import { describe, expect, it } from 'vitest';

import { kmh } from './coaster';
import {
  appendCheck,
  appendPiece,
  buildDesign,
  placeCoaster,
  removeLastPiece,
  trackEnd,
} from './coasters';
import { createPark, type Park } from './park';
import { PIECES, pieceEnd, sameEnd, type TrackEnd } from './track';
import { TICK, World } from './world';

/** A station in the flat middle of a fresh park, heading north, entrance on the west. */
function withStation(type: 'junior-coaster' | 'wooden-coaster' | 'steel-coaster') {
  const park = createPark(4);
  park.money = 10_000_000;
  const ride = placeCoaster(park, type, 22, 26, 3);
  if (!ride?.coaster) throw new Error('no station');
  return { park, ride, coaster: ride.coaster };
}

describe('track geometry', () => {
  it('turns and loops end where they say, and four right turns come home', () => {
    const start: TrackEnd = { x: 10, z: 10, h: 4, dir: 0, slope: 'flat' };
    let end = start;
    for (let turn = 0; turn < 4; turn++) end = pieceEnd('right-2', end);
    expect(end.dir).toBe(0);
    // Four medium right turns trace a 4×4 square and come back to the start.
    expect(sameEnd(end, start)).toBe(true);
    const loop = pieceEnd('loop', start);
    expect(loop).toMatchObject({ x: 11, z: 5, h: 4, dir: 0 });
    expect(PIECES.loop.inversions).toBe(1);
  });

  it('climbs by the right amounts', () => {
    let end: TrackEnd = { x: 5, z: 5, h: 0, dir: 1, slope: 'flat' };
    for (const id of [
      'flat-to-up25',
      'straight',
      'up25-to-up60',
      'straight',
      'up60-to-up25',
      'up25-to-flat',
    ] as const) {
      end = pieceEnd(id, end);
    }
    expect(end).toMatchObject({ x: 11, z: 5, h: 1 + 2 + 5 + 8 + 5 + 1, slope: 'flat' });
  });
});

describe('building', () => {
  it('starts with a three-tile station and an entrance and exit alongside', () => {
    const { ride, coaster } = withStation('junior-coaster');
    expect(coaster.pieces.map((piece) => piece.id)).toEqual(['station', 'station', 'station']);
    expect(coaster.start).toMatchObject({ x: 22, z: 28, dir: 0 });
    expect(ride.entrance?.x).toBe(21);
    expect(ride.open).toBe(false);
  });

  it('refuses pieces that don’t fit', () => {
    const { park, ride } = withStation('junior-coaster');
    expect(appendCheck(park, ride, 'loop', false).reason).toMatch(/upside down/);
    expect(appendCheck(park, ride, 'up25-to-flat', false).reason).toMatch(/slope/);
    expect(appendCheck(park, ride, 'flat-to-down25', false).reason).toMatch(/ground/);
    expect(appendCheck(park, ride, 'right-2', true).reason).toMatch(/chain/);
  });

  it('won’t let the track hit itself', () => {
    const { park, ride } = withStation('steel-coaster');
    // Three tight rights bring the track back round to the station's side, level with it.
    for (const id of ['right-1', 'right-1', 'right-1'] as const) {
      expect(appendPiece(park, ride, id, false)).toBe(true);
    }
    expect(appendCheck(park, ride, 'straight', false).reason).toMatch(/hit itself/);
  });

  it('undoes the last piece and refunds it', () => {
    const { park, ride, coaster } = withStation('junior-coaster');
    const money = park.money;
    appendPiece(park, ride, 'straight', false);
    expect(park.money).toBeLessThan(money);
    expect(removeLastPiece(park, ride)).toBe(true);
    expect(park.money).toBe(money);
    expect(removeLastPiece(park, ride)).toBe(false);
    expect(
      sameEnd(
        trackEnd(coaster),
        pieceEnd('station', pieceEnd('station', pieceEnd('station', coaster.start))),
      ),
    ).toBe(true);
  });
});

describe('ready-made coasters', () => {
  for (const type of ['junior-coaster', 'wooden-coaster', 'steel-coaster'] as const) {
    it(`${type}: completes, passes its test run and rates sensibly`, () => {
      const { park, ride, coaster } = withStation(type);
      const built = buildDesign(park, ride);
      expect(built.reason).toBe('');
      expect(coaster.complete).toBe(true);
      expect(coaster.problem).toBeNull();
      const stats = coaster.stats;
      expect(stats).not.toBeNull();
      if (!stats) return;
      expect(stats.duration).toBeGreaterThan(8);
      expect(stats.duration).toBeLessThan(120);
      expect(stats.excitement).toBeGreaterThan(2.5);
      expect(stats.intensity).toBeLessThan(9.5);
      expect(stats.maxVerticalG).toBeLessThan(5.5);
      if (type === 'steel-coaster') expect(stats.inversions).toBe(1);
      if (type === 'junior-coaster') expect(kmh(stats.maxSpeed)).toBeLessThan(kmh(15));
    });
  }

  it('ranks the thrill rides above the junior coaster', () => {
    const excitement = (['junior-coaster', 'wooden-coaster', 'steel-coaster'] as const).map(
      (type) => {
        const { park, ride, coaster } = withStation(type);
        buildDesign(park, ride);
        return coaster.stats?.excitement ?? 0;
      },
    );
    expect(excitement[1]).toBeGreaterThan(excitement[0] ?? 0);
    expect(excitement[2]).toBeGreaterThan(excitement[0] ?? 0);
  });

  it('carries guests round', () => {
    const { park, ride } = withStation('wooden-coaster');
    buildDesign(park, ride);
    ride.open = true;
    // A path from the entrance gate to the coaster's entrance and exit.
    const joinPath = (p: Park) => {
      for (let z = p.depth - 9; z >= 26; z--) p.buildPath(20, z);
      for (let x = 20; x <= p.gate.x; x++) p.buildPath(x, p.depth - 8);
    };
    joinPath(park);
    const world = new World(park);
    expect(world.problem(ride)).toBeNull();
    for (let step = 0; step < 900 / TICK; step++) world.tick();
    expect(ride.customers).toBeGreaterThan(10);
  });
});
