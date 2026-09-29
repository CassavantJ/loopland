import { RIDE_TYPES } from './catalog';
import { DIRECTIONS, DX, DZ, type Tile } from './grid';
import { BIN_CAPACITY, DAY_SECONDS, PATH_ITEM_IDS, USE, type Park, type Ride } from './park';
import { JOB_TIME, type Job, type Staff } from './staff';
import type { World } from './world';

/**
 * What the staff do: walk the paths, find the nearest job for their role, claim it so nobody
 * else goes too, walk there and do it. With nothing to do they wander (which is the whole job
 * for security guards and entertainers).
 */

const STAFF_WALK = 1.3;
/** How far along the paths a handyman looks for work. */
const SEARCH = 40;
/** Bins this full get emptied. */
const EMPTY_AT = Math.ceil(BIN_CAPACITY * 0.6);

const key = (job: Job, park: Park) =>
  job.kind === 'fix' || job.kind === 'inspect'
    ? `ride:${job.ride}`
    : `tile:${park.index(job.tile.x, job.tile.z)}`;

export function updateStaff(world: World, staff: Staff, dt: number): void {
  const park = world.park;
  if (staff.state === 'working') {
    staff.timer -= dt;
    if (staff.timer <= 0) finishJob(world, staff);
    return;
  }
  staff.progress = Math.min(1, staff.progress + STAFF_WALK * dt);
  const { from, to, progress, heading } = staff;
  staff.x = from.x + (to.x - from.x) * progress + 0.5 - DZ[heading] * staff.lane;
  staff.z = from.z + (to.z - from.z) * progress + 0.5 + DX[heading] * staff.lane;
  if (staff.progress < 1) return;

  staff.from = staff.to;
  const here = staff.from;
  if (!park.isWalkable(here.x, here.z)) {
    // Their path was bulldozed: back to the entrance.
    dropJob(world, staff);
    staff.from = world.gateInside;
    staff.to = world.gateInside;
    return;
  }
  if (staff.job && !stillNeeded(world, staff.job)) dropJob(world, staff);
  if (!staff.job) findJob(world, staff);
  const job = staff.job;
  if (job?.tile.x === here.x && job.tile.z === here.z) {
    staff.state = 'working';
    staff.timer = JOB_TIME[job.kind];
    return;
  }
  step(world, staff, job?.tile ?? null);
}

/** One tile towards a target along the paths, or a wander. */
function step(world: World, staff: Staff, target: Tile | null) {
  const park = world.park;
  const here = staff.from;
  const options = world.nav.neighbours(here);
  let next: Tile | undefined;
  if (target) {
    const field = world.nav.field(target);
    const distance = field[park.index(here.x, here.z)] ?? -1;
    if (distance < 0) {
      dropJob(world, staff);
    } else {
      const closer = options.filter(
        (option) => field[park.index(option.x, option.z)] === distance - 1,
      );
      if (closer.length > 0) next = park.random.pick(closer);
    }
  }
  if (!next) {
    const back = { x: here.x - DX[staff.heading], z: here.z - DZ[staff.heading] };
    const forward = options.filter((option) => option.x !== back.x || option.z !== back.z);
    next = forward.length > 0 ? park.random.pick(forward) : options[0];
  }
  if (!next) return;
  for (const direction of DIRECTIONS) {
    if (here.x + DX[direction] === next.x && here.z + DZ[direction] === next.z)
      staff.heading = direction;
  }
  staff.to = next;
  staff.progress = 0;
}

/** Whether a claimed job still needs doing. */
function stillNeeded(world: World, job: Job): boolean {
  const park = world.park;
  if (job.kind === 'fix' || job.kind === 'inspect') {
    const ride = park.ride(job.ride);
    return !!ride && (job.kind === 'fix' ? ride.broken : inspectionDue(park, ride));
  }
  const index = park.index(job.tile.x, job.tile.z);
  if (!park.isWalkable(job.tile.x, job.tile.z)) return false;
  switch (job.kind) {
    case 'sweep':
      return (park.litter[index] ?? 0) > 0 || (park.vomit[index] ?? 0) > 0;
    case 'empty':
      return (park.binFill[index] ?? 0) > 0;
    case 'repair':
      return park.smashed[index] === 1;
  }
}

export function inspectionDue(park: Park, ride: Ride): boolean {
  if (RIDE_TYPES[ride.type].kind !== 'ride' || ride.broken || ride.inspectEvery <= 0) return false;
  return (park.time - ride.lastInspection) / DAY_SECONDS >= ride.inspectEvery;
}

/** Where a mechanic stands to work on a ride: by its exit, or else its entrance. */
export function mechanicSpot(world: World, ride: Ride): Tile | null {
  const park = world.park;
  for (const which of ['exit', 'entrance'] as const) {
    const spot = park.frontOf(ride, which);
    if (spot && park.isWalkable(spot.x, spot.z)) return spot;
  }
  const join = world.line(ride).join;
  return join && park.isWalkable(join.x, join.z) ? join : null;
}

