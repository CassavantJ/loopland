import { RIDE_TYPES, type Item } from './catalog';
import type { Direction, Tile } from './grid';
import type { Ride } from './park';
import type { Random } from './random';

export type GuestState = 'walking' | 'queuing' | 'riding' | 'buying' | 'gone';

export type Goal = { kind: 'ride'; ride: number } | { kind: 'leave' };

export interface Thought {
  text: string;
  day: number;
}

export interface Guest {
  id: number;
  name: string;
  /** Position in tiles; a tile's centre is at +0.5. */
  x: number;
  z: number;
  from: Tile;
  to: Tile;
  progress: number;
  heading: Direction;
  /** Sideways offset from the middle of the path, so crowds don't walk in single file. */
  lane: number;
  state: GuestState;
  goal: Goal | null;
  /** The ride or stall a guest is queuing for, riding or buying from. */
  at: number;
  timer: number;
  /** Seconds spent heading for the current goal. */
  goalTime: number;
  money: number;
  spent: number;
  happiness: number;
  hunger: number;
  thirst: number;
  toilet: number;
  energy: number;
  nausea: number;
  /** The band of ride intensity this guest enjoys. */
  intensityMin: number;
  intensityMax: number;
  ridden: number[];
  thoughts: Thought[];
  holding: Item | null;
  hasMap: boolean;
  arrived: number;
  /** Game seconds before they start thinking about going home. */
  stay: number;
  look: { shirt: string; trousers: string; skin: string; hair: string };
}

