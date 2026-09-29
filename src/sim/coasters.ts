import { RIDE_TYPES, type RideTypeId } from './catalog';
import { sampleTrack, testRun, type Circuit, type RideStats, type TrainState } from './coaster';
import { DX, DZ, turn, type Direction } from './grid';
import { USE, type Park, type Ride } from './park';
import {
  cellTile,
  DESIGNS,
  fits,
  PIECES,
  pieceCells,
  pieceEnd,
  pieceTop,
  sameEnd,
  type PieceId,
  type Placed,
  type TrackEnd,
} from './track';

/**
 * Building roller coasters: a station first (with its entrance and exit alongside), then
 * track piece by piece until it comes back round into the station, then a test run.
 */

export interface CoasterState {
  pieces: Placed[];
  /** The station's first tile, heading the way trains leave. */
  start: TrackEnd;
  complete: boolean;
  stats: RideStats | null;
  /** Why the last test run failed. */
  problem: string | null;
  train: TrainState;
  /** Money spent on track, for refunds. */
  spent: number;
  /** Bumped on every change, so cached circuits and meshes rebuild. */
  version: number;
}

export const STATION_LENGTH = 3;
/** Track higher than this above the ground (in height steps) can pass over paths. */
const CLEARANCE = 6;
/** Room above a piece for the cars and riders. */
const HEADROOM = 5;
export const MAX_TRACK_HEIGHT = 64;

export function pieceCost(id: PieceId, chain: boolean): number {
  const spec = PIECES[id];
  let cost = 2_500;
  if (spec.turn !== 0) cost = 2_000 * spec.size * spec.size;
  if (spec.bank !== 0) cost += 1_000;
  if (spec.inversions > 0) cost = 45_000;
  if (id === 'brakes') cost = 6_000;
  if (id === 'booster') cost = 12_000;
  return cost + (chain ? 1_000 : 0);
}

export function trackEnd(coaster: CoasterState): TrackEnd {
  const last = coaster.pieces[coaster.pieces.length - 1];
  return last ? pieceEnd(last.id, last.start) : coaster.start;
}

const circuits = new WeakMap<CoasterState, { version: number; circuit: Circuit }>();

export function circuitOf(coaster: CoasterState): Circuit {
  const cached = circuits.get(coaster);
  if (cached?.version === coaster.version) return cached.circuit;
  const circuit = sampleTrack(coaster.pieces);
  circuits.set(coaster, { version: coaster.version, circuit });
  return circuit;
}

interface Cell {
  ride: number;
  low: number;
  high: number;
}

/** Every tile any coaster passes over, with the heights it uses. */
function occupancy(park: Park): Map<number, Cell[]> {
  const cells = new Map<number, Cell[]>();
  for (const ride of park.rides) {
    if (!ride.coaster) continue;
    for (const placed of ride.coaster.pieces) {
      const end = pieceEnd(placed.id, placed.start);
      const low = Math.min(placed.start.h, end.h);
      const high = pieceTop(placed.id, placed.start);
      for (const cell of pieceCells(placed.id)) {
        const tile = cellTile(placed.start, cell);
        const key = park.index(tile.x, tile.z);
        const list = cells.get(key) ?? [];
        list.push({ ride: ride.id, low, high });
        cells.set(key, list);
      }
    }
  }
  return cells;
}

/** The travel direction for a station whose entrance side faces `facing`. */
export const travelFor = (facing: Direction) => turn(facing, 1);

/** Puts down a coaster's station. The entrance and exit go on its left side. */
export function placeCoaster(
  park: Park,
  type: RideTypeId,
  x: number,
  z: number,
  facing: Direction,
): Ride | null {
  const spec = RIDE_TYPES[type];
  if (!spec.coaster) return null;
  const ride = park.placeRide(type, x, z, facing);
  if (!ride) return null;
  const dir = travelFor(facing);
  // The station tile furthest back along the direction of travel.
  const tiles = [];
  for (let dz = 0; dz < ride.depth; dz++) {
    for (let dx = 0; dx < ride.width; dx++) tiles.push({ x: ride.x + dx, z: ride.z + dz });
  }
  const back = tiles.reduce((best, tile) =>
    tile.x * DX[dir] + tile.z * DZ[dir] < best.x * DX[dir] + best.z * DZ[dir] ? tile : best,
  );
  const start: TrackEnd = { x: back.x, z: back.z, h: ride.height, dir, slope: 'flat' };
  const pieces: Placed[] = [];
  let at = start;
  for (let index = 0; index < STATION_LENGTH; index++) {
    pieces.push({ id: 'station', chain: false, start: at });
    at = pieceEnd('station', at);
  }
  ride.coaster = {
    pieces,
    start,
    complete: false,
    stats: null,
    problem: null,
    train: { s: 0, v: 0, travelled: 0 },
    spent: 0,
    version: 1,
  };
  ride.open = false;
  return ride;
}

