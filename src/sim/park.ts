import {
  EARTH_COST,
  PATH_COST,
  PATH_ITEMS,
  QUEUE_COST,
  RIDE_TYPES,
  SCENERY,
  type PathItemId,
  type RideTypeId,
  type SceneryId,
} from './catalog';
import { DIRECTIONS, DX, DZ, Terrain, turn, type Direction, type Tile } from './grid';
import { Random } from './random';

/** What a tile is used for. Plain numbers so they pack into typed arrays. */
export const USE = {
  empty: 0,
  path: 1,
  queue: 2,
  ride: 3,
  entrance: 4,
  exit: 5,
  stall: 6,
  scenery: 7,
  gate: 8,
} as const;
export type Use = (typeof USE)[keyof typeof USE];

export const SCENERY_IDS = Object.keys(SCENERY) as SceneryId[];
export const PATH_ITEM_IDS = Object.keys(PATH_ITEMS) as PathItemId[];

export interface Ride {
  id: number;
  type: RideTypeId;
  name: string;
  /** Footprint, after rotation. */
  x: number;
  z: number;
  width: number;
  depth: number;
  /** The way the front faces: entrance and exit (rides) or the counter (stalls). */
  facing: Direction;
  entrance: Tile | null;
  exit: Tile | null;
  /** Ground height, in height steps. */
  height: number;
  open: boolean;
  price: number;
  /** Guests waiting, front first. */
  queue: number[];
  riders: number[];
  phase: 'idle' | 'loading' | 'running';
  timer: number;
  customers: number;
  income: number;
  monthIncome: number;
  monthCustomers: number;
  built: number;
}

export interface Placement {
  ok: boolean;
  reason: string;
  cost: number;
  /** Footprint tiles, then entrance and exit for rides. */
  tiles: Tile[];
  entrance: Tile | null;
  exit: Tile | null;
  height: number;
}

export type Ledger = Record<
  'construction' | 'rides' | 'food' | 'entrance' | 'upkeep' | 'wages' | 'interest',
  number
>;

export const emptyLedger = (): Ledger => ({
  construction: 0,
  rides: 0,
  food: 0,
  entrance: 0,
  upkeep: 0,
  wages: 0,
  interest: 0,
});

export interface Message {
  day: number;
  text: string;
  /** A ride or guest to jump to. */
  ride?: number;
  guest?: number;
}

/** Game seconds per day, days per month, and the months a park is open. */
export const DAY_SECONDS = 6;
export const MONTH_DAYS = 20;
export const MONTHS = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'];

export class Park {
  name: string;
  readonly terrain: Terrain;
  readonly width: number;
  readonly depth: number;
  readonly use: Uint8Array;
  /** Ride id, scenery index, and so on, depending on `use`. */
  readonly ref: Int32Array;
  /** Facing of stalls, entrances, exits and scenery. */
  readonly facing: Uint8Array;
  /** Bench, bin or lamp on a path: index in PATH_ITEM_IDS + 1. */
  readonly pathItem: Uint8Array;
  readonly owned: Uint8Array;
  gate: Tile;
  rides: Ride[] = [];
  nextRideId = 1;
  money: number;
  entranceFee: number;
  /** Game seconds since the park opened. */
  time = 0;
  rating = 500;
  ledger: Ledger = emptyLedger();
  history: { month: number; ledger: Ledger; guests: number; rating: number }[] = [];
  messages: Message[] = [];
  random: Random;
  /** Bumped whenever something is built or removed, so views know to rebuild. */
  version = 0;
  /** Bumped when the land itself changes shape. */
  landVersion = 0;

  constructor(options: {
    width: number;
    depth: number;
    seed: number;
    money: number;
    name: string;
  }) {
    this.name = options.name;
    this.width = options.width;
    this.depth = options.depth;
    this.terrain = new Terrain(options.width, options.depth);
    const tiles = options.width * options.depth;
    this.use = new Uint8Array(tiles);
    this.ref = new Int32Array(tiles);
    this.facing = new Uint8Array(tiles);
    this.pathItem = new Uint8Array(tiles);
    this.owned = new Uint8Array(tiles);
    this.money = options.money;
    this.entranceFee = 1_000;
    this.random = new Random(options.seed);
    this.gate = { x: Math.floor(options.width / 2), z: options.depth - 1 };
  }

  index(x: number, z: number): number {
    return z * this.width + x;
  }

  inside(x: number, z: number): boolean {
    return this.terrain.inside(x, z);
  }