const FIRST_NAMES = [
  'Ada',
  'Ben',
  'Cleo',
  'Dev',
  'Esme',
  'Finn',
  'Gia',
  'Hugo',
  'Ines',
  'Jonah',
  'Kira',
  'Leo',
  'Mina',
  'Nico',
  'Omar',
  'Pia',
  'Quinn',
  'Rosa',
  'Sami',
  'Tess',
  'Umar',
  'Vera',
  'Wes',
  'Xena',
  'Yusuf',
  'Zoe',
  'Arlo',
  'Bea',
  'Cal',
  'Dina',
  'Eli',
  'Fay',
  'Gus',
  'Hana',
  'Ivo',
  'Juno',
];
const INITIALS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'P',
  'R',
  'S',
  'T',
  'V',
  'W',
  'Y',
];
const SHIRTS = [
  '#ff6b6b',
  '#4dabf7',
  '#51cf66',
  '#fcc419',
  '#cc5de8',
  '#ff922b',
  '#20c997',
  '#f06595',
  '#ffffff',
  '#343a40',
];
const TROUSERS = ['#364fc7', '#495057', '#212529', '#862e9c', '#5c940d', '#e9ecef', '#a0522d'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c'];
const HAIR = ['#2b1d0e', '#6b4226', '#d9a441', '#1a1a1a', '#b5651d', '#e8e8e8', '#8b0000'];

export function makeGuest(
  id: number,
  at: Tile,
  heading: Direction,
  time: number,
  random: Random,
): Guest {
  const bravery = random.next();
  return {
    id,
    name: `${random.pick(FIRST_NAMES)} ${random.pick(INITIALS)}.`,
    x: at.x + 0.5,
    z: at.z + 0.5,
    from: at,
    to: at,
    progress: 1,
    heading,
    lane: random.range(-0.26, 0.26),
    state: 'walking',
    goal: null,
    at: 0,
    timer: 0,
    goalTime: 0,
    money: random.int(30, 110) * 100,
    spent: 0,
    happiness: random.range(0.55, 0.8),
    hunger: random.range(0.05, 0.4),
    thirst: random.range(0.05, 0.4),
    toilet: random.range(0, 0.3),
    energy: random.range(0.75, 1),
    nausea: 0,
    intensityMin: Math.max(0, bravery * 5 - 1.5),
    intensityMax: 3 + bravery * 6.5,
    ridden: [],
    thoughts: [],
    holding: null,
    hasMap: false,
    arrived: time,
    stay: random.range(360, 900),
    look: {
      shirt: random.pick(SHIRTS),
      trousers: random.pick(TROUSERS),
      skin: random.pick(SKINS),
      hair: random.pick(HAIR),
    },
  };
}

export function think(guest: Guest, text: string, day: number): void {
  if (guest.thoughts[0]?.text === text) return;
  guest.thoughts.unshift({ text, day });
  if (guest.thoughts.length > 6) guest.thoughts.length = 6;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Needs drift over time: hungrier, thirstier, more tired, less queasy. */
export function driftNeeds(guest: Guest, dt: number): void {
  guest.hunger = clamp(guest.hunger + 0.0021 * dt);
  guest.thirst = clamp(guest.thirst + 0.0026 * dt);
  guest.toilet = clamp(guest.toilet + 0.0011 * dt);
  guest.energy = clamp(guest.energy - (guest.state === 'walking' ? 0.0008 : 0.0003) * dt);
  guest.nausea = clamp(guest.nausea - 0.004 * dt);
  let mood = 0;
  if (guest.hunger > 0.75) mood -= 0.002;
  if (guest.thirst > 0.75) mood -= 0.002;
  if (guest.toilet > 0.8) mood -= 0.003;
  if (guest.nausea > 0.6) mood -= 0.002;
  if (guest.energy < 0.2) mood -= 0.001;
  if (guest.state === 'queuing' && guest.timer > 60) mood -= 0.0015;
  guest.happiness = clamp(guest.happiness + mood * dt);
}

/** What a guest thinks a ride or item is worth, in cents. */
export function fairPrice(ride: Ride): number {
  const spec = RIDE_TYPES[ride.type];
  if (spec.kind === 'ride') return Math.round(spec.excitement * 55) * 1;
  switch (spec.sells) {
    case 'burger':
      return 350;
    case 'drink':
      return 180;
    case 'ice-cream':
      return 200;
    case 'balloon':
      return 150;
    case 'map':
      return 80;
    default:
      return 50;
  }
}

/** How well a ride's intensity suits a guest: 1 is perfect, below 0 they won't go near it. */
export function intensityFit(guest: Guest, intensity: number): number {
  if (intensity > guest.intensityMax) return 1 - (intensity - guest.intensityMax) * 0.8;
  if (intensity < guest.intensityMin) return 1 - (guest.intensityMin - intensity) * 0.25;
  return 1;
}

/** A guest comes off a ride: happier (or not), a bit queasier. */
export function afterRide(guest: Guest, ride: Ride, random: Random, day: number): void {
  const spec = RIDE_TYPES[ride.type];
  const fit = intensityFit(guest, spec.intensity);
  guest.happiness = clamp(
    guest.happiness + 0.03 + 0.05 * spec.excitement * Math.max(0, fit) - (fit < 0.5 ? 0.12 : 0),
  );
  guest.nausea = clamp(guest.nausea + spec.nausea * 0.07 * random.range(0.5, 1.5));
  guest.energy = clamp(guest.energy - 0.02);
  if (!guest.ridden.includes(ride.id)) guest.ridden.push(ride.id);
  if (fit < 0.5) think(guest, `${ride.name} was too intense for me!`, day);
  else if (spec.intensity < guest.intensityMin) think(guest, `${ride.name} was a bit tame.`, day);
  else if (spec.excitement >= 4) think(guest, `${ride.name} was brilliant!`, day);
  else think(guest, `${ride.name} was fun.`, day);
  if (guest.nausea > 0.7) think(guest, 'I feel sick…', day);
}

/** A guest uses a stall: fed, watered or relieved. */
export function afterStall(guest: Guest, ride: Ride, day: number): void {
  const spec = RIDE_TYPES[ride.type];
  switch (spec.sells) {
    case 'burger':
      guest.hunger = clamp(guest.hunger - 0.75);
      guest.thirst = clamp(guest.thirst + 0.12);
      guest.happiness = clamp(guest.happiness + 0.05);
      think(guest, 'That burger hit the spot.', day);
      break;
    case 'drink':
      guest.thirst = clamp(guest.thirst - 0.75);
      guest.toilet = clamp(guest.toilet + 0.25);
      guest.happiness = clamp(guest.happiness + 0.03);
      break;
    case 'ice-cream':
      guest.hunger = clamp(guest.hunger - 0.3);
      guest.thirst = clamp(guest.thirst - 0.25);
      guest.happiness = clamp(guest.happiness + 0.08);
      think(guest, 'Mmm, ice cream.', day);
      break;
    case 'balloon':
      guest.holding = 'balloon';
      guest.happiness = clamp(guest.happiness + 0.1);
      think(guest, 'I love my new balloon!', day);
      break;
    case 'map':
      guest.hasMap = true;
      think(guest, 'Now I know where everything is.', day);
      break;
    case undefined:
      guest.toilet = 0;
      guest.happiness = clamp(guest.happiness + 0.04);
      break;
  }
}
