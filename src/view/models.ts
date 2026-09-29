import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { RIDE_TYPES, type RideTypeId, type SceneryId } from '../sim/catalog';
import type { Ride } from '../sim/park';
import { box, cone, cylinder, mat, mesh, signTexture, sphere, stripedCone } from './materials';

/**
 * Low-poly models for everything in the park, built from primitives in code. Each model sits
 * on y = 0 at the middle of its footprint, with its front facing +z; the view turns it to face
 * the right way. Animated models get an `update` that follows the ride's cycle.
 */
export interface Model {
  group: THREE.Group;
  update?: (ride: Ride, time: number, dt: number) => void;
}

/** A box stretched between two points, for struts and frames. */
export function strut(from: THREE.Vector3, to: THREE.Vector3, thickness: number, color: string) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const result = mesh(new THREE.BoxGeometry(thickness, length, thickness), mat(color));
  result.position.copy(from).add(to).multiplyScalar(0.5);
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return result;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** How far into its run a ride is, 0–1, or null when it's not running. */
function runProgress(ride: Ride): number | null {
  if (ride.phase !== 'running') return null;
  const duration = RIDE_TYPES[ride.type].duration;
  return 1 - Math.max(0, ride.timer) / duration;
}

/** Eases a spinning speed toward full while running and toward zero otherwise. */
function spinUp(current: number, running: boolean, dt: number, rate = 0.6) {
  return running ? Math.min(1, current + dt * rate) : Math.max(0, current - dt * rate);
}

// Rides ----------------------------------------------------------------------------------------

function carousel(colors: readonly string[]): Model {
  const group = new THREE.Group();
  const [main = '#ff6b6b', trim = '#ffd43b', third = '#4dabf7'] = colors;
  group.add(cylinder(1.42, 1.48, 0.18, '#f1f3f5', 24));
  const turntable = new THREE.Group();
  turntable.position.y = 0.18;
  turntable.add(cylinder(1.32, 1.32, 0.06, trim, 24));
  const horses: THREE.Object3D[] = [];
  for (let index = 0; index < 10; index++) {
    const angle = (index / 10) * Math.PI * 2;
    const radius = index % 2 === 0 ? 1.05 : 0.72;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    turntable.add(cylinder(0.022, 0.022, 1.1, '#fab005', 6, x, 0, z));
    const horse = new THREE.Group();
    horse.position.set(x, 0.42, z);
    horse.rotation.y = -angle;
    horse.add(
      box(0.1, 0.14, 0.32, index % 3 === 0 ? '#ffffff' : index % 3 === 1 ? '#f8f0e3' : '#e9d8c4'),
    );
    const head = box(0.08, 0.16, 0.1, '#ffffff', 0, 0.06, 0.16);
    head.rotation.x = -0.4;
    horse.add(head);
    horse.add(box(0.11, 0.05, 0.12, index % 2 ? main : third, 0, 0.14, -0.02));
    turntable.add(horse);
    horses.push(horse);
  }
  turntable.add(cylinder(0.32, 0.32, 1.12, main, 12));
  group.add(turntable);
  const roof = stripedCone(1.6, 0.7, [main, '#ffffff'], 16);
  roof.position.y = 1.36;
  group.add(roof);
  group.add(cylinder(1.6, 1.6, 0.12, third, 24, 0, 1.28));
  group.add(cylinder(0.02, 0.02, 0.45, '#868e96', 4, 0, 2.02));
  group.add(box(0.02, 0.14, 0.24, trim, 0, 2.3, 0.12));

  let speed = 0;
  return {
    group,
    update(ride, time, dt) {
      speed = spinUp(speed, ride.phase === 'running', dt, 0.5);
      turntable.rotation.y += speed * 1.1 * dt;
      horses.forEach((horse, index) => {
        horse.position.y = 0.42 + Math.sin(time * 3.2 + index * 1.7) * 0.07 * speed;
      });
    },
  };
}

