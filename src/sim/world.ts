import { RIDE_TYPES, type Item } from './catalog';
import { DIRECTIONS, DX, DZ, type Direction, type Tile } from './grid';
import { circuitOf } from './coasters';
import { stepTrain } from './coaster';
import {
  afterRide,
  afterStall,
  driftNeeds,
  fairPrice,
  intensityFit,
  makeGuest,
  ratingsOf,
  think,
  type Guest,
} from './guests';
import { beautyMap, sceneryBonus } from './beauty';
import { dropJob, guarded, inspectionDue, itemAt, itemSide, updateStaff } from './crew';
import { Navigator } from './navigation';
import { BIN_CAPACITY, emptyLedger, MONTHS, USE, type Park, type Ride } from './park';
import { currentProject, FUNDING, researchDay } from './research';
import { makeStaff, STAFF, type Staff, type StaffRole } from './staff';

/** Game seconds per simulation step. */
export const TICK = 0.1;
/** Walking speed in tiles per second. */
const WALK = 1.15;
/** Guests per queue tile. */
const PER_QUEUE_TILE = 3;
const FOOD: readonly Item[] = ['burger', 'ice-cream'];

interface Line {
  version: number;
  tiles: Tile[];
  join: Tile | null;
}

/**
 * The living park: guests arriving, walking, queuing, riding, eating and going home, rides
 * cycling, and the money coming in and going out. Advance it with `tick`.
 */
export class World {
  readonly park: Park;
  readonly nav: Navigator;
  guests: Guest[] = [];
  private byId = new Map<number, Guest>();
  private nextGuestId = 1;
  private lines = new Map<number, Line>();
  /** Everyone who ever came in. */
  visitors = 0;
  /** Jobs a staff member is already on its way to. */
  readonly claims = new Set<string>();
  /** How clean the paths are, 0-1, updated daily. */
  cleanliness = 1;
  private lastNag = -100;

  constructor(park: Park) {
    this.park = park;
    this.nav = new Navigator(park);
    park.onRideRemoved = (ride) => {
      this.release(ride);
    };
  }

  guest(id: number): Guest | undefined {
    return this.byId.get(id);
  }

  get inPark(): number {
    return this.guests.length;
  }

  // Layout -------------------------------------------------------------------------------------

  line(ride: Ride): Line {
    const cached = this.lines.get(ride.id);
    if (cached?.version === this.park.version) return cached;
    const line = { version: this.park.version, ...this.park.queueLine(ride) };
    this.lines.set(ride.id, line);
    return line;
  }

  /** Where guests go to use a ride (the end of its queue) or a stall (its counter). */
  target(ride: Ride): Tile | null {
    const spec = RIDE_TYPES[ride.type];
    if (spec.kind === 'stall') {
      const counter = this.park.frontOf(ride, 'counter');
      return counter && this.park.isWalkable(counter.x, counter.z) ? counter : null;
    }
    return this.line(ride).join;
  }

  /** Whether guests can use a ride: open, with a way in and a way out. */
  usable(ride: Ride): boolean {
    if (!ride.open || ride.broken) return false;
    if (ride.coaster && (!ride.coaster.complete || !ride.coaster.stats)) return false;
    const target = this.target(ride);
    if (!target || !this.park.isWalkable(target.x, target.z)) return false;
    if (RIDE_TYPES[ride.type].kind === 'stall') return true;
    const out = this.park.frontOf(ride, 'exit');
    return (
      !!out &&
      this.park.isWalkable(out.x, out.z) &&
      !!ride.exit &&
      this.park.terrain.meets(ride.exit.x, ride.exit.z, ride.facing)
    );
  }

  /** What's wrong with a ride, for its info panel. */
  problem(ride: Ride): string | null {
    const coaster = ride.coaster;
    if (coaster && !coaster.complete)
      return 'The track isn’t finished: bring it back round into the station.';
    if (coaster?.problem) return coaster.problem;
    if (coaster && !coaster.stats) return 'It needs a test run before it can open.';
    if (ride.broken) {
      const coming = this.claims.has(`ride:${ride.id}`);
      const mechanics = this.park.staff.some((staff) => staff.role === 'mechanic');
      return coming
        ? 'Broken down. A mechanic is on the way.'
        : mechanics
          ? 'Broken down, waiting for a mechanic.'
          : 'Broken down! Hire a mechanic to fix it.';
    }
    if (!ride.open) return 'Closed.';
    const spec = RIDE_TYPES[ride.type];
    if (spec.kind === 'stall') return this.target(ride) ? null : 'The counter doesn’t face a path.';
    if (!this.line(ride).join) return 'The entrance isn’t connected to a path.';
    const out = this.park.frontOf(ride, 'exit');
    if (!out || !this.park.isWalkable(out.x, out.z)) return 'The exit isn’t connected to a path.';
    if (this.nav.distance(this.gateInside, this.line(ride).join ?? out) < 0) {
      return 'Guests can’t reach it from the park entrance.';
    }
    return null;
  }

