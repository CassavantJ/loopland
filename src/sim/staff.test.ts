import { describe, expect, it } from 'vitest';

import { guarded, inspectionDue } from './crew';
import {
  BIN_CAPACITY,
  createPark,
  DAY_SECONDS,
  MONTH_DAYS,
  Park,
  PATH_ITEM_IDS,
  type SavedPark,
} from './park';
import { currentProject, newResearch, researchDay, RESEARCH_ORDER } from './research';
import { STAFF } from './staff';
import { TICK, World } from './world';

const run = (world: World, seconds: number) => {
  for (let step = 0; step < seconds / TICK; step++) world.tick();
};

/** The starter park from the guest tests: a street, a carousel and some stalls. */
function starter(seed = 3) {
  const park = createPark(seed);
  const world = new World(park);
  const gx = park.gate.x;
  const plaza = park.depth - 8;
  for (let z = plaza - 1; z >= plaza - 10; z--) park.buildPath(gx, z);
  const carousel = park.placeRide('carousel', gx - 4, plaza - 6, 1);
  park.placeRide('burger-stall', gx + 1, plaza - 2, 3);
  park.placeRide('drink-stall', gx + 1, plaza - 3, 3);
  park.placeRide('toilets', gx + 1, plaza - 4, 3);
  if (!carousel) throw new Error('no carousel');
  return { park, world, carousel, gx, plaza };
}

const dirt = (park: Park) =>
  park.litter.reduce((sum, value) => sum + value, 0) +
  park.vomit.reduce((sum, value) => sum + value, 0);