function ferrisWheel(colors: readonly string[]): Model {
  const group = new THREE.Group();
  const [main = '#f06595', white = '#ffffff', third = '#845ef7'] = colors;
  const hub = 2.05;
  const radius = 1.72;
  group.add(box(3.8, 0.12, 1.8, '#dee2e6'));
  for (const z of [-0.55, 0.55]) {
    group.add(strut(v(-1.25, 0.1, z), v(0, hub, z), 0.1, white));
    group.add(strut(v(1.25, 0.1, z), v(0, hub, z), 0.1, white));
  }
  const axle = cylinder(0.08, 0.08, 1.2, '#868e96', 8);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, hub, 0);
  group.add(axle);
  const wheel = new THREE.Group();
  wheel.position.y = hub;
  for (const z of [-0.36, 0.36]) {
    const rim = mesh(new THREE.TorusGeometry(radius, 0.045, 6, 40), mat(main));
    rim.position.z = z;
    wheel.add(rim);
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2;
      wheel.add(
        strut(v(0, 0, z), v(Math.cos(angle) * radius, Math.sin(angle) * radius, z), 0.03, white),
      );
    }
  }
  const cars: THREE.Group[] = [];
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    const car = new THREE.Group();
    car.add(box(0.34, 0.26, 0.46, index % 2 ? third : main, 0, -0.42, 0));
    car.add(box(0.4, 0.05, 0.52, white, 0, -0.14, 0));
    car.add(cylinder(0.015, 0.015, 0.14, '#868e96', 4, 0, -0.14, 0));
    holder.add(car);
    wheel.add(holder);
    cars.push(car);
  }
  group.add(wheel);
  let speed = 0;
  return {
    group,
    update(ride, _time, dt) {
      speed = spinUp(speed, ride.phase === 'running', dt, 0.4);
      wheel.rotation.z -= speed * 0.32 * dt;
      for (const car of cars) car.rotation.z = -wheel.rotation.z;
    },
  };
}

function teacups(colors: readonly string[]): Model {
  const group = new THREE.Group();
  group.add(cylinder(1.45, 1.48, 0.1, '#f8f9fa', 24));
  const floor = new THREE.Group();
  floor.position.y = 0.1;
  floor.add(cylinder(1.38, 1.38, 0.04, '#ffe8cc', 24));
  const cups: THREE.Group[] = [];
  for (let index = 0; index < 4; index++) {
    const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
    const cup = new THREE.Group();
    cup.position.set(Math.cos(angle) * 0.78, 0.04, Math.sin(angle) * 0.78);
    const color = colors[index % colors.length] ?? '#63e6be';
    cup.add(cylinder(0.34, 0.24, 0.3, color, 14));
    cup.add(cylinder(0.3, 0.3, 0.02, '#fff9db', 14, 0, 0.29));
    const handle = mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 10, Math.PI), mat(color));
    handle.position.set(0.34, 0.16, 0);
    handle.rotation.z = -Math.PI / 2;
    cup.add(handle);
    cup.add(cylinder(0.05, 0.05, 0.24, '#adb5bd', 6, 0, 0.29));
    cup.add(cylinder(0.14, 0.14, 0.03, '#495057', 12, 0, 0.5));
    floor.add(cup);
    cups.push(cup);
  }
  // A teapot in the middle.
  floor.add(sphere(0.3, '#ffffff', 0, 0.32, 0));
  floor.add(cylinder(0.08, 0.14, 0.1, '#ffffff', 10, 0, 0.56));
  floor.add(sphere(0.06, colors[0] ?? '#63e6be', 0, 0.7, 0));
  const spout = cylinder(0.04, 0.06, 0.3, '#ffffff', 8);
  spout.position.set(0.3, 0.4, 0);
  spout.rotation.z = -0.9;
  floor.add(spout);
  group.add(floor);
  let speed = 0;
  return {
    group,
    update(ride, _time, dt) {
      speed = spinUp(speed, ride.phase === 'running', dt, 0.7);
      floor.rotation.y += speed * 0.7 * dt;
      cups.forEach((cup, index) => {
        cup.rotation.y += speed * (2.4 + index * 0.4) * dt;
      });
    },
  };
}

