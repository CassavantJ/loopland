import { describe, expect, it } from 'vitest';

import {
  borrow,
  CAMPAIGNS,
  earnedAwards,
  INTEREST,
  parkValue,
  repay,
  startCampaign,
} from './business';
import { buildDesign, placeCoaster } from './coasters';
import { RIDE_TYPES, type RideTypeId } from './catalog';
import { createPark, DAY_SECONDS, MONTH_DAYS, MONTHS, type Park } from './park';
import {
  createScenario,
  describeObjective,
  objectiveStatus,
  scenario,
  SCENARIOS,
} from './scenarios';
import { TICK, World } from './world';

const run = (world: World, seconds: number) => {
  for (let step = 0; step < seconds / TICK; step++) world.tick();
};
const MONTH = DAY_SECONDS * MONTH_DAYS;

/**
 * A street north from the plaza with rides either side, each with a queue line four tiles
 * long, plus stalls, bins, benches and staff: roughly what a sensible player builds.
 */
function buildStreet(park: Park, world: World, rides: readonly RideTypeId[]) {
  const gx = park.gate.x;
  const plaza = park.depth - 8;
  for (let z = plaza - 1; z >= plaza - 30; z--) park.buildPath(gx, z);
  const placed: string[] = [];
  const next = { west: plaza - 2, east: plaza - 2 };
  rides.forEach((type, index) => {
    const west = index % 2 === 0;
    const spec = RIDE_TYPES[type];
    // Sideways facings swap the footprint.
    const width = spec.depth;
    const depth = spec.width;
    const z = (west ? next.west : next.east) - depth + 1;
    const ride = west
      ? park.placeRide(type, gx - 5 - width, z, 1)
      : park.placeRide(type, gx + 5, z, 3);
    if (west) next.west = z - 2;
    else next.east = z - 2;
    if (!ride?.entrance || !ride.exit) {
      placed.push(`${type} failed`);
      return;
    }
    placed.push(ride.name);
    // Queue from the entrance back to the street; a path from the exit to it.
    const step = west ? 1 : -1;
    for (let x = ride.entrance.x + step; x !== gx; x += step)
      park.buildPath(x, ride.entrance.z, true);
    for (let x = ride.exit.x + step; x !== gx; x += step) park.buildPath(x, ride.exit.z);
  });
  // Stalls wherever there's room along the street, counters facing it.
  const stall = (type: RideTypeId) => {
    for (let z = plaza - 1; z >= plaza - 30; z--) {
      if (park.placeRide(type, gx - 1, z, 1) ?? park.placeRide(type, gx + 1, z, 3)) return;
    }
    placed.push(`${type} failed`);
  };
  for (const type of [
    'burger-stall',
    'drink-stall',
    'toilets',
    'toilets',
    'burger-stall',
    'drink-stall',
  ] as const) {
    stall(type);
  }
  for (let z = plaza - 3; z >= plaza - 27; z -= 4) {
    park.placePathItem('bin', gx, z);
    park.placePathItem('bench', gx, z - 2);
  }
  world.hire('handyman');
  world.hire('handyman');
  world.hire('mechanic');
  world.hire('security');
  return placed;
}

describe('loans', () => {
  it('lends up to a limit, charges interest monthly, and takes repayments', () => {
    const park = createPark(2);
    const world = new World(park);
    park.maxLoan = 300_000;
    const money = park.money;
    expect(borrow(park).ok).toBe(true);
    expect(borrow(park, 500_000).ok).toBe(true);
    expect(park.loan).toBe(300_000);
    expect(borrow(park).ok).toBe(false);
    expect(park.money).toBe(money + 300_000);
    park.entranceFee = 100_000;
    run(world, MONTH + 1);
    expect(park.ledger.interest).toBe(-Math.round(300_000 * INTEREST));
    expect(repay(park, 200_000).ok).toBe(true);
    expect(park.loan).toBe(100_000);
  });
});

describe('land', () => {
  it('can only be built on once bought', () => {
    const def = scenario('little-acre');
    if (!def) throw new Error('missing scenario');
    const park = createScenario(def);
    // Just north of the plot, on the flat.
    expect(park.forSale(22, 26)).toBe(true);
    expect(park.buildPath(22, 26)).toBe(false);
    const money = park.money;
    expect(park.buyLand(22, 26, 23, 27).ok).toBe(true);
    expect(park.money).toBe(money - 4 * def.landPrice);
    expect(park.isOwned(22, 26)).toBe(true);
    expect(park.buildPath(22, 26)).toBe(true);
    expect(park.buyLand(22, 26, 23, 27).ok).toBe(false);
    // The map's edge is never for sale.
    expect(park.forSale(0, 10)).toBe(false);
  });
});

describe('marketing', () => {
  it('brings in more guests, costs money each month, and ends', () => {
    const visitors = (advertise: boolean) => {
      const park = createPark(5);
      const world = new World(park);
      buildStreet(park, world, ['carousel', 'teacups']);
      if (advertise) expect(startCampaign(park, 'adverts', 2).ok).toBe(true);
      run(world, MONTH * 1.5);
      return { visitors: world.visitors, park };
    };
    const plain = visitors(false);
    const advertised = visitors(true);
    expect(advertised.visitors).toBeGreaterThan(plain.visitors * 1.2);
    const park = advertised.park;
    expect(park.history[0]?.ledger.marketing).toBe(-CAMPAIGNS.adverts.cost);
    expect(park.ledger.marketing).toBe(-CAMPAIGNS.adverts.cost);
    expect(startCampaign(park, 'adverts', 1).ok).toBe(false);
  });
});

