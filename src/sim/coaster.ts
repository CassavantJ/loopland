import { DX, DZ, HEIGHT_STEP, turn } from './grid';
import { PIECES, pieceLocal, type PieceId, type Placed, type TrackEnd } from './track';

/**
 * Coaster physics along a finished circuit. The track is sampled into a dense table; a train
 * is a position along it (its front car) and a speed. Gravity, friction, chain lifts, the
 * station's drive tyres, brakes and boosters move it. A test run records the numbers that
 * decide the ride's ratings.
 *
 * Units: tiles and seconds. A tile is about three metres.
 */

export const METRES_PER_TILE = 3;
const GRAVITY = 9.81 / METRES_PER_TILE;
const SAMPLE = 0.05;
export const CHAIN_SPEED = 2.2;
const STATION_SPEED = 1.6;
const BRAKE_SPEED = 3;
const BOOST_SPEED = 13;
const CURVE_SCALE = 0.5;

export interface CoasterType {
  cars: number;
  seatsPerCar: number;
  /** Rolling resistance and air drag. */
  friction: number;
  drag: number;
  carSpacing: number;
  /** Which special pieces it can use. */
  loops: boolean;
  steep: boolean;
  boosters: boolean;
}

export interface Sample {
  s: number;
  x: number;
  y: number;
  z: number;
  /** Unit tangent. */
  tx: number;
  ty: number;
  tz: number;
  /** Unit up vector for the cars (follows banking and loops). */
  ux: number;
  uy: number;
  uz: number;
  piece: number;
  chain: boolean;
  station: boolean;
  brake: boolean;
  boost: boolean;
}

export interface Circuit {
  samples: Sample[];
  length: number;
  /** Where the train stops in the station: the far end of the platform. */
  stop: number;
  stationLength: number;
}

/** Where a local piece point lands in the world. */
function toWorld(start: TrackEnd, local: { f: number; l: number; u: number }) {
  const fx = DX[start.dir];
  const fz = DZ[start.dir];
  const right = turn(start.dir, 1);
  const rx = DX[right];
  const rz = DZ[right];
  const ox = start.x + 0.5 - fx * 0.5;
  const oz = start.z + 0.5 - fz * 0.5;
  return {
    x: ox + fx * local.f + rx * local.l,
    y: (start.h + local.u) * HEIGHT_STEP,
    z: oz + fz * local.f + rz * local.l,
  };
}

/** Samples a list of pieces into points roughly SAMPLE apart. */
export function sampleTrack(pieces: readonly Placed[]): Circuit {
  const raw: Omit<Sample, 's'>[] = [];
  let stationLength = 0;
  pieces.forEach((placed, index) => {
    const spec = PIECES[placed.id];
    if (placed.id === 'station') stationLength++;
    // Enough steps for the piece's length.
    const rough = placed.id === 'loop' ? 14 : spec.turn !== 0 ? spec.size * 1.6 : 1.4;
    const steps = Math.max(8, Math.ceil(rough / SAMPLE));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      const local = pieceLocal(placed.id, placed.start.slope, t);
      const point = toWorld(placed.start, local);
      const ahead = toWorld(
        placed.start,
        pieceLocal(placed.id, placed.start.slope, Math.min(1, t + 0.002)),
      );
      const behind = toWorld(
        placed.start,
        pieceLocal(placed.id, placed.start.slope, Math.max(0, t - 0.002)),
      );
      let tx = ahead.x - behind.x;
      let ty = ahead.y - behind.y;
      let tz = ahead.z - behind.z;
      const length = Math.hypot(tx, ty, tz) || 1;
      tx /= length;
      ty /= length;
      tz /= length;
      // Up: world up made square to the tangent, then rolled for banking. In a loop the
      // up vector points at the loop's centre instead.
      let ux: number;
      let uy: number;
      let uz: number;
      if (local.loop !== undefined) {
        const fx = DX[placed.start.dir];
        const fz = DZ[placed.start.dir];
        const theta = local.loop;
        ux = -fx * Math.sin(theta);
        uy = Math.cos(theta);
        uz = -fz * Math.sin(theta);
      } else {
        ux = -ty * tx;
        uy = 1 - ty * ty;
        uz = -ty * tz;
        const upLength = Math.hypot(ux, uy, uz) || 1;
        ux /= upLength;
        uy /= upLength;
        uz /= upLength;
        if (local.roll !== 0) {
          // Rotate up about the tangent by the roll (Rodrigues, with up ⟂ tangent).
          const cx = ty * uz - tz * uy;
          const cy = tz * ux - tx * uz;
          const cz = tx * uy - ty * ux;
          const cos = Math.cos(local.roll);
          const sin = Math.sin(local.roll);
          ux = ux * cos + cx * sin;
          uy = uy * cos + cy * sin;
          uz = uz * cos + cz * sin;
        }
      }
      raw.push({
        ...point,
        tx,
        ty,
        tz,
        ux,
        uy,
        uz,
        piece: index,
        chain: placed.chain,
        station: placed.id === 'station',
        brake: placed.id === 'brakes',
        boost: placed.id === 'booster',
      });
    }
  });
  const samples: Sample[] = [];
  let s = 0;
  raw.forEach((point, index) => {
    if (index > 0) {
      const previous = raw[index - 1];
      if (previous)
        s += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
    }
    samples.push({ ...point, s });
  });
  const last = raw[raw.length - 1];
  const first = raw[0];
  const closing =
    last && first ? Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) : 0;
  const length = s + closing;
  const stationEnd = samples.find((sample) => sample.piece === stationLength)?.s ?? stationLength;
  return { samples, length, stop: Math.max(0, stationEnd - 0.15), stationLength };
}