function swingShip(colors: readonly string[]): Model {
  const group = new THREE.Group();
  const [hull = '#a0522d', trim = '#fab005', sail = '#e03131'] = colors;
  const pivot = 2.5;
  group.add(box(4.6, 0.1, 1.8, '#ced4da'));
  for (const z of [-0.75, 0.75]) {
    group.add(strut(v(-1.2, 0.1, z), v(0, pivot + 0.1, z), 0.12, '#495057'));
    group.add(strut(v(1.2, 0.1, z), v(0, pivot + 0.1, z), 0.12, '#495057'));
  }
  const axle = cylinder(0.07, 0.07, 1.7, '#868e96', 8);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, pivot, 0);
  group.add(axle);

  const swing = new THREE.Group();
  swing.position.y = pivot;
  // The hull: a side profile with a curved keel, extruded across the ship.
  const shape = new THREE.Shape();
  shape.moveTo(-1.8, 0.1);
  shape.lineTo(1.8, 0.1);
  shape.quadraticCurveTo(1.5, -0.55, 0, -0.62);
  shape.quadraticCurveTo(-1.5, -0.55, -1.8, 0.1);
  const hullGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.9,
    bevelEnabled: false,
    curveSegments: 6,
  });
  hullGeometry.translate(0, 0, -0.45);
  const body = mesh(hullGeometry, mat(hull));
  body.position.y = -1.95;
  swing.add(body);
  swing.add(box(3.5, 0.06, 0.95, trim, 0, -1.87, 0));
  swing.add(box(0.12, 0.8, 0.12, '#6b3e26', 0, -1.85, 0));
  const flag = box(0.02, 0.35, 0.5, sail, 0, -1.3, 0.25);
  swing.add(flag);
  for (const x of [-1.2, 1.2]) {
    for (const z of [-0.42, 0.42]) swing.add(strut(v(0, 0, z), v(x, -1.85, z), 0.07, '#adb5bd'));
  }
  group.add(swing);
  let amplitude = 0;
  let phase = 0;
  return {
    group,
    update(ride, _time, dt) {
      const progress = runProgress(ride);
      // Swing higher through the first two-thirds, then settle.
      const target =
        progress === null ? 0 : progress < 0.7 ? 0.3 + progress * 1.2 : (1 - progress) * 3.5;
      amplitude += (target - amplitude) * Math.min(1, dt * 0.8);
      phase += dt * 1.6;
      swing.rotation.z = Math.sin(phase) * amplitude;
    },
  };
}

function dropTower(colors: readonly string[]): Model {
  const group = new THREE.Group();
  const [column = '#495057', ring = '#ff922b', seats = '#e64980'] = colors;
  const height = 5.4;
  group.add(box(1.9, 0.14, 1.9, '#ced4da'));
  for (let index = 0; index < 6; index++) {
    group.add(
      box(0.46, height / 6, 0.46, index % 2 ? column : '#f8f9fa', 0, 0.14 + (index * height) / 6),
    );
  }
  group.add(cone(0.4, 0.5, ring, 8, 0, height + 0.14));
  group.add(sphere(0.08, '#fa5252', 0, height + 0.7, 0));
  const carriage = new THREE.Group();
  carriage.add(cylinder(0.75, 0.75, 0.24, ring, 16));
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    const seat = box(0.18, 0.28, 0.14, seats, Math.cos(angle) * 0.68, -0.2, Math.sin(angle) * 0.68);
    seat.rotation.y = -angle;
    carriage.add(seat);
  }
  carriage.position.y = 0.3;
  group.add(carriage);
  return {
    group,
    update(ride) {
      const progress = runProgress(ride);
      let y = 0.3;
      if (progress !== null) {
        const top = height - 0.6;
        if (progress < 0.6) y = 0.3 + (top - 0.3) * (progress / 0.6);
        else if (progress < 0.72) y = top;
        else if (progress < 0.8) {
          const fall = (progress - 0.72) / 0.08;
          y = top - (top - 0.6) * fall * fall;
        } else y = 0.6 - 0.3 * Math.min(1, (progress - 0.8) / 0.2);
      }
      carriage.position.y = y;
    },
  };
}