  useAt(x: number, z: number): Use {
    return (this.inside(x, z) ? (this.use[this.index(x, z)] ?? 0) : 0) as Use;
  }

  isOwned(x: number, z: number): boolean {
    return this.inside(x, z) && this.owned[this.index(x, z)] === 1;
  }

  isWalkable(x: number, z: number): boolean {
    const use = this.useAt(x, z);
    return use === USE.path || use === USE.gate;
  }

  ride(id: number): Ride | undefined {
    return this.rides.find((ride) => ride.id === id);
  }

  rideAt(x: number, z: number): Ride | undefined {
    const use = this.useAt(x, z);
    if (use === USE.ride || use === USE.entrance || use === USE.exit || use === USE.stall) {
      return this.ride(this.ref[this.index(x, z)] ?? -1);
    }
    return undefined;
  }

  get day(): number {
    return Math.floor(this.time / DAY_SECONDS);
  }

  get month(): number {
    return Math.floor(this.day / MONTH_DAYS);
  }

  /** "12 May, Year 2". */
  get date(): string {
    const month = this.month;
    const name = MONTHS[month % MONTHS.length] ?? '';
    return `${(this.day % MONTH_DAYS) + 1} ${name}, Year ${Math.floor(month / MONTHS.length) + 1}`;
  }

  post(text: string, links: { ride?: number; guest?: number } = {}): void {
    this.messages.push({ day: this.day, text, ...links });
    if (this.messages.length > 60) this.messages.splice(0, this.messages.length - 60);
  }

  setEntranceFee(cents: number): void {
    this.entranceFee = Math.max(0, Math.min(10_000, Math.round(cents)));
  }

  spend(amount: number, category: keyof Ledger): void {
    this.money -= amount;
    this.ledger[category] -= amount;
  }

  earn(amount: number, category: keyof Ledger): void {
    this.money += amount;
    this.ledger[category] += amount;
  }

  private changed(land = false) {
    this.version++;
    if (land) this.landVersion++;
  }

  // Building ---------------------------------------------------------------------------------

  pathCheck(x: number, z: number, queue: boolean): { ok: boolean; reason: string; cost: number } {
    if (!this.inside(x, z)) return { ok: false, reason: 'Off the map.', cost: 0 };
    if (!this.isOwned(x, z))
      return { ok: false, reason: 'The park doesn’t own this land.', cost: 0 };
    const use = this.useAt(x, z);
    const wanted = queue ? USE.queue : USE.path;
    if (use === wanted) return { ok: false, reason: 'Already built.', cost: 0 };
    if (use !== USE.empty && use !== USE.path && use !== USE.queue && use !== USE.scenery) {
      return { ok: false, reason: 'Something’s in the way.', cost: 0 };
    }
    if (!this.terrain.pathShape(x, z)) {
      return {
        ok: false,
        reason: 'Too steep here. Paths need flat land or a gentle ramp.',
        cost: 0,
      };
    }
    const cost = queue ? QUEUE_COST : PATH_COST;
    if (cost > this.money) return { ok: false, reason: 'Not enough money.', cost };
    return { ok: true, reason: '', cost };
  }

  buildPath(x: number, z: number, queue = false): boolean {
    const check = this.pathCheck(x, z, queue);
    if (!check.ok) return false;
    const index = this.index(x, z);
    this.use[index] = queue ? USE.queue : USE.path;
    this.ref[index] = 0;
    if (queue) this.pathItem[index] = 0;
    this.spend(check.cost, 'construction');
    this.changed();
    return true;
  }

  sceneryCheck(id: SceneryId, x: number, z: number): { ok: boolean; reason: string; cost: number } {
    if (!this.inside(x, z)) return { ok: false, reason: 'Off the map.', cost: 0 };
    if (!this.isOwned(x, z))
      return { ok: false, reason: 'The park doesn’t own this land.', cost: 0 };
    if (this.useAt(x, z) !== USE.empty)
      return { ok: false, reason: 'Something’s in the way.', cost: 0 };
    const cost = SCENERY[id].cost;
    if (cost > this.money) return { ok: false, reason: 'Not enough money.', cost };
    return { ok: true, reason: '', cost };
  }

  placeScenery(id: SceneryId, x: number, z: number, facing: Direction = 0): boolean {
    const check = this.sceneryCheck(id, x, z);
    if (!check.ok) return false;
    const index = this.index(x, z);
    this.use[index] = USE.scenery;
    this.ref[index] = SCENERY_IDS.indexOf(id);
    this.facing[index] = facing;
    this.spend(check.cost, 'construction');
    this.changed();
    return true;
  }