/** The sample at or just before a distance along the circuit (wrapping). */
export function sampleAt(circuit: Circuit, s: number): Sample {
  const { samples, length } = circuit;
  const wrapped = ((s % length) + length) % length;
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((samples[middle]?.s ?? 0) <= wrapped) low = middle;
    else high = middle - 1;
  }
  const sample = samples[low];
  if (!sample) throw new Error('empty circuit');
  return sample;
}

/** A smoothly interpolated point along the circuit, for drawing cars. */
export function pointAt(circuit: Circuit, s: number): Sample {
  const { samples, length } = circuit;
  const wrapped = ((s % length) + length) % length;
  const a = sampleAt(circuit, wrapped);
  const index = samples.indexOf(a);
  const b = samples[index + 1] ?? samples[0];
  if (!b) return a;
  const span = (b.s > a.s ? b.s : length) - a.s || 1;
  const t = Math.min(1, Math.max(0, (wrapped - a.s) / span));
  const mix = (p: number, q: number) => p + (q - p) * t;
  return {
    ...a,
    s: wrapped,
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
    tx: mix(a.tx, b.tx),
    ty: mix(a.ty, b.ty),
    tz: mix(a.tz, b.tz),
    ux: mix(a.ux, b.ux),
    uy: mix(a.uy, b.uy),
    uz: mix(a.uz, b.uz),
  };
}

export interface TrainState {
  /** Front car position along the circuit. */
  s: number;
  v: number;
  /** Distance travelled since leaving the station. */
  travelled: number;
}

/** Moves a train along for one time step. Returns true when it has come home to the station. */
export function stepTrain(
  circuit: Circuit,
  type: CoasterType,
  train: TrainState,
  dt: number,
): boolean {
  // Average the slope over every car: a long train is pulled by its back over the top.
  let slope = 0;
  let onChain = false;
  let inStation = false;
  let braking = false;
  let boosting = false;
  for (let car = 0; car < type.cars; car++) {
    const sample = sampleAt(circuit, train.s - car * type.carSpacing);
    slope += sample.ty;
    onChain ||= sample.chain;
    inStation ||= sample.station;
    braking ||= sample.brake;
    boosting ||= sample.boost;
  }
  slope /= type.cars;
  let accel =
    -GRAVITY * slope -
    Math.sign(train.v) * (type.friction * GRAVITY + type.drag * train.v * train.v);
  if (boosting && train.v < BOOST_SPEED) accel += 9;
  train.v += accel * dt;
  if (onChain && train.v < CHAIN_SPEED) train.v = CHAIN_SPEED;
  if (braking && train.v > BRAKE_SPEED) train.v = Math.max(BRAKE_SPEED, train.v - 12 * dt);
  const homeStretch = train.travelled > circuit.length * 0.5;
  if (inStation) {
    if (!homeStretch && train.v < STATION_SPEED) train.v = STATION_SPEED;
    if (homeStretch) train.v = Math.max(Math.min(train.v, STATION_SPEED * 1.5), 0.6);
  }
  train.s += train.v * dt;
  train.travelled += train.v * dt;
  // Home when the front passes the stop point again.
  if (homeStretch && train.travelled >= circuit.length - 0.02) {
    train.s = circuit.stop;
    train.v = 0;
    return true;
  }
  return false;
}

export interface RideStats {
  length: number;
  duration: number;
  maxSpeed: number;
  averageSpeed: number;
  highestDrop: number;
  drops: number;
  inversions: number;
  maxVerticalG: number;
  minVerticalG: number;
  maxLateralG: number;
  airtime: number;
  highest: number;
  excitement: number;
  intensity: number;
  nausea: number;
}

export type TestResult = { ok: true; stats: RideStats } | { ok: false; reason: string };