function bumperCars(colors: readonly string[]): Model {
  const group = new THREE.Group();
  group.add(box(3.9, 0.12, 3.9, '#495057'));
  group.add(box(3.7, 0.02, 3.7, '#343a40', 0, 0.12));
  // Rails with a gap at the front for the entrance and exit.
  const rail = '#fcc419';
  group.add(box(3.9, 0.14, 0.08, rail, 0, 0.12, -1.91));
  group.add(box(0.08, 0.14, 3.9, rail, -1.91, 0.12, 0));
  group.add(box(0.08, 0.14, 3.9, rail, 1.91, 0.12, 0));
  group.add(box(1.2, 0.14, 0.08, rail, -1.35, 0.12, 1.91));
  group.add(box(1.2, 0.14, 0.08, rail, 1.35, 0.12, 1.91));
  for (const x of [-1.85, 1.85]) {
    for (const z of [-1.85, 1.85]) group.add(box(0.1, 1.5, 0.1, '#868e96', x, 0.12, z));
  }
  const canopyColor = colors[1] ?? '#fa5252';
  for (let index = 0; index < 8; index++) {
    group.add(box(0.49, 0.18, 3.9, index % 2 ? canopyColor : '#ffffff', -1.72 + index * 0.49, 1.6));
  }
  const cars: THREE.Group[] = [];
  for (let index = 0; index < 6; index++) {
    const car = new THREE.Group();
    const color = colors[index % colors.length] ?? '#15aabf';
    car.add(box(0.36, 0.14, 0.5, color, 0, 0.14));
    car.add(box(0.4, 0.06, 0.54, '#212529', 0, 0.12));
    car.add(box(0.22, 0.14, 0.14, color, 0, 0.28, -0.12));
    car.add(cylinder(0.01, 0.01, 1.1, '#adb5bd', 4, 0, 0.3, -0.18));
    car.position.set(-1.2 + (index % 3) * 1.2, 0.02, index < 3 ? -0.9 : 0.6);
    group.add(car);
    cars.push(car);
  }
  const homes = cars.map((car) => car.position.clone());
  let speed = 0;
  return {
    group,
    update(ride, time, dt) {
      speed = spinUp(speed, ride.phase === 'running', dt, 1.5);
      cars.forEach((car, index) => {
        const home = homes[index];
        if (!home) return;
        const t = time * (0.5 + index * 0.07) + index * 2.1;
        const x = Math.sin(t * 1.3) * 1.3;
        const z = Math.cos(t * 0.9 + index) * 1.3;
        car.position.x = home.x + (x - home.x) * speed;
        car.position.z = home.z + (z - home.z) * speed;
        if (speed > 0.05)
          car.rotation.y = Math.atan2(Math.cos(t * 1.3) * 1.3, -Math.sin(t * 0.9 + index) * 0.9);
      });
    },
  };
}

