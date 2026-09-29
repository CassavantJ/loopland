import { money, RIDE_TYPES, type RideTypeId } from './catalog';
import { parkValue } from './business';
import { ratingsOf } from './guests';
import { createPark, MONTHS, type Park } from './park';
import { RESEARCH_ORDER, STARTING } from './research';
import type { World } from './world';

/**
 * Scenarios: parks to build with a goal to reach by a deadline, from gentle starters to hard
 * ones with little land or money. Plus a sandbox with everything unlocked and no goal.
 */

export type Objective =
  | { kind: 'guests'; guests: number; rating: number; year: number }
  | { kind: 'value'; value: number; year: number }
  | { kind: 'coasters'; count: number; excitement: number; year: number }
  | { kind: 'income'; perMonth: number; year: number }
  | { kind: 'none' };

export interface ScenarioDef {
  id: string;
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Sandbox';
  blurb: string;
  seed: number;
  terrain: 'gentle' | 'hilly' | 'flat';
  /** A lake dug and filled before you arrive, as a tile rectangle. */
  lake?: { x0: number; z0: number; x1: number; z1: number };
  money: number;
  /** Already borrowed (and included in the money). */
  loan: number;
  maxLoan: number;
  /** Land the park owns to start with; the rest of the map is for sale at `landPrice`. */
  owned?: { x0: number; z0: number; x1: number; z1: number };
  landPrice: number;
  invented: 'start' | 'all' | readonly RideTypeId[];
  objective: Objective;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'sunny-meadows',
    name: 'Sunny Meadows',
    difficulty: 'Easy',
    blurb: 'Flat green fields and a little money. The perfect place to start your first park.',
    seed: 11,
    terrain: 'gentle',
    money: 2_500_000,
    loan: 0,
    maxLoan: 2_000_000,
    landPrice: 20_000,
    invented: 'start',
    objective: { kind: 'guests', guests: 200, rating: 600, year: 2 },
  },
  {
    id: 'lakeside',
    name: 'Lakeside Retreat',
    difficulty: 'Easy',
    blurb: 'A quiet lake in rolling country. Guests love a pretty park by the water.',
    seed: 23,
    terrain: 'gentle',
    lake: { x0: 14, z0: 18, x1: 21, z1: 25 },
    money: 3_000_000,
    loan: 0,
    maxLoan: 2_000_000,
    landPrice: 20_000,
    invented: [...STARTING, 'paddle-boats'],
    objective: { kind: 'guests', guests: 300, rating: 620, year: 2 },
  },
  {
    id: 'hillside',
    name: 'Hillside Heights',
    difficulty: 'Medium',
    blurb: 'Steep hills made for roller coasters, and a bank loan to build them with.',
    seed: 37,
    terrain: 'hilly',
    money: 3_000_000,
    loan: 1_000_000,
    maxLoan: 3_000_000,
    landPrice: 20_000,
    invented: [...STARTING, 'wooden-coaster'],
    objective: { kind: 'coasters', count: 3, excitement: 5, year: 3 },
  },
  {
    id: 'money-mountain',
    name: 'Money Mountain',
    difficulty: 'Medium',
    blurb: 'Investors want a park worth something. Build big, and fill it with guests.',
    seed: 41,
    terrain: 'hilly',
    money: 2_000_000,
    loan: 500_000,
    maxLoan: 3_000_000,
    landPrice: 20_000,
    invented: 'start',
    objective: { kind: 'value', value: 3_500_000, year: 3 },
  },
  {
    id: 'little-acre',
    name: 'Little Acre',
    difficulty: 'Hard',
    blurb: 'A tiny plot by the road. Buy more land as you grow, and pack in the crowds.',
    seed: 53,
    terrain: 'gentle',
    money: 1_500_000,
    loan: 0,
    maxLoan: 2_500_000,
    owned: { x0: 18, z0: 30, x1: 30, z1: 46 },
    landPrice: 30_000,
    invented: 'start',
    objective: { kind: 'guests', guests: 500, rating: 650, year: 4 },
  },
  {
    id: 'golden-rides',
    name: 'Golden Rides',
    difficulty: 'Hard',
    blurb: 'Deep in debt. Turn it round: make the rides and shops earn big in a single month.',
    seed: 67,
    terrain: 'flat',
    money: 2_000_000,
    loan: 1_500_000,
    maxLoan: 2_500_000,
    landPrice: 20_000,
    invented: 'start',
    objective: { kind: 'income', perMonth: 250_000, year: 3 },
  },
  {
    id: 'sandbox',
    name: 'Sandbox',
    difficulty: 'Sandbox',
    blurb: 'Everything invented, plenty of money, and no goal. Just build.',
    seed: 7,
    terrain: 'gentle',
    money: 10_000_000,
    loan: 0,
    maxLoan: 5_000_000,
    landPrice: 10_000,
    invented: 'all',
    objective: { kind: 'none' },
  },
];

export function scenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((candidate) => candidate.id === id);
}