export interface AppendCheck {
  ok: boolean;
  reason: string;
  cost: number;
  end: TrackEnd;
}

export function appendCheck(park: Park, ride: Ride, id: PieceId, chain: boolean): AppendCheck {
  const coaster = ride.coaster;
  const start = coaster
    ? trackEnd(coaster)
    : { x: 0, z: 0, h: 0, dir: 0 as Direction, slope: 'flat' as const };
  const end = pieceEnd(id, start);
  const fail = (reason: string): AppendCheck => ({ ok: false, reason, cost: 0, end });
  if (!coaster) return fail('Not a coaster.');
  if (coaster.complete) return fail('The circuit is already complete.');
  const type = RIDE_TYPES[ride.type].coaster;
  if (!type) return fail('Not a coaster.');
  const spec = PIECES[id];
  if (id === 'station') return fail('Stations are placed with the ride.');
  if (!fits(id, start.slope)) return fail('That piece can’t follow this slope.');
  if (spec.inversions > 0 && !type.loops) return fail('This coaster can’t go upside down.');
  if (
    !type.steep &&
    [end.slope, start.slope].some((slope) => slope === 'up60' || slope === 'down60')
  ) {
    return fail('This coaster can’t take slopes that steep.');
  }
  if (id === 'booster' && !type.boosters) return fail('This coaster has no boosters.');
  if (chain && !spec.liftable) return fail('A chain lift only fits uphill pieces.');
  if (chain && start.slope.startsWith('down')) return fail('A chain lift only fits uphill pieces.');
  const top = pieceTop(id, start);
  if (top > MAX_TRACK_HEIGHT) return fail('That’s as high as the supports will go.');
  const low = Math.min(start.h, end.h);
  const cells = occupancy(park);
  for (const cell of pieceCells(id)) {
    const tile = cellTile(start, cell);
    if (!park.inside(tile.x, tile.z)) return fail('Off the edge of the park.');
    if (!park.isOwned(tile.x, tile.z)) return fail('The park doesn’t own this land.');
    const ground = Math.max(...park.terrain.tileCorners(tile.x, tile.z));
    if (low < ground) return fail('The track would run into the ground.');
    for (const other of cells.get(park.index(tile.x, tile.z)) ?? []) {
      if (low < other.high + HEADROOM && top + HEADROOM > other.low) {
        return fail(
          other.ride === ride.id
            ? 'The track would hit itself.'
            : 'Another ride’s track is in the way.',
        );
      }
    }
    const use = park.useAt(tile.x, tile.z);
    const lowHere = low < ground + CLEARANCE;
    const clear = use === USE.empty || use === USE.scenery;
    const passable = clear || use === USE.path || use === USE.queue;
    if (lowHere ? !clear : !passable) {
      return fail(
        lowHere
          ? 'Something’s in the way. Build higher to pass over paths.'
          : 'Something’s in the way.',
      );
    }
  }
  const cost = pieceCost(id, chain);
  if (cost > park.money) return fail('Not enough money.');
  return { ok: true, reason: '', cost, end };
}

export function appendPiece(park: Park, ride: Ride, id: PieceId, chain: boolean): boolean {
  const check = appendCheck(park, ride, id, chain);
  const coaster = ride.coaster;
  if (!check.ok || !coaster) return false;
  const start = trackEnd(coaster);
  coaster.pieces.push({ id, chain, start });
  coaster.spent += check.cost;
  coaster.version++;
  park.spend(check.cost, 'construction');
  markTrack(park, ride);
  if (sameEnd(check.end, coaster.start)) {
    coaster.complete = true;
    runTest(park, ride);
  }
  park.touch();
  return true;
}

