import { RIDE_TYPES, SCENERY, type RideTypeId, type SceneryId, type Theme } from './catalog';

/**
 * Research: a park starts with two rides, three stalls, a few trees and bushes and plain
 * paths. Its designers invent everything else one project at a time (rides, stalls, scenery
 * packs, and the tools for landscaping and water), faster the more money goes into it.
 */

export type ToolProject = 'tool:landscaping' | 'tool:water';
export type SceneryProject = `scenery:${Theme}`;
export type ProjectId = RideTypeId | SceneryProject | ToolProject;

export interface Research {
  funding: 0 | 1 | 2 | 3;
  /** Progress on the current project, 0–1. */
  progress: number;
  invented: ProjectId[];
  /** 2 once scenery and tools became research projects (older saves predate that). */
  version?: 2;
}

export const STARTING: readonly ProjectId[] = [
  'carousel',
  'teacups',
  'burger-stall',
  'drink-stall',
  'toilets',
];

/** Scenery everyone has from the start; the rest comes in themed packs. */
const BASIC_SCENERY: readonly SceneryId[] = ['oak', 'pine', 'bush', 'hedge', 'flowers'];

/** Research projects that aren't rides or stalls. */
export const EXTRAS: Record<
  SceneryProject | ToolProject,
  { name: string; blurb: string; days: number }
> = {
  'tool:landscaping': {
    name: 'Landscaping',
    blurb: 'Raise, lower and level the land, and paint the ground.',
    days: 16,
  },
  'tool:water': { name: 'Water', blurb: 'Make lakes and ponds.', days: 20 },
  'scenery:garden': {
    name: 'Garden scenery',
    blurb: 'Fountains, statues, topiary, tulips and flower arches.',
    days: 14,
  },
  'scenery:nature': { name: 'More nature', blurb: 'Willow trees and boulders.', days: 10 },
  'scenery:western': {
    name: 'Wild West scenery',
    blurb: 'Cacti, barrels and wagon wheels.',
    days: 14,
  },
  'scenery:space': {
    name: 'Space scenery',
    blurb: 'Model rockets and glowing crystals.',
    days: 16,
  },
  'scenery:spooky': {
    name: 'Spooky scenery',
    blurb: 'Dead trees, gravestones and pumpkins.',
    days: 14,
  },
  'scenery:tropical': { name: 'Tropical scenery', blurb: 'Palm trees and tiki torches.', days: 12 },
};

/** What gets invented, in order: a mix, so something new turns up every month or so. */
export const RESEARCH_ORDER: readonly ProjectId[] = [
  'ferris-wheel',
  'tool:landscaping',
  'info-kiosk',
  'scenery:garden',
  'junior-coaster',
  'ice-cream-stall',
  'bumper-cars',
  'tool:water',
  'paddle-boats',
  'scenery:nature',
  'swing-ship',
  'balloon-stall',
  'scenery:western',
  'wooden-coaster',
  'haunted-house',
  'scenery:spooky',
  'drop-tower',
  'scenery:tropical',
  'scenery:space',
  'steel-coaster',
];

export const FUNDING = [
  { label: 'None', cost: 0, speed: 0 },
  { label: 'Low', cost: 20_000, speed: 0.55 },
  { label: 'Normal', cost: 40_000, speed: 1 },
  { label: 'High', cost: 60_000, speed: 1.6 },
] as const;

const isRide = (id: ProjectId): id is RideTypeId => id in RIDE_TYPES;

export function projectName(id: ProjectId): string {
  return isRide(id) ? RIDE_TYPES[id].name : EXTRAS[id].name;
}

/** "ride", "stall", "scenery" or "tool", for news and lists. */
export function projectKind(id: ProjectId): string {
  if (isRide(id)) return RIDE_TYPES[id].kind;
  return id.startsWith('scenery:') ? 'scenery' : 'tool';
}

export function newResearch(everything = false): Research {
  return {
    funding: 2,
    progress: 0,
    invented: everything ? [...STARTING, ...RESEARCH_ORDER] : [...STARTING],
    version: 2,
  };
}

/** Research from an older save: scenery and tools weren't projects yet, so it keeps them. */
export function upgradeResearch(research: Research): Research {
  if (research.version === 2) return research;
  const extras = Object.keys(EXTRAS) as (SceneryProject | ToolProject)[];
  return { ...research, invented: [...new Set([...research.invented, ...extras])], version: 2 };
}

export function isInvented(research: Research, id: ProjectId): boolean {
  return research.invented.includes(id);
}

export function sceneryUnlocked(research: Research, id: SceneryId): boolean {
  return BASIC_SCENERY.includes(id) || research.invented.includes(`scenery:${SCENERY[id].theme}`);
}

/** The project being worked on, or null when everything's invented. */
export function currentProject(research: Research): ProjectId | null {
  return RESEARCH_ORDER.find((id) => !research.invented.includes(id)) ?? null;
}

/** Game days a project takes at normal funding: bigger rides take longer. */
export function projectDays(id: ProjectId): number {
  if (!isRide(id)) return EXTRAS[id].days;
  const cost = RIDE_TYPES[id].cost;
  return Math.round(14 + (cost / 120_000) * 26);
}

/** Moves research on by one day. Returns what was invented today, if anything. */
export function researchDay(research: Research): ProjectId | null {
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
