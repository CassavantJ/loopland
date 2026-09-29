import { DIRECTIONS, DX, DZ, type Tile } from './grid';
import type { Park } from './park';

/**
 * Walking distances over the path network. For each destination tile a breadth-first search
 * gives every path tile its number of steps away (or −1), so a guest just steps downhill.
 * Fields are cached until something is built or removed.
 */
export class Navigator {
  readonly park: Park;
  private version = -1;
  private fields = new Map<number, Int16Array>();

  constructor(park: Park) {
    this.park = park;
  }

  private refresh() {
    if (this.version !== this.park.version) {
      this.version = this.park.version;
      this.fields.clear();
    }
  }

  field(target: Tile): Int16Array {
    this.refresh();
    const park = this.park;
    const key = park.index(target.x, target.z);
    const cached = this.fields.get(key);
    if (cached) return cached;
    const field = new Int16Array(park.width * park.depth).fill(-1);
    if (park.isWalkable(target.x, target.z)) {
      const queue = new Int32Array(park.width * park.depth);
      let head = 0;
      let tail = 0;
      field[key] = 0;
      queue[tail++] = key;
      while (head < tail) {
        const index = queue[head++] ?? 0;
        const x = index % park.width;
        const z = Math.floor(index / park.width);
        const distance = field[index] ?? 0;
        for (const direction of DIRECTIONS) {
          const nx = x + DX[direction];
          const nz = z + DZ[direction];
          if (!park.isWalkable(nx, nz) || !park.terrain.meets(x, z, direction)) continue;
          const next = park.index(nx, nz);
          if (field[next] !== -1) continue;
          field[next] = distance + 1;
          queue[tail++] = next;
        }
      }
    }
    this.fields.set(key, field);
    return field;
  }

  /** Steps from one tile to another along paths, or −1 when there's no way. */
  distance(from: Tile, to: Tile): number {
    return this.field(to)[this.park.index(from.x, from.z)] ?? -1;
  }

  /** Walkable neighbours you can step to from a tile. */
  neighbours(tile: Tile): Tile[] {
    const park = this.park;
    const result: Tile[] = [];
    for (const direction of DIRECTIONS) {
      const nx = tile.x + DX[direction];
      const nz = tile.z + DZ[direction];
      if (park.isWalkable(nx, nz) && park.terrain.meets(tile.x, tile.z, direction)) {
        result.push({ x: nx, z: nz });
      }
    }
    return result;
  }
}