function hauntedHouse(colors: readonly string[]): Model {
  const group = new THREE.Group();
  const [walls = '#5f3dc4', roof = '#343a40', slime = '#b2f2bb'] = colors;
  group.add(box(2.8, 0.1, 2.8, '#495057'));
  group.add(box(2.3, 1.3, 1.8, walls, 0, 0.1, -0.2));
  const shape = new THREE.Shape();
  shape.moveTo(-1.3, 0);
  shape.lineTo(1.3, 0);
  shape.lineTo(0, 0.9);
  shape.lineTo(-1.3, 0);
  const roofGeometry = new THREE.ExtrudeGeometry(shape, { depth: 2.0, bevelEnabled: false });
  roofGeometry.translate(0, 0, -1.2);
  const roofMesh = mesh(roofGeometry, mat(roof));
  roofMesh.position.y = 1.4;
  group.add(roofMesh);
  group.add(box(0.7, 2.3, 0.7, walls, -0.85, 0.1, -0.75));
  group.add(cone(0.55, 0.9, roof, 4, -0.85, 2.4, -0.75));
  group.add(box(0.5, 0.75, 0.06, '#212529', 0, 0.1, 0.72));
  const windows: THREE.Mesh[] = [];
  for (const [x, y] of [
    [-0.7, 0.85],
    [0.7, 0.85],
    [-0.85, 1.85],
    [0.35, 0.5],
  ] as const) {
    const window = box(0.3, 0.3, 0.05, '#ffe066', x, y, x === -0.85 ? -0.38 : 0.72);
    window.material = mat('#ffe066', { emissive: '#8a6d00' });
    group.add(window);
    windows.push(window);
  }
  const ghost = new THREE.Group();
  ghost.add(sphere(0.18, '#f8f9fa', 0, 0.2, 0));
  ghost.add(cone(0.18, 0.3, '#f8f9fa', 8, 0, -0.18, 0));
  ghost.add(sphere(0.03, '#212529', 0.07, 0.24, 0.15, 0));
  ghost.add(sphere(0.03, '#212529', -0.07, 0.24, 0.15, 0));
  group.add(ghost);
  group.add(box(0.2, 0.02, 0.4, slime, 0.8, 0.1, 1.0));
  return {
    group,
    update(_ride, time) {
      ghost.position.set(
        Math.cos(time * 0.8) * 1.4,
        2.2 + Math.sin(time * 2) * 0.15,
        Math.sin(time * 0.8) * 1.2,
      );
      ghost.rotation.y = -time * 0.8;
      windows.forEach((window, index) => {
        window.visible = Math.sin(time * (1.3 + index * 0.9) + index) > -0.85;
      });
    },
  };
}

// Stalls ---------------------------------------------------------------------------------------

function awning(colors: readonly string[]): THREE.Group {
  const group = new THREE.Group();
  for (let index = 0; index < 6; index++) {
    const stripe = box(
      0.16,
      0.04,
      0.95,
      colors[index % colors.length] ?? '#fff',
      -0.4 + index * 0.16,
      0,
    );
    group.add(stripe);
  }
  group.rotation.x = 0.28;
  return group;
}

function stall(type: RideTypeId, colors: readonly string[]): Model {
  const group = new THREE.Group();
  const [main = '#e8590c', second = '#ffffff'] = colors;
  if (type === 'toilets') {
    group.add(box(0.86, 0.8, 0.8, '#f1f3f5', 0, 0, -0.04));
    group.add(box(0.96, 0.08, 0.9, '#495057', 0, 0.8, -0.04));
    group.add(box(0.26, 0.55, 0.04, '#339af0', -0.2, 0, 0.37));
    group.add(box(0.26, 0.55, 0.04, '#f06595', 0.2, 0, 0.37));
    group.add(sphere(0.06, '#ffffff', -0.2, 0.7, 0.4, 0));
    group.add(sphere(0.06, '#ffffff', 0.2, 0.7, 0.4, 0));
    return { group };
  }
  group.add(box(0.78, 0.62, 0.7, second, 0, 0, -0.08));
  group.add(box(0.84, 0.08, 0.24, main, 0, 0.55, 0.3));
  group.add(box(0.78, 0.04, 0.7, main, 0, 0.6, -0.08));
  const shade = awning([main, second]);
  shade.position.set(0, 0.95, 0.02);
  group.add(shade);
  group.add(box(0.05, 0.4, 0.05, '#868e96', -0.36, 0.6, 0.38));
  group.add(box(0.05, 0.4, 0.05, '#868e96', 0.36, 0.6, 0.38));
  const sign = new THREE.Group();
  sign.position.y = 1.15;
  switch (RIDE_TYPES[type].sells) {
    case 'burger':
      sign.add(cylinder(0.2, 0.2, 0.08, '#f59f00', 12, 0, 0));
      sign.add(cylinder(0.21, 0.21, 0.06, '#7b3f00', 12, 0, 0.08));
      sign.add(cylinder(0.22, 0.2, 0.03, '#51cf66', 12, 0, 0.14));
      sign.add(sphere(0.2, '#f59f00', 0, 0.18, 0));
      sign.children[3]?.scale.set(1, 0.45, 1);
      break;
    case 'drink':
      sign.add(cylinder(0.14, 0.11, 0.34, '#1c7ed6', 10));
      sign.add(cylinder(0.15, 0.15, 0.03, '#ffffff', 10, 0, 0.34));
      sign.add(box(0.03, 0.22, 0.03, '#ff6b6b', 0.05, 0.36, 0));
      break;
    case 'ice-cream': {
      const holder = cone(0.12, 0.34, '#e8b86d', 8);
      holder.rotation.x = Math.PI;
      holder.position.y = 0.17;
      sign.add(holder);
      sign.add(sphere(0.14, '#f783ac', 0, 0.38, 0));
      break;
    }
    case 'balloon':
      for (const [x, color] of [
        [-0.14, '#fa5252'],
        [0, '#fcc419'],
        [0.14, '#4dabf7'],
      ] as const) {
        sign.add(box(0.01, 0.3, 0.01, '#868e96', x * 0.5, 0, 0));
        sign.add(sphere(0.11, color, x, 0.38 + Math.abs(x), 0));
      }
      break;
    case 'map':
      sign.add(cylinder(0.2, 0.2, 0.06, '#2f9e44', 16, 0, 0.15));
      sign.children[0]?.rotateX(Math.PI / 2);
      sign.add(box(0.05, 0.18, 0.07, '#ffffff', 0, 0.06, 0));
      sign.add(box(0.05, 0.05, 0.07, '#ffffff', 0, 0.28, 0));
      break;
  }
  group.add(sign);
  return {
    group,
    update(_ride, time) {
      sign.rotation.y = Math.sin(time * 0.8) * 0.3;
    },
  };
}