/** Builds a scenario's park, ready to play. */
export function createScenario(def: ScenarioDef): Park {
  const shapes = {
    gentle: {},
    hilly: { hills: 16, peak: [5, 12] as const, flat: 0.24 },
    flat: { hills: 0 },
  } as const;
  const park = createPark(def.seed, 48, def.invented === 'all', shapes[def.terrain]);
  park.name = def.name === 'Sandbox' ? 'Loopland' : def.name;
  park.scenario = def.id;
  park.objective = def.objective;
  if (typeof def.invented !== 'string') park.research.invented = [...def.invented];
  if (def.lake) {
    // Dig two steps down and fill it back up level with the land around.
    const { x0, z0, x1, z1 } = def.lake;
    park.money = 100_000_000;
    park.editLand(x0, z0, x1 + 1, z1 + 1, 'lower');
    park.editLand(x0 + 1, z0 + 1, x1, z1, 'lower');
    park.editWater(x0, z0, x1, z1, true);
    park.editWater(x0, z0, x1, z1, true);
  }
  if (def.owned) {
    const { x0, z0, x1, z1 } = def.owned;
    for (let z = 1; z < park.depth - 1; z++) {
      for (let x = 1; x < park.width - 1; x++) {
        const inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
        park.owned[park.index(x, z)] = inside ? 1 : 2;
      }
    }
  }
  park.landPrice = def.landPrice;
  park.maxLoan = def.maxLoan;
  park.loan = def.loan;
  park.money = def.money;
  park.ledger = Object.fromEntries(
    Object.keys(park.ledger).map((key) => [key, 0]),
  ) as Park['ledger'];
  park.version++;
  park.landVersion++;
  return park;
}

const monthName = (year: number) =>
  `the end of ${MONTHS[MONTHS.length - 1] ?? 'October'}, Year ${year}`;

export function describeObjective(objective: Objective): string {
  switch (objective.kind) {
    case 'guests':
      return `Have ${objective.guests} guests in the park and a park rating of at least ${objective.rating}, by ${monthName(objective.year)}.`;
    case 'value':
      return `Build a park worth ${money(objective.value)} by ${monthName(objective.year)}.`;
    case 'coasters':
      return `Build ${objective.count} roller coasters with an excitement rating of ${objective.excitement.toFixed(1)} or more, by ${monthName(objective.year)}.`;
    case 'income':
      return `Make ${money(objective.perMonth)} from rides and shops in a single month, by ${monthName(objective.year)}.`;
    case 'none':
      return 'No goal: build whatever you like.';
  }
}

export interface ObjectiveStatus {
  met: boolean;
  /** 0–1. */
  fraction: number;
  progress: string;
}

export function objectiveStatus(world: World): ObjectiveStatus {
  const park = world.park;
  const objective = park.objective;
  switch (objective.kind) {
    case 'guests': {
      const guests = world.guests.length;
      const met = guests >= objective.guests && park.rating >= objective.rating;
      return {
        met,
        // As far along as the part that's furthest behind.
        fraction: Math.min(guests / objective.guests, park.rating / objective.rating, 1),
        progress: `${guests} of ${objective.guests} guests, rating ${park.rating} of ${objective.rating}`,
      };
    }
    case 'value': {
      const value = parkValue(world);
      return {
        met: value >= objective.value,
        fraction: Math.min(1, value / objective.value),
        progress: `Park worth ${money(value)} of ${money(objective.value)}`,
      };
    }
    case 'coasters': {
      const good = park.rides.filter(
        (ride) =>
          ride.coaster?.stats && ride.open && ratingsOf(ride).excitement >= objective.excitement,
      ).length;
      return {
        met: good >= objective.count,
        fraction: Math.min(1, good / objective.count),
        progress: `${good} of ${objective.count} coasters exciting enough`,
      };
    }
    case 'income': {
      const best = park.bestIncome;
      const now = park.ledger.rides + park.ledger.food;
      return {
        met: best >= objective.perMonth,
        fraction: Math.min(1, Math.max(best, now) / objective.perMonth),
        progress: `Best month ${money(best)}, this month ${money(now)}, of ${money(objective.perMonth)}`,
      };
    }
    case 'none':
      return { met: false, fraction: 0, progress: '' };
  }
}

/** Checks the goal: won as soon as it's met, lost if the deadline passes first. */
export function checkObjective(world: World): void {
  const park = world.park;
  const objective = park.objective;
  if (objective.kind === 'none' || park.outcome !== 'playing') return;
  if (objectiveStatus(world).met) {
    park.outcome = 'won';
    park.post(`Scenario complete! ${park.name} met its goal.`);
    return;
  }
  if (park.month >= objective.year * MONTHS.length) {
    park.outcome = 'lost';
    park.post('Time’s up: the goal wasn’t met.');
  }
}

/** Names of everything a scenario starts with, for its description. */
export function startingRides(def: ScenarioDef): string[] {
  const ids =
    def.invented === 'all'
      ? [...STARTING, ...RESEARCH_ORDER]
      : def.invented === 'start'
        ? STARTING
        : def.invented;
  return ids.filter((id) => RIDE_TYPES[id].kind === 'ride').map((id) => RIDE_TYPES[id].name);
}