  get gateInside(): Tile {
    return { x: this.park.gate.x, z: this.park.gate.z - 1 };
  }

  // The clock ---------------------------------------------------------------------------------

  tick(dt = TICK): void {
    const park = this.park;
    const day = park.day;
    const month = park.month;
    park.time += dt;
    this.spawn(dt);
    for (const guest of this.guests) this.updateGuest(guest, dt);
    if (this.guests.some((guest) => guest.state === 'gone')) {
      this.guests = this.guests.filter((guest) => {
        if (guest.state !== 'gone') return true;
        this.byId.delete(guest.id);
        return false;
      });
    }
    for (const staff of park.staff) updateStaff(this, staff, dt);
    this.entertain(dt);
    for (const ride of park.rides) this.updateRide(ride, dt);
    if (park.day !== day) this.newDay();
    if (park.month !== month) this.newMonth(month);
  }

  private spawn(dt: number) {
    const park = this.park;
    const inside = this.gateInside;
    if (!park.isWalkable(inside.x, inside.z)) return;
    const rides = park.rides.filter(
      (ride) => RIDE_TYPES[ride.type].kind === 'ride' && this.usable(ride),
    ).length;
    const stalls = park.rides.filter(
      (ride) => RIDE_TYPES[ride.type].kind === 'stall' && this.usable(ride),
    ).length;
    const cap = 30 + rides * 55 + stalls * 8;
    if (this.guests.length >= cap) return;
    const fair = 500 + rides * 350;
    const fee = park.entranceFee;
    const priceFactor = fee <= fair ? 1 : Math.max(0.05, 1 - ((fee - fair) / fair) * 0.9);
    const rate = (0.05 + rides * 0.06 + stalls * 0.008) * (0.4 + park.rating / 800) * priceFactor;
    if (!park.random.chance(rate * dt)) return;

    const guest = makeGuest(this.nextGuestId++, park.gate, 0, park.time, park.random);
    if (guest.money < fee) return;
    guest.money -= fee;
    guest.spent += fee;
    park.earn(fee, 'entrance');
    if (fee > fair * 1.3) {
      guest.happiness -= 0.1;
      think(guest, 'That entrance fee was steep.', park.day);
    }
    this.guests.push(guest);
    this.byId.set(guest.id, guest);
    this.visitors++;
    if (this.visitors === 1) park.post('Your first guest has arrived!', { guest: guest.id });
    else if (this.visitors % 500 === 0)
      park.post(`${this.visitors} guests have visited ${park.name}!`);
  }

  // Guests ------------------------------------------------------------------------------------

  private updateGuest(guest: Guest, dt: number) {
    driftNeeds(guest, dt);
    switch (guest.state) {
      case 'walking':
        guest.goalTime += dt;
        this.walk(guest, dt);
        break;
      case 'queuing':
        guest.timer += dt;
        this.shuffleForward(guest, dt);
        break;
      case 'buying':
        guest.timer -= dt;
        if (guest.timer <= 0) this.finishBuying(guest);
        break;
      case 'sitting':
        guest.timer -= dt;
        guest.happiness = Math.min(1, guest.happiness + 0.003 * dt);
        if (guest.timer <= 0 || guest.energy > 0.95) {
          guest.state = 'walking';
          guest.progress = 1;
        }
        break;
      case 'riding':
      case 'gone':
        break;
    }
    if (guest.nausea > 0.88 && guest.state !== 'riding') {
      guest.nausea = 0.35;
      guest.happiness = Math.max(0, guest.happiness - 0.15);
      think(guest, 'I shouldn’t have eaten before that ride…', this.park.day);
      this.mess(guest, 'vomit');
    }
    // Nobody carries a wrapper forever: with no bin in sight, it ends up on the ground.
    if (guest.rubbish > 45 && guest.state !== 'riding') {
      guest.rubbish = -1;
      this.mess(guest, 'litter');
    }
  }

  private walk(guest: Guest, dt: number) {
    guest.progress = Math.min(1, guest.progress + WALK * dt);
    this.place(guest);
    if (guest.progress >= 1) this.arrive(guest);
  }

  /** Puts a walking guest where their progress says, keeping to their lane. */
  private place(guest: Guest) {
    const { from, to, progress, heading } = guest;
    const x = from.x + (to.x - from.x) * progress + 0.5;
    const z = from.z + (to.z - from.z) * progress + 0.5;
    guest.x = x - DZ[heading] * guest.lane;
    guest.z = z + DX[heading] * guest.lane;
  }