describe('litter and bins', () => {
  it('piles up on the paths when there are no bins', () => {
    const { park, world } = starter();
    run(world, 900);
    expect(park.litter.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(5);
  });

  it('goes in bins instead when there are some', () => {
    const { park, world, gx, plaza } = starter();
    for (let z = plaza - 1; z >= plaza - 10; z -= 2) park.placePathItem('bin', gx, z);
    park.placePathItem('bin', gx, plaza);
    run(world, 900);
    const binned = park.binFill.reduce((sum, value) => sum + value, 0);
    expect(binned).toBeGreaterThan(5);
  });

  it('gets swept up and emptied by a handyman', () => {
    const { park, world, gx, plaza } = starter();
    park.placePathItem('bin', gx, plaza - 5);
    park.binFill[park.index(gx, plaza - 5)] = BIN_CAPACITY;
    for (let z = plaza - 1; z >= plaza - 8; z--) park.litter[park.index(gx, z)] = 4;
    park.vomit[park.index(gx, plaza - 9)] = 1;
    const handyman = world.hire('handyman');
    park.entranceFee = 100_000; // no guests making more mess
    run(world, 120);
    expect(dirt(park)).toBe(0);
    expect(park.binFill[park.index(gx, plaza - 5)]).toBe(0);
    expect(handyman?.done.sweep).toBeGreaterThan(5);
    expect(handyman?.done.empty).toBe(1);
  });
});

describe('breakdowns', () => {
  it('shut a ride until a mechanic fixes it', () => {
    const { park, world, carousel } = starter();
    carousel.broken = true;
    expect(world.usable(carousel)).toBe(false);
    expect(world.problem(carousel)).toMatch(/Hire a mechanic/);
    run(world, 60);
    expect(carousel.broken).toBe(true);
    const mechanic = world.hire('mechanic');
    run(world, 90);
    expect(carousel.broken).toBe(false);
    expect(mechanic?.done.fix).toBe(1);
    expect(park.messages.some((message) => message.text.includes('fixed'))).toBe(true);
  });

  it('get less likely with regular inspections', () => {
    const { park, world, carousel } = starter();
    carousel.reliability = 0.6;
    carousel.lastInspection = -10 * DAY_SECONDS;
    carousel.inspectEvery = 2;
    expect(inspectionDue(park, carousel)).toBe(true);
    world.hire('mechanic');
    run(world, 90);
    expect(carousel.reliability).toBeGreaterThan(0.6);
    expect(inspectionDue(park, carousel)).toBe(false);
  });

  it('happen to neglected rides eventually', () => {
    const { world, carousel } = starter();
    carousel.reliability = 0.4;
    carousel.inspectEvery = 0;
    run(world, DAY_SECONDS * MONTH_DAYS * 6);
    expect(carousel.breakdowns).toBeGreaterThan(0);
  });
});

describe('security', () => {
  it('knows when a guard is close by', () => {
    const { park, world, gx, plaza } = starter();
    expect(guarded(park, { x: gx, z: plaza - 3 })).toBe(false);
    world.hire('security');
    expect(guarded(park, { x: gx, z: park.depth - 3 })).toBe(true);
    expect(guarded(park, { x: 2, z: 2 })).toBe(false);
  });

  it('stops angry guests smashing things', () => {
    const smashedWith = (guards: number) => {
      const { park, world, gx, plaza } = starter(9);
      for (let z = plaza; z >= plaza - 10; z--) park.placePathItem('bench', gx, z);
      for (let index = 0; index < guards; index++) world.hire('security');
      for (let second = 0; second < 600; second++) {
        run(world, 1);
        // Make everyone furious, but not quite furious enough to leave.
        for (const guest of world.guests) guest.happiness = Math.min(guest.happiness, 0.18);
      }
      return park.smashed.reduce((sum, value) => sum + value, 0);
    };
    const unguarded = smashedWith(0);
    expect(unguarded).toBeGreaterThan(0);
    expect(smashedWith(3)).toBeLessThan(unguarded);
  });
});

describe('staff costs', () => {
  it('pays everyone’s wages each month', () => {
    const { park, world } = starter();
    world.hire('handyman');
    world.hire('entertainer');
    run(world, DAY_SECONDS * MONTH_DAYS + 1);
    expect(park.history[0]?.ledger.wages).toBe(-(STAFF.handyman.wage + STAFF.entertainer.wage));
  });
});

describe('research', () => {
  it('starts with a few rides and invents the rest in order', () => {
    const research = newResearch();
    expect(currentProject(research)).toBe(RESEARCH_ORDER[0]);
    let days = 0;
    while (currentProject(research) && days < 2_000) {
      researchDay(research);
      days++;
    }
    expect(research.invented).toEqual(expect.arrayContaining([...RESEARCH_ORDER]));
    // At normal funding, everything takes a few in-game years, not forever.
    expect(days).toBeGreaterThan(150);
    expect(days).toBeLessThan(600);
  });

  it('won’t build what hasn’t been invented, and costs nothing with nothing to invent', () => {
    const park = createPark(2, 48, false);
    expect(park.placement('drop-tower', 20, 20, 2).reason).toBe('Not invented yet.');
    expect(park.placement('carousel', 20, 20, 2).ok).toBe(true);
    const world = new World(park);
    run(world, DAY_SECONDS * MONTH_DAYS + 1);
    expect(park.history[0]?.ledger.research).toBeLessThan(0);
    const done = createPark(2);
    const idle = new World(done);
    run(idle, DAY_SECONDS * MONTH_DAYS + 1);
    expect(done.history[0]?.ledger.research).toBe(0);
  });
});

describe('saving', () => {
  it('keeps staff, mess, bins and research', () => {
    const { park, world, gx, plaza } = starter();
    world.hire('mechanic');
    park.placePathItem('bin', gx, plaza - 2);
    park.binFill[park.index(gx, plaza - 2)] = 3;
    park.litter[park.index(gx, plaza - 4)] = 2;
    park.research = newResearch();
    researchDay(park.research);
    const copy = JSON.parse(JSON.stringify(park.toJSON())) as SavedPark;
    const loaded = Park.fromJSON(copy);
    expect(loaded.staff.map((staff) => staff.role)).toEqual(['mechanic']);
    expect(loaded.binFill[park.index(gx, plaza - 2)]).toBe(3);
    expect(loaded.litter[park.index(gx, plaza - 4)]).toBe(2);
    expect(loaded.research.progress).toBeCloseTo(park.research.progress);
    expect(PATH_ITEM_IDS).toContain('bin');
  });

  it('loads parks saved before staff and research existed', () => {
    const { park } = starter();
    const old = JSON.parse(JSON.stringify(park.toJSON())) as Partial<SavedPark>;
    delete old.staff;
    delete old.research;
    delete old.litter;
    const loaded = Park.fromJSON(old as SavedPark);
    expect(loaded.staff).toEqual([]);
    expect(currentProject(loaded.research)).toBeNull();
    expect(loaded.rides[0]?.reliability).toBeGreaterThan(0);
  });
});
