import * as THREE from 'three';

import { RIDE_TYPES, type RideTypeId } from '../sim/catalog';
import { pointAt, sampleTrack, type Circuit, type Sample } from '../sim/coaster';
import { circuitOf, trackEnd } from '../sim/coasters';
import { DX, DZ, HEIGHT_STEP, turn } from '../sim/grid';
import type { Ride } from '../sim/park';
import type { Terrain } from '../sim/grid';
import type { Placed } from '../sim/track';
import { box, cone, mat } from './materials';
import type { Model } from './models';

const vertexColors = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

interface Style {
  rail: string;
  tie: string;
  support: string;
  wooden: boolean;
}

export function styleFor(type: RideTypeId): Style {
  switch (type) {
    case 'wooden-coaster':
      return { rail: '#6b4f3a', tie: '#8d6e4b', support: '#a0785a', wooden: true };
    case 'junior-coaster':
      return { rail: '#fab005', tie: '#495057', support: '#1c7ed6', wooden: false };
    default:
      return { rail: '#e03131', tie: '#495057', support: '#e9ecef', wooden: false };
  }
}

/** Collects coloured triangles for one merged mesh. */
class Mesher {
  positions: number[] = [];
  colors: number[] = [];

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color) {
    for (const point of [a, b, c, a, c, d]) {
      this.positions.push(point.x, point.y, point.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  /** A square tube through a list of points, `size` across, oriented by each point's up. */
  tube(
    points: { p: THREE.Vector3; up: THREE.Vector3; side: THREE.Vector3 }[],
    size: number,
    color: THREE.Color,
  ) {
    const half = size / 2;
    const corners = (entry: (typeof points)[number]) => [
      entry.p.clone().addScaledVector(entry.up, half).addScaledVector(entry.side, -half),
      entry.p.clone().addScaledVector(entry.up, half).addScaledVector(entry.side, half),
      entry.p.clone().addScaledVector(entry.up, -half).addScaledVector(entry.side, half),
      entry.p.clone().addScaledVector(entry.up, -half).addScaledVector(entry.side, -half),
    ];
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current) continue;
      const a = corners(previous);
      const b = corners(current);
      for (let face = 0; face < 4; face++) {
        const next = (face + 1) % 4;
        const [a0, a1, b0, b1] = [a[face], a[next], b[face], b[next]];
        if (a0 && a1 && b0 && b1) this.quad(a0, b0, b1, a1, color);
      }
    }
  }

  /** An axis-aligned box from its bottom centre. */
  post(x: number, y0: number, y1: number, z: number, size: number, color: THREE.Color) {
    const h = size / 2;
    const v = (px: number, py: number, pz: number) => new THREE.Vector3(px, py, pz);
    const corners = [
      v(x - h, 0, z - h),
      v(x + h, 0, z - h),
      v(x + h, 0, z + h),
      v(x - h, 0, z + h),
    ];
    for (let side = 0; side < 4; side++) {
      const a = corners[side];
      const b = corners[(side + 1) % 4];
      if (!a || !b) continue;
      this.quad(v(a.x, y0, a.z), v(b.x, y0, b.z), v(b.x, y1, b.z), v(a.x, y1, a.z), color);
    }
  }

  /** A slanted brace between two points, as a thin flat bar. */
  brace(from: THREE.Vector3, to: THREE.Vector3, width: number, color: THREE.Color) {
    const along = to.clone().sub(from).normalize();
    const across = new THREE.Vector3(-along.z, 0, along.x).normalize().multiplyScalar(width / 2);
    if (across.lengthSq() === 0) across.set(width / 2, 0, 0);
    const up = new THREE.Vector3(0, width / 2, 0);
    this.quad(
      from.clone().sub(up),
      to.clone().sub(up),
      to.clone().add(up),
      from.clone().add(up),
      color,
    );
    this.quad(
      from.clone().sub(across),
      from.clone().add(across),
      to.clone().add(across),
      to.clone().sub(across),
      color,
    );
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

const vector = (sample: Sample) => new THREE.Vector3(sample.x, sample.y, sample.z);
const upOf = (sample: Sample) => new THREE.Vector3(sample.ux, sample.uy, sample.uz);
const rightOf = (sample: Sample) =>
  new THREE.Vector3(sample.tx, sample.ty, sample.tz).cross(upOf(sample)).normalize();

/** Rails, ties and (optionally) supports for a stretch of track. */
export function trackGeometry(
  circuit: Circuit,
  style: Style,
  terrain: Terrain | null,
  options: { tint?: string; closed?: boolean } = {},
): THREE.BufferGeometry {
  const { tint, closed = false } = options;
  const mesher = new Mesher();
  const rail = new THREE.Color(tint ?? style.rail);
  const tie = new THREE.Color(tint ?? style.tie);
  const support = new THREE.Color(tint ?? style.support);
  const chain = new THREE.Color(tint ?? '#343a40');
  const lift = 0.12;
  const gauge = 0.17;
  const samples = circuit.samples.filter((_, index) => index % 2 === 0);
  const first = circuit.samples[0];
  if (closed && first && samples.length > 2) samples.push({ ...first, s: circuit.length });
  const rails = (offset: number, height: number) =>
    samples.map((sample) => {
      const up = upOf(sample);
      const side = rightOf(sample);
      return {
        p: vector(sample)
          .addScaledVector(up, lift + height)
          .addScaledVector(side, offset),
        up,
        side,
      };
    });
  mesher.tube(rails(-gauge, 0), 0.06, rail);
  mesher.tube(rails(gauge, 0), 0.06, rail);
  if (!style.wooden) mesher.tube(rails(0, -0.09), 0.08, rail);
  // Ties across the rails, and the chain up lift hills.
  let nextTie = 0;
  for (const sample of circuit.samples) {
    if (sample.s < nextTie) continue;
    nextTie = sample.s + (style.wooden ? 0.22 : 0.32);
    const up = upOf(sample);
    const side = rightOf(sample);
    const along = new THREE.Vector3(sample.tx, sample.ty, sample.tz);
    const centre = vector(sample).addScaledVector(up, lift - 0.04);
    const half = gauge + 0.05;
    const depth = style.wooden ? 0.06 : 0.04;
    const a = centre.clone().addScaledVector(side, -half).addScaledVector(along, -depth);
    const b = centre.clone().addScaledVector(side, half).addScaledVector(along, -depth);
    const c = centre.clone().addScaledVector(side, half).addScaledVector(along, depth);
    const d = centre.clone().addScaledVector(side, -half).addScaledVector(along, depth);
    mesher.quad(a, d, c, b, sample.chain ? chain : tie);
    mesher.quad(a, b, c, d, sample.chain ? chain : tie);
  }
  if (terrain) {
    // Supports: posts down to the ground about once a tile, where the track is upright.
    let nextPost = 0.5;
    for (const sample of circuit.samples) {
      if (sample.s < nextPost || sample.uy < 0.6) continue;
      const ground = terrain.heightAt(sample.x, sample.z);
      const top = sample.y + lift - 0.1;
      if (top - ground < 0.25 || sample.station) continue;
      nextPost = sample.s + 1;
      if (style.wooden) {
        const side = rightOf(sample).multiplyScalar(gauge + 0.05);
        const left = vector(sample).sub(side);
        const right = vector(sample).add(side);
        mesher.post(left.x, ground, top, left.z, 0.07, support);
        mesher.post(right.x, ground, top, right.z, 0.07, support);
        // Criss-cross bracing between the two posts, every tile of height.
        for (let y = ground + 0.1; y < top - 0.3; y += 0.9) {
          mesher.brace(
            new THREE.Vector3(left.x, y, left.z),
            new THREE.Vector3(right.x, Math.min(top, y + 0.8), right.z),
            0.04,
            support,
          );
          mesher.brace(
            new THREE.Vector3(right.x, y, right.z),
            new THREE.Vector3(left.x, Math.min(top, y + 0.8), left.z),
            0.04,
            support,
          );
        }
      } else {
        mesher.post(sample.x, ground, top, sample.z, 0.1, support);
      }
    }
  }
  return mesher.build();
}

function car(color: string, front: boolean): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.44, 0.16, 0.72, color, 0, 0.12, 0));
  group.add(box(0.46, 0.05, 0.74, '#343a40', 0, 0.1, 0));
  for (const z of [-0.18, 0.16]) group.add(box(0.4, 0.2, 0.06, '#212529', 0, 0.22, z - 0.12));
  if (front) {
    const nose = cone(0.2, 0.3, color, 4, 0, 0, 0);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.2, 0.42);
    group.add(nose);
  }
  return group;
}