  private arrive(guest: Guest) {
    const park = this.park;
    const tile = guest.to;
    guest.from = tile;

    if (!park.isWalkable(tile.x, tile.z)) {
      // The path was bulldozed under them.
      const rescue = this.nearestWalkable(tile);
      if (!rescue) {
        guest.state = 'gone';
        return;
      }
      guest.from = rescue;
      guest.to = rescue;
      guest.progress = 1;
      this.place(guest);
      return;
    }

    if (guest.goal?.kind === 'leave' && tile.x === park.gate.x && tile.z === park.gate.z) {
      guest.state = 'gone';
      return;
    }
    if (this.onTile(guest, tile)) return;

    if (guest.goal?.kind === 'ride') {
      const ride = park.ride(guest.goal.ride);
      const target = ride && this.usable(ride) ? this.target(ride) : null;
      if (!ride || !target) {
        guest.goal = null;
      } else if (target.x === tile.x && target.z === tile.z) {
        if (this.reach(guest, ride)) return;
      } else if (guest.goalTime > 150) {
        think(guest, `I’ve been looking for ${ride.name} for ages.`, park.day);
        guest.happiness = Math.max(0, guest.happiness - 0.05);
        guest.goal = null;
      }
    }

    if (!guest.goal) this.decide(guest);
    this.stepFrom(guest, tile);
  }

  /** Picks the next tile: downhill towards the goal, or a wander. */
  private stepFrom(guest: Guest, tile: Tile) {
    const park = this.park;
    const options = this.nav.neighbours(tile);
    let next: Tile | undefined;
    const goalTile = this.goalTile(guest);
    if (goalTile) {
      const field = this.nav.field(goalTile);
      const here = field[park.index(tile.x, tile.z)] ?? -1;
      if (here < 0) {
        const name = guest.goal?.kind === 'ride' ? park.ride(guest.goal.ride)?.name : 'the way out';
        think(guest, `I can’t find ${name ?? 'it'}.`, park.day);
        guest.happiness = Math.max(0, guest.happiness - 0.03);
        guest.goal = guest.goal?.kind === 'leave' ? guest.goal : null;
      } else {
        const closer = options.filter(
          (option) => field[park.index(option.x, option.z)] === here - 1,
        );
        if (closer.length > 0) next = park.random.pick(closer);
      }
    }
    if (!next) {
      // Wander: keep going mostly straight, avoid turning back unless it's a dead end.
      const ahead = { x: tile.x + DX[guest.heading], z: tile.z + DZ[guest.heading] };
      const forward = options.filter(
        (option) =>
          !(option.x === tile.x - DX[guest.heading] && option.z === tile.z - DZ[guest.heading]),
      );
      if (
        forward.some((option) => option.x === ahead.x && option.z === ahead.z) &&
        park.random.chance(0.6)
      ) {
        next = ahead;
      } else if (forward.length > 0) {
        next = park.random.pick(forward);
      } else if (options.length > 0) {
        next = park.random.pick(options);
      }
    }
    if (!next) {
      // Nowhere to go (a lone path tile): stand and wait.
      guest.progress = 0.5;
      return;
    }
    guest.heading = directionTo(tile, next);
    guest.to = next;
    guest.progress = 0;
  }

  private goalTile(guest: Guest): Tile | null {
    if (!guest.goal) return null;
    if (guest.goal.kind === 'leave') return this.park.gate;
    const ride = this.park.ride(guest.goal.ride);
    return ride ? this.target(ride) : null;
  }

  /** At the queue's end or the counter: join the queue, or buy. Returns false to keep walking. */
  private reach(guest: Guest, ride: Ride): boolean {
    const park = this.park;
    const spec = RIDE_TYPES[ride.type];
    guest.goal = null;
    if (ride.price > guest.money) {
      think(guest, `I can’t afford ${ride.name}.`, park.day);
      return false;
    }
    if (ride.price > fairPrice(ride) * 2) {
      think(
        guest,
        `I’m not paying ${formatPrice(ride.price)} for ${spec.kind === 'stall' ? 'that' : ride.name}!`,
        park.day,
      );
      guest.happiness = Math.max(0, guest.happiness - 0.03);
      return false;
    }
    if (spec.kind === 'stall') {
      guest.state = 'buying';
      guest.at = ride.id;
      guest.timer = spec.duration;
      guest.heading = ((ride.facing + 2) % 4) as Direction;
      return true;
    }
    const line = this.line(ride);
    const room = Math.max(6, line.tiles.length * PER_QUEUE_TILE);
    if (ride.queue.length >= room) {
      think(guest, `The queue for ${ride.name} is too long.`, park.day);
      guest.happiness = Math.max(0, guest.happiness - 0.02);
      return false;
    }
    ride.queue.push(guest.id);
    guest.state = 'queuing';
    guest.at = ride.id;
    guest.timer = 0;
    return true;
  }

