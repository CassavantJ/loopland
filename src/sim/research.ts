import { RIDE_TYPES, type RideTypeId } from './catalog';

/**
 * Research: a park starts with a handful of rides and stalls, and its designers invent the
 * rest one at a time, faster the more money goes into it each month.
 */

export interface Research {
  funding: 0 | 1 | 2 | 3;
  /** Progress on the current project, 0–1. */
  progress: number;
  invented: RideTypeId[];
}

export const STARTING: readonly RideTypeId[] = [
  'carousel',
  'ferris-wheel',
  'teacups',
  'junior-coaster',
  'burger-stall',
  'drink-stall',
  'toilets',
  'info-kiosk',
];

/** What gets invented, in order. */
export const RESEARCH_ORDER: readonly RideTypeId[] = [
  'ice-cream-stall',
  'bumper-cars',
  'paddle-boats',
  'swing-ship',
  'balloon-stall',
  'wooden-coaster',
  'haunted-house',
  'drop-tower',
  'steel-coaster',
];

export const FUNDING = [
  { label: 'None', cost: 0, speed: 0 },
  { label: 'Low', cost: 20_000, speed: 0.55 },
  { label: 'Normal', cost: 40_000, speed: 1 },
  { label: 'High', cost: 60_000, speed: 1.6 },
] as const;

export function newResearch(everything = false): Research {
  return {
    funding: 2,
    progress: 0,
    invented: everything ? [...STARTING, ...RESEARCH_ORDER] : [...STARTING],
  };
}

export function isInvented(research: Research, type: RideTypeId): boolean {
  return research.invented.includes(type);
}

/** The project being worked on, or null when everything's invented. */
export function currentProject(research: Research): RideTypeId | null {
  return RESEARCH_ORDER.find((type) => !research.invented.includes(type)) ?? null;
}

/** Game days a project takes at normal funding: bigger rides take longer. */
export function projectDays(type: RideTypeId): number {
  const cost = RIDE_TYPES[type].cost;
  return Math.round(14 + (cost / 120_000) * 26);
}

/** Moves research on by one day. Returns what was invented today, if anything. */
export function researchDay(research: Research): RideTypeId | null {
  const project = currentProject(research);
  if (!project) return null;
  research.progress += FUNDING[research.funding].speed / projectDays(project);
  if (research.progress < 1) return null;
  research.progress = 0;
  research.invented.push(project);
  return project;
}

/** Roughly how many days until the current project is done. */
export function daysLeft(research: Research): number | null {
  const project = currentProject(research);
  const speed = FUNDING[research.funding].speed;
  if (!project || speed === 0) return null;
  return Math.ceil(((1 - research.progress) * projectDays(project)) / speed);
}