  sceneryAt(x: number, z: number): SceneryId | null {
    if (this.useAt(x, z) !== USE.scenery) return null;
    return SCENERY_IDS[this.ref[this.index(x, z)] ?? -1] ?? null;
  }

  pathItemAt(x: number, z: number): PathItemId | null {
    if (!this.inside(x, z)) return null;
    return PATH_ITEM_IDS[(this.pathItem[this.index(x, z)] ?? 0) - 1] ?? null;
  }

  placePathItem(id: PathItemId, x: number, z: number): { ok: boolean; reason: string } {
    if (this.useAt(x, z) !== USE.path)
      return { ok: false, reason: 'Benches, bins and lamps go on paths.' };
    if (this.pathItemAt(x, z) === id) return { ok: false, reason: 'Already here.' };
    const cost = PATH_ITEMS[id].cost;
    if (cost > this.money) return { ok: false, reason: 'Not enough money.' };
    this.pathItem[this.index(x, z)] = PATH_ITEM_IDS.indexOf(id) + 1;
    this.spend(cost, 'construction');
    this.changed();
    return { ok: true, reason: '' };
  }

  /** Where a ride or stall would go, and whether it can. Changes nothing. */
  placement(type: RideTypeId, x: number, z: number, facing: Direction): Placement {
    const spec = RIDE_TYPES[type];
    const sideways = facing % 2 === 1;
    const width = sideways ? spec.depth : spec.width;
    const depth = sideways ? spec.width : spec.depth;
    const tiles: Tile[] = [];
    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) tiles.push({ x: x + dx, z: z + dz });
    }
    let entrance: Tile | null = null;
    let exit: Tile | null = null;
    if (spec.kind === 'ride') {
      const front = frontTiles(x, z, width, depth, facing);
      entrance = front[0] ?? null;
      exit = front[front.length - 1] ?? null;
    }
    const all = [...tiles, ...(entrance ? [entrance] : []), ...(exit ? [exit] : [])];
    const fail = (reason: string, cost = 0): Placement => ({
      ok: false,
      reason,
      cost,
      tiles: all,
      entrance,
      exit,
      height: 0,
    });

    for (const tile of all) {
      if (!this.inside(tile.x, tile.z)) return fail('Off the edge of the park.');
      if (!this.isOwned(tile.x, tile.z)) return fail('The park doesn’t own this land.');
      const use = this.useAt(tile.x, tile.z);
      if (use !== USE.empty && use !== USE.scenery) return fail('Something’s in the way.');
    }

    // Level the ground to the most common height under it, if that doesn't disturb anything.
    const heights = new Map<number, number>();
    for (const tile of all) {
      for (const corner of this.terrain.tileCorners(tile.x, tile.z)) {
        heights.set(corner, (heights.get(corner) ?? 0) + 1);
      }
    }
    const height = [...heights.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
    const trial = new Terrain(this.width, this.depth, this.terrain.corners.slice());
    let moved = 0;
    for (const tile of all) moved += trial.level(tile.x, tile.z, tile.x, tile.z, height);
    // Re-level each tile once more: levelling one can nudge a neighbour's shared corners.
    for (const tile of all) moved += trial.level(tile.x, tile.z, tile.x, tile.z, height);
    const inPlacement = new Set(all.map((tile) => this.index(tile.x, tile.z)));
    for (let tz = 0; tz < this.depth; tz++) {
      for (let tx = 0; tx < this.width; tx++) {
        if (inPlacement.has(this.index(tx, tz))) continue;
        const use = this.useAt(tx, tz);
        if (use === USE.empty || use === USE.scenery) continue;
        const before = this.terrain.tileCorners(tx, tz);
        const after = trial.tileCorners(tx, tz);
        if (before.some((value, corner) => value !== after[corner])) {
          return fail('The ground is too uneven here.');
        }
      }
    }
    const cost = spec.cost + moved * EARTH_COST;
    if (cost > this.money) return fail('Not enough money.', cost);
    return { ok: true, reason: '', cost, tiles: all, entrance, exit, height };
  }

  placeRide(type: RideTypeId, x: number, z: number, facing: Direction): Ride | null {
    const plan = this.placement(type, x, z, facing);
    if (!plan.ok) return null;
    const spec = RIDE_TYPES[type];
    const levelled = plan.tiles.some((tile) => !this.terrain.isFlat(tile.x, tile.z));
    for (let pass = 0; pass < 2; pass++) {
      for (const tile of plan.tiles)
        this.terrain.level(tile.x, tile.z, tile.x, tile.z, plan.height);
    }
    const sideways = facing % 2 === 1;
    const count = this.rides.filter((ride) => ride.type === type).length + 1;
    const ride: Ride = {
      id: this.nextRideId++,
      type,
      name: `${spec.name} ${count}`,
      x,
      z,
      width: sideways ? spec.depth : spec.width,
      depth: sideways ? spec.width : spec.depth,
      facing,
      entrance: plan.entrance,
      exit: plan.exit,
      height: plan.height,
      open: true,
      price: spec.price,
      queue: [],
      riders: [],
      phase: 'idle',
      timer: 0,
      customers: 0,
      income: 0,
      monthIncome: 0,
      monthCustomers: 0,
      built: this.day,
    };
    const mark = (tile: Tile, use: Use) => {
      const index = this.index(tile.x, tile.z);
      this.use[index] = use;
      this.ref[index] = ride.id;
      this.facing[index] = facing;
      this.pathItem[index] = 0;
    };
    const footprint = plan.tiles.slice(0, ride.width * ride.depth);
    for (const tile of footprint) mark(tile, spec.kind === 'stall' ? USE.stall : USE.ride);
    if (plan.entrance) mark(plan.entrance, USE.entrance);
    if (plan.exit) mark(plan.exit, USE.exit);
    this.rides.push(ride);
    this.spend(plan.cost, 'construction');
    this.changed(levelled);
    return ride;
  }

  /** Refund for demolishing: half of what it cost. */
  removalRefund(x: number, z: number): number {
    const use = this.useAt(x, z);
    if (use === USE.path) return PATH_COST / 2;
    if (use === USE.queue) return QUEUE_COST / 2;
    if (use === USE.scenery) {
      const id = this.sceneryAt(x, z);
      return id ? SCENERY[id].cost / 2 : 0;
    }
    const ride = this.rideAt(x, z);
    return ride ? RIDE_TYPES[ride.type].cost / 2 : 0;
  }

  /** Bulldozes whatever is on a tile. Returns a description of what went, or null. */
  demolish(x: number, z: number): string | null {
    const use = this.useAt(x, z);
    if (use === USE.empty || use === USE.gate || !this.isOwned(x, z)) return null;
    const refund = this.removalRefund(x, z);
    const index = this.index(x, z);
    if (use === USE.path || use === USE.queue || use === USE.scenery) {
      const name = use === USE.scenery ? SCENERY[this.sceneryAt(x, z) ?? 'bush'].name : 'Path';
      this.use[index] = USE.empty;
      this.ref[index] = 0;
      this.pathItem[index] = 0;
      this.earn(refund, 'construction');
      this.changed();
      return name;
    }
    const ride = this.rideAt(x, z);
    if (!ride) return null;
    this.removeRide(ride);
    this.earn(refund, 'construction');
    return ride.name;
  }

  /** Hook for the guest simulation to release anyone on or waiting for a ride. */
  onRideRemoved: (ride: Ride) => void = () => undefined;

  removeRide(ride: Ride): void {
    this.onRideRemoved(ride);
    for (let index = 0; index < this.use.length; index++) {
      const use = this.use[index];
      if (
        this.ref[index] === ride.id &&
        (use === USE.ride || use === USE.entrance || use === USE.exit || use === USE.stall)
      ) {
        this.use[index] = USE.empty;
        this.ref[index] = 0;
      }
    }
    this.rides = this.rides.filter((other) => other !== ride);
    this.changed();
  }

  /** Raises or lowers one corner of the land, with neighbours following. */
  terraform(cx: number, cz: number, by: 1 | -1): { ok: boolean; reason: string } {
    if (cx < 0 || cz < 0 || cx > this.width || cz > this.depth)
      return { ok: false, reason: 'Off the map.' };
    const trial = new Terrain(this.width, this.depth, this.terrain.corners.slice());
    trial.setCorner(cx, cz, trial.corner(cx, cz) + by);
    const moved = trial.smooth(cx, cz, cx, cz) + 1;
    for (let tz = 0; tz < this.depth; tz++) {
      for (let tx = 0; tx < this.width; tx++) {
        const before = this.terrain.tileCorners(tx, tz);
        const after = trial.tileCorners(tx, tz);
        if (before.every((value, corner) => value === after[corner])) continue;
        if (!this.isOwned(tx, tz)) return { ok: false, reason: 'The park doesn’t own that land.' };
        const use = this.useAt(tx, tz);
        if (use === USE.scenery) continue;
        if (use === USE.path || use === USE.queue) {
          if (!trial.pathShape(tx, tz)) return { ok: false, reason: 'A path is in the way.' };
          continue;
        }
        if (use !== USE.empty) return { ok: false, reason: 'Something’s built there.' };
      }
    }
    const cost = moved * EARTH_COST;
    if (cost > this.money) return { ok: false, reason: 'Not enough money.' };
    this.terrain.corners.set(trial.corners);
    this.spend(cost, 'construction');
    this.changed(true);
    return { ok: true, reason: '' };
  }

  // Layout helpers -----------------------------------------------------------------------------

  /** The walkable tile a guest steps onto after leaving a ride, or stands on to use a stall. */
  frontOf(ride: Ride, which: 'entrance' | 'exit' | 'counter'): Tile | null {
    const tile = which === 'entrance' ? ride.entrance : which === 'exit' ? ride.exit : ride;
    if (!tile) return null;
    return { x: tile.x + DX[ride.facing], z: tile.z + DZ[ride.facing] };
  }

  /**
   * The line of queue tiles leading to a ride's entrance, nearest the entrance first. Guests
   * join at `join`, the path tile touching the far end of the line (or the entrance's front
   * tile itself when there's no queue line).
   */
  queueLine(ride: Ride): { tiles: Tile[]; join: Tile | null } {
    const start = this.frontOf(ride, 'entrance');
    if (!start || !ride.entrance) return { tiles: [], join: null };
    if (this.useAt(start.x, start.z) === USE.path) return { tiles: [], join: start };
    if (this.useAt(start.x, start.z) !== USE.queue) return { tiles: [], join: null };
    if (!this.terrain.meets(ride.entrance.x, ride.entrance.z, ride.facing))
      return { tiles: [], join: null };
    const tiles: Tile[] = [start];
    const seen = new Set([this.index(start.x, start.z)]);
    let current = start;
    for (;;) {
      let next: Tile | null = null;
      let exit: Tile | null = null;
      for (const direction of DIRECTIONS) {
        const nx = current.x + DX[direction];
        const nz = current.z + DZ[direction];
        if (!this.terrain.meets(current.x, current.z, direction)) continue;
        const index = this.index(nx, nz);
        if (seen.has(index)) continue;
        const use = this.useAt(nx, nz);
        if (use === USE.queue && !next) next = { x: nx, z: nz };
        else if (use === USE.path && !exit) exit = { x: nx, z: nz };
      }
      if (next) {
        seen.add(this.index(next.x, next.z));
        tiles.push(next);
        current = next;
        continue;
      }
      return { tiles, join: exit };
    }
  }

  // Saving ------------------------------------------------------------------------------------

  toJSON(): SavedPark {
    return {
      version: 1,
      name: this.name,
      width: this.width,
      depth: this.depth,
      corners: Array.from(this.terrain.corners),
      use: Array.from(this.use),
      ref: Array.from(this.ref),
      facing: Array.from(this.facing),
      pathItem: Array.from(this.pathItem),
      owned: Array.from(this.owned),
      gate: this.gate,
      rides: this.rides.map((ride) => ({
        ...ride,
        queue: [],
        riders: [],
        phase: 'idle',
        timer: 0,
      })),
      nextRideId: this.nextRideId,
      money: this.money,
      entranceFee: this.entranceFee,
      time: this.time,
      rating: this.rating,
      ledger: this.ledger,
      history: this.history,
      seed: this.random.state,
    };
  }

  static fromJSON(saved: SavedPark): Park {
    const park = new Park({
      width: saved.width,
      depth: saved.depth,
      seed: saved.seed,
      money: saved.money,
      name: saved.name,
    });
    park.terrain.corners.set(saved.corners);
    park.use.set(saved.use);
    park.ref.set(saved.ref);
    park.facing.set(saved.facing);
    park.pathItem.set(saved.pathItem);
    park.owned.set(saved.owned);
    park.gate = saved.gate;
    park.rides = saved.rides;
    park.nextRideId = saved.nextRideId;
    park.entranceFee = saved.entranceFee;
    park.time = saved.time;
    park.rating = saved.rating;
    park.ledger = saved.ledger;
    park.history = saved.history;
    return park;
  }
}

