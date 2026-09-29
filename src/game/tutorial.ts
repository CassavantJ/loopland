import { RIDE_TYPES } from '../sim/catalog';
import { USE } from '../sim/park';
import type { World } from '../sim/world';
import type { Selection } from './tools';

/**
 * The first-time tutorial: a short run of steps, each waiting for the player to do
 * something in the real park (lay a path, build a ride, …) before moving on.
 */

/** What a step can point at: a toolbar button, by its label. */
export type Highlight = 'Path' | 'Queue' | 'Rides' | 'Shops' | 'Staff' | 'Park';

export interface StepContext {
  world: World;
  selection: Selection;
  /** Whatever the step recorded about the park when it started. */
  baseline: number;
}

export interface Step {
  id: string;
  title: string;
  /** Text for mouse players and for touch screens. */
  text: string;
  touchText?: string;
  highlight?: Highlight;
  /** Measures the park when the step starts (for "build one more" checks). */
  measure?: (world: World) => number;
  /** Done yet? Steps without a check just have a Next button. */
  done?: (context: StepContext) => boolean;
}

const pathCount = (world: World) =>
  world.park.use.reduce((sum, use) => sum + (use === USE.path ? 1 : 0), 0);

const flatRides = (world: World) =>
  world.park.rides.filter((ride) => RIDE_TYPES[ride.type].kind === 'ride').length;

export const STEPS: readonly Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Loopland!',
    text: 'You run this park now. Guests come in through the gate at the front. Let’s give them something to do.',
  },
  {
    id: 'camera',
    title: 'Look around',
    text: 'Drag the map to move around, scroll to zoom, and use the round buttons on the right (or Q and E) to turn the view.',
    touchText:
      'Drag the map to move around, pinch to zoom, and use the round buttons on the right to turn the view.',
  },
  {
    id: 'path',
    title: 'Lay a path',
    text: 'Pick Path, then click and drag from the plaza by the gate to lay a line of footpath. Make it at least three tiles long.',
    touchText:
      'Pick Path, then drag from the plaza by the gate to lay a line of footpath. Make it at least three tiles long.',
    highlight: 'Path',
    measure: pathCount,
    done: ({ world, baseline }) => pathCount(world) >= baseline + 3,
  },
  {
    id: 'ride',
    title: 'Build a ride',
    text: 'Open Rides and choose the Carousel. Move it next to your new path: it turns to face the path by itself. Click to build it.',
    touchText:
      'Open Rides and choose the Carousel. Tap next to your new path: it turns to face the path by itself.',
    highlight: 'Rides',
    measure: flatRides,
    done: ({ world, baseline }) => flatRides(world) > baseline,
  },
  {
    id: 'connect',
    title: 'Join it up',
    text: 'A ride needs its entrance and its exit (the two little arches) touching a path. Click the ride to check: its panel says what’s wrong. Lay more path if you need to.',
    touchText:
      'A ride needs its entrance and its exit (the two little arches) touching a path. Tap the ride to check: its panel says what’s wrong.',
    highlight: 'Path',
    done: ({ world }) =>
      world.park.rides.some((ride) => RIDE_TYPES[ride.type].kind === 'ride' && world.usable(ride)),
  },
  {
    id: 'shops',
    title: 'Food and toilets',
    text: 'Guests get hungry, thirsty and desperate for the loo. Open Shops and build a Burger Bar and some Toilets beside a path.',
    highlight: 'Shops',
    done: ({ world }) => {
      const open = world.park.rides.filter((ride) => world.usable(ride));
      return (
        open.some((ride) => RIDE_TYPES[ride.type].sells === 'burger') &&
        open.some((ride) => ride.type === 'toilets')
      );
    },
  },
  {
    id: 'guests',
    title: 'Meet your guests',
    text: 'Guests are on their way in. Click one to see how they feel and what they’re thinking. Their thoughts tell you what the park needs.',
    touchText:
      'Guests are on their way in. Tap one to see how they feel and what they’re thinking. Their thoughts tell you what the park needs.',
    done: ({ selection }) => selection?.kind === 'guest',
  },
  {
    id: 'queue',
    title: 'Queue lines',
    text: 'Popular rides need somewhere to wait. Build Queue path leading up to a ride’s entrance; without one, only a few guests can queue and the rest grumble.',
    highlight: 'Queue',
  },
  {
    id: 'staff',
    title: 'Hire some help',
    text: 'Guests drop litter and rides break down. Open Staff and hire a Handyman to keep the paths clean. Mechanics fix rides.',
    highlight: 'Staff',
    done: ({ world }) => world.park.staff.some((staff) => staff.role === 'handyman'),
  },
  {
    id: 'goal',
    title: 'Your goal',
    text: 'Every park has a goal, shown in the top bar. Open Park any time to see how you’re doing, set the entrance fee, and read the news. Have fun!',
    highlight: 'Park',
  },
];

const KEY = 'loopland.tutorial.v1';

export function tutorialDone(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    window.localStorage.setItem(KEY, 'done');
  } catch {
    // Private browsing: it'll be offered again next time.
  }
}

export interface TutorialState {
  step: number;
  baseline: number;
}

/** Where the tutorial starts: the first step, measured against the park as it is now. */
export function startTutorial(world: World): TutorialState {
  return { step: 0, baseline: STEPS[0]?.measure?.(world) ?? 0 };
}

/** The next step, with its baseline taken now. */
export function nextStep(world: World, state: TutorialState): TutorialState {
  const step = state.step + 1;
  return { step, baseline: STEPS[step]?.measure?.(world) ?? 0 };
}
