import { RIDE_TYPES, SCENERY } from './catalog';
import { ratingsOf } from './guests';
import { SCENERY_IDS, USE, type Park } from './park';
import type { World } from './world';

/**
 * The business side: loans, marketing campaigns, awards, and what the park is worth.
 * Money is in cents.
 */

export type CampaignId = 'adverts' | 'vouchers' | 'ride-advert';

export const CAMPAIGNS: Record<CampaignId, { name: string; blurb: string; cost: number }> = {
  adverts: {
    name: 'Park adverts',
    blurb: 'Posters and radio spots bring in plenty more visitors.',
    cost: 50_000,
  },
  vouchers: {
    name: 'Half-price vouchers',
    blurb: 'Entry at half price for new visitors. Crowds flock in, but the gate takes less.',
    cost: 30_000,
  },
  'ride-advert': {
    name: 'Ride advert',
    blurb: 'Tell everyone about one ride: new visitors head straight for it.',
    cost: 20_000,
  },
};

export interface Campaign {
  id: CampaignId;
  monthsLeft: number;
  /** For ride adverts: which ride. */
  ride?: number;
}

export type AwardId = 'tidiest' | 'happiest' | 'most-beautiful' | 'best-value' | 'thrills';

export const AWARDS: Record<AwardId, { name: string; blurb: string }> = {
  tidiest: { name: 'Tidiest Park', blurb: 'Spotless paths, month after month.' },
  happiest: { name: 'Happiest Guests', blurb: 'Nobody leaves without a smile.' },
  'most-beautiful': { name: 'Most Beautiful Park', blurb: 'Gardens, trees and water everywhere.' },
  'best-value': { name: 'Best Value', blurb: 'Cheap to get in, plenty to do.' },
  thrills: { name: 'Thrill Capital', blurb: 'Three or more exciting roller coasters.' },
};

export interface Award {
  id: AwardId;
  /** The month it was won; awards last three months. */
  month: number;
}

/** Interest charged on a loan each month, as a fraction. */
export const INTEREST = 0.008;
export const LOAN_STEP = 100_000;

export function borrow(park: Park, amount = LOAN_STEP): { ok: boolean; reason: string } {
  const room = park.maxLoan - park.loan;
  if (room <= 0) return { ok: false, reason: 'The bank won’t lend any more.' };
  const taken = Math.min(amount, room);
  park.loan += taken;
  park.money += taken;
  return { ok: true, reason: '' };
}

export function repay(park: Park, amount = LOAN_STEP): { ok: boolean; reason: string } {
  if (park.loan <= 0) return { ok: false, reason: 'There’s no loan to repay.' };
  const paid = Math.min(amount, park.loan);
  if (paid > park.money) return { ok: false, reason: 'Not enough money.' };
  park.loan -= paid;
  park.money -= paid;
  return { ok: true, reason: '' };
}

export function startCampaign(
  park: Park,
  id: CampaignId,
  months: number,
  ride?: number,
): { ok: boolean; reason: string } {
  if (park.marketing.some((campaign) => campaign.id === id)) {
    return { ok: false, reason: 'That campaign is already running.' };
  }
  if (id === 'ride-advert' && (ride === undefined || !park.ride(ride))) {
    return { ok: false, reason: 'Pick a ride to advertise.' };
  }
  const cost = CAMPAIGNS[id].cost;
  if (cost > park.money) return { ok: false, reason: 'Not enough money.' };
  // The first month is paid up front; the rest at the start of each month.
  park.spend(cost, 'marketing');
  park.marketing.push({ id, monthsLeft: months, ...(ride === undefined ? {} : { ride }) });
  park.post(`${CAMPAIGNS[id].name} started.`);
  return { ok: true, reason: '' };
}

export const campaignActive = (park: Park, id: CampaignId) =>
  park.marketing.some((campaign) => campaign.id === id);

export const advertisedRide = (park: Park): number | null =>
  park.marketing.find((campaign) => campaign.id === 'ride-advert')?.ride ?? null;

/** How much more often guests arrive, from marketing and awards. */
export function arrivalBoost(park: Park): number {
  let boost = 1;
  if (campaignActive(park, 'adverts')) boost *= 1.6;
  if (campaignActive(park, 'vouchers')) boost *= 1.8;
  if (campaignActive(park, 'ride-advert')) boost *= 1.2;
  return boost * (1 + park.awards.length * 0.08);
}

/** The park's worth: its rides (worth less as they age), coaster track, scenery and guests. */
export function parkValue(world: World): number {
  const park = world.park;
  let value = 0;
  for (const ride of park.rides) {
    const years = (park.day - ride.built) / 160;
    value += RIDE_TYPES[ride.type].cost * Math.max(0.4, 1 - years * 0.1);
    value += (ride.coaster?.spent ?? 0) * 0.8;
  }
  for (let index = 0; index < park.use.length; index++) {
    if (park.use[index] !== USE.scenery) continue;
    const id = SCENERY_IDS[park.ref[index] ?? 0];
    if (id) value += SCENERY[id].cost * 0.5;
  }
  return Math.round(value + world.guests.length * 1_500);
}

/** The start of every month: interest, campaigns, and handing out awards. */
export function monthlyBusiness(world: World): void {
  const park = world.park;
  if (park.loan > 0) park.spend(Math.round(park.loan * INTEREST), 'interest');
  for (const campaign of park.marketing) {
    campaign.monthsLeft--;
    if (campaign.monthsLeft > 0) park.spend(CAMPAIGNS[campaign.id].cost, 'marketing');
    else park.post(`${CAMPAIGNS[campaign.id].name} has finished.`);
  }
  park.marketing = park.marketing.filter((campaign) => campaign.monthsLeft > 0);
  const month = park.month;
  park.awards = park.awards.filter((award) => month - award.month < 3);
  for (const id of earnedAwards(world)) {
    if (park.awards.some((award) => award.id === id)) continue;
    park.awards.push({ id, month });
    park.post(`${park.name} has won the ${AWARDS[id].name} award!`);
  }
}

export function earnedAwards(world: World): AwardId[] {
  const park = world.park;
  const earned: AwardId[] = [];
  const guests = world.guests.length;
  const paths = park.use.reduce((sum, use) => sum + (use === USE.path ? 1 : 0), 0);
  if (paths >= 40 && world.cleanliness >= 0.95) earned.push('tidiest');
  const happiness =
    guests > 0 ? world.guests.reduce((sum, guest) => sum + guest.happiness, 0) / guests : 0;
  if (guests >= 100 && happiness >= 0.72) earned.push('happiest');
  // Scenery that guests can actually see: within a couple of tiles of a path.
  let scenery = 0;
  for (let z = 0; z < park.depth; z++) {
    for (let x = 0; x < park.width; x++) {
      if (park.useAt(x, z) !== USE.scenery) continue;
      let near = false;
      for (let dz = -2; dz <= 2 && !near; dz++) {
        for (let dx = -2; dx <= 2 && !near; dx++) near = park.useAt(x + dx, z + dz) === USE.path;
      }
      if (near) scenery++;
    }
  }
  if (scenery >= 60) earned.push('most-beautiful');
  const rides = park.rides.filter((ride) => RIDE_TYPES[ride.type].kind === 'ride').length;
  if (rides >= 6 && park.entranceFee <= 500) earned.push('best-value');
  const thrilling = park.rides.filter(
    (ride) => ride.coaster?.stats && ratingsOf(ride).excitement >= 5,
  ).length;
  if (thrilling >= 3) earned.push('thrills');
  return earned;
}