export interface SavedPark {
  version: 1;
  name: string;
  width: number;
  depth: number;
  corners: number[];
  use: number[];
  ref: number[];
  facing: number[];
  pathItem: number[];
  owned: number[];
  gate: Tile;
  rides: Ride[];
  nextRideId: number;
  money: number;
  entranceFee: number;
  time: number;
  rating: number;
  ledger: Ledger;
  history: Park['history'];
  seed: number;
}

/** The row of tiles just outside a footprint's front edge. */
function frontTiles(x: number, z: number, width: number, depth: number, facing: Direction): Tile[] {
  switch (facing) {
    case 0:
      return Array.from({ length: width }, (_, dx) => ({ x: x + dx, z: z - 1 }));
    case 1:
      return Array.from({ length: depth }, (_, dz) => ({ x: x + width, z: z + dz }));
    case 2:
      return Array.from({ length: width }, (_, dx) => ({ x: x + width - 1 - dx, z: z + depth }));
    case 3:
      return Array.from({ length: depth }, (_, dz) => ({ x: x - 1, z: z + depth - 1 - dz }));
  }
}

/** A new park: rolling hills at the edges, a flat middle, an entrance on the south edge. */
export function createPark(seed = 1, size = 48): Park {
  const park = new Park({ width: size, depth: size, seed, money: 2_500_000, name: 'Loopland' });
  const { terrain } = park;
  const random = new Random(seed * 7 + 3);
  const base = 6;
  terrain.corners.fill(base);
  // Hills: raise a few blobs away from the middle, then smooth everything to legal slopes.
  const middle = size / 2;
  for (let hill = 0; hill < 9; hill++) {
    const angle = random.range(0, Math.PI * 2);
    const distance = random.range(size * 0.32, size * 0.5);
    const cx = middle + Math.cos(angle) * distance;
    const cz = middle + Math.sin(angle) * distance;
    const radius = random.range(4, 9);
    const peak = random.int(3, 9);
    for (let z = 0; z <= size; z++) {
      for (let x = 0; x <= size; x++) {
        const d = Math.hypot(x - cx, z - cz) / radius;
        if (d < 1) {
          const lift = Math.round(peak * (1 - d * d));
          terrain.setCorner(x, z, Math.max(terrain.corner(x, z), base + lift));
        }
      }
    }
  }
  // Keep the building area and the entrance flat.
  const keep = (x: number, z: number) =>
    Math.hypot(x - middle, z - middle) < size * 0.33 ||
    (Math.abs(x - park.gate.x) < 5 && z > middle);
  for (let z = 0; z <= size; z++) {
    for (let x = 0; x <= size; x++) if (keep(x, z)) terrain.setCorner(x, z, base);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let z = 0; z <= size; z++) {
      for (let x = 0; x <= size; x++) {
        // Pull each corner to within one step of its neighbours, lowering the high side.
        let low = Infinity;
        for (const direction of DIRECTIONS) {
          const nx = x + DX[direction];
          const nz = z + DZ[direction];
          if (nx >= 0 && nz >= 0 && nx <= size && nz <= size)
            low = Math.min(low, terrain.corner(nx, nz));
        }
        if (terrain.corner(x, z) > low + 1 && !keep(x, z)) terrain.setCorner(x, z, low + 1);
      }
    }
  }
  terrain.smooth(-1, -1, -1, -1);

  // The park owns everything inside a one-tile border.
  for (let z = 1; z < size - 1; z++) {
    for (let x = 1; x < size - 1; x++) park.owned[park.index(x, z)] = 1;
  }
  const gate = park.index(park.gate.x, park.gate.z);
  park.use[gate] = USE.gate;
  park.facing[gate] = 0;
  park.owned[gate] = 1;
  // A short path in from the gate, then a little plaza.
  for (let z = size - 2; z >= size - 7; z--) park.buildPath(park.gate.x, z);
  for (let x = park.gate.x - 2; x <= park.gate.x + 2; x++) park.buildPath(x, size - 8);
  // Trees on the hills.
  for (let attempt = 0; attempt < 220; attempt++) {
    const x = random.int(1, size - 2);
    const z = random.int(1, size - 2);
    if (keep(x, z) || park.useAt(x, z) !== USE.empty) continue;
    const id = random.pick<SceneryId>(['oak', 'oak', 'pine', 'pine', 'bush']);
    park.placeScenery(id, x, z, turn(0, random.int(0, 3)));
  }
  park.money = 2_500_000;
  park.ledger = emptyLedger();
  park.version = 1;
  park.landVersion = 1;
  return park;
}