function claim(world: World, staff: Staff, job: Job) {
  staff.job = job;
  world.claims.add(key(job, world.park));
}

export function dropJob(world: World, staff: Staff): void {
  if (staff.job) world.claims.delete(key(staff.job, world.park));
  staff.job = null;
  staff.state = 'walking';
}

function findJob(world: World, staff: Staff) {
  const park = world.park;
  if (staff.role === 'mechanic') {
    // Broken rides first, then inspections, nearest first.
    for (const wanted of ['fix', 'inspect'] as const) {
      let best: Job | null = null;
      let bestDistance = Infinity;
      for (const ride of park.rides) {
        const needed = wanted === 'fix' ? ride.broken : inspectionDue(park, ride);
        if (!needed || world.claims.has(`ride:${ride.id}`)) continue;
        const spot = mechanicSpot(world, ride);
        if (!spot) continue;
        const distance = world.nav.distance(staff.from, spot);
        if (distance >= 0 && distance < bestDistance) {
          best = { kind: wanted, ride: ride.id, tile: spot };
          bestDistance = distance;
        }
      }
      if (best) {
        claim(world, staff, best);
        return;
      }
    }
    return;
  }
  if (staff.role !== 'handyman') return;
  // Breadth-first along the paths for the nearest mess, full bin or smashed item.
  const start = park.index(staff.from.x, staff.from.z);
  const seen = new Map<number, number>([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const index = queue.shift() ?? start;
    const distance = seen.get(index) ?? 0;
    const x = index % park.width;
    const z = Math.floor(index / park.width);
    const tile = { x, z };
    const job: Job | null =
      (park.litter[index] ?? 0) > 0 || (park.vomit[index] ?? 0) > 0
        ? { kind: 'sweep', tile }
        : (park.binFill[index] ?? 0) >= EMPTY_AT
          ? { kind: 'empty', tile }
          : park.smashed[index] === 1
            ? { kind: 'repair', tile }
            : null;
    if (job && !world.claims.has(key(job, park))) {
      claim(world, staff, job);
      return;
    }
    if (distance >= SEARCH) continue;
    for (const next of world.nav.neighbours(tile)) {
      const nextIndex = park.index(next.x, next.z);
      if (seen.has(nextIndex)) continue;
      seen.set(nextIndex, distance + 1);
      queue.push(nextIndex);
    }
  }
}

function finishJob(world: World, staff: Staff) {
  const park = world.park;
  const job = staff.job;
  staff.state = 'walking';
  if (!job) return;
  const index = park.index(job.tile.x, job.tile.z);
  switch (job.kind) {
    case 'sweep':
      park.litter[index] = 0;
      park.vomit[index] = 0;
      park.dirtVersion++;
      break;
    case 'empty':
      park.binFill[index] = 0;
      park.dirtVersion++;
      break;
    case 'repair':
      park.smashed[index] = 0;
      park.dirtVersion++;
      break;
    case 'fix': {
      const ride = park.ride(job.ride);
      if (ride?.broken) {
        ride.broken = false;
        ride.reliability = Math.min(0.98, ride.reliability + 0.03);
        ride.lastInspection = park.time;
        park.post(`${ride.name} has been fixed.`, { ride: ride.id });
      }
      break;
    }
    case 'inspect': {
      const ride = park.ride(job.ride);
      if (ride) {
        const age = (park.day - ride.built) / 160;
        ride.reliability = Math.min(0.98 - age * 0.03, ride.reliability + 0.08);
        ride.lastInspection = park.time;
      }
      break;
    }
  }
  staff.done[job.kind]++;
  dropJob(world, staff);
}

/** Whether a security guard is within a few tiles. */
export function guarded(park: Park, tile: Tile): boolean {
  return park.staff.some(
    (staff) =>
      staff.role === 'security' &&
      Math.max(Math.abs(staff.x - tile.x - 0.5), Math.abs(staff.z - tile.z - 0.5)) < 6,
  );
}

/** Which way a bench, bin or lamp sits on its path tile, shared by the view and the sim. */
export function itemSide(park: Park, x: number, z: number): { dx: number; dz: number } {
  const side = (x + z) % 2 === 0 ? 1 : -1;
  const across = park.useAt(x + 1, z) === USE.path || park.useAt(x - 1, z) === USE.path;
  return across ? { dx: 0, dz: side * 0.36 } : { dx: side * 0.36, dz: 0 };
}

export const itemAt = (park: Park, index: number) =>
  PATH_ITEM_IDS[(park.pathItem[index] ?? 0) - 1] ?? null;
