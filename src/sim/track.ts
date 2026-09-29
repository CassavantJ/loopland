import { DX, DZ, turn, type Direction } from './grid';

/**
 * Roller coaster track: a chain of pieces, each starting where the last one ended.
 *
 * A piece starts at the back edge of a tile, heading one of four directions, at some height
 * (in height steps). Pieces are described in their own frame: `f` forward along the heading,
 * `l` to the right, `u` up in height steps. The frame's origin is the middle of the start
 * tile's back edge, so a straight piece runs from f = 0 to f = 1.
 */

export type Slope = 'flat' | 'up25' | 'up60' | 'down25' | 'down60';

/** Height steps climbed per tile on each slope. */
export const RISE: Record<Slope, number> = { flat: 0, up25: 2, up60: 8, down25: -2, down60: -8 };

export type PieceId =
  | 'station'
  | 'straight'
  | 'flat-to-up25'
  | 'up25-to-flat'
  | 'up25-to-up60'
  | 'up60-to-up25'
  | 'flat-to-down25'
  | 'down25-to-flat'
  | 'down25-to-down60'
  | 'down60-to-down25'
  | 'left-1'
  | 'right-1'
  | 'left-2'
  | 'right-2'
  | 'left-3'
  | 'right-3'
  | 'bank-left-2'
  | 'bank-right-2'
  | 'bank-left-3'
  | 'bank-right-3'
  | 'loop'
  | 'loop-left'
  | 'brakes'
  | 'booster';

export interface PieceSpec {
  id: PieceId;
  label: string;
  /** The slope a piece must start on (any slope for plain straights). */
  from: Slope | 'any';
  /** The slope it ends on ('same' keeps the entry slope). */
  to: Slope | 'same';
  /** Quarter turns: +1 right, −1 left. */
  turn: -1 | 0 | 1;
  /** Turn size in tiles. */
  size: number;
  /** Peak bank angle, radians (positive leans right). */
  bank: number;
  inversions: number;
  /** A chain lift may be fitted. */
  liftable: boolean;
}

const piece = (id: PieceId, label: string, extra: Partial<PieceSpec> = {}): PieceSpec => ({
  id,
  label,
  from: 'flat',
  to: 'flat',
  turn: 0,
  size: 1,
  bank: 0,
  inversions: 0,
  liftable: false,
  ...extra,
});

export const PIECES: Record<PieceId, PieceSpec> = {
  station: piece('station', 'Station'),
  straight: piece('straight', 'Straight', { from: 'any', to: 'same', liftable: true }),
  'flat-to-up25': piece('flat-to-up25', 'Start climbing', { to: 'up25', liftable: true }),
  'up25-to-flat': piece('up25-to-flat', 'Level out', { from: 'up25', liftable: true }),
  'up25-to-up60': piece('up25-to-up60', 'Steepen', { from: 'up25', to: 'up60', liftable: true }),
  'up60-to-up25': piece('up60-to-up25', 'Ease off', { from: 'up60', to: 'up25', liftable: true }),
  'flat-to-down25': piece('flat-to-down25', 'Start dropping', { to: 'down25' }),
  'down25-to-flat': piece('down25-to-flat', 'Pull out', { from: 'down25' }),
  'down25-to-down60': piece('down25-to-down60', 'Steepen', { from: 'down25', to: 'down60' }),
  'down60-to-down25': piece('down60-to-down25', 'Ease off', { from: 'down60', to: 'down25' }),
  'left-1': piece('left-1', 'Tight left', { turn: -1, size: 1 }),
  'right-1': piece('right-1', 'Tight right', { turn: 1, size: 1 }),
  'left-2': piece('left-2', 'Left turn', { turn: -1, size: 2 }),
  'right-2': piece('right-2', 'Right turn', { turn: 1, size: 2 }),
  'left-3': piece('left-3', 'Wide left', { turn: -1, size: 3 }),
  'right-3': piece('right-3', 'Wide right', { turn: 1, size: 3 }),
  'bank-left-2': piece('bank-left-2', 'Banked left', { turn: -1, size: 2, bank: -0.75 }),
  'bank-right-2': piece('bank-right-2', 'Banked right', { turn: 1, size: 2, bank: 0.75 }),
  'bank-left-3': piece('bank-left-3', 'Wide banked left', { turn: -1, size: 3, bank: -0.7 }),
  'bank-right-3': piece('bank-right-3', 'Wide banked right', { turn: 1, size: 3, bank: 0.7 }),
  loop: piece('loop', 'Loop (to the right)', { inversions: 1 }),
  'loop-left': piece('loop-left', 'Loop (to the left)', { inversions: 1 }),
  brakes: piece('brakes', 'Brakes'),
  booster: piece('booster', 'Booster'),
};