  private finishBuying(guest: Guest) {
    const park = this.park;
    const ride = park.ride(guest.at);
    guest.state = 'walking';
    guest.progress = 1;
    if (!ride) return;
    if (ride.price > 0 && ride.price <= guest.money) {
      guest.money -= ride.price;
      guest.spent += ride.price;
      park.earn(ride.price, 'food');
      ride.income += ride.price;
      ride.monthIncome += ride.price;
    }
    ride.customers++;
    ride.monthCustomers++;
    afterStall(guest, ride, park.day);
  }

  /** Where the guest at `slot` in a ride's queue stands. */
  slot(ride: Ride, slot: number): { x: number; z: number } {
    const line = this.line(ride);
    const tileIndex = Math.floor(slot / PER_QUEUE_TILE);
    const within = slot % PER_QUEUE_TILE;
    const tile = line.tiles[tileIndex];
    if (!tile) {
      // Past the end of the line (or no line): bunch up on the join tile.
      const at = line.join ?? this.park.frontOf(ride, 'entrance') ?? ride;
      const spill = slot - line.tiles.length * PER_QUEUE_TILE;
      return {
        x: at.x + 0.5 + ((spill % 3) - 1) * 0.26,
        z: at.z + 0.5 + ((Math.floor(spill / 3) % 3) - 1) * 0.26,
      };
    }
    const next = line.tiles[tileIndex + 1] ?? line.join ?? tile;
    const dx = Math.sign(next.x - tile.x);
    const dz = Math.sign(next.z - tile.z);
    const along = (within - 1) * 0.3;
    return { x: tile.x + 0.5 + dx * along, z: tile.z + 0.5 + dz * along };
  }

  private shuffleForward(guest: Guest, dt: number) {
    const ride = this.park.ride(guest.at);
    if (!ride) return;
    const index = ride.queue.indexOf(guest.id);
    const spot = this.slot(ride, Math.max(0, index));
    const dx = spot.x - guest.x;
    const dz = spot.z - guest.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(distance, WALK * 0.8 * dt);
    if (distance > 0.001) {
      guest.x += (dx / distance) * step;
      guest.z += (dz / distance) * step;
      guest.heading = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 2 : 0;
    }
  }

  /** Whether a queuing guest has reached their spot. */
  private settled(guest: Guest, ride: Ride, index: number): boolean {
    const spot = this.slot(ride, index);
    return Math.hypot(spot.x - guest.x, spot.z - guest.z) < 0.2;
  }

  private decide(guest: Guest) {
    const park = this.park;
    const day = park.day;
    const stayed = park.time - guest.arrived;
    if (guest.goal?.kind === 'leave') return;
    const leave = (thought: string) => {
      guest.goal = { kind: 'leave' };
      guest.goalTime = 0;
      think(guest, thought, day);
    };
    const reason =
      guest.energy < 0.12
        ? 'I’m exhausted. Time to go home.'
        : guest.happiness < 0.15
          ? 'I want to go home.'
          : stayed > guest.stay
            ? 'What a day! Time to head home.'
            : guest.money < 100 && guest.hunger < 0.8
              ? 'I’ve run out of money.'
              : null;
    if (reason) {
      leave(reason);
      return;
    }

    const stall = (want: (ride: Ride) => boolean, missing: string) => {
      const found = this.nearest(
        guest,
        (ride) => RIDE_TYPES[ride.type].kind === 'stall' && want(ride),
      );
      if (found) {
        guest.goal = { kind: 'ride', ride: found.id };
        guest.goalTime = 0;
        return true;
      }
      think(guest, missing, day);
      guest.happiness = Math.max(0, guest.happiness - 0.01);
      return false;
    };
    const sells = (items: readonly (Item | undefined)[]) => (ride: Ride) =>
      items.includes(RIDE_TYPES[ride.type].sells);
    if (guest.toilet > 0.65 && stall((ride) => ride.type === 'toilets', 'I need a toilet!')) return;
    if (guest.hunger > 0.55 && stall(sells(FOOD), 'I’m hungry.')) return;
    if (guest.thirst > 0.55 && stall(sells(['drink']), 'I’m thirsty.')) return;
    if (!guest.holding && guest.happiness > 0.5 && park.random.chance(0.04)) {
      const balloon = this.nearest(guest, (ride) => RIDE_TYPES[ride.type].sells === 'balloon');
      if (balloon) {
        guest.goal = { kind: 'ride', ride: balloon.id };
        guest.goalTime = 0;
        return;
      }
    }
    if (park.random.chance(0.45)) this.chooseRide(guest);
  }

