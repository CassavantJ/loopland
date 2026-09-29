/**
 * Map geometry shared by the simulation and the renderer.
 *
 * The park is a grid of square tiles. x runs east, z runs south. Each tile has four corner
 * heights (whole numbers of HEIGHT_STEP); neighbouring corners differ by at most one step, so
 * every tile is flat, a ramp, or one of a few gentle corner shapes.
 */

/** World units per height step; a tile is 1 × 1 world units. */
export const HEIGHT_STEP = 0.25;
export const MAX_HEIGHT = 40;

export type Direction = 0 | 1 | 2 | 3;
/** North (−z), east (+x), south (+z), west (−x). */
export const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DZ = [-1, 0, 1, 0] as const;
export const opposite = (direction: Direction) => ((direction + 2) % 4) as Direction;
export const turn = (direction: Direction, by: number) =>
  ((((direction + by) % 4) + 4) % 4) as Direction;

export interface Tile {
  x: number;
  z: number;
}

export class Terrain {
  readonly width: number;
  readonly depth: number;
  /** Corner heights, (width + 1) × (depth + 1), row by row. */
  readonly corners: Int16Array;

  constructor(width: number, depth: number, corners?: Int16Array) {
    this.width = width;
    this.depth = depth;
    this.corners = corners ?? new Int16Array((width + 1) * (depth + 1));
  }

  inside(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.depth;
  }

  corner(cx: number, cz: number): number {
    return this.corners[cz * (this.width + 1) + cx] ?? 0;
  }

  setCorner(cx: number, cz: number, height: number): void {
    this.corners[cz * (this.width + 1) + cx] = Math.max(0, Math.min(MAX_HEIGHT, height));
  }

  /** A tile's corners: north-west, north-east, south-east, south-west. */
  tileCorners(x: number, z: number): [number, number, number, number] {
    return [
      this.corner(x, z),
      this.corner(x + 1, z),
      this.corner(x + 1, z + 1),
      this.corner(x, z + 1),
    ];
  }

  base(x: number, z: number): number {
    return Math.min(...this.tileCorners(x, z));
  }

  isFlat(x: number, z: number): boolean {
    const [a, b, c, d] = this.tileCorners(x, z);
    return a === b && b === c && c === d;
  }

  /**
   * The two corner heights along one edge of a tile, listed clockwise. Two tiles meet cleanly
   * (a path can cross) when one's edge equals the other's opposite edge reversed.
   */
  edge(x: number, z: number, side: Direction): [number, number] {
    const [nw, ne, se, sw] = this.tileCorners(x, z);
    switch (side) {
      case 0:
        return [nw, ne];
      case 1:
        return [ne, se];
      case 2:
        return [se, sw];
      case 3:
        return [sw, nw];
    }
  }

  /** Whether a path can lie on this tile: flat, or a straight ramp. */
  pathShape(x: number, z: number): 'flat' | 'ramp' | null {
    if (this.isFlat(x, z)) return 'flat';
    const [nw, ne, se, sw] = this.tileCorners(x, z);
    const rampNS = nw === ne && sw === se && Math.abs(nw - sw) === 1;
    const rampEW = nw === sw && ne === se && Math.abs(nw - ne) === 1;
    return rampNS || rampEW ? 'ramp' : null;
  }

  /** Whether you can walk straight from one tile into its neighbour on `side`. */
  meets(x: number, z: number, side: Direction): boolean {
    const nx = x + DX[side];
    const nz = z + DZ[side];
    if (!this.inside(nx, nz)) return false;
    const [a, b] = this.edge(x, z, side);
    const [c, d] = this.edge(nx, nz, opposite(side));
    return a === d && b === c;
  }

  /** Surface height (in world units) at a point inside the map. */
  heightAt(px: number, pz: number): number {
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(px)));
    const z = Math.min(this.depth - 1, Math.max(0, Math.floor(pz)));
    const u = Math.min(1, Math.max(0, px - x));
    const v = Math.min(1, Math.max(0, pz - z));
    const [nw, ne, se, sw] = this.tileCorners(x, z);
    // Two triangles, split from north-west to south-east (the renderer splits the same way).
    const h = u >= v ? nw + (ne - nw) * u + (se - ne) * v : nw + (se - sw) * u + (sw - nw) * v;
    return h * HEIGHT_STEP;
  }

  /**
   * Levels a rectangle of tiles to `height`, dragging neighbouring corners along so no step
   * is steeper than one. Returns how many height steps of earth were moved.
   */
  level(x0: number, z0: number, x1: number, z1: number, height: number): number {
    let moved = 0;
    for (let cz = z0; cz <= z1 + 1; cz++) {
      for (let cx = x0; cx <= x1 + 1; cx++) {
        moved += Math.abs(this.corner(cx, cz) - height);
        this.setCorner(cx, cz, height);
      }
    }
    moved += this.smooth(x0, z0, x1 + 1, z1 + 1);
    return moved;
  }

  /**
   * Moves corners outside a fixed rectangle until no neighbours differ by more than one step:
   * first raising corners that sit too far below a neighbour, then lowering ones too far above.
   * Each pass only moves one way, so it always settles.
   */
  smooth(fx0: number, fz0: number, fx1: number, fz1: number): number {
    let moved = 0;
    const fixed = (cx: number, cz: number) => cx >= fx0 && cx <= fx1 && cz >= fz0 && cz <= fz1;
    for (const raise of [true, false]) {
      for (let pass = 0; pass < MAX_HEIGHT * 2; pass++) {
        let changed = false;
        for (let cz = 0; cz <= this.depth; cz++) {
          for (let cx = 0; cx <= this.width; cx++) {
            if (fixed(cx, cz)) continue;
            const here = this.corner(cx, cz);
            let next = here;
            for (const direction of DIRECTIONS) {
              const nx = cx + DX[direction];
              const nz = cz + DZ[direction];
              if (nx < 0 || nz < 0 || nx > this.width || nz > this.depth) continue;
              const neighbour = this.corner(nx, nz);
              next = raise ? Math.max(next, neighbour - 1) : Math.min(next, neighbour + 1);
            }
            if (next !== here) {
              moved += Math.abs(next - here);
              this.setCorner(cx, cz, next);
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
    }
    return moved;
  }
}
