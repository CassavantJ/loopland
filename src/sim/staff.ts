import type { Direction, Tile } from './grid';
import type { Random } from './random';

/** The people who keep a park running. Wages are per month, in cents. */
export type StaffRole = 'handyman' | 'mechanic' | 'security' | 'entertainer';

export const STAFF_ROLES: readonly StaffRole[] = [
  'handyman',
  'mechanic',
  'security',
  'entertainer',
];

export const STAFF: Record<
  StaffRole,
  { name: string; plural: string; wage: number; blurb: string; uniform: string; trousers: string }
> = {
  handyman: {
    name: 'Handyman',
    plural: 'Handymen',
    wage: 5_000,
    blurb: 'Sweeps up litter and sick, empties bins and repairs broken benches and lamps.',
    uniform: '#2f9e44',
    trousers: '#2b8a3e',
  },
  mechanic: {
    name: 'Mechanic',
    plural: 'Mechanics',
    wage: 8_000,
    blurb: 'Fixes rides that break down and inspects them to keep them reliable.',
    uniform: '#1971c2',
    trousers: '#1864ab',
  },
  security: {
    name: 'Security guard',
    plural: 'Security guards',
    wage: 6_000,
    blurb: 'Patrols the paths. Angry guests won’t smash things while one is nearby.',
    uniform: '#212529',
    trousers: '#343a40',
  },
  entertainer: {
    name: 'Entertainer',
    plural: 'Entertainers',
    wage: 5_500,
    blurb: 'A giant cheerful costume that cheers up guests nearby, especially in queues.',
    uniform: '#f76707',
    trousers: '#f76707',
  },
};

export type Job =
  | { kind: 'sweep'; tile: Tile }
  | { kind: 'empty'; tile: Tile }
  | { kind: 'repair'; tile: Tile }
  | { kind: 'fix'; ride: number; tile: Tile }
  | { kind: 'inspect'; ride: number; tile: Tile };

/** Seconds each job takes once there. */
export const JOB_TIME: Record<Job['kind'], number> = {
  sweep: 1.5,
  empty: 2,
  repair: 3,
  fix: 6,
  inspect: 4,
};

export interface Staff {
  id: number;
  role: StaffRole;
  name: string;
  x: number;
  z: number;
  from: Tile;
  to: Tile;
  progress: number;
  heading: Direction;
  lane: number;
  state: 'walking' | 'working';
  job: Job | null;
  timer: number;
  hired: number;
  /** Jobs done, by kind. */
  done: Record<Job['kind'], number>;
  /** Entertainers: which costume. */
  costume: number;
}

const FIRST = [
  'Sam',
  'Alex',
  'Robin',
  'Jo',
  'Kai',
  'Noor',
  'Lee',
  'Max',
  'Rae',
  'Ash',
  'Bo',
  'Remy',
];
const COSTUMES = ['Panda', 'Tiger', 'Frog', 'Bunny'];

export const costumeName = (staff: Staff) => COSTUMES[staff.costume % COSTUMES.length] ?? 'Panda';

export function makeStaff(
  id: number,
  role: StaffRole,
  at: Tile,
  day: number,
  random: Random,
): Staff {
  const first = random.pick(FIRST);
  return {
    id,
    role,
    name: role === 'entertainer' ? `${first} (in costume)` : first,
    x: at.x + 0.5,
    z: at.z + 0.5,
    from: at,
    to: at,
    progress: 1,
    heading: 0,
    lane: random.range(-0.2, 0.2),
    state: 'walking',
    job: null,
    timer: 0,
    hired: day,
    done: { sweep: 0, empty: 0, repair: 0, fix: 0, inspect: 0 },
    costume: random.int(0, COSTUMES.length - 1),
  };
}

/** A short line on what a staff member is up to. */
export function describeJob(staff: Staff, rideName: (id: number) => string): string {
  const job = staff.job;
  const verb = staff.state === 'working';
  if (!job) {
    return staff.role === 'security'
      ? 'Patrolling'
      : staff.role === 'entertainer'
        ? 'Entertaining the crowds'
        : 'Looking for work';
  }
  switch (job.kind) {
    case 'sweep':
      return verb ? 'Sweeping the path' : 'Going to sweep a path';
    case 'empty':
      return verb ? 'Emptying a bin' : 'Going to empty a bin';
    case 'repair':
      return verb ? 'Repairing something' : 'Going to repair something';
    case 'fix':
      return `${verb ? 'Fixing' : 'Heading to fix'} ${rideName(job.ride)}`;
    case 'inspect':
      return `${verb ? 'Inspecting' : 'Heading to inspect'} ${rideName(job.ride)}`;
  }
}