  /** The nearest usable, affordable stall or ride that passes a test. */
  private nearest(guest: Guest, test: (ride: Ride) => boolean): Ride | null {
    let best: Ride | null = null;
    let bestDistance = Infinity;
    for (const ride of this.park.rides) {
      if (!test(ride) || !this.usable(ride) || ride.price > guest.money) continue;
      const target = this.target(ride);
      if (!target) continue;
      const distance = this.nav.distance(guest.from, target);
      if (distance >= 0 && distance < bestDistance) {
        best = ride;
        bestDistance = distance;
      }
    }
    return best;
  }

  private chooseRide(guest: Guest) {
    const park = this.park;
    let best: Ride | null = null;
    let bestScore = -Infinity;
    for (const ride of park.rides) {
      const spec = ratingsOf(ride);
      if (RIDE_TYPES[ride.type].kind !== 'ride' || !this.usable(ride) || ride.price > guest.money)
        continue;
      const fit = intensityFit(guest, spec.intensity);
      if (fit < 0.3) continue;
      const target = this.target(ride);
      if (!target) continue;
      const distance = this.nav.distance(guest.from, target);
      if (distance < 0 || (!guest.hasMap && distance > 34)) continue;
      const again = guest.ridden.includes(ride.id) ? 2 : 0;
      const pricey = ride.price > fairPrice(ride) * 1.4 ? 1.5 : 0;
      const score =
        spec.excitement * fit -
        distance * 0.04 -
        again -
        pricey -
        ride.queue.length * 0.04 +
        park.random.range(0, 1.5);
      if (score > bestScore) {
        best = ride;
        bestScore = score;
      }
    }
    if (best) {
      guest.goal = { kind: 'ride', ride: best.id };
      guest.goalTime = 0;
      if (!guest.ridden.includes(best.id)) think(guest, `I want to go on ${best.name}!`, park.day);
    }
  }

  /** Litter or sick where a guest stands, if it's a path. */
  private mess(guest: Guest, kind: 'litter' | 'vomit') {
    const park = this.park;
    const x = Math.floor(guest.x);
    const z = Math.floor(guest.z);
    const use = park.useAt(x, z);
    if (use !== USE.path && use !== USE.queue) return;
    const layer = kind === 'litter' ? park.litter : park.vomit;
    const index = park.index(x, z);
    layer[index] = Math.min(200, (layer[index] ?? 0) + 1);
    park.dirtVersion++;
  }

  /**
   * What a walking guest notices on a tile: a bin for their rubbish, mess underfoot, a bench
   * to rest on, or (if they're furious and nobody's watching) something to smash. Returns true
   * if they sat down.
   */
  private onTile(guest: Guest, tile: Tile): boolean {
    const park = this.park;
    const day = park.day;
    const index = park.index(tile.x, tile.z);
    if (guest.rubbish >= 0) {
      for (const spot of [tile, ...this.nav.neighbours(tile)]) {
        const at = park.index(spot.x, spot.z);
        if (itemAt(park, at) !== 'bin' || park.smashed[at] === 1) continue;
        if ((park.binFill[at] ?? 0) < BIN_CAPACITY) {
          park.binFill[at] = (park.binFill[at] ?? 0) + 1;
        } else {
          // Overflowing: it goes on the ground next to the bin.
          park.litter[at] = Math.min(200, (park.litter[at] ?? 0) + 1);
          think(guest, 'The bins here are overflowing.', day);
        }
        guest.rubbish = -1;
        park.dirtVersion++;
        break;
      }
    }
    const litter = park.litter[index] ?? 0;
    const vomit = park.vomit[index] ?? 0;
    if (vomit > 0) {
      guest.happiness = Math.max(0, guest.happiness - 0.02);
      think(guest, 'Yuck! Someone’s been sick here.', day);
    } else if (litter >= 3) {
      guest.happiness = Math.max(0, guest.happiness - 0.01);
      think(guest, 'The paths here are disgusting.', day);
    }
    const item = itemAt(park, index);
    if (
      item &&
      park.smashed[index] === 0 &&
      guest.happiness < 0.22 &&
      !guarded(park, tile) &&
      park.random.chance(0.04)
    ) {
      park.smashed[index] = 1;
      park.dirtVersion++;
      guest.happiness = Math.min(1, guest.happiness + 0.05);
      think(guest, 'That’s what I think of this park!', day);
      return false;
    }
    if (item && park.smashed[index] === 1 && park.random.chance(0.3)) {
      think(guest, 'Someone’s smashed things up here.', day);
      guest.happiness = Math.max(0, guest.happiness - 0.005);
    }
    // Pretty surroundings lift the mood.
    const beauty = beautyMap(park)[index] ?? 0;
    if (beauty > 1.2) {
      guest.happiness = Math.min(1, guest.happiness + Math.min(0.012, beauty * 0.003));
      if (park.random.chance(0.08)) think(guest, 'The scenery here is lovely.', day);
    }
    const busy = guest.goal?.kind === 'ride' && guest.goalTime < 60;
    if (item === 'bench' && park.smashed[index] === 0 && guest.energy < 0.4 && !busy) {
      const side = itemSide(park, tile.x, tile.z);
      guest.state = 'sitting';
      guest.timer = 12 + park.random.range(0, 10);
      guest.x = tile.x + 0.5 + side.dx * 0.8;
      guest.z = tile.z + 0.5 + side.dz * 0.8;
      guest.heading = side.dx > 0 ? 3 : side.dx < 0 ? 1 : side.dz > 0 ? 0 : 2;
      think(guest, 'Ahh, a sit down.', day);
      return true;
    }
    return false;
  }

