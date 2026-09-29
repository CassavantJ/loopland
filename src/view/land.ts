import * as THREE from 'three';

import { DIRECTIONS, DX, DZ, HEIGHT_STEP, type Direction } from '../sim/grid';
import { SURFACES, USE, type Park } from '../sim/park';

/** Builds non-indexed triangles with per-vertex colours. */
class Builder {
  positions: number[] = [];
  colors: number[] = [];

  triangle(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, color: THREE.Color) {
    for (const point of [a, b, c]) {
      this.positions.push(point.x, point.y, point.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  /** A quad from four points listed counter-clockwise seen from its front. */
  quad(
    a: THREE.Vector3Like,
    b: THREE.Vector3Like,
    c: THREE.Vector3Like,
    d: THREE.Vector3Like,
    color: THREE.Color,
  ) {
    this.triangle(a, b, c, color);
    this.triangle(a, c, d, color);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

/** A cheap per-tile hash for colour variation. */
const hash = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h & 0xffff) / 0xffff;
};

const GRASS = new THREE.Color('#79c257');
const GRASS_OUTSIDE = new THREE.Color('#8aa874');
const LAKE_BED = new THREE.Color('#8c7a52');
const FOR_SALE = new THREE.Color('#b9c27a');
const FENCE = new THREE.Color('#8d6e4b');
const FENCE_TOP = new THREE.Color('#b08a5f');
const SURFACE_COLOURS = SURFACES.map((surface) => new THREE.Color(surface.colour));
const WATER = new THREE.Color('#4dabf7');
const WATER_SIDE = new THREE.Color('#1c7ed6');
const DIRT = new THREE.Color('#8d6e4b');
const DIRT_DARK = new THREE.Color('#6d5238');
const SKIRT_DEPTH = -0.8;

export function terrainGeometry(park: Park): THREE.BufferGeometry {
  const { terrain } = park;
  const out = new Builder();
  const color = new THREE.Color();
  const point = (x: number, z: number) => ({ x, y: terrain.corner(x, z) * HEIGHT_STEP, z });
  for (let z = 0; z < park.depth; z++) {
    for (let x = 0; x < park.width; x++) {
      const owned = park.isOwned(x, z) || park.useAt(x, z) === USE.gate;
      const paint = SURFACE_COLOURS[park.surface[park.index(x, z)] ?? 0] ?? GRASS;
      color.copy(owned ? paint : park.forSale(x, z) ? FOR_SALE : GRASS_OUTSIDE);
      // Lake beds are sandy and dim.
      if (park.underwater(x, z)) color.lerp(LAKE_BED, 0.6);
      const shade = (hash(x, z) - 0.5) * 0.06 + ((x + z) % 2 === 0 ? 0.015 : -0.015);
      color.offsetHSL(0, 0, shade + terrain.base(x, z) * 0.004);
      const nw = point(x, z);
      const ne = point(x + 1, z);
      const se = point(x + 1, z + 1);
      const sw = point(x, z + 1);
      out.triangle(nw, se, ne, color);
      out.triangle(nw, sw, se, color);
    }
  }
  // Earth sides around the edge, so the park sits like a model on a table.
  const side = (a: THREE.Vector3Like, b: THREE.Vector3Like) => {
    const lowA = { x: a.x, y: SKIRT_DEPTH, z: a.z };
    const lowB = { x: b.x, y: SKIRT_DEPTH, z: b.z };
    const lipA = { x: a.x, y: a.y - 0.08, z: a.z };
    const lipB = { x: b.x, y: b.y - 0.08, z: b.z };
    out.quad(a, lipA, lipB, b, GRASS);
    out.quad(lipA, lowA, lowB, lipB, DIRT);
  };
  for (let x = 0; x < park.width; x++) {
    side(point(x + 1, 0), point(x, 0));
    side(point(x, park.depth), point(x + 1, park.depth));
  }
  for (let z = 0; z < park.depth; z++) {
    side(point(0, z), point(0, z + 1));
    side(point(park.width, z + 1), point(park.width, z));
  }
  // The underside, in case the camera ever peeks below.
  out.quad(
    { x: 0, y: SKIRT_DEPTH, z: 0 },
    { x: park.width, y: SKIRT_DEPTH, z: 0 },
    { x: park.width, y: SKIRT_DEPTH, z: park.depth },
    { x: 0, y: SKIRT_DEPTH, z: park.depth },
    DIRT_DARK,
  );
  return out.build();
}

const PATH = new THREE.Color('#dcc7a1');
const PATH_EDGE = new THREE.Color('#a88e66');
const QUEUE = new THREE.Color('#a9bfd6');
const QUEUE_EDGE = new THREE.Color('#58708f');

const walkish = (use: number) =>
  use === USE.path ||
  use === USE.queue ||
  use === USE.gate ||
  use === USE.entrance ||
  use === USE.exit;

/** Footpaths and queue lines: a surface on the land, with a kerb on every unconnected side. */
export function pathGeometry(park: Park): THREE.BufferGeometry {
  const { terrain } = park;
  const out = new Builder();
  const lift = 0.025;
  const at = (x: number, z: number, raise = 0) => ({
    x,
    y: terrain.heightAt(x, z) + lift + raise,
    z,
  });
  const color = new THREE.Color();
  for (let z = 0; z < park.depth; z++) {
    for (let x = 0; x < park.width; x++) {
      const use = park.useAt(x, z);
      if (!walkish(use)) continue;
      const queue = use === USE.queue;
      color.copy(queue ? QUEUE : PATH).offsetHSL(0, 0, (hash(x, z) - 0.5) * 0.03);
      out.quad(at(x, z), at(x, z + 1), at(x + 1, z + 1), at(x + 1, z), color);
      if (use === USE.gate || use === USE.entrance || use === USE.exit) continue;
      const edge = queue ? QUEUE_EDGE : PATH_EDGE;
      for (const direction of DIRECTIONS) {
        const nx = x + DX[direction];
        const nz = z + DZ[direction];
        if (walkish(park.useAt(nx, nz)) && terrain.meets(x, z, direction)) continue;
        kerb(out, x, z, direction, at, edge, queue ? 0.1 : 0.07);
      }
    }
  }
  return out.build();
}

function kerb(
  out: Builder,
  x: number,
  z: number,
  side: Direction,
  at: (x: number, z: number, raise?: number) => THREE.Vector3Like,
  color: THREE.Color,
  width: number,
) {
  const raise = 0.035;
  // Corners of the strip, clockwise from the tile's outer edge.
  let points: [number, number][];
  switch (side) {
    case 0:
      points = [
        [x, z],
        [x + 1, z],
        [x + 1, z + width],
        [x, z + width],
      ];
      break;
    case 1:
      points = [
        [x + 1, z],
        [x + 1, z + 1],
        [x + 1 - width, z + 1],
        [x + 1 - width, z],
      ];
      break;
    case 2:
      points = [
        [x + 1, z + 1],
        [x, z + 1],
        [x, z + 1 - width],
        [x + 1, z + 1 - width],
      ];
      break;
    case 3:
      points = [
        [x, z + 1],
        [x, z],
        [x + width, z],
        [x + width, z + 1],
      ];
      break;
  }
  const [a, b, c, d] = points.map(([px, pz]) => at(px, pz, raise));
  if (!a || !b || !c || !d) return;
  // Top of the kerb, then its inner face down to the path.
  out.quad(a, d, c, b, color);
  const [, , c0, d0] = points.map(([px, pz]) => at(px, pz, 0));
  if (c0 && d0) out.quad(d, d0, c0, c, color);
}

/** A flat outline following the land over a set of tiles, for the cursor and previews. */
export function tilesGeometry(
  park: Park,
  tiles: readonly { x: number; z: number }[],
): THREE.BufferGeometry {
  const out = new Builder();
  const white = new THREE.Color('#ffffff');
  const at = (x: number, z: number) => ({ x, y: park.terrain.heightAt(x, z) + 0.06, z });
  for (const { x, z } of tiles) {
    if (!park.inside(x, z)) continue;
    const inset = 0.04;
    out.quad(
      at(x + inset, z + inset),
      at(x + inset, z + 1 - inset),
      at(x + 1 - inset, z + 1 - inset),
      at(x + 1 - inset, z + inset),
      white,
    );
  }
  return out.build();
}

/** The cursor for land tools: a dot on a corner. */
export function cornerGeometry(park: Park, cx: number, cz: number): THREE.BufferGeometry {
  const out = new Builder();
  const white = new THREE.Color('#ffffff');
  const y = park.terrain.corner(cx, cz) * HEIGHT_STEP + 0.07;
  const r = 0.18;
  out.quad(
    { x: cx - r, y, z: cz },
    { x: cx, y, z: cz + r },
    { x: cx + r, y, z: cz },
    { x: cx, y, z: cz - r },
    white,
  );
  return out.build();
}

/** Lakes: a surface at each tile's water level, with sides where the water stands above land. */
export function waterGeometry(park: Park): THREE.BufferGeometry {
  const out = new Builder();
  const { terrain } = park;
  const levelAt = (x: number, z: number) =>
    park.underwater(x, z) ? (park.water[park.index(x, z)] ?? 0) * HEIGHT_STEP - 0.03 : null;
  for (let z = 0; z < park.depth; z++) {
    for (let x = 0; x < park.width; x++) {
      const y = levelAt(x, z);
      if (y === null) continue;
      out.quad(
        { x, y, z },
        { x, y, z: z + 1 },
        { x: x + 1, y, z: z + 1 },
        { x: x + 1, y, z },
        WATER,
      );
      // Sides: down to the land on any edge where the neighbour's water is lower (or none).
      const edges: [number, number, [number, number], [number, number]][] = [
        [0, -1, [x + 1, z], [x, z]],
        [1, 0, [x + 1, z + 1], [x + 1, z]],
        [0, 1, [x, z + 1], [x + 1, z + 1]],
        [-1, 0, [x, z], [x, z + 1]],
      ];
      for (const [dx, dz, [ax, az], [bx, bz]] of edges) {
        const other = park.inside(x + dx, z + dz) ? levelAt(x + dx, z + dz) : null;
        if (other !== null && other >= y) continue;
        const groundA = terrain.corner(ax, az) * HEIGHT_STEP;
        const groundB = terrain.corner(bx, bz) * HEIGHT_STEP;
        const bottomA = Math.min(y, Math.max(groundA, other ?? -Infinity));
        const bottomB = Math.min(y, Math.max(groundB, other ?? -Infinity));
        if (bottomA >= y - 0.01 && bottomB >= y - 0.01) continue;
        out.quad(
          { x: ax, y, z: az },
          { x: ax, y: bottomA, z: az },
          { x: bx, y: bottomB, z: bz },
          { x: bx, y, z: bz },
          WATER_SIDE,
        );
      }
    }
  }
  return out.build();
}

/** A low wooden fence round the land the park owns. */
export function fenceGeometry(park: Park): THREE.BufferGeometry {
  const out = new Builder();
  const inside = (x: number, z: number) => park.isOwned(x, z) || park.useAt(x, z) === USE.gate;
  const height = 0.16;
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const ya = park.terrain.corner(ax, az) * HEIGHT_STEP;
    const yb = park.terrain.corner(bx, bz) * HEIGHT_STEP;
    // A thin board standing on the edge, seen from both sides, with a top.
    const inset = 0.02;
    const nx = bz === az ? 0 : inset;
    const nz = bx === ax ? 0 : inset;
    const a0 = { x: ax - nx, y: ya, z: az - nz };
    const b0 = { x: bx - nx, y: yb, z: bz - nz };
    const a1 = { x: ax - nx, y: ya + height, z: az - nz };
    const b1 = { x: bx - nx, y: yb + height, z: bz - nz };
    const c0 = { x: ax + nx, y: ya, z: az + nz };
    const d0 = { x: bx + nx, y: yb, z: bz + nz };
    const c1 = { x: ax + nx, y: ya + height, z: az + nz };
    const d1 = { x: bx + nx, y: yb + height, z: bz + nz };
    out.quad(a0, b0, b1, a1, FENCE);
    out.quad(d0, c0, c1, d1, FENCE);
    out.quad(a1, b1, d1, c1, FENCE_TOP);
  };
  for (let z = 0; z < park.depth; z++) {
    for (let x = 0; x < park.width; x++) {
      if (!inside(x, z) || park.useAt(x, z) === USE.gate) continue;
      if (!inside(x, z - 1)) rail(x, z, x + 1, z);
      if (!inside(x + 1, z)) rail(x + 1, z, x + 1, z + 1);
      if (!inside(x, z + 1) && park.useAt(x, z + 1) !== USE.gate) rail(x + 1, z + 1, x, z + 1);
      if (!inside(x - 1, z)) rail(x, z + 1, x, z);
    }
  }
  return out.build();
}
