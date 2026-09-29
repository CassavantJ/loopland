import * as THREE from 'three';

import type { Guest } from '../sim/guests';
import type { Terrain } from '../sim/grid';
import { mat } from './materials';

/** Heading to a rotation about y, for models whose front faces +z. */
export const FACING_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2] as const;

const BALLOONS = ['#fa5252', '#fcc419', '#4dabf7', '#51cf66', '#f783ac'];

/**
 * Every guest drawn with a handful of instanced meshes: legs, body, head, hair and any
 * balloon, each instance tinted with the guest's own colours.
 */
export class Crowd {
  readonly group = new THREE.Group();
  private capacity = 0;
  private parts: THREE.InstancedMesh[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly euler = new THREE.Euler();
  /** Guest ids in instance order, for picking. */
  ids: number[] = [];

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
    ];
  }

  update(guests: readonly Guest[], terrain: Terrain, time: number): void {
    this.ensure(guests.length);
    const [legs, body, head, hair, balloon] = this.parts;
    if (!legs || !body || !head || !hair || !balloon) return;
    this.ids.length = 0;
    let count = 0;
    let balloons = 0;
    for (const guest of guests) {
      if (guest.state === 'riding' || guest.state === 'gone') continue;
      const walking = guest.state === 'walking' && guest.progress < 1;
      const bob = walking ? Math.abs(Math.sin(time * 11 + guest.id)) * 0.018 : 0;
      this.position.set(guest.x, terrain.heightAt(guest.x, guest.z) + 0.028 + bob, guest.z);
      this.euler.set(0, FACING_ANGLE[guest.heading], 0);
      this.rotation.setFromEuler(this.euler);
      this.scale.set(1, 1, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      for (const part of [legs, body, head, hair]) part.setMatrixAt(count, this.matrix);
      legs.setColorAt(count, this.color.set(guest.look.trousers));
      body.setColorAt(count, this.color.set(guest.look.shirt));
      head.setColorAt(count, this.color.set(guest.look.skin));
      hair.setColorAt(count, this.color.set(guest.look.hair));
      if (guest.holding === 'balloon') {
        this.position.y += Math.sin(time * 2 + guest.id) * 0.02;
        this.matrix.compose(this.position, this.rotation, this.scale);
        balloon.setMatrixAt(balloons, this.matrix);
        balloon.setColorAt(
          balloons,
          this.color.set(BALLOONS[guest.id % BALLOONS.length] ?? '#fa5252'),
        );
        balloons++;
      }
      this.ids.push(guest.id);
      count++;
    }
    for (const part of [legs, body, head, hair]) {
      part.count = count;
      part.instanceMatrix.needsUpdate = true;
      if (part.instanceColor) part.instanceColor.needsUpdate = true;
    }
    balloon.count = balloons;
    balloon.instanceMatrix.needsUpdate = true;
    if (balloon.instanceColor) balloon.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const part of this.parts) part.dispose();
  }
}