  /** Entertainers cheer up everyone close by, queues most of all. */
  private entertain(dt: number) {
    const entertainers = this.park.staff.filter((staff) => staff.role === 'entertainer');
    if (entertainers.length === 0) return;
    for (const guest of this.guests) {
      for (const staff of entertainers) {
        const dx = guest.x - staff.x;
        const dz = guest.z - staff.z;
        if (dx * dx + dz * dz > 12) continue;
        guest.happiness = Math.min(
          1,
          guest.happiness + (guest.state === 'queuing' ? 0.006 : 0.003) * dt,
        );
        break;
      }
    }
  }

  // Staff -------------------------------------------------------------------------------------

  hire(role: StaffRole): Staff | null {
    const park = this.park;
    const at = this.gateInside;
    if (!park.isWalkable(at.x, at.z)) return null;
    const staff = makeStaff(park.nextStaffId++, role, at, park.day, park.random);
    park.staff.push(staff);
    const job = STAFF[role].name.toLowerCase();
    park.post(`${staff.name} joined as ${/^[aeiou]/.test(job) ? 'an' : 'a'} ${job}.`);
    return staff;
  }

  fire(id: number): void {
    const park = this.park;
    const staff = park.staff.find((member) => member.id === id);
    if (!staff) return;
    dropJob(this, staff);
    park.staff = park.staff.filter((member) => member !== staff);
  }

