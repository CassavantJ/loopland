/**
 * Everything a player can build. Money is in cents throughout.
 *
 * Ratings are on a 0–10 scale: excitement is how much fun a ride is, intensity how wild,
 * nausea how likely it is to turn stomachs. Guests each like a band of intensity.
 */

import type { CoasterType } from './coaster';

export type RideKind = 'ride' | 'stall';

export type RideTypeId =
  | 'carousel'
  | 'ferris-wheel'
  | 'teacups'
  | 'swing-ship'
  | 'drop-tower'
  | 'bumper-cars'
  | 'haunted-house'
  | 'junior-coaster'
  | 'wooden-coaster'
  | 'steel-coaster'
  | 'burger-stall'
  | 'drink-stall'
  | 'ice-cream-stall'
  | 'balloon-stall'
  | 'toilets'
  | 'info-kiosk'
  | 'paddle-boats';

export type Item = 'burger' | 'drink' | 'ice-cream' | 'balloon' | 'map';

export interface RideType {
  id: RideTypeId;
  kind: RideKind;
  name: string;
  blurb: string;
  /** Footprint before rotation: width along x, depth along z. */
  width: number;
  depth: number;
  cost: number;
  /** Running cost per month. */
  upkeep: number;
  /** Default price per ride or item. */
  price: number;
  /** Rides: guests per cycle and seconds per ride. Stalls: seconds to serve. */
  capacity: number;
  duration: number;
  excitement: number;
  intensity: number;
  nausea: number;
  /** What a stall sells (toilets sell nothing). */
  sells?: Item;
  /** Colours for the model. */
  colours: readonly string[];
  /** Roller coasters: how their trains behave. Ratings come from a test run instead. */
  coaster?: CoasterType;
  /** Ready-made layout for coasters. */
  design?: 'junior' | 'wooden' | 'steel';
  /** Built on water rather than land. */
  water?: boolean;
}