/** The booth at a ride's entrance, or the arch at its exit, front facing +z. */
export function entranceModel(color: string, exit: boolean): THREE.Group {
  const group = new THREE.Group();
  const post = exit ? '#adb5bd' : '#495057';
  group.add(box(0.9, 0.04, 0.9, exit ? '#ced4da' : '#e9ecef'));
  group.add(box(0.08, 0.85, 0.08, post, -0.38, 0, 0));
  group.add(box(0.08, 0.85, 0.08, post, 0.38, 0, 0));
  group.add(box(0.92, 0.22, 0.1, exit ? '#868e96' : color, 0, 0.85, 0));
  if (!exit) {
    group.add(box(0.94, 0.06, 0.4, color, 0, 1.07, 0));
    group.add(sphere(0.07, '#ffe066', 0, 1.2, 0, 0));
  }
  return group;
}

/** The park's main gate: two towers and an arch with the park's name. */
export function gateModel(name: string): THREE.Group {
  const group = new THREE.Group();
  for (const x of [-1.15, 1.15]) {
    group.add(box(0.55, 1.7, 0.55, '#ff8787', x, 0, 0));
    group.add(box(0.62, 0.1, 0.62, '#ffffff', x, 1.7, 0));
    group.add(cone(0.42, 0.6, '#4dabf7', 8, x, 1.8, 0));
    group.add(sphere(0.07, '#ffd43b', x, 2.45, 0, 0));
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.46, 0.12), [
    mat('#fcc419'),
    mat('#fcc419'),
    mat('#fcc419'),
    mat('#fcc419'),
    new THREE.MeshLambertMaterial({ map: signTexture(name.toUpperCase(), '#fcc419', '#1d1a2a') }),
    new THREE.MeshLambertMaterial({ map: signTexture(name.toUpperCase(), '#fcc419', '#1d1a2a') }),
  ]);
  sign.position.set(0, 1.45, 0);
  sign.castShadow = true;
  group.add(sign);
  group.add(box(0.3, 0.45, 0.3, '#e9ecef', -0.62, 0, 0.3));
  group.add(box(0.3, 0.45, 0.3, '#e9ecef', 0.62, 0, 0.3));
  return group;
}

