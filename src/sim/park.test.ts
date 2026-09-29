import { describe, expect, it } from 'vitest';

import { RIDE_TYPES } from './catalog';
import { Terrain } from './grid';
import { createPark, USE, type Park } from './park';
import { TICK, World } from './world';

/** A plaza north of the entrance path with a carousel, a burger bar, drinks and toilets. */
function starterPark(): { park: Park; world: World } {
  const park = createPark(3);
  const world = new World(park);
  const gx = park.gate.x;
  const plaza = park.depth - 8;
  // A main street running north from the plaza.
  for (let z = plaza - 1; z >= plaza - 10; z--) park.buildPath(gx, z);
  // Carousel west of the street, entrance and exit facing east onto it.
  const carousel = park.placeRide('carousel', gx - 4, plaza - 6, 1);
  // Stalls east of the street, counters facing west.
  const burgers = park.placeRide('burger-stall', gx + 1, plaza - 2, 3);
  const drinks = park.placeRide('drink-stall', gx + 1, plaza - 3, 3);
  const toilets = park.placeRide('toilets', gx + 1, plaza - 4, 3);
  if (!carousel || !burgers || !drinks || !toilets) throw new Error('could not build');
  return { park, world };
}

const run = (world: World, seconds: number) => {
  for (let step = 0; step < seconds / TICK; step++) world.tick();
};

describe('terrain', () => {
  it('only allows gentle slopes, and levels without cliffs', () => {
    const terrain = new Terrain(8, 8);
    terrain.corners.fill(4);
    terrain.level(3, 3, 4, 4, 8);
    for (let z = 0; z <= 8; z++) {
      for (let x = 0; x < 8; x++) {
        expect(Math.abs(terrain.corner(x, z) - terrain.corner(x + 1, z))).toBeLessThanOrEqual(1);
      }
    }
    expect(terrain.isFlat(3, 3)).toBe(true);
    expect(terrain.base(3, 3)).toBe(8);
  });

  it('knows where paths can go and which tiles meet', () => {
    const terrain = new Terrain(4, 4);
    terrain.corners.fill(2);
    expect(terrain.pathShape(1, 1)).toBe('flat');
    expect(terrain.meets(1, 1, 1)).toBe(true);
    // Raise the east edge of tile (1,1): a ramp going up to the east.
    terrain.setCorner(2, 1, 3);
    terrain.setCorner(2, 2, 3);
    expect(terrain.pathShape(1, 1)).toBe('ramp');
    expect(terrain.meets(1, 1, 3)).toBe(true);
  });
});

describe('building', () => {
  it('builds a starting park with an entrance path', () => {
    const park = createPark(1);
    expect(park.useAt(park.gate.x, park.gate.z)).toBe(USE.gate);
    expect(park.useAt(park.gate.x, park.gate.z - 1)).toBe(USE.path);
    expect(park.money).toBe(2_500_000);
  });

  it('places rides with an entrance and exit out front, and charges for them', () => {
    const park = createPark(1);
    const before = park.money;
    const x = park.gate.x - 1;
    const z = park.depth - 14;
    const ride = park.placeRide('carousel', x, z, 2);
    expect(ride).not.toBeNull();
    expect(ride?.entrance).toEqual({ x: x + 2, z: z + 3 });
    expect(ride?.exit).toEqual({ x, z: z + 3 });
    expect(park.useAt(x + 1, z + 1)).toBe(USE.ride);
    expect(park.money).toBeLessThanOrEqual(before - RIDE_TYPES.carousel.cost);
    // Nothing else can go on top of it.
    expect(park.placement('toilets', x + 1, z + 1, 0).ok).toBe(false);
    expect(park.buildPath(x + 1, z + 1)).toBe(false);
  });

  it('refunds half when bulldozing, and removes whole rides', () => {
    const park = createPark(1);
    const ride = park.placeRide('teacups', park.gate.x - 1, park.depth - 14, 2);
    if (!ride) throw new Error('no ride');
    const money = park.money;
    expect(park.demolish(ride.x + 1, ride.z + 1)).toBe(ride.name);
    expect(park.rides).toHaveLength(0);
    expect(park.money).toBe(money + RIDE_TYPES.teacups.cost / 2);
    expect(park.useAt(ride.entrance?.x ?? 0, ride.entrance?.z ?? 0)).toBe(USE.empty);
  });

  it('follows a queue line from the entrance to the path', () => {
    const park = createPark(1);
    const gx = park.gate.x;
    const ride = park.placeRide('carousel', gx - 1, park.depth - 16, 2);
    if (!ride?.entrance) throw new Error('no ride');
    // Queue: two tiles south of the entrance, then the path.
    park.buildPath(ride.entrance.x, ride.entrance.z + 1, true);
    park.buildPath(ride.entrance.x, ride.entrance.z + 2, true);
    park.buildPath(ride.entrance.x, ride.entrance.z + 3);
    const line = park.queueLine(ride);
    expect(line.tiles).toHaveLength(2);
    expect(line.join).toEqual({ x: ride.entrance.x, z: ride.entrance.z + 3 });
  });

  it('saves and loads', () => {
    const { park } = starterPark();
    const copy = JSON.parse(JSON.stringify(park.toJSON())) as ReturnType<Park['toJSON']>;
    const loaded = (park.constructor as typeof Park).fromJSON(copy);
    expect(loaded.rides.map((ride) => ride.name)).toEqual(park.rides.map((ride) => ride.name));
    expect(Array.from(loaded.use)).toEqual(Array.from(park.use));
    expect(loaded.money).toBe(park.money);
  });
});

describe('guests', () => {
  it('come in, ride, eat, and pay for it', () => {
    const { park, world } = starterPark();
    const start = park.money;
    run(world, 600);
    expect(world.visitors).toBeGreaterThan(10);
    const carousel = park.rides.find((ride) => ride.type === 'carousel');
    expect(carousel?.customers).toBeGreaterThan(5);
    const food = park.rides.filter((ride) => RIDE_TYPES[ride.type].kind === 'stall');
    expect(food.reduce((sum, stall) => sum + stall.customers, 0)).toBeGreaterThan(0);
    expect(park.money).toBeGreaterThan(start);
    expect(park.ledger.entrance + (park.history[0]?.ledger.entrance ?? 0)).toBeGreaterThan(0);
  });

  it('never stand on anything but paths and queues', () => {
    const { park, world } = starterPark();
    for (let second = 0; second < 400; second++) {
      run(world, 1);
      for (const guest of world.guests) {
        if (guest.state !== 'walking') continue;
        const use = park.useAt(Math.floor(guest.x), Math.floor(guest.z));
        expect([USE.path, USE.queue, USE.gate]).toContain(use);
      }
    }
  });

  it('stop coming when the entrance fee is outrageous', () => {
    const { park, world } = starterPark();
    park.entranceFee = 20_000;
    run(world, 300);
    expect(world.visitors).toBe(0);
  });

  it('leave the queue when a ride is demolished', () => {
    const { park, world } = starterPark();
    run(world, 300);
    const carousel = park.rides.find((ride) => ride.type === 'carousel');
    if (!carousel) throw new Error('no carousel');
    park.demolish(carousel.x, carousel.z);
    expect(
      world.guests.filter((guest) => guest.state === 'queuing' || guest.state === 'riding'),
    ).toHaveLength(0);
    run(world, 60);
  });
});