export const RIDE_TYPES: Record<RideTypeId, RideType> = {
  carousel: {
    id: 'carousel',
    kind: 'ride',
    name: 'Carousel',
    blurb: 'Painted horses going round and round. Gentle, and loved by everyone.',
    width: 3,
    depth: 3,
    cost: 60_000,
    upkeep: 3_000,
    price: 100,
    capacity: 16,
    duration: 18,
    excitement: 3.2,
    intensity: 1.2,
    nausea: 0.8,
    colours: ['#ff6b6b', '#ffd43b', '#4dabf7'],
  },
  'ferris-wheel': {
    id: 'ferris-wheel',
    kind: 'ride',
    name: 'Ferris Wheel',
    blurb: 'A slow lap of the sky with views across the whole park.',
    width: 4,
    depth: 2,
    cost: 90_000,
    upkeep: 4_000,
    price: 150,
    capacity: 16,
    duration: 30,
    excitement: 3.8,
    intensity: 1.6,
    nausea: 0.6,
    colours: ['#f06595', '#ffffff', '#845ef7'],
  },
  teacups: {
    id: 'teacups',
    kind: 'ride',
    name: 'Spinning Cups',
    blurb: 'Giant teacups that spin on a spinning floor. Mind your lunch.',
    width: 3,
    depth: 3,
    cost: 55_000,
    upkeep: 3_000,
    price: 120,
    capacity: 16,
    duration: 16,
    excitement: 3.6,
    intensity: 3.4,
    nausea: 4.8,
    colours: ['#63e6be', '#ffa8a8', '#ffe066', '#a5d8ff'],
  },
  'swing-ship': {
    id: 'swing-ship',
    kind: 'ride',
    name: 'Swinging Ship',
    blurb: 'A pirate ship that swings higher and higher until the stomach drops.',
    width: 5,
    depth: 2,
    cost: 80_000,
    upkeep: 4_000,
    price: 150,
    capacity: 20,
    duration: 20,
    excitement: 4.6,
    intensity: 5.2,
    nausea: 4.2,
    colours: ['#a0522d', '#fab005', '#e03131'],
  },
  'drop-tower': {
    id: 'drop-tower',
    kind: 'ride',
    name: 'Drop Tower',
    blurb: 'Up, up, up… then straight down. For thrill-seekers only.',
    width: 2,
    depth: 2,
    cost: 120_000,
    upkeep: 6_000,
    price: 200,
    capacity: 8,
    duration: 14,
    excitement: 5.6,
    intensity: 7.4,
    nausea: 3.8,
    colours: ['#495057', '#ff922b', '#e64980'],
  },
  'bumper-cars': {
    id: 'bumper-cars',
    kind: 'ride',
    name: 'Bumper Cars',
    blurb: 'Little electric cars built for crashing into your friends.',
    width: 4,
    depth: 4,
    cost: 70_000,
    upkeep: 3_500,
    price: 120,
    capacity: 10,
    duration: 22,
    excitement: 4.2,
    intensity: 2.8,
    nausea: 1.2,
    colours: ['#15aabf', '#fa5252', '#fcc419', '#40c057'],
  },
  'haunted-house': {
    id: 'haunted-house',
    kind: 'ride',
    name: 'Haunted House',
    blurb: 'A creaky old mansion full of cardboard ghosts and real screams.',
    width: 3,
    depth: 3,
    cost: 85_000,
    upkeep: 3_500,
    price: 150,
    capacity: 12,
    duration: 26,
    excitement: 4.4,
    intensity: 3.0,
    nausea: 1.0,
    colours: ['#5f3dc4', '#343a40', '#b2f2bb'],
  },
  'junior-coaster': {
    id: 'junior-coaster',
    kind: 'ride',
    name: 'Junior Coaster',
    blurb: 'A gentle little coaster for younger thrill-seekers. No steep drops, no loops.',
    width: 3,
    depth: 1,
    cost: 50_000,
    upkeep: 4_000,
    price: 150,
    capacity: 12,
    duration: 40,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    colours: ['#fab005', '#1c7ed6', '#ffffff'],
    coaster: {
      cars: 3,
      seatsPerCar: 4,
      friction: 0.018,
      drag: 0.004,
      carSpacing: 0.9,
      loops: false,
      steep: false,
      boosters: false,
    },
    design: 'junior',
  },
  'wooden-coaster': {
    id: 'wooden-coaster',
    kind: 'ride',
    name: 'Wooden Coaster',
    blurb: 'A rattling timber classic, full of airtime hills and big drops.',
    width: 3,
    depth: 1,
    cost: 90_000,
    upkeep: 7_000,
    price: 250,
    capacity: 12,
    duration: 60,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    colours: ['#c92a2a', '#8d5a3b', '#f1e3c8'],
    coaster: {
      cars: 3,
      seatsPerCar: 4,
      friction: 0.022,
      drag: 0.005,
      carSpacing: 0.9,
      loops: false,
      steep: true,
      boosters: false,
    },
    design: 'wooden',
  },
  'steel-coaster': {
    id: 'steel-coaster',
    kind: 'ride',
    name: 'Looping Coaster',
    blurb: 'Smooth steel track that can turn you upside down with loops and boosters.',
    width: 3,
    depth: 1,
    cost: 120_000,
    upkeep: 8_000,
    price: 300,
    capacity: 12,
    duration: 60,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    colours: ['#1c7ed6', '#e9ecef', '#fa5252'],
    coaster: {
      cars: 3,
      seatsPerCar: 4,
      friction: 0.014,
      drag: 0.003,
      carSpacing: 0.9,
      loops: true,
      steep: true,
      boosters: true,
    },
    design: 'steel',
  },
  'paddle-boats': {
    id: 'paddle-boats',
    kind: 'ride',
    name: 'Paddle Boats',
    blurb: 'Swan-shaped pedal boats on the lake. Needs water deep enough to float on.',
    width: 3,
    depth: 3,
    cost: 45_000,
    upkeep: 2_500,
    price: 120,
    capacity: 8,
    duration: 30,
    excitement: 2.8,
    intensity: 0.8,
    nausea: 0.4,
    colours: ['#f8f9fa', '#fcc419', '#e8590c'],
    water: true,
  },
  'burger-stall': {
    id: 'burger-stall',
    kind: 'stall',
    name: 'Burger Bar',
    blurb: 'Burgers for hungry guests.',
    width: 1,
    depth: 1,
    cost: 15_000,
    upkeep: 1_500,
    price: 300,
    capacity: 1,
    duration: 3,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    sells: 'burger',
    colours: ['#e8590c', '#ffd43b'],
  },
  'drink-stall': {
    id: 'drink-stall',
    kind: 'stall',
    name: 'Drinks Stand',
    blurb: 'Fizzy drinks for thirsty guests.',
    width: 1,
    depth: 1,
    cost: 12_000,
    upkeep: 1_200,
    price: 150,
    capacity: 1,
    duration: 2,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    sells: 'drink',
    colours: ['#1c7ed6', '#ffffff'],
  },
  'ice-cream-stall': {
    id: 'ice-cream-stall',
    kind: 'stall',
    name: 'Ice Cream Cart',
    blurb: 'Cold, sweet and a little messy.',
    width: 1,
    depth: 1,
    cost: 12_000,
    upkeep: 1_200,
    price: 180,
    capacity: 1,
    duration: 2,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    sells: 'ice-cream',
    colours: ['#f783ac', '#fff0f6'],
  },
  'balloon-stall': {
    id: 'balloon-stall',
    kind: 'stall',
    name: 'Balloon Stand',
    blurb: 'Balloons. Guests love them until they let go.',
    width: 1,
    depth: 1,
    cost: 10_000,
    upkeep: 1_000,
    price: 120,
    capacity: 1,
    duration: 2,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    sells: 'balloon',
    colours: ['#fa5252', '#fcc419', '#4dabf7'],
  },
  toilets: {
    id: 'toilets',
    kind: 'stall',
    name: 'Toilets',
    blurb: 'Essential. Guests who can’t find one get very unhappy.',
    width: 1,
    depth: 1,
    cost: 10_000,
    upkeep: 1_500,
    price: 0,
    capacity: 2,
    duration: 4,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    colours: ['#dee2e6', '#339af0'],
  },
  'info-kiosk': {
    id: 'info-kiosk',
    kind: 'stall',
    name: 'Information Kiosk',
    blurb: 'Park maps, so guests stop getting lost.',
    width: 1,
    depth: 1,
    cost: 10_000,
    upkeep: 1_000,
    price: 50,
    capacity: 1,
    duration: 2,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    sells: 'map',
    colours: ['#2f9e44', '#ffffff'],
  },
};