  private nearestWalkable(from: Tile): Tile | null {
    const park = this.park;
    for (let radius = 1; radius <= 6; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (park.isWalkable(from.x + dx, from.z + dz)) return { x: from.x + dx, z: from.z + dz };
        }
      }
    }
    return null;
  }

  // Rides -------------------------------------------------------------------------------------

  private updateRide(ride: Ride, dt: number) {
    const spec = RIDE_TYPES[ride.type];
    if (spec.kind === 'stall') return;
    if (ride.broken) {
      ride.downtime += dt;
      return;
    }
    switch (ride.phase) {
      case 'idle':
        if (ride.open && ride.queue.length > 0) {
          ride.phase = 'loading';
          ride.timer = 0;
        }
        break;
      case 'loading': {
        ride.timer += dt;
        if (!ride.open) {
          ride.phase = 'idle';
          break;
        }
        let ready = 0;
        while (
          ready < spec.capacity &&
          ready < ride.queue.length &&
          this.settled(this.byId.get(ride.queue[ready] ?? -1) ?? ({} as Guest), ride, ready)
        ) {
          ready++;
        }
        if (ready >= spec.capacity || (ride.timer >= 8 && ready > 0)) this.start(ride, ready);
        break;
      }
      case 'running':
        if (ride.coaster) {
          const type = RIDE_TYPES[ride.type].coaster;
          if (type && stepTrain(circuitOf(ride.coaster), type, ride.coaster.train, dt))
            this.finish(ride);
          break;
        }
        ride.timer -= dt;
        if (ride.timer <= 0) this.finish(ride);
        break;
    }
  }

  private start(ride: Ride, count: number) {
    const park = this.park;
    const boarding = ride.queue.splice(0, count);
    for (const id of boarding) {
      const guest = this.byId.get(id);
      if (!guest) continue;
      if (guest.money < ride.price) {
        think(guest, `I can’t afford ${ride.name}.`, park.day);
        this.backToPath(guest, ride);
        continue;
      }
      guest.money -= ride.price;
      guest.spent += ride.price;
      park.earn(ride.price, 'rides');
      ride.income += ride.price;
      ride.monthIncome += ride.price;
      ride.customers++;
      ride.monthCustomers++;
      guest.state = 'riding';
      ride.riders.push(id);
    }
    ride.phase = ride.riders.length > 0 ? 'running' : 'idle';
    ride.timer = RIDE_TYPES[ride.type].duration;
    this.dispatch(ride);
  }

  /** Coasters: send the train off from the station. */
  private dispatch(ride: Ride) {
    const coaster = ride.coaster;
    if (!coaster || ride.phase !== 'running') return;
    coaster.train = { s: circuitOf(coaster).stop, v: 0, travelled: 0 };
  }

  /** Sends an empty train round a finished coaster, to watch it run. */
  testDrive(ride: Ride): void {
    if (!ride.coaster?.complete || ride.phase === 'running') return;
    ride.phase = 'running';
    this.dispatch(ride);
  }

  private finish(ride: Ride) {
    const park = this.park;
    const out = park.frontOf(ride, 'exit');
    for (const id of ride.riders) {
      const guest = this.byId.get(id);
      if (!guest) continue;
      afterRide(guest, ride, park.random, park.day);
      if (out && park.isWalkable(out.x, out.z)) {
        guest.state = 'walking';
        guest.from = out;
        guest.to = out;
        guest.progress = 1;
        guest.heading = ride.facing;
        guest.goal = null;
        this.place(guest);
      } else {
        this.backToPath(guest, ride);
      }
    }
    ride.riders = [];
    ride.phase = 'idle';
    if (ride.failing) this.breakDown(ride);
  }

  /** A ride stops working until a mechanic fixes it. */
  private breakDown(ride: Ride) {
    const park = this.park;
    ride.failing = false;
    ride.broken = true;
    ride.brokenSince = park.time;
    ride.breakdowns++;
    ride.reliability = Math.max(0.2, ride.reliability - 0.02);
    for (const id of ride.queue) {
      const guest = this.byId.get(id);
      if (!guest) continue;
      think(guest, `${ride.name} has broken down. Typical!`, park.day);
      guest.happiness = Math.max(0, guest.happiness - 0.05);
      this.backToPath(guest, ride);
    }
    ride.queue = [];
    ride.phase = 'idle';
    const mechanics = park.staff.some((staff) => staff.role === 'mechanic');
    park.post(
      mechanics
        ? `${ride.name} has broken down.`
        : `${ride.name} has broken down. Hire a mechanic to fix it!`,
      { ride: ride.id },
    );
  }

  setResearchFunding(level: 0 | 1 | 2 | 3): void {
    this.park.research.funding = level;
  }

  setInspection(ride: Ride, days: number): void {
    ride.inspectEvery = days;
  }

  /** Sends a guest back to walking from wherever the ride leaves them. */
  private backToPath(guest: Guest, ride: Ride) {
    const tile =
      this.line(ride).join ??
      this.park.frontOf(ride, 'exit') ??
      this.nearestWalkable(ride) ??
      this.park.gate;
    const walkable = this.park.isWalkable(tile.x, tile.z)
      ? tile
      : (this.nearestWalkable(tile) ?? this.park.gate);
    guest.state = 'walking';
    guest.from = walkable;
    guest.to = walkable;
    guest.progress = 1;
    guest.goal = null;
    this.place(guest);
  }

  /** A ride was demolished or closed: everyone on it or waiting for it goes back to the paths. */
  release(ride: Ride): void {
    for (const id of [...ride.queue, ...ride.riders]) {
      const guest = this.byId.get(id);
      if (guest) {
        think(guest, `${ride.name} closed while I was waiting!`, this.park.day);
        guest.happiness = Math.max(0, guest.happiness - 0.05);
        this.backToPath(guest, ride);
      }
    }
    for (const guest of this.guests) {
      if (guest.state === 'buying' && guest.at === ride.id) {
        guest.state = 'walking';
        guest.progress = 1;
      }
      if (guest.goal?.kind === 'ride' && guest.goal.ride === ride.id) guest.goal = null;
    }
    ride.queue = [];
    ride.riders = [];
    ride.phase = 'idle';
  }

  setPrice(ride: Ride, price: number): void {
    ride.price = Math.max(0, Math.min(2_000, Math.round(price)));
  }

  setOpen(ride: Ride, open: boolean): void {
    ride.open = open;
    if (!open) this.release(ride);
    this.park.post(`${ride.name} is now ${open ? 'open' : 'closed'}.`, { ride: ride.id });
  }

  // Calendar ----------------------------------------------------------------------------------

  private newDay() {
    const park = this.park;
    for (const ride of park.rides) {
      if (RIDE_TYPES[ride.type].kind === 'ride') ride.sceneryBonus = sceneryBonus(park, ride);
    }
    // Rides wear out a little each day and sometimes break down; unreliable ones more often.
    for (const ride of park.rides) {
      if (RIDE_TYPES[ride.type].kind !== 'ride' || ride.broken || ride.failing) continue;
      if (ride.coaster && !ride.coaster.stats) continue;
      ride.reliability = Math.max(0.3, ride.reliability - 0.004);
      const odds = (1 - ride.reliability) * (inspectionDue(park, ride) ? 0.07 : 0.05);
      if (ride.open && park.random.chance(odds)) {
        if (ride.phase === 'running') ride.failing = true;
        else this.breakDown(ride);
      }
    }
    const invented = researchDay(park.research);
    if (invented) {
      const spec = RIDE_TYPES[invented];
      park.post(`New ${spec.kind === 'stall' ? 'stall' : 'ride'} invented: ${spec.name}!`);
      park.touch();
    }
    this.updateCleanliness();
    const guests = this.guests.length;
    const happiness =
      guests > 0 ? this.guests.reduce((sum, guest) => sum + guest.happiness, 0) / guests : 0.6;
    const rides = park.rides.filter(
      (ride) => RIDE_TYPES[ride.type].kind === 'ride' && this.usable(ride),
    ).length;
    const broken = park.rides.filter((ride) => ride.broken).length;
    const smashed = park.smashed.reduce((sum, value) => sum + value, 0);
    const target =
      120 +
      happiness * 560 +
      Math.min(1, rides / 10) * 260 -
      (1 - this.cleanliness) * 220 -
      broken * 35 -
      smashed * 6;
    park.rating = Math.round(
      Math.min(999, Math.max(0, park.rating + (target - park.rating) * 0.15)),
    );
  }

  /** How dirty the paths are, and a nudge to hire help when it's bad. */
  private updateCleanliness() {
    const park = this.park;
    let paths = 0;
    let dirt = 0;
    for (let index = 0; index < park.use.length; index++) {
      const use = park.use[index];
      if (use !== USE.path && use !== USE.queue) continue;
      paths++;
      dirt += (park.litter[index] ?? 0) + (park.vomit[index] ?? 0) * 2;
    }
    this.cleanliness = paths === 0 ? 1 : Math.max(0, 1 - dirt / paths / 0.6);
    const day = park.day;
    if (day - this.lastNag < 10) return;
    if (this.cleanliness < 0.6 && !park.staff.some((staff) => staff.role === 'handyman')) {
      park.post('Guests are complaining about the dirty paths. Hire a handyman!');
      this.lastNag = day;
    }
  }

  private newMonth(finished: number) {
    const park = this.park;
    const upkeep = park.rides.reduce((sum, ride) => sum + RIDE_TYPES[ride.type].upkeep, 0);
    park.spend(upkeep, 'upkeep');
    const wages = park.staff.reduce((sum, staff) => sum + STAFF[staff.role].wage, 0);
    if (wages > 0) park.spend(wages, 'wages');
    // Research only costs money while there's something left to invent.
    const research = currentProject(park.research) ? FUNDING[park.research.funding].cost : 0;
    if (research > 0) park.spend(research, 'research');
    park.history.push({
      month: finished,
      ledger: park.ledger,
      guests: this.guests.length,
      rating: park.rating,
    });
    if (park.history.length > 24) park.history.shift();
    const total = Object.values(park.ledger).reduce((sum, value) => sum + value, 0);
    park.post(
      `${MONTHS[finished % MONTHS.length] ?? 'Monthly'} report: ${total >= 0 ? 'profit' : 'loss'} of ${formatPrice(Math.abs(total))}.`,
    );
    park.ledger = emptyLedger();
    for (const ride of park.rides) {
      ride.monthIncome = 0;
      ride.monthCustomers = 0;
      ride.downtime = 0;
    }
  }
}

function directionTo(from: Tile, to: Tile): Direction {
  for (const direction of DIRECTIONS) {
    if (from.x + DX[direction] === to.x && from.z + DZ[direction] === to.z) return direction;
  }
  return 0;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Tile use names, for the inspector. */
export const USE_NAMES: Record<number, string> = {
  [USE.empty]: 'Grass',
  [USE.path]: 'Footpath',
  [USE.queue]: 'Queue line',
  [USE.ride]: 'Ride',
  [USE.entrance]: 'Ride entrance',
  [USE.exit]: 'Ride exit',
  [USE.stall]: 'Stall',
  [USE.scenery]: 'Scenery',
  [USE.gate]: 'Park entrance',
};
