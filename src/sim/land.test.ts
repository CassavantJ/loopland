import { describe, expect, it } from 'vitest';

import { beautyMap, sceneryBonus } from './beauty';
import { appendCheck, appendPiece, placeCoaster } from './coasters';
import { ratingsOf } from './guests';
import { createPark, Park, SURFACES, type SavedPark } from './park';

/** A fresh park with plenty of money, and the flat middle to work in. */
function park(): Park {
  const result = createPark(6);
  result.money = 10_000_000;
  return result;
}

describe('landscaping', () => {
  it('raises and lowers a patch of land, with slopes around it', () => {
    const p = park();
    const before = p.terrain.corner(21, 21);
    expect(p.editLand(20, 20, 22, 22, 'raise').ok).toBe(true);
    expect(p.editLand(20, 20, 22, 22, 'raise').ok).toBe(true);
    expect(p.terrain.corner(21, 21)).toBe(before + 2);
    // One corner out, the land steps down by one.
    expect(p.terrain.corner(19, 21)).toBe(before + 1);
    expect(p.terrain.isFlat(20, 20)).toBe(true);
    expect(p.editLand(20, 20, 22, 22, 'lower').ok).toBe(true);
    expect(p.terrain.corner(21, 21)).toBe(before + 1);
  });

  it('levels an area to a height', () => {
    const p = park();
    p.editLand(18, 18, 20, 20, 'raise');
    const base = p.terrain.base(24, 24);
    expect(p.editLand(17, 17, 21, 21, 'level', base).ok).toBe(true);
    for (let z = 17; z < 21; z++) {
      for (let x = 17; x < 21; x++) expect(p.terrain.base(x, z)).toBe(base);
    }
  });

  it('won’t tip a path over or bury a coaster', () => {
    const p = park();
    p.buildPath(24, 20);
    expect(p.editLand(24, 20, 24, 20, 'raise').reason).toMatch(/path/i);
    const ride = placeCoaster(p, 'junior-coaster', 22, 26, 3);
    if (!ride) throw new Error('no coaster');
    appendPiece(p, ride, 'straight', false);
    // The piece after the station runs at ground level just north of it.
    expect(p.editLand(22, 25, 22, 25, 'raise').ok).toBe(false);
  });

  it('paints the ground', () => {
    const p = park();
    const money = p.money;
    expect(p.paint(10, 10, 12, 12, 3).ok).toBe(true);
    expect(p.surface[p.index(11, 11)]).toBe(3);
    expect(SURFACES[3].name).toBe('Sand');
    expect(p.money).toBe(money - 9 * 100);
    expect(p.paint(10, 10, 12, 12, 3).ok).toBe(false);
  });
});

describe('water', () => {
  it('floods an area, which can’t then be built on, and drains again', () => {
    const p = park();
    expect(p.editWater(20, 20, 22, 22, true).ok).toBe(true);
    expect(p.underwater(21, 21)).toBe(true);
    expect(p.deepWater(21, 21)).toBe(true);
    expect(p.underwater(23, 21)).toBe(false);
    expect(p.pathCheck(21, 21, false).reason).toMatch(/under water/);
    expect(p.sceneryCheck('oak', 21, 21).ok).toBe(false);
    expect(p.placement('carousel', 20, 20, 2).reason).toMatch(/under water/);
    expect(p.editWater(20, 20, 22, 22, false).ok).toBe(true);
    expect(p.underwater(21, 21)).toBe(false);
  });

  it('won’t flood paths, and drowns scenery', () => {
    const p = park();
    p.buildPath(21, 21);
    expect(p.editWater(20, 20, 22, 22, true).reason).toMatch(/in the way/);
    const q = park();
    q.placeScenery('oak', 21, 21);
    q.editWater(20, 20, 22, 22, true);
    expect(q.sceneryAt(21, 21)).toBeNull();
  });

  it('floats paddle boats, with the entrance on dry land', () => {
    const p = park();
    expect(p.placement('paddle-boats', 20, 20, 2).reason).toMatch(/lake/);
    p.editWater(20, 20, 22, 22, true);
    const plan = p.placement('paddle-boats', 20, 20, 2);
    expect(plan.reason).toBe('');
    const boats = p.placeRide('paddle-boats', 20, 20, 2);
    expect(boats?.height).toBe(p.water[p.index(21, 21)]);
    // The land under the lake wasn't levelled away.
    expect(p.underwater(21, 21)).toBe(true);
  });

  it('fills a dug lake to one level, with paddle boats launched from the shore', () => {
    const p = park();
    // Dig two steps down over tiles 18–24, then fill it.
    expect(p.editLand(18, 18, 25, 25, 'lower').ok).toBe(true);
    expect(p.editLand(19, 19, 24, 24, 'lower').ok).toBe(true);
    // Two steps down, two steps of water: back up to the level of the land around.
    expect(p.editWater(18, 18, 24, 24, true).ok).toBe(true);
    expect(p.editWater(18, 18, 24, 24, true).ok).toBe(true);
    expect(p.water[p.index(21, 21)]).toBe(p.terrain.base(10, 21));
    const levels = new Set<number>();
    for (let z = 18; z <= 24; z++) {
      for (let x = 18; x <= 24; x++) levels.add(p.water[p.index(x, z)] ?? 0);
    }
    expect(levels.size).toBe(1);
    // Boats on the east side, their entrance and exit on the sloping shore.
    const plan = p.placement('paddle-boats', 22, 20, 1);
    expect(plan.reason).toBe('');
    expect(plan.entrance).toEqual({ x: 25, z: 20 });
  });

  it('keeps coaster track out of the water', () => {
    const p = park();
    const ride = placeCoaster(p, 'junior-coaster', 22, 26, 3);
    if (!ride) throw new Error('no coaster');
    p.editWater(21, 24, 23, 25, true);
    expect(appendCheck(p, ride, 'straight', false).reason).toMatch(/water/);
  });
});

describe('scenery and beauty', () => {
  it('makes rides more exciting with scenery and water around them', () => {
    const p = park();
    const ride = p.placeRide('carousel', 20, 20, 2);
    if (!ride) throw new Error('no ride');
    const bare = sceneryBonus(p, ride);
    for (const [x, z] of [
      [19, 19],
      [23, 19],
      [19, 22],
      [23, 22],
      [18, 20],
      [24, 21],
    ] as const) {
      p.placeScenery('fountain', x, z);
    }
    const pretty = sceneryBonus(p, ride);
    expect(pretty).toBeGreaterThan(bare + 0.2);
    expect(pretty).toBeLessThanOrEqual(1);
    ride.sceneryBonus = pretty;
    expect(ratingsOf(ride).excitement).toBeCloseTo(3.2 + pretty);
  });

  it('spreads beauty to nearby tiles only', () => {
    const p = park();
    p.placeScenery('statue', 10, 10);
    const map = beautyMap(p);
    expect(map[p.index(10, 10)]).toBeGreaterThan(map[p.index(12, 10)] ?? 0);
    expect(map[p.index(20, 20)]).toBe(0);
  });
});

describe('saving', () => {
  it('keeps water and ground paint', () => {
    const p = park();
    p.editWater(20, 20, 21, 21, true);
    p.paint(5, 5, 5, 5, 4);
    const loaded = Park.fromJSON(JSON.parse(JSON.stringify(p.toJSON())) as SavedPark);
    expect(loaded.underwater(20, 20)).toBe(true);
    expect(loaded.surface[p.index(5, 5)]).toBe(4);
  });
});
