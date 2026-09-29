import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Terrain } from '../sim/grid';
import type { Guest } from '../sim/guests';
import { STAFF, type Staff } from '../sim/staff';
import { mat } from './materials';

/** Heading to a rotation about y, for models whose front faces +z. */
export const FACING_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2] as const;

const BALLOONS = ['#fa5252', '#fcc419', '#4dabf7', '#51cf66', '#f783ac'];
/** Entertainer costumes: panda, tiger, frog, bunny. */
const COSTUMES = [
  { head: '#f8f9fa', body: '#212529' },
  { head: '#ff922b', body: '#f76707' },
  { head: '#69db7c', body: '#2f9e44' },
  { head: '#fcc2d7', body: '#f783ac' },
];
const STAFF_SKIN = '#e0ac69';

/**
 * Every guest and staff member drawn with a handful of instanced meshes: legs, body, head,
 * hair (or a cap), balloons, and the big heads of entertainers' costumes.
 */
export class Crowd {
  readonly group = new THREE.Group();
  private capacity = 0;
  private parts: THREE.InstancedMesh[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private readonly euler = new THREE.Euler();

  private ensure(count: number) {
    if (count <= this.capacity) return;
    this.capacity = Math.max(256, Math.ceil(count * 1.5));
    for (const part of this.parts) {
      this.group.remove(part);
      part.dispose();
    }
    const white = mat('#ffffff');
    const make = (geometry: THREE.BufferGeometry) => {
      const part = new THREE.InstancedMesh(geometry, white, this.capacity);
      part.castShadow = true;
      part.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      part.frustumCulled = false;
      this.group.add(part);
      return part;
    };
    this.parts = [
      make(new THREE.BoxGeometry(0.1, 0.13, 0.065).translate(0, 0.065, 0)),
      make(new THREE.BoxGeometry(0.13, 0.13, 0.085).translate(0, 0.195, 0)),
      make(new THREE.IcosahedronGeometry(0.058, 1).translate(0, 0.31, 0)),
      make(new THREE.BoxGeometry(0.1, 0.035, 0.1).translate(0, 0.355, -0.005)),
      make(new THREE.IcosahedronGeometry(0.075, 1).translate(0.09, 0.62, 0)),
      // Costume heads, with little ears.
      // Costume heads, with round ears.
      make(
        mergeGeometries([
          new THREE.IcosahedronGeometry(0.12, 1).translate(0, 0.36, 0),
          new THREE.IcosahedronGeometry(0.045, 0).translate(-0.085, 0.47, 0),
          new THREE.IcosahedronGeometry(0.045, 0).translate(0.085, 0.47, 0),
        ]),
      ),
    ];
  }

  update(guests: readonly Guest[], staff: readonly Staff[], terrain: Terrain, time: number): void {
    this.ensure(guests.length + staff.length);
    const [legs, body, head, hair, balloon, costume] = this.parts;
    if (!legs || !body || !head || !hair || !balloon || !costume) return;
    let count = 0;
    let balloons = 0;
    let costumes = 0;
    const put = (
      x: number,
      z: number,
      heading: 0 | 1 | 2 | 3,
      lift: number,
      colours: { trousers: string; shirt: string; skin: string; hair: string },
      hideHead: boolean,
    ) => {
      this.position.set(x, terrain.heightAt(x, z) + 0.028 + lift, z);
      this.euler.set(0, FACING_ANGLE[heading], 0);
      this.rotation.setFromEuler(this.euler);
      this.scale.set(1, 1, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      legs.setMatrixAt(count, this.matrix);
      body.setMatrixAt(count, this.matrix);
      legs.setColorAt(count, this.color.set(colours.trousers));
      body.setColorAt(count, this.color.set(colours.shirt));
      if (hideHead) this.scale.set(0, 0, 0);
      this.matrix.compose(this.position, this.rotation, this.scale);
      head.setMatrixAt(count, this.matrix);
      hair.setMatrixAt(count, this.matrix);
      head.setColorAt(count, this.color.set(colours.skin));
      hair.setColorAt(count, this.color.set(colours.hair));
      count++;
    };
    for (const guest of guests) {
      if (guest.state === 'riding' || guest.state === 'gone') continue;
      const walking = guest.state === 'walking' && guest.progress < 1;
      const bob = walking ? Math.abs(Math.sin(time * 11 + guest.id)) * 0.018 : 0;
      // Sitting guests drop onto the bench.
      const lift = guest.state === 'sitting' ? 0.02 : bob;
      put(guest.x, guest.z, guest.heading, lift, guest.look, false);
      if (guest.holding === 'balloon') {
        this.position.y += Math.sin(time * 2 + guest.id) * 0.02;
        this.scale.set(1, 1, 1);
        this.matrix.compose(this.position, this.rotation, this.scale);
        balloon.setMatrixAt(balloons, this.matrix);
        balloon.setColorAt(
          balloons,
          this.color.set(BALLOONS[guest.id % BALLOONS.length] ?? '#fa5252'),
        );
        balloons++;
      }
    }
    for (const member of staff) {
      const uniform = STAFF[member.role];
      const walking = member.state === 'walking' && member.progress < 1;
      const bob = walking ? Math.abs(Math.sin(time * 10 + member.id)) * 0.02 : 0;
      // Working staff bend to their task.
      const lift = member.state === 'working' ? Math.abs(Math.sin(time * 6)) * 0.03 : bob;
      if (member.role === 'entertainer') {
        const look = COSTUMES[member.costume % COSTUMES.length] ?? COSTUMES[0];
        if (!look) continue;
        put(
          member.x,
          member.z,
          member.heading,
          lift,
          { trousers: look.body, shirt: look.body, skin: look.head, hair: look.head },
          true,
        );
        this.scale.set(1, 1, 1);
        this.matrix.compose(this.position, this.rotation, this.scale);
        costume.setMatrixAt(costumes, this.matrix);
        costume.setColorAt(costumes, this.color.set(look.head));
        costumes++;
      } else {
        put(
          member.x,
          member.z,
          member.heading,
          lift,
          {
            trousers: uniform.trousers,
            shirt: uniform.uniform,
            skin: STAFF_SKIN,
            hair: uniform.uniform,
          },
          false,
        );
      }
    }
    for (const part of [legs, body, head, hair]) {
      part.count = count;
      part.instanceMatrix.needsUpdate = true;
      if (part.instanceColor) part.instanceColor.needsUpdate = true;
    }
    for (const [part, used] of [
      [balloon, balloons],
      [costume, costumes],
    ] as const) {
      part.count = used;
      part.instanceMatrix.needsUpdate = true;
      if (part.instanceColor) part.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const part of this.parts) part.dispose();
  }
}
