import { SCENERY } from './catalog';
import { USE, type Park, type Ride } from './park';
import { SCENERY_IDS } from './park';

/**
 * How lovely each tile is: scenery spreads its beauty to the tiles around it, and water adds a
 * little too. Guests enjoy walking through pretty parts of the park, and rides surrounded by
 * scenery and water are more exciting.
 */

const RADIUS = 3;
const cache = new WeakMap<Park, { key: string; map: Float32Array }>();

export function beautyMap(park: Park): Float32Array {
  const key = `${park.version}:${park.landVersion}`;
  const cached = cache.get(park);
  if (cached?.key === key) return cached.map;
  const map = new Float32Array(park.width * park.depth);
  const spread = (x: number, z: number, amount: number, radius: number) => {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = x + dx;
        const tz = z + dz;
        if (!park.inside(tx, tz)) continue;
        const falloff = 1 - Math.max(Math.abs(dx), Math.abs(dz)) / (radius + 1);
        const index = park.index(tx, tz);
        map[index] = (map[index] ?? 0) + amount * falloff;
      }
    }
  };
  for (let z = 0; z < park.depth; z++) {
    for (let x = 0; x < park.width; x++) {
      const index = park.index(x, z);
      if (park.use[index] === USE.scenery) {
        const id = SCENERY_IDS[park.ref[index] ?? 0];
        if (id) spread(x, z, SCENERY[id].beauty * 0.4, RADIUS);
      } else if (park.underwater(x, z)) {
        spread(x, z, 0.12, 2);
      }
    }
  }
  cache.set(park, { key, map });
  return map;
}

/** Extra excitement a ride gets from the scenery and water around it (up to +1). */
export function sceneryBonus(park: Park, ride: Ride): number {
  const map = beautyMap(park);
  let total = 0;
  let tiles = 0;
  for (let z = ride.z - 2; z < ride.z + ride.depth + 2; z++) {
    for (let x = ride.x - 2; x < ride.x + ride.width + 2; x++) {
      if (!park.inside(x, z)) continue;
      total += map[park.index(x, z)] ?? 0;
      tiles++;
    }
  }
  // Coasters also count the scenery along their track.
  for (const placed of ride.coaster?.pieces ?? []) {
    const { x, z } = placed.start;
    if (!park.inside(x, z)) continue;
    total += (map[park.index(x, z)] ?? 0) * 0.5;
    tiles += 0.5;
  }
  if (tiles === 0) return 0;
  return Math.round(Math.min(1, (total / tiles) * 0.9) * 100) / 100;
}