export const LOOP_RADIUS = 2;
export const LOOP_LENGTH = 5;

export interface TrackEnd {
  x: number;
  z: number;
  /** Height in height steps. */
  h: number;
  dir: Direction;
  slope: Slope;
}

export interface Placed {
  id: PieceId;
  chain: boolean;
  /** Where the piece starts. */
  start: TrackEnd;
}

/** Where a piece of the given kind would end, starting from `start`. */
export function pieceEnd(id: PieceId, start: TrackEnd): TrackEnd {
  const spec = PIECES[id];
  const slope: Slope = spec.to === 'same' ? start.slope : spec.to;
  const f = { x: DX[start.dir], z: DZ[start.dir] };
  const r = { x: DX[turn(start.dir, 1)], z: DZ[turn(start.dir, 1)] };
  if (spec.turn !== 0) {
    const n = spec.size;
    const side = spec.turn;
    return {
      x: start.x + f.x * (n - 1) + r.x * n * side,
      z: start.z + f.z * (n - 1) + r.z * n * side,
      h: start.h,
      dir: turn(start.dir, side),
      slope,
    };
  }
  if (id === 'loop' || id === 'loop-left') {
    const side = id === 'loop' ? 1 : -1;
    return {
      x: start.x + f.x * LOOP_LENGTH + r.x * side,
      z: start.z + f.z * LOOP_LENGTH + r.z * side,
      h: start.h,
      dir: start.dir,
      slope,
    };
  }
  return {
    x: start.x + f.x,
    z: start.z + f.z,
    h: start.h + climb(id, start.slope),
    dir: start.dir,
    slope,
  };
}

/** Height steps a one-tile piece climbs. */
function climb(id: PieceId, slope: Slope): number {
  switch (id) {
    case 'straight':
      return RISE[slope];
    case 'flat-to-up25':
    case 'up25-to-flat':
      return 1;
    case 'flat-to-down25':
    case 'down25-to-flat':
      return -1;
    case 'up25-to-up60':
    case 'up60-to-up25':
      return 5;
    case 'down25-to-down60':
    case 'down60-to-down25':
      return -5;
    default:
      return 0;
  }
}

/** Whether a piece can follow a track ending on `slope`. */
export function fits(id: PieceId, slope: Slope): boolean {
  const spec = PIECES[id];
  return spec.from === 'any' ? true : spec.from === slope;
}

export interface LocalPoint {
  f: number;
  l: number;
  /** Up, in height steps. */
  u: number;
  roll: number;
  /** For loops: the angle around the loop, so the up vector can follow it. */
  loop?: number;
}

/** A point part-way (t from 0 to 1) along a piece, in the piece's own frame. */
export function pieceLocal(id: PieceId, slope: Slope, t: number): LocalPoint {
  const spec = PIECES[id];
  if (spec.turn !== 0) {
    const radius = spec.size - 0.5;
    const angle = (t * Math.PI) / 2;
    return {
      f: radius * Math.sin(angle),
      l: spec.turn * radius * (1 - Math.cos(angle)),
      u: 0,
      roll: spec.bank * Math.sin(Math.PI * t),
    };
  }
  if (id === 'loop' || id === 'loop-left') {
    const theta = t * Math.PI * 2;
    return {
      f: (LOOP_LENGTH * theta) / (Math.PI * 2) + LOOP_RADIUS * Math.sin(theta) * 0.92,
      l: ((id === 'loop' ? 1 : -1) * (1 - Math.cos(theta / 2))) / 2,
      u: (LOOP_RADIUS * (1 - Math.cos(theta))) / 0.25,
      roll: 0,
      loop: theta,
    };
  }
  let u = 0;
  switch (id) {
    case 'straight':
      u = RISE[slope] * t;
      break;
    case 'flat-to-up25':
      u = t * t;
      break;
    case 'up25-to-flat':
      u = 2 * t - t * t;
      break;
    case 'flat-to-down25':
      u = -t * t;
      break;
    case 'down25-to-flat':
      u = -(2 * t - t * t);
      break;
    case 'up25-to-up60':
      u = 2 * t + 3 * t * t;
      break;
    case 'up60-to-up25':
      u = 8 * t - 3 * t * t;
      break;
    case 'down25-to-down60':
      u = -(2 * t + 3 * t * t);
      break;
    case 'down60-to-down25':
      u = -(8 * t - 3 * t * t);
      break;
    default:
      u = 0;
  }
  return { f: t, l: 0, u, roll: 0 };
}