/** Placeholder for a coaster station while placing it: a platform and canopy, 3 × 1. */
function stationPreview(colors: readonly string[]): Model {
  const group = new THREE.Group();
  group.add(box(3, 0.12, 0.9, '#ced4da'));
  group.add(box(2.9, 0.08, 0.16, colors[1] ?? '#495057', 0, 0.12, -0.1));
  group.add(box(2.9, 0.08, 0.16, colors[1] ?? '#495057', 0, 0.12, 0.1));
  for (const x of [-1.3, 1.3]) {
    for (const z of [-0.4, 0.4]) group.add(box(0.06, 1.1, 0.06, '#868e96', x, 0, z));
  }
  group.add(box(3, 0.08, 1.1, colors[0] ?? '#e03131', 0, 1.1));
  return { group };
}

export function rideModel(ride: Ride): Model {
  const spec = RIDE_TYPES[ride.type];
  if (spec.coaster) return stationPreview(spec.colours);
  switch (ride.type) {
    case 'carousel':
      return carousel(spec.colours);
    case 'ferris-wheel':
      return ferrisWheel(spec.colours);
    case 'teacups':
      return teacups(spec.colours);
    case 'swing-ship':
      return swingShip(spec.colours);
    case 'drop-tower':
      return dropTower(spec.colours);
    case 'bumper-cars':
      return bumperCars(spec.colours);
    case 'haunted-house':
      return hauntedHouse(spec.colours);
    default:
      return stall(ride.type, spec.colours);
  }
}

// Scenery (instanced) --------------------------------------------------------------------------

interface Part {
  geometry: THREE.BufferGeometry;
  color: string;
  matrix?: THREE.Matrix4;
}

const at = (
  x: number,
  y: number,
  z: number,
  scale: [number, number, number] = [1, 1, 1],
  rotation = 0,
) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotation, 0)),
    new THREE.Vector3(...scale),
  );

/** Bakes coloured parts into one geometry with vertex colours, for instancing. */
function bake(parts: Part[]): THREE.BufferGeometry {
  const pieces = parts.map(({ geometry, color, matrix }) => {
    const piece = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) piece.applyMatrix4(matrix);
    const tint = new THREE.Color(color);
    const count = piece.attributes.position?.count ?? 0;
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      values[index * 3] = tint.r;
      values[index * 3 + 1] = tint.g;
      values[index * 3 + 2] = tint.b;
    }
    piece.setAttribute('color', new THREE.BufferAttribute(values, 3));
    piece.deleteAttribute('uv');
    return piece;
  });
  const merged = mergeGeometries(pieces, false);
  merged.computeVertexNormals();
  return merged;
}

const cyl = (top: number, bottom: number, height: number, segments = 7) =>
  new THREE.CylinderGeometry(top, bottom, height, segments).translate(0, height / 2, 0);
const ball = (radius: number, detail = 0) => new THREE.IcosahedronGeometry(radius, detail);
const coneGeo = (radius: number, height: number, segments = 7) =>
  new THREE.ConeGeometry(radius, height, segments).translate(0, height / 2, 0);
const cube = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);