export function removeLastPiece(park: Park, ride: Ride): boolean {
  const coaster = ride.coaster;
  if (!coaster || coaster.pieces.length <= STATION_LENGTH) return false;
  const removed = coaster.pieces.pop();
  if (!removed) return false;
  const refund = pieceCost(removed.id, removed.chain);
  coaster.spent -= refund;
  park.earn(refund, 'construction');
  coaster.complete = false;
  coaster.stats = null;
  coaster.problem = null;
  coaster.version++;
  ride.open = false;
  markTrack(park, ride);
  park.touch();
  return true;
}

/** Marks the tiles under low track as the ride's (and clears scenery there). */
function markTrack(park: Park, ride: Ride) {
  const coaster = ride.coaster;
  if (!coaster) return;
  const inStation = (x: number, z: number) =>
    x >= ride.x && x < ride.x + ride.width && z >= ride.z && z < ride.z + ride.depth;
  for (let index = 0; index < park.use.length; index++) {
    if (park.use[index] !== USE.ride || park.ref[index] !== ride.id) continue;
    const x = index % park.width;
    const z = Math.floor(index / park.width);
    if (!inStation(x, z)) {
      park.use[index] = USE.empty;
      park.ref[index] = 0;
    }
  }
  for (const placed of coaster.pieces) {
    if (placed.id === 'station') continue;
    const end = pieceEnd(placed.id, placed.start);
    const low = Math.min(placed.start.h, end.h);
    for (const cell of pieceCells(placed.id)) {
      const tile = cellTile(placed.start, cell);
      const ground = Math.max(...park.terrain.tileCorners(tile.x, tile.z));
      const use = park.useAt(tile.x, tile.z);
      if (low < ground + CLEARANCE && (use === USE.empty || use === USE.scenery)) {
        const index = park.index(tile.x, tile.z);
        park.use[index] = USE.ride;
        park.ref[index] = ride.id;
      }
    }
  }
}

/** Builds the coaster's ready-made layout, if it fits. */
export function buildDesign(park: Park, ride: Ride): { ok: boolean; reason: string } {
  const coaster = ride.coaster;
  const design = RIDE_TYPES[ride.type].design;
  if (!coaster || !design) return { ok: false, reason: 'No ready-made layout for this ride.' };
  if (coaster.pieces.length > STATION_LENGTH)
    return { ok: false, reason: 'Clear the track first.' };
  const pieces = DESIGNS[design].map((entry) => {
    const [id = 'straight', flag] = entry.split(' ');
    return { id: id as PieceId, chain: flag === 'c' };
  });
  const total = pieces.reduce((sum, item) => sum + pieceCost(item.id, item.chain), 0);
  if (total > park.money)
    return {
      ok: false,
      reason: `Not enough money: the layout costs ${Math.round(total / 100)} dollars.`,
    };
  for (const [index, item] of pieces.entries()) {
    const check = appendCheck(park, ride, item.id, item.chain);
    if (!check.ok) {
      while (coaster.pieces.length > STATION_LENGTH) removeLastPiece(park, ride);
      return { ok: false, reason: `It doesn’t fit here (piece ${index + 1}: ${check.reason})` };
    }
    appendPiece(park, ride, item.id, item.chain);
  }
  return { ok: true, reason: '' };
}

/** Sends an empty train round and records the ratings, or why it failed. */
export function runTest(park: Park, ride: Ride): void {
  const coaster = ride.coaster;
  const type = RIDE_TYPES[ride.type].coaster;
  if (!coaster || !type || !coaster.complete) return;
  const result = testRun(circuitOf(coaster), type, coaster.pieces, (x, z) =>
    park.terrain.heightAt(x, z),
  );
  if (result.ok) {
    coaster.stats = result.stats;
    coaster.problem = null;
  } else {
    coaster.stats = null;
    coaster.problem = result.reason;
  }
  coaster.train = { s: circuitOf(coaster).stop, v: 0, travelled: 0 };
}

/** Pieces the builder offers next, given where the track ends. */
export function nextPieces(ride: Ride): PieceId[] {
  const coaster = ride.coaster;
  const type = RIDE_TYPES[ride.type].coaster;
  if (!coaster || !type) return [];
  const slope = trackEnd(coaster).slope;
  return (Object.keys(PIECES) as PieceId[]).filter((id) => {
    const spec = PIECES[id];
    if (id === 'station' || !fits(id, slope)) return false;
    if (spec.inversions > 0 && !type.loops) return false;
    if (id === 'booster' && !type.boosters) return false;
    const to = spec.to === 'same' ? slope : spec.to;
    if (!type.steep && (to === 'up60' || to === 'down60')) return false;
    return true;
  });
}