/** Tiles a piece passes over, as forward/right offsets from its start tile. */
export function pieceCells(id: PieceId): { f: number; l: number }[] {
  const spec = PIECES[id];
  if (spec.turn !== 0) {
    const cells: { f: number; l: number }[] = [];
    for (let f = 0; f < spec.size; f++) {
      for (let l = 0; l < spec.size; l++) cells.push({ f, l: l * spec.turn });
    }
    return cells;
  }
  if (id === 'loop' || id === 'loop-left') {
    const side = id === 'loop' ? 1 : -1;
    const cells: { f: number; l: number }[] = [];
    for (let f = 0; f < LOOP_LENGTH; f++) {
      cells.push({ f, l: 0 }, { f, l: side });
    }
    return cells;
  }
  return [{ f: 0, l: 0 }];
}

/** Converts a piece-frame offset to map tiles. */
export function cellTile(
  start: TrackEnd,
  cell: { f: number; l: number },
): { x: number; z: number } {
  const right = turn(start.dir, 1);
  return {
    x: start.x + DX[start.dir] * cell.f + DX[right] * cell.l,
    z: start.z + DZ[start.dir] * cell.f + DZ[right] * cell.l,
  };
}

/** The highest point of a piece above its start, in height steps (for clearance). */
export function pieceTop(id: PieceId, start: TrackEnd): number {
  if (id === 'loop' || id === 'loop-left') return start.h + Math.ceil((LOOP_RADIUS * 2) / 0.25);
  const end = pieceEnd(id, start);
  return Math.max(start.h, end.h);
}

export function sameEnd(a: TrackEnd, b: TrackEnd): boolean {
  return a.x === b.x && a.z === b.z && a.h === b.h && a.dir === b.dir && a.slope === b.slope;
}

/** The mirror image of a piece: lefts become rights. */
export function mirror(id: PieceId): PieceId {
  const swaps: Partial<Record<PieceId, PieceId>> = {
    'left-1': 'right-1',
    'right-1': 'left-1',
    'left-2': 'right-2',
    'right-2': 'left-2',
    'left-3': 'right-3',
    'right-3': 'left-3',
    'bank-left-2': 'bank-right-2',
    'bank-right-2': 'bank-left-2',
    'bank-left-3': 'bank-right-3',
    'bank-right-3': 'bank-left-3',
    loop: 'loop-left',
    'loop-left': 'loop',
  };
  return swaps[id] ?? id;
}

/** Ready-made layouts, as pieces after the station (a trailing c fits a chain lift). */
export const DESIGNS: Record<'junior' | 'wooden' | 'steel', string[]> = {
  junior: [
    'straight',
    'flat-to-up25 c',
    'straight c',
    'straight c',
    'straight c',
    'up25-to-flat c',
    'right-2',
    'right-2',
    'flat-to-down25',
    'straight',
    'straight',
    'straight',
    'down25-to-flat',
    'straight',
    'straight',
    'straight',
    'straight',
    'right-2',
    'right-2',
  ],
  wooden: [
    'straight',
    'flat-to-up25 c',
    ...Array.from({ length: 9 }, () => 'straight c'),
    'up25-to-flat c',
    'bank-right-2',
    'bank-right-2',
    'flat-to-down25',
    'down25-to-down60',
    'straight',
    'down60-to-down25',
    'down25-to-flat',
    'flat-to-up25',
    'straight',
    'up25-to-flat',
    'flat-to-down25',
    'straight',
    'down25-to-flat',
    'straight',
    'brakes',
    'brakes',
    'brakes',
    'bank-right-2',
    'bank-right-2',
  ],
  steel: [
    'straight',
    'flat-to-up25 c',
    ...Array.from({ length: 13 }, () => 'straight c'),
    'up25-to-flat c',
    'right-2',
    'right-2',
    'flat-to-down25',
    'down25-to-down60',
    'straight',
    'straight',
    'down60-to-down25',
    'down25-to-flat',
    'straight',
    'loop',
    'straight',
    'straight',
    'straight',
    'straight',
    'brakes',
    'brakes',
    'right-2',
    'right-1',
  ],
};