function station(ride: Ride, colour: string): THREE.Group {
  const group = new THREE.Group();
  const coaster = ride.coaster;
  if (!coaster) return group;
  const { start } = coaster;
  const f = { x: DX[start.dir], z: DZ[start.dir] };
  const left = turn(start.dir, -1);
  const l = { x: DX[left], z: DZ[left] };
  const y = start.h * HEIGHT_STEP;
  // The platform runs along the left of the track, the whole length of the station.
  const centre = {
    x: start.x + 0.5 + f.x * 1 + l.x * 0.34,
    z: start.z + 0.5 + f.z * 1 + l.z * 0.34,
  };
  const along = Math.abs(f.x) > 0;
  const platform = box(along ? 3 : 0.32, 0.12, along ? 0.32 : 3, '#ced4da', centre.x, y, centre.z);
  group.add(platform);
  // A canopy over the track on four posts.
  const mid = { x: start.x + 0.5 + f.x, z: start.z + 0.5 + f.z };
  for (const end of [-1.3, 1.3]) {
    for (const side of [-0.48, 0.48]) {
      const px = mid.x + f.x * end + (along ? 0 : side);
      const pz = mid.z + f.z * end + (along ? side : 0);
      group.add(box(0.06, 1.1, 0.06, '#868e96', px, y, pz));
    }
  }
  group.add(box(along ? 3 : 1.15, 0.08, along ? 1.15 : 3, colour, mid.x, y + 1.1, mid.z));
  group.add(box(along ? 3.1 : 1.25, 0.05, along ? 1.25 : 3.1, '#ffffff', mid.x, y + 1.18, mid.z));
  return group;
}

