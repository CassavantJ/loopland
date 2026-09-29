import * as THREE from 'three';

import { RIDE_TYPES, type PathItemId, type RideTypeId, type SceneryId } from '../sim/catalog';
import { HEIGHT_STEP, type Direction, type Tile } from '../sim/grid';
import { PATH_ITEM_IDS, SCENERY_IDS, USE, type Ride } from '../sim/park';
import type { World } from '../sim/world';
import { Crowd, FACING_ANGLE } from './crowd';
import { cornerGeometry, pathGeometry, terrainGeometry, tilesGeometry } from './land';
import { mat } from './materials';
import {
  entranceModel,
  gateModel,
  PATH_ITEM_GEOMETRY,
  rideModel,
  sceneryGeometry,
  type Model,
} from './models';

export interface Pick {
  tile: Tile;
  /** The nearest land corner, for raising and lowering. */
  corner: Tile;
  point: THREE.Vector3;
}

export type Preview =
  | { kind: 'tiles'; tiles: readonly Tile[]; ok: boolean }
  | { kind: 'corner'; corner: Tile }
  | {
      kind: 'ride';
      type: RideTypeId;
      x: number;
      z: number;
      facing: Direction;
      ok: boolean;
      tiles: readonly Tile[];
    }
  | null;

const ELEVATION = (30 * Math.PI) / 180;
const BASE_PIXELS = 34;
const vertexColors = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** The 3D view: an isometric camera over the park, kept in sync with the simulation. */
export class ParkView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly world: World;
  /** The point on the ground the camera looks at. */
  readonly target = new THREE.Vector3();
  /** Quarter turns of the view, 0–3. */
  rotation = 0;
  zoom = 1;
  private azimuth = 0;
  private size = { width: 1, height: 1 };
  private readonly sun: THREE.DirectionalLight;
  private terrain: THREE.Mesh;
  private paths: THREE.Mesh;
  private scenery = new THREE.Group();
  private rides = new THREE.Group();
  private readonly models = new Map<number, { ride: Ride; holder: THREE.Group; model: Model }>();
  private readonly crowd = new Crowd();
  private cursor: THREE.Mesh;
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private landVersion = -1;
  private version = -1;
  private readonly raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement, world: World, options: { shadows: boolean }) {
    this.world = world;
    const park = world.park;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = options.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.add(new THREE.HemisphereLight('#e6f4ff', '#5b7a3c', 2.2));
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.6);
    this.sun.castShadow = options.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const reach = Math.max(park.width, park.depth) * 0.75;
    Object.assign(this.sun.shadow.camera, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      near: 1,
      far: 200,
    });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(park.width / 2, 0, park.depth / 2);
    this.sun.position.set(park.width / 2 - 30, 60, park.depth / 2 - 18);
    this.scene.add(this.sun, this.sun.target);

    this.terrain = new THREE.Mesh(new THREE.BufferGeometry(), vertexColors);
    this.terrain.receiveShadow = true;
    this.paths = new THREE.Mesh(new THREE.BufferGeometry(), vertexColors);
    this.paths.receiveShadow = true;
    this.cursor = new THREE.Mesh(new THREE.BufferGeometry(), mat('#ffffff', { transparent: 0.45 }));
    this.cursor.renderOrder = 2;
    this.scene.add(
      this.terrain,
      this.paths,
      this.scenery,
      this.rides,
      this.crowd.group,
      this.cursor,
    );

    const gate = gateModel(park.name);
    gate.position.set(
      park.gate.x + 0.5,
      park.terrain.base(park.gate.x, park.gate.z) * HEIGHT_STEP,
      park.gate.z + 0.5,
    );
    this.scene.add(gate);

    this.target.set(park.gate.x + 0.5, 1, park.gate.z - 8);
    this.azimuth = this.azimuthFor(0);
  }

  private azimuthFor(rotation: number) {
    return Math.PI / 4 + (rotation * Math.PI) / 2;
  }

  resize(width: number, height: number, dpr: number): void {
    this.size = { width, height };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
  }

  /** Pans by a number of screen pixels. */
  pan(dx: number, dy: number): void {
    const scale = 1 / (BASE_PIXELS * this.zoom);
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const forward = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    this.target.addScaledVector(right, -dx * scale);
    this.target.addScaledVector(forward, (dy * scale) / Math.sin(ELEVATION));
    const park = this.world.park;
    this.target.x = Math.min(park.width, Math.max(0, this.target.x));
    this.target.z = Math.min(park.depth, Math.max(0, this.target.z));
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(3.5, Math.max(0.45, this.zoom * factor));
  }

  rotate(by: 1 | -1): void {
    this.rotation = (this.rotation + by + 4) % 4;
  }

  private updateCamera(dt: number) {
    const goal = this.azimuthFor(this.rotation);
    let delta = goal - this.azimuth;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.azimuth += delta * Math.min(1, dt * 9);
    const { width, height } = this.size;
    const scale = BASE_PIXELS * this.zoom;
    Object.assign(this.camera, {
      left: -width / 2 / scale,
      right: width / 2 / scale,
      top: height / 2 / scale,
      bottom: -height / 2 / scale,
      near: -200,
      far: 400,
    });
    this.camera.updateProjectionMatrix();
    const distance = 80;
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * Math.cos(ELEVATION) * distance,
      this.target.y + Math.sin(ELEVATION) * distance,
      this.target.z + Math.cos(this.azimuth) * Math.cos(ELEVATION) * distance,
    );
    this.camera.lookAt(this.target);
  }

  /** Rebuilds whatever changed since the last frame. */
  private sync() {
    const park = this.world.park;
    if (park.landVersion !== this.landVersion) {
      this.landVersion = park.landVersion;
      this.terrain.geometry.dispose();
      this.terrain.geometry = terrainGeometry(park);
      this.version = -1;
    }
    if (park.version === this.version) return;
    this.version = park.version;
    this.paths.geometry.dispose();
    this.paths.geometry = pathGeometry(park);
    this.buildScenery();
    this.buildRides();
  }

  private buildScenery() {
    const park = this.world.park;
    for (const child of this.scenery.children) {
      if (child instanceof THREE.InstancedMesh) child.dispose();
    }
    this.scenery.clear();
    const buckets = new Map<string, THREE.Matrix4[]>();
    const add = (key: string, matrix: THREE.Matrix4) => {
      const list = buckets.get(key) ?? [];
      list.push(matrix);
      buckets.set(key, list);
    };
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let z = 0; z < park.depth; z++) {
      for (let x = 0; x < park.width; x++) {
        const index = park.index(x, z);
        const use = park.use[index];
        if (use === USE.scenery) {
          const id = SCENERY_IDS[park.ref[index] ?? 0] ?? 'bush';
          const jitter = ((x * 7 + z * 13) % 10) / 10;
          const big = id === 'oak' || id === 'pine' || id === 'palm';
          position.set(
            x + 0.5 + (big ? (jitter - 0.5) * 0.2 : 0),
            park.terrain.heightAt(x + 0.5, z + 0.5),
            z + 0.5 + (big ? (((x * 3 + z * 5) % 10) / 10 - 0.5) * 0.2 : 0),
          );
          const turned = FACING_ANGLE[((park.facing[index] ?? 0) % 4) as 0 | 1 | 2 | 3];
          rotation.setFromEuler(new THREE.Euler(0, turned + (big ? jitter : 0), 0));
          const size = big ? 0.85 + jitter * 0.35 : 1;
          scale.set(size, size, size);
          add(`scenery:${id}`, new THREE.Matrix4().compose(position, rotation, scale));
        } else if (use === USE.path && park.pathItem[index]) {
          const id = PATH_ITEM_IDS[(park.pathItem[index] ?? 1) - 1] ?? 'bench';
          position.set(x + 0.5, park.terrain.heightAt(x + 0.5, z + 0.5) + 0.02, z + 0.5);
          // Items sit at the side of the path, facing across it.
          const side = (x + z) % 2 === 0 ? 1 : -1;
          const across = park.useAt(x + 1, z) === USE.path || park.useAt(x - 1, z) === USE.path;
          if (across) position.z += side * 0.36;
          else position.x += side * 0.36;
          rotation.setFromEuler(
            new THREE.Euler(
              0,
              across ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2,
              0,
            ),
          );
          scale.set(1, 1, 1);
          add(`item:${id}`, new THREE.Matrix4().compose(position, rotation, scale));
        }
      }
    }
    for (const [key, matrices] of buckets) {
      const [kind, id] = key.split(':');
      const geometry =
        kind === 'scenery'
          ? sceneryGeometry(id as SceneryId)
          : PATH_ITEM_GEOMETRY[id as PathItemId]();
      const instanced = new THREE.InstancedMesh(geometry, vertexColors, matrices.length);
      matrices.forEach((matrix, index) => {
        instanced.setMatrixAt(index, matrix);
      });
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      this.scenery.add(instanced);
    }
  }

  private buildRides() {
    const park = this.world.park;
    const current = new Set(park.rides.map((ride) => ride.id));
    for (const [id, entry] of this.models) {
      if (!current.has(id)) {
        this.rides.remove(entry.holder);
        this.models.delete(id);
      }
    }
    for (const ride of park.rides) {
      if (this.models.has(ride.id)) continue;
      const holder = new THREE.Group();
      const model = rideModel(ride);
      const y = ride.height * HEIGHT_STEP;
      model.group.position.set(ride.x + ride.width / 2, y, ride.z + ride.depth / 2);
      model.group.rotation.y = FACING_ANGLE[ride.facing];
      holder.add(model.group);
      const color = RIDE_TYPES[ride.type].colours[0] ?? '#ff6b6b';
      for (const [tile, exit] of [
        [ride.entrance, false],
        [ride.exit, true],
      ] as const) {
        if (!tile) continue;
        const booth = entranceModel(color, exit);
        booth.position.set(tile.x + 0.5, y, tile.z + 0.5);
        booth.rotation.y = FACING_ANGLE[ride.facing];
        holder.add(booth);
      }
      holder.userData.rideId = ride.id;
      this.rides.add(holder);
      this.models.set(ride.id, { ride, holder, model });
    }
  }

  setPreview(preview: Preview): void {
    const park = this.world.park;
    this.cursor.geometry.dispose();
    if (!preview) {
      this.cursor.geometry = new THREE.BufferGeometry();
      this.setGhost(null);
      return;
    }
    if (preview.kind === 'corner') {
      this.cursor.geometry = cornerGeometry(park, preview.corner.x, preview.corner.z);
      this.cursor.material = mat('#ffffff', { transparent: 0.8 });
      this.setGhost(null);
      return;
    }
    this.cursor.geometry = tilesGeometry(park, preview.tiles);
    this.cursor.material = mat(preview.ok ? '#8ce99a' : '#ff8787', { transparent: 0.55 });
    this.setGhost(preview.kind === 'ride' ? preview : null);
  }

  private setGhost(preview: Extract<Preview, { kind: 'ride' }> | null) {
    if (!preview) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostKey = '';
      return;
    }
    const key = `${preview.type}:${preview.facing}:${preview.ok}`;
    if (key !== this.ghostKey) {
      if (this.ghost) this.scene.remove(this.ghost);
      const spec = RIDE_TYPES[preview.type];
      const sideways = preview.facing % 2 === 1;
      const fake = {
        type: preview.type,
        phase: 'idle',
        timer: 0,
        width: sideways ? spec.depth : spec.width,
        depth: sideways ? spec.width : spec.depth,
      } as Ride;
      const model = rideModel(fake);
      model.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const color =
            child.material instanceof THREE.MeshLambertMaterial
              ? `#${child.material.color.getHexString()}`
              : '#ffffff';
          child.material = mat(preview.ok ? color : '#ff6b6b', { transparent: 0.6 });
          child.castShadow = false;
        }
      });
      model.group.rotation.y = FACING_ANGLE[preview.facing];
      this.ghost = new THREE.Group();
      this.ghost.add(model.group);
      this.ghost.userData.size = [fake.width, fake.depth];
      this.scene.add(this.ghost);
      this.ghostKey = key;
    }
    if (!this.ghost) return;
    const [width = 1, depth = 1] = this.ghost.userData.size as number[];
    const park = this.world.park;
    const cx = preview.x + width / 2;
    const cz = preview.z + depth / 2;
    const y = park.inside(Math.floor(cx), Math.floor(cz)) ? park.terrain.heightAt(cx, cz) : 0;
    this.ghost.position.set(0, 0, 0);
    const inner = this.ghost.children[0];
    inner?.position.set(cx, y + 0.02, cz);
  }

  render(time: number, dt: number): void {
    this.sync();
    this.updateCamera(dt);
    for (const { ride, model } of this.models.values()) model.update?.(ride, time, dt);
    this.crowd.update(this.world.guests, this.world.park.terrain, time);
    this.renderer.render(this.scene, this.camera);
  }

  /** The land under a point on the canvas. */
  pick(clientX: number, clientY: number, canvas: HTMLCanvasElement): Pick | null {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!hit) return null;
    const park = this.world.park;
    const tile = { x: Math.floor(hit.point.x), z: Math.floor(hit.point.z) };
    if (!park.inside(tile.x, tile.z)) return null;
    return {
      tile,
      corner: { x: Math.round(hit.point.x), z: Math.round(hit.point.z) },
      point: hit.point,
    };
  }

  /** The guest nearest a point on the canvas, within a few pixels. */
  pickGuest(clientX: number, clientY: number, canvas: HTMLCanvasElement): number | null {
    const rect = canvas.getBoundingClientRect();
    const projected = new THREE.Vector3();
    let best: number | null = null;
    let bestDistance = 14 * Math.max(0.7, this.zoom);
    const terrain = this.world.park.terrain;
    for (const guest of this.world.guests) {
      if (guest.state === 'riding') continue;
      projected
        .set(guest.x, terrain.heightAt(guest.x, guest.z) + 0.2, guest.z)
        .project(this.camera);
      const x = rect.left + ((projected.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - projected.y) / 2) * rect.height;
      const distance = Math.hypot(x - clientX, y - clientY);
      if (distance < bestDistance) {
        best = guest.id;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Centres the view on a tile. */
  focus(x: number, z: number): void {
    this.target.set(x + 0.5, this.target.y, z + 0.5);
  }

  dispose(): void {
    this.crowd.dispose();
    this.renderer.dispose();
  }
}