export function sceneryGeometry(id: SceneryId): THREE.BufferGeometry {
  switch (id) {
    case 'oak':
      return bake([
        { geometry: cyl(0.06, 0.09, 0.4), color: '#8d5a3b' },
        { geometry: ball(0.34), color: '#4caf50', matrix: at(0, 0.62, 0) },
        { geometry: ball(0.24), color: '#5cbf5f', matrix: at(0.16, 0.78, 0.08) },
        { geometry: ball(0.22), color: '#43a047', matrix: at(-0.14, 0.72, -0.1) },
      ]);
    case 'pine':
      return bake([
        { geometry: cyl(0.05, 0.07, 0.25), color: '#7b4a2e' },
        { geometry: coneGeo(0.34, 0.5), color: '#2f7d4f', matrix: at(0, 0.2, 0) },
        { geometry: coneGeo(0.27, 0.45), color: '#358a58', matrix: at(0, 0.45, 0) },
        { geometry: coneGeo(0.19, 0.4), color: '#3d9a62', matrix: at(0, 0.68, 0) },
      ]);
    case 'palm':
      return bake([
        { geometry: cyl(0.04, 0.06, 0.4, 6), color: '#a47148' },
        { geometry: cyl(0.035, 0.04, 0.4, 6), color: '#b07d52', matrix: at(0.04, 0.38, 0) },
        ...[0, 1, 2, 3, 4].map((index) => ({
          geometry: new THREE.ConeGeometry(0.08, 0.5, 4)
            .rotateZ(Math.PI / 2 + 0.35)
            .translate(0.24, 0, 0),
          color: '#51cf66',
          matrix: at(0.06, 0.78, 0, [1, 0.5, 1], (index / 5) * Math.PI * 2),
        })),
        { geometry: ball(0.06), color: '#8d5a3b', matrix: at(0.06, 0.76, 0) },
      ]);
    case 'bush':
      return bake([
        { geometry: ball(0.22), color: '#5cb85c', matrix: at(0, 0.16, 0, [1.2, 0.8, 1]) },
        { geometry: ball(0.15), color: '#69c46a', matrix: at(0.12, 0.2, 0.06) },
      ]);
    case 'flowers':
      return bake([
        { geometry: cube(0.8, 0.08, 0.8), color: '#7a5a3f' },
        ...Array.from({ length: 9 }, (_, index) => ({
          geometry: ball(0.07),
          color: ['#ff6b6b', '#fcc419', '#f783ac', '#ffffff', '#b197fc'][index % 5] ?? '#fff',
          matrix: at(-0.25 + (index % 3) * 0.25, 0.14, -0.25 + Math.floor(index / 3) * 0.25),
        })),
      ]);
    case 'hedge':
      return bake([{ geometry: cube(0.92, 0.42, 0.38), color: '#3a9a4a' }]);
    case 'fountain':
      return bake([
        { geometry: cyl(0.44, 0.46, 0.16, 12), color: '#ced4da' },
        { geometry: cyl(0.38, 0.38, 0.02, 12), color: '#74c0fc', matrix: at(0, 0.14, 0) },
        { geometry: cyl(0.06, 0.08, 0.45, 8), color: '#adb5bd' },
        { geometry: cyl(0.18, 0.08, 0.08, 10), color: '#ced4da', matrix: at(0, 0.45, 0) },
        { geometry: coneGeo(0.12, 0.3, 8), color: '#a5d8ff', matrix: at(0, 0.5, 0) },
      ]);
    case 'statue':
      return bake([
        { geometry: cube(0.4, 0.3, 0.4), color: '#868e96' },
        { geometry: cyl(0.08, 0.1, 0.42, 7), color: '#ced4da', matrix: at(0, 0.3, 0) },
        { geometry: ball(0.09), color: '#ced4da', matrix: at(0, 0.8, 0) },
        {
          geometry: cube(0.05, 0.3, 0.05),
          color: '#ced4da',
          matrix: at(0.12, 0.62, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.8)),
        },
      ]);
  }
}

export const PATH_ITEM_GEOMETRY = {
  bench: () =>
    bake([
      { geometry: cube(0.36, 0.03, 0.12), color: '#a0522d', matrix: at(0, 0.1, 0) },
      { geometry: cube(0.36, 0.1, 0.03), color: '#a0522d', matrix: at(0, 0.13, -0.06) },
      { geometry: cube(0.03, 0.1, 0.1), color: '#495057', matrix: at(-0.15, 0, 0) },
      { geometry: cube(0.03, 0.1, 0.1), color: '#495057', matrix: at(0.15, 0, 0) },
    ]),
  bin: () =>
    bake([
      { geometry: cyl(0.06, 0.05, 0.16, 8), color: '#2b8a3e' },
      { geometry: cyl(0.065, 0.065, 0.02, 8), color: '#212529', matrix: at(0, 0.16, 0) },
    ]),
  lamp: () =>
    bake([
      { geometry: cyl(0.015, 0.02, 0.5, 5), color: '#343a40' },
      { geometry: ball(0.05), color: '#fff3bf', matrix: at(0, 0.52, 0) },
    ]),
};

export { mesh };