/** Runs one empty lap and measures it. */
export function testRun(
  circuit: Circuit,
  type: CoasterType,
  pieces: readonly Placed[],
  groundAt: (x: number, z: number) => number,
): TestResult {
  const train: TrainState = { s: circuit.stop, v: 0, travelled: 0 };
  const dt = 1 / 60;
  let time = 0;
  let maxSpeed = 0;
  let maxVertical = 1;
  let minVertical = 1;
  let maxLateral = 0;
  let airtime = 0;
  let descending = false;
  let dropStart = 0;
  let highestDrop = 0;
  let drops = 0;
  let lowestSpeedClimb = Infinity;
  const middleCar = Math.floor(type.cars / 2) * type.carSpacing;
  for (;;) {
    const done = stepTrain(circuit, type, train, dt);
    time += dt;
    if (done) break;
    if (time > 240) {
      return {
        ok: false,
        reason:
          lowestSpeedClimb < 0.2
            ? 'The train can’t get over a hill. Add a chain lift or make the hill lower.'
            : 'The train never made it back to the station.',
      };
    }
    const speed = Math.abs(train.v);
    maxSpeed = Math.max(maxSpeed, speed);
    const here = pointAt(circuit, train.s - middleCar);
    if (here.ty > 0.05) lowestSpeedClimb = Math.min(lowestSpeedClimb, speed);
    // G-forces on the middle car: centripetal acceleration plus gravity, in the car's frame.
    // Curvature over about a tile: what riders feel, not every seam between pieces.
    const ds = 0.55;
    const behind = pointAt(circuit, train.s - middleCar - ds);
    const ahead = pointAt(circuit, train.s - middleCar + ds);
    const cx = (ahead.x - 2 * here.x + behind.x) / (ds * ds);
    const cy = (ahead.y - 2 * here.y + behind.y) / (ds * ds);
    const cz = (ahead.z - 2 * here.z + behind.z) / (ds * ds);
    // Pieces are drawn compact (a tile stands for a longer stretch of real track), so the
    // bends are gentler than they look: count half their curvature.
    const v2 = train.v * train.v * CURVE_SCALE;
    const fx = v2 * cx;
    const fy = v2 * cy + GRAVITY;
    const fz = v2 * cz;
    const vertical = (fx * here.ux + fy * here.uy + fz * here.uz) / GRAVITY;
    // Right = tangent × up.
    const rx = here.ty * here.uz - here.tz * here.uy;
    const ry = here.tz * here.ux - here.tx * here.uz;
    const rz = here.tx * here.uy - here.ty * here.ux;
    const lateral = Math.abs(fx * rx + fy * ry + fz * rz) / GRAVITY;
    if (train.travelled > 0.5) {
      maxVertical = Math.max(maxVertical, vertical);
      minVertical = Math.min(minVertical, vertical);
      maxLateral = Math.max(maxLateral, lateral);
      if (vertical < 0.2) airtime += dt;
    }
    // Drops: count each descent and remember the biggest.
    const front = sampleAt(circuit, train.s);
    if (front.ty < -0.08 && !descending) {
      descending = true;
      dropStart = front.y;
    } else if (front.ty > -0.02 && descending) {
      descending = false;
      const drop = dropStart - front.y;
      if (drop > 0.4) {
        drops++;
        highestDrop = Math.max(highestDrop, drop);
      }
    }
  }
  const inversions = pieces.reduce((sum, placed) => sum + PIECES[placed.id].inversions, 0);
  const highest = Math.max(
    ...circuit.samples.map((sample) => sample.y - groundAt(sample.x, sample.z)),
  );
  const stats = rate({
    length: circuit.length,
    duration: time,
    maxSpeed,
    averageSpeed: circuit.length / Math.max(1, time),
    highestDrop,
    drops,
    inversions,
    maxVerticalG: maxVertical,
    minVerticalG: minVertical,
    maxLateralG: maxLateral,
    airtime,
    highest,
  });
  return { ok: true, stats };
}

/** Turns measurements into excitement, intensity and nausea (0–10, intensity can go past). */
export function rate(measured: Omit<RideStats, 'excitement' | 'intensity' | 'nausea'>): RideStats {
  const kmh = measured.maxSpeed * METRES_PER_TILE * 3.6;
  const dropMetres = measured.highestDrop * METRES_PER_TILE;
  const extremeG =
    Math.max(0, measured.maxVerticalG - 5) +
    Math.max(0, -1.5 - measured.minVerticalG) +
    Math.max(0, measured.maxLateralG - 2.8);
  const excitement =
    0.6 +
    Math.min(2.6, kmh / 32) +
    Math.min(1.8, dropMetres / 14) +
    Math.min(1.2, measured.drops * 0.22) +
    measured.inversions * 0.55 +
    Math.min(1, measured.airtime * 0.6) +
    Math.min(1, measured.duration / 70) +
    Math.min(0.6, measured.maxLateralG * 0.25) -
    extremeG * 1.5;
  const intensity =
    0.2 +
    kmh / 34 +
    Math.max(0, measured.maxVerticalG - 1) * 0.7 +
    measured.maxLateralG * 0.8 +
    Math.max(0, 0.4 - measured.minVerticalG) +
    measured.inversions * 0.6;
  const nausea =
    0.3 +
    measured.maxLateralG * 1.2 +
    measured.inversions * 0.6 +
    intensity * 0.2 +
    Math.max(0, 0.2 - measured.minVerticalG) * 0.8;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    ...measured,
    excitement: round(Math.max(0, Math.min(10, excitement))),
    intensity: round(Math.max(0, intensity)),
    nausea: round(Math.max(0, Math.min(10, nausea))),
  };
}

export const kmh = (tilesPerSecond: number) => tilesPerSecond * METRES_PER_TILE * 3.6;

export type { PieceId };