/** The whole coaster: track, supports, station and train, drawn in world coordinates. */
export function coasterModel(ride: Ride, terrain: Terrain): Model & { world: true } {
  const group = new THREE.Group();
  const coaster = ride.coaster;
  const spec = RIDE_TYPES[ride.type];
  const style = styleFor(ride.type);
  if (!coaster) return { group, world: true };
  const colour = spec.colours[0] ?? '#e03131';
  group.add(station(ride, colour));
  const circuit = coaster.complete ? circuitOf(coaster) : sampleTrack(coaster.pieces);
  const track = new THREE.Mesh(
    trackGeometry(circuit, style, terrain, { closed: coaster.complete }),
    vertexColors,
  );
  track.castShadow = true;
  track.receiveShadow = true;
  group.add(track);

  // Where the next piece goes, while building.
  const marker = new THREE.Group();
  if (!coaster.complete) {
    const end = trackEnd(coaster);
    const arrow = cone(0.22, 0.45, '#ffd43b', 4);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.35, 0.1);
    marker.add(arrow);
    marker.position.set(
      end.x + 0.5 - DX[end.dir] * 0.5,
      end.h * HEIGHT_STEP,
      end.z + 0.5 - DZ[end.dir] * 0.5,
    );
    marker.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][end.dir] ?? 0;
    group.add(marker);
  }

  const type = spec.coaster;
  const cars: THREE.Group[] = [];
  const heads: THREE.Mesh[][] = [];
  if (coaster.complete && type) {
    for (let index = 0; index < type.cars; index++) {
      const body = car(index % 2 === 0 ? colour : (spec.colours[2] ?? '#ffffff'), index === 0);
      const riders: THREE.Mesh[] = [];
      for (let seat = 0; seat < type.seatsPerCar; seat++) {
        const head = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.06, 0),
          mat(['#f1c27d', '#c68642', '#8d5524', '#ffdbac'][seat % 4] ?? '#f1c27d'),
        );
        head.position.set(seat % 2 === 0 ? -0.1 : 0.1, 0.4, seat < 2 ? 0.02 : -0.26);
        head.visible = false;
        body.add(head);
        riders.push(head);
      }
      group.add(body);
      cars.push(body);
      heads.push(riders);
    }
  }

  const basis = new THREE.Matrix4();
  const tangent = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  return {
    group,
    world: true,
    update(current, time) {
      if (!coaster.complete || !type) {
        marker.position.y = trackEnd(coaster).h * HEIGHT_STEP + Math.sin(time * 4) * 0.05;
        return;
      }
      const live = circuitOf(coaster);
      const front = current.phase === 'running' ? coaster.train.s : live.stop;
      const riders = current.riders.length;
      cars.forEach((body, index) => {
        const at = pointAt(live, front - index * type.carSpacing - 0.35);
        tangent.set(at.tx, at.ty, at.tz).normalize();
        up.set(at.ux, at.uy, at.uz).normalize();
        right.crossVectors(up, tangent).normalize();
        up.crossVectors(tangent, right).normalize();
        basis.makeBasis(right, up, tangent);
        body.quaternion.setFromRotationMatrix(basis);
        body.position.set(at.x, at.y + 0.02, at.z).addScaledVector(up, 0.05);
        heads[index]?.forEach((head, seat) => {
          head.visible = index * type.seatsPerCar + seat < riders;
        });
      });
    },
  };
}

/** A see-through preview of a single piece, for the builder. */
export function pieceGhost(placed: Placed, type: RideTypeId, ok: boolean): THREE.Mesh {
  const circuit = sampleTrack([placed]);
  const mesh = new THREE.Mesh(
    trackGeometry(circuit, styleFor(type), null, { tint: ok ? '#51cf66' : '#fa5252' }),
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 3;
  return mesh;
}