export const RIDES = Object.values(RIDE_TYPES).filter(
  (type) => type.kind === 'ride' && !type.coaster,
);
export const COASTERS = Object.values(RIDE_TYPES).filter((type) => type.coaster);
export const STALLS = Object.values(RIDE_TYPES).filter((type) => type.kind === 'stall');

// New ids go at the end: saved parks store scenery by its position in this list.
export type SceneryId =
  | 'oak'
  | 'pine'
  | 'palm'
  | 'bush'
  | 'flowers'
  | 'hedge'
  | 'fountain'
  | 'statue'
  | 'willow'
  | 'boulder'
  | 'topiary'
  | 'tulips'
  | 'flower-arch'
  | 'cactus'
  | 'barrel'
  | 'wagon-wheel'
  | 'rocket'
  | 'crystal'
  | 'dead-tree'
  | 'gravestone'
  | 'pumpkin'
  | 'tiki-torch';

export type Theme = 'nature' | 'garden' | 'western' | 'space' | 'spooky' | 'tropical';

export const THEMES: readonly { id: Theme; name: string }[] = [
  { id: 'nature', name: 'Nature' },
  { id: 'garden', name: 'Garden' },
  { id: 'western', name: 'Wild West' },
  { id: 'space', name: 'Space' },
  { id: 'spooky', name: 'Spooky' },
  { id: 'tropical', name: 'Tropical' },
];

export interface SceneryType {
  id: SceneryId;
  name: string;
  cost: number;
  /** How much guests nearby enjoy it (0–3). */
  beauty: number;
  theme: Theme;
}

const scenery = (id: SceneryId, name: string, cost: number, beauty: number, theme: Theme) => ({
  id,
  name,
  cost,
  beauty,
  theme,
});

export const SCENERY: Record<SceneryId, SceneryType> = {
  oak: scenery('oak', 'Oak tree', 1_500, 1, 'nature'),
  pine: scenery('pine', 'Pine tree', 1_200, 1, 'nature'),
  palm: scenery('palm', 'Palm tree', 2_000, 1.5, 'tropical'),
  bush: scenery('bush', 'Bush', 600, 0.5, 'nature'),
  flowers: scenery('flowers', 'Flower bed', 800, 1.5, 'garden'),
  hedge: scenery('hedge', 'Hedge', 700, 0.5, 'garden'),
  fountain: scenery('fountain', 'Fountain', 12_000, 3, 'garden'),
  statue: scenery('statue', 'Statue', 8_000, 2.5, 'garden'),
  willow: scenery('willow', 'Willow tree', 1_800, 1.5, 'nature'),
  boulder: scenery('boulder', 'Boulder', 900, 0.5, 'nature'),
  topiary: scenery('topiary', 'Topiary', 2_500, 2, 'garden'),
  tulips: scenery('tulips', 'Tulips', 900, 1.5, 'garden'),
  'flower-arch': scenery('flower-arch', 'Flower arch', 4_000, 2.5, 'garden'),
  cactus: scenery('cactus', 'Cactus', 900, 1, 'western'),
  barrel: scenery('barrel', 'Barrels', 700, 0.5, 'western'),
  'wagon-wheel': scenery('wagon-wheel', 'Wagon wheel', 1_000, 1, 'western'),
  rocket: scenery('rocket', 'Model rocket', 9_000, 2.5, 'space'),
  crystal: scenery('crystal', 'Glowing crystal', 5_000, 2, 'space'),
  'dead-tree': scenery('dead-tree', 'Dead tree', 800, 1, 'spooky'),
  gravestone: scenery('gravestone', 'Gravestone', 700, 1, 'spooky'),
  pumpkin: scenery('pumpkin', 'Pumpkins', 600, 1, 'spooky'),
  'tiki-torch': scenery('tiki-torch', 'Tiki torch', 1_200, 1.5, 'tropical'),
};

export type PathItemId = 'bench' | 'bin' | 'lamp';

export const PATH_ITEMS: Record<PathItemId, { id: PathItemId; name: string; cost: number }> = {
  bench: { id: 'bench', name: 'Bench', cost: 800 },
  bin: { id: 'bin', name: 'Litter bin', cost: 500 },
  lamp: { id: 'lamp', name: 'Lamp', cost: 600 },
};

export const PATH_COST = 1_000;
export const QUEUE_COST = 1_200;
/** Cost per height step of earth moved when levelling land for a building. */
export const EARTH_COST = 250;

/** Money as dollars: 1500 → "$15.00", 150000 → "$1,500". */
export function money(cents: number, exact = false): string {
  const sign = cents < 0 ? '−' : '';
  const dollars = Math.abs(cents) / 100;
  const whole = Number.isInteger(dollars) && !exact;
  return `${sign}$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