describe('awards', () => {
  it('go to spotless parks, and lift the rating', () => {
    const park = createPark(8);
    const world = new World(park);
    for (let z = 5; z < 45; z++) park.buildPath(20, z);
    world.cleanliness = 1;
    expect(earnedAwards(world)).toContain('tidiest');
    world.cleanliness = 0.5;
    expect(earnedAwards(world)).not.toContain('tidiest');
  });
});

describe('scenarios', () => {
  for (const def of SCENARIOS) {
    it(`${def.name} sets up a playable park`, () => {
      const park = createScenario(def);
      const world = new World(park);
      expect(park.isWalkable(world.gateInside.x, world.gateInside.z)).toBe(true);
      expect(park.money).toBe(def.money);
      expect(park.loan).toBe(def.loan);
      expect(park.objective).toEqual(def.objective);
      expect(describeObjective(def.objective).length).toBeGreaterThan(10);
      if (def.lake) expect(park.deepWater(def.lake.x0 + 3, def.lake.z0 + 3)).toBe(true);
      if (def.invented === 'all')
        expect(park.placement('steel-coaster', 20, 20, 3).reason).not.toMatch(/invented/);
      else expect(park.placement('steel-coaster', 20, 20, 3).reason).toMatch(/invented/);
    });
  }

  it('reports progress, and is won as soon as the goal is met', () => {
    const park = createPark(9);
    const world = new World(park);
    // The trees the park starts with are worth something already.
    const start = parkValue(world);
    park.objective = { kind: 'value', value: start + 50_000, year: 2 };
    expect(objectiveStatus(world).met).toBe(false);
    park.placeRide('carousel', 20, 20, 2);
    expect(parkValue(world)).toBeGreaterThanOrEqual(start + 50_000);
    run(world, DAY_SECONDS + 1);
    expect(park.outcome).toBe('won');
  });

  it('is lost when the deadline passes', () => {
    const park = createPark(9);
    const world = new World(park);
    park.objective = { kind: 'guests', guests: 5_000, rating: 900, year: 1 };
    run(world, MONTH * MONTHS.length + DAY_SECONDS);
    expect(park.outcome).toBe('lost');
  });

  it('counts exciting coasters towards a coaster goal', () => {
    const park = createPark(4);
    park.money = 10_000_000;
    const world = new World(park);
    park.objective = { kind: 'coasters', count: 1, excitement: 5, year: 3 };
    const ride = placeCoaster(park, 'steel-coaster', 22, 26, 3);
    if (!ride) throw new Error('no coaster');
    buildDesign(park, ride);
    ride.open = true;
    expect(objectiveStatus(world).met).toBe(true);
  });

  it('Sunny Meadows can be won with a sensible park', () => {
    const def = scenario('sunny-meadows');
    if (def?.objective.kind !== 'guests') throw new Error('missing scenario');
    const park = createScenario(def);
    const world = new World(park);
    const placed = buildStreet(park, world, [
      'carousel',
      'teacups',
      'carousel',
      'teacups',
      'carousel',
      'teacups',
    ]);
    expect(placed.filter((name) => name.includes('failed'))).toEqual([]);
    const deadline = MONTH * MONTHS.length * def.objective.year;
    let seconds = 0;
    const log: string[] = [];
    while (park.outcome === 'playing' && seconds < deadline) {
      run(world, MONTH);
      seconds += MONTH;
      const guests = world.guests;
      const happy =
        guests.reduce((sum, guest) => sum + guest.happiness, 0) / Math.max(1, guests.length);
      log.push(`${park.date}: ${objectiveStatus(world).progress}, happiness ${happy.toFixed(2)}`);
    }
    const thoughts = new Map<string, number>();
    for (const guest of world.guests) {
      for (const thought of guest.thoughts.slice(0, 2))
        thoughts.set(thought.text, (thoughts.get(thought.text) ?? 0) + 1);
    }
    log.push(JSON.stringify([...thoughts].sort((x, y) => y[1] - x[1]).slice(0, 12)));
    log.push(
      JSON.stringify(
        park.rides.map(
          (ride) =>
            `${ride.name} ${world.problem(ride) ?? 'ok'} q${ride.queue.length} c${ride.customers}`,
        ),
      ),
    );
    const needs = (key: 'hunger' | 'thirst' | 'toilet' | 'energy' | 'nausea') =>
      (
        world.guests.reduce((sum, guest) => sum + guest[key], 0) / Math.max(1, world.guests.length)
      ).toFixed(2);
    log.push(
      `needs hunger ${needs('hunger')} thirst ${needs('thirst')} toilet ${needs('toilet')} energy ${needs('energy')} nausea ${needs('nausea')}`,
    );
    expect(park.outcome, log.join(' | ')).toBe('won');
  });
});
