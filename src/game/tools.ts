import {
  money,
  RIDE_TYPES,
  SCENERY,
  PATH_ITEMS,
  type PathItemId,
  type RideTypeId,
  type SceneryId,
} from '../sim/catalog';
import { DX, DZ, type Direction, type Tile } from '../sim/grid';
import { placeCoaster } from '../sim/coasters';
import { SURFACES, USE, type LandMode } from '../sim/park';

/** Brush sizes for landscaping, in tiles; 0 works on a single corner. */
export type Brush = 0 | 1 | 3 | 5;

/** The tiles a brush of `size` covers around a tile. */
export function brushRect(tile: Tile, size: Brush) {
  const half = Math.floor(Math.max(1, size) / 2);
  return { x0: tile.x - half, z0: tile.z - half, x1: tile.x + half, z1: tile.z + half };
}
import type { World } from '../sim/world';
import type { ParkView, Pick, Preview } from '../view/ParkView';

export type Tool =
  | { kind: 'inspect' }
  | { kind: 'path'; queue: boolean }
  | { kind: 'ride'; type: RideTypeId }
  | { kind: 'scenery'; id: SceneryId }
  | { kind: 'item'; id: PathItemId }
  | { kind: 'land'; mode: LandMode; size: Brush }
  | { kind: 'paint'; surface: number; size: Brush }
  | { kind: 'water'; raise: boolean; size: Brush }
  | { kind: 'bulldoze' };

export type Selection =
  | { kind: 'ride'; id: number }
  | { kind: 'guest'; id: number }
  | { kind: 'staff'; id: number }
  | null;

export interface ToolCallbacks {
  /** Something was clicked with the inspect tool. */
  select: (selection: Selection) => void;
  /** A short note for the player: a cost, or why something can't be built. */
  note: (text: string, bad?: boolean) => void;
  /** Money was spent or the park changed, so the HUD should refresh. */
  changed: () => void;
  /** Building finished, so go back to inspecting (after a coaster's station). */
  done: () => void;
  /** The thing being placed turned (by the player, or to face a path). */
  faced: (facing: Direction) => void;
}

/** A straight run of tiles from a to b along whichever axis is longer. */
export function line(a: Tile, b: Tile): Tile[] {
  const tiles: Tile[] = [];
  if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) {
    const step = Math.sign(b.x - a.x) || 1;
    for (let x = a.x; x !== b.x + step; x += step) tiles.push({ x, z: a.z });
  } else {
    const step = Math.sign(b.z - a.z) || 1;
    for (let z = a.z; z !== b.z + step; z += step) tiles.push({ x: a.x, z });
  }
  return tiles;
}

/**
 * Turns pointer, touch and keyboard input into camera moves and building. Drags pan with the
 * inspect tool (or the right mouse button, or two fingers); with a building tool they draw.
 */
export class Interaction {
  tool: Tool = { kind: 'inspect' };
  facing: Direction = 2;
  /** Until the player turns something themselves, rides face the nearest path. */
  private autoFacing = true;
  /** Hover notes stay quiet briefly after a build, so its message can be read. */
  private quietUntil = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly view: ParkView;
  private readonly world: World;
  private readonly callbacks: ToolCallbacks;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: {
    id: number;
    startX: number;
    startY: number;
    mode: 'pan' | 'tool' | 'pending';
    start: Pick | null;
    painted: Set<string>;
  } | null = null;
  private pinch: { distance: number; x: number; y: number } | null = null;
  private hover: Pick | null = null;

  constructor(canvas: HTMLCanvasElement, view: ParkView, world: World, callbacks: ToolCallbacks) {
    this.canvas = canvas;
    this.view = view;
    this.world = world;
    this.callbacks = callbacks;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  destroy(): void {
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.onDown);
    canvas.removeEventListener('pointermove', this.onMove);
    canvas.removeEventListener('pointerup', this.onUp);
    canvas.removeEventListener('pointercancel', this.onCancel);
    canvas.removeEventListener('pointerleave', this.onLeave);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  setTool(tool: Tool): void {
    if (
      tool.kind !== this.tool.kind ||
      (tool.kind === 'ride' && this.tool.kind === 'ride' && tool.type !== this.tool.type)
    ) {
      this.autoFacing = true;
    }
    this.tool = tool;
    this.drag = null;
    this.refreshPreview();
  }

  turn(): void {
    this.autoFacing = false;
    this.facing = ((this.facing + 1) % 4) as Direction;
    this.callbacks.faced(this.facing);
    this.refreshPreview();
  }

  private onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.view.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  private onDown = (event: PointerEvent) => {
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      // Second finger: switch to pinch-zoom and two-finger pan, and forget the first drag.
      this.drag = null;
      this.pinch = this.pinchState();
      this.refreshPreview();
      return;
    }
    const pan = event.button === 1 || event.button === 2 || this.tool.kind === 'inspect';
    const pick = this.view.pick(event.clientX, event.clientY, this.canvas);
    this.drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode: pan ? 'pending' : 'tool',
      start: pick,
      painted: new Set(),
    };
    if (!pan && pick) this.applyPaint(pick);
  };

  private pinchState() {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return null;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private onMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (previous) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size >= 2 && this.pinch) {
      const next = this.pinchState();
      if (next) {
        this.view.pan(next.x - this.pinch.x, next.y - this.pinch.y);
        if (this.pinch.distance > 0) this.view.zoomBy(next.distance / this.pinch.distance);
        this.pinch = next;
      }
      return;
    }

    const drag = this.drag;
    if (drag?.id === event.pointerId && previous) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (drag.mode === 'pending' && moved > 6) drag.mode = 'pan';
      if (drag.mode === 'pan') {
        this.view.pan(event.clientX - previous.x, event.clientY - previous.y);
        return;
      }
    }

    const pick = this.view.pick(event.clientX, event.clientY, this.canvas);
    this.hover = pick;
    if (drag?.mode === 'tool' && pick) this.applyPaint(pick);
    this.refreshPreview();
  };

  private onUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const drag = this.drag;
    if (drag?.id !== event.pointerId) return;
    this.drag = null;
    const pick = this.view.pick(event.clientX, event.clientY, this.canvas);
    if (drag.mode === 'pending') {
      // A click without a drag.
      if (this.tool.kind === 'inspect') this.inspect(event.clientX, event.clientY, pick);
      else if (event.button === 2 && this.tool.kind !== 'bulldoze')
        this.setTool({ kind: 'inspect' });
    } else if (drag.mode === 'tool') {
      this.finish(drag.start, pick);
    }
    this.refreshPreview();
  };

  private onCancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.pinch = null;
    this.drag = null;
    this.refreshPreview();
  };

  private onLeave = () => {
    if (this.drag) return;
    this.hover = null;
    this.view.setPreview(null);
  };

  private inspect(clientX: number, clientY: number, pick: Pick | null) {
    const person = this.view.pickPerson(clientX, clientY, this.canvas);
    if (person) {
      this.callbacks.select(person);
      return;
    }
    const ride = pick ? this.world.park.rideAt(pick.tile.x, pick.tile.z) : undefined;
    this.callbacks.select(ride ? { kind: 'ride', id: ride.id } : null);
  }

  /** Tools that act on every tile the pointer crosses. */
  private applyPaint(pick: Pick) {
    const drag = this.drag;
    if (!drag) return;
    const key = `${pick.tile.x},${pick.tile.z}`;
    if (drag.painted.has(key)) return;
    const park = this.world.park;
    const tool = this.tool;
    if (tool.kind === 'scenery') {
      drag.painted.add(key);
      const check = park.sceneryCheck(tool.id, pick.tile.x, pick.tile.z);
      if (check.ok) {
        park.placeScenery(
          tool.id,
          pick.tile.x,
          pick.tile.z,
          ((pick.tile.x + pick.tile.z) % 4) as Direction,
        );
        this.callbacks.changed();
      } else if (drag.painted.size === 1) this.callbacks.note(check.reason, true);
    } else if (tool.kind === 'bulldoze') {
      drag.painted.add(key);
      const refund = park.removalRefund(pick.tile.x, pick.tile.z);
      const gone = park.demolish(pick.tile.x, pick.tile.z);
      if (gone) {
        this.callbacks.note(`${gone} demolished${refund ? `: ${money(refund)} back` : ''}.`);
        this.callbacks.changed();
      }
    } else if (tool.kind === 'paint') {
      drag.painted.add(key);
      const { x0, z0, x1, z1 } = brushRect(pick.tile, tool.size);
      if (park.paint(x0, z0, x1, z1, tool.surface).ok) this.callbacks.changed();
    } else if (tool.kind === 'item') {
      drag.painted.add(key);
      const result = park.placePathItem(tool.id, pick.tile.x, pick.tile.z);
      if (result.ok) this.callbacks.changed();
      else if (drag.painted.size === 1) this.callbacks.note(result.reason, true);
    }
  }

  /** Tools that act once the pointer is released: paths, rides and land. */
  private finish(start: Pick | null, end: Pick | null) {
    const park = this.world.park;
    const tool = this.tool;
    if (tool.kind === 'path' && start) {
      const tiles = line(start.tile, (end ?? start).tile);
      let built = 0;
      let reason = '';
      let spent = 0;
      for (const tile of tiles) {
        const check = park.pathCheck(tile.x, tile.z, tool.queue);
        if (check.ok && park.buildPath(tile.x, tile.z, tool.queue)) {
          built++;
          spent += check.cost;
        } else if (!reason && check.reason !== 'Already built.') reason = check.reason;
      }
      if (built > 0) {
        this.quietUntil = performance.now() + 2000;
        this.callbacks.note(
          `Built ${built} ${tool.queue ? 'queue' : 'path'} ${built === 1 ? 'tile' : 'tiles'} for ${money(spent)}.`,
        );
        this.callbacks.changed();
      } else if (reason) this.callbacks.note(reason, true);
    } else if (tool.kind === 'ride') {
      const pick = end ?? start;
      if (!pick) return;
      const { origin: at, facing } = this.choose(tool.type, pick);
      if (facing !== this.facing) {
        this.facing = facing;
        this.callbacks.faced(facing);
      }
      const plan = park.placement(tool.type, at.x, at.z, this.facing);
      if (!plan.ok) {
        this.callbacks.note(plan.reason, true);
        return;
      }
      const ride = RIDE_TYPES[tool.type].coaster
        ? placeCoaster(park, tool.type, at.x, at.z, this.facing)
        : park.placeRide(tool.type, at.x, at.z, this.facing);
      if (ride) {
        this.quietUntil = performance.now() + 2500;
        const spec = RIDE_TYPES[tool.type];
        this.callbacks.note(
          spec.coaster
            ? `${ride.name}’s station is down. Now build the track.`
            : spec.kind === 'ride'
              ? `${ride.name} built for ${money(plan.cost)}. Connect its entrance and exit to a path.`
              : `${ride.name} built for ${money(plan.cost)}.`,
        );
        this.callbacks.changed();
        if (spec.coaster) {
          this.setTool({ kind: 'inspect' });
          this.callbacks.done();
        }
        this.callbacks.select({ kind: 'ride', id: ride.id });
      }
    } else if (tool.kind === 'land' && end) {
      const result = this.landEdit(tool, start ?? end, end, true);
      if (!result.ok) this.callbacks.note(result.reason, true);
      else this.callbacks.changed();
    } else if (tool.kind === 'water' && end) {
      const { x0, z0, x1, z1 } = brushRect(end.tile, tool.size);
      const result = park.editWater(x0, z0, x1, z1, tool.raise);
      if (!result.ok) this.callbacks.note(result.reason, true);
      else this.callbacks.changed();
    }
  }

  /** Checks (or makes) a land edit: a corner, or a brush of tiles; levelling matches `start`. */
  private landEdit(
    tool: Extract<Tool, { kind: 'land' }>,
    start: Pick,
    end: Pick,
    apply: boolean,
  ): { ok: boolean; reason: string; cost: number } {
    const park = this.world.park;
    const target = park.terrain.base(start.tile.x, start.tile.z);
    let rect: { cx0: number; cz0: number; cx1: number; cz1: number };
    if (tool.size === 0 && tool.mode !== 'level') {
      rect = { cx0: end.corner.x, cz0: end.corner.z, cx1: end.corner.x, cz1: end.corner.z };
    } else {
      const { x0, z0, x1, z1 } = brushRect(end.tile, tool.size);
      rect = { cx0: x0, cz0: z0, cx1: x1 + 1, cz1: z1 + 1 };
    }
    const check = park.landCheck(rect.cx0, rect.cz0, rect.cx1, rect.cz1, tool.mode, target);
    if (!apply || !check.ok) return check;
    const done = park.editLand(rect.cx0, rect.cz0, rect.cx1, rect.cz1, tool.mode, target);
    return { ...done, cost: check.cost };
  }

  private originFor(type: RideTypeId, pick: Pick, facing: Direction): Tile {
    const spec = RIDE_TYPES[type];
    const sideways = facing % 2 === 1;
    const width = sideways ? spec.depth : spec.width;
    const depth = sideways ? spec.width : spec.depth;
    return {
      x: Math.round(pick.point.x - width / 2),
      z: Math.round(pick.point.z - depth / 2),
    };
  }

  private hint(text: string, bad = false) {
    if (performance.now() < this.quietUntil) return;
    this.callbacks.note(text, bad);
  }

  /**
   * Where a ride goes for a pointer position, and which way it faces. It snaps back a tile
   * when that puts its entrance (or counter) beside a path, and, until the player turns it
   * themselves, it turns to face the nearest path too.
   */
  private choose(type: RideTypeId, pick: Pick): { origin: Tile; facing: Direction } {
    const park = this.world.park;
    const kind = RIDE_TYPES[type].kind;
    const walk = (tile: Tile | null) => {
      if (!tile) return false;
      const use = park.useAt(tile.x, tile.z);
      return use === USE.path || use === USE.queue;
    };
    const facings = this.autoFacing
      ? [0, 1, 2, 3].map((turn) => ((this.facing + turn) % 4) as Direction)
      : [this.facing];
    let best = { origin: this.originFor(type, pick, this.facing), facing: this.facing };
    let bestScore = -1;
    for (const facing of facings) {
      const base = this.originFor(type, pick, facing);
      for (const shift of [0, 1]) {
        const origin = { x: base.x - DX[facing] * shift, z: base.z - DZ[facing] * shift };
        const plan = park.placement(type, origin.x, origin.z, facing);
        if (!plan.ok) continue;
        const ahead = (tile: Tile | null) =>
          tile ? { x: tile.x + DX[facing], z: tile.z + DZ[facing] } : null;
        const connects =
          kind === 'stall'
            ? walk(ahead(origin))
              ? 3
              : 0
            : (walk(ahead(plan.entrance)) ? 2 : 0) + (walk(ahead(plan.exit)) ? 1 : 0);
        // Only snap when it actually reaches a path; otherwise stay under the pointer.
        if (shift === 1 && connects === 0) continue;
        const score = connects - shift * 0.5 + (facing === this.facing ? 0.1 : 0);
        if (score > bestScore) {
          best = { origin, facing };
          bestScore = score;
        }
      }
    }
    return best;
  }

  refreshPreview(): void {
    const park = this.world.park;
    const pick = this.hover;
    const tool = this.tool;
    let preview: Preview = null;
    if (pick) {
      switch (tool.kind) {
        case 'inspect':
          preview = null;
          break;
        case 'path': {
          const tiles =
            this.drag?.mode === 'tool' && this.drag.start
              ? line(this.drag.start.tile, pick.tile)
              : [pick.tile];
          const checks = tiles.map((tile) => park.pathCheck(tile.x, tile.z, tool.queue));
          const cost = checks.reduce((sum, check) => sum + (check.ok ? check.cost : 0), 0);
          preview = { kind: 'tiles', tiles, ok: checks.some((check) => check.ok) };
          if (cost > 0)
            this.hint(
              `${tiles.length > 1 ? `${checks.filter((check) => check.ok).length} tiles: ` : ''}${money(cost)}`,
            );
          break;
        }
        case 'ride': {
          const { origin: at, facing } = this.choose(tool.type, pick);
          if (facing !== this.facing) {
            this.facing = facing;
            this.callbacks.faced(facing);
          }
          const plan = park.placement(tool.type, at.x, at.z, this.facing);
          preview = {
            kind: 'ride',
            type: tool.type,
            x: at.x,
            z: at.z,
            facing: this.facing,
            ok: plan.ok,
            tiles: plan.tiles,
          };
          this.hint(
            plan.ok ? `${RIDE_TYPES[tool.type].name}: ${money(plan.cost)}` : plan.reason,
            !plan.ok,
          );
          break;
        }
        case 'scenery': {
          const check = park.sceneryCheck(tool.id, pick.tile.x, pick.tile.z);
          preview = { kind: 'tiles', tiles: [pick.tile], ok: check.ok };
          this.hint(`${SCENERY[tool.id].name}: ${money(SCENERY[tool.id].cost)}`);
          break;
        }
        case 'item':
          preview = {
            kind: 'tiles',
            tiles: [pick.tile],
            ok: park.useAt(pick.tile.x, pick.tile.z) === USE.path,
          };
          this.hint(`${PATH_ITEMS[tool.id].name}: ${money(PATH_ITEMS[tool.id].cost)}`);
          break;
        case 'land': {
          const start = this.drag?.start ?? pick;
          const check = this.landEdit(tool, start, pick, false);
          if (tool.size === 0 && tool.mode !== 'level') {
            preview = { kind: 'corner', corner: pick.corner };
          } else {
            const { x0, z0, x1, z1 } = brushRect(pick.tile, tool.size);
            preview = { kind: 'tiles', tiles: rectTiles(x0, z0, x1, z1), ok: check.ok };
          }
          this.hint(check.ok ? money(check.cost) : check.reason, !check.ok);
          break;
        }
        case 'water': {
          const { x0, z0, x1, z1 } = brushRect(pick.tile, tool.size);
          const check = park.waterCheck(x0, z0, x1, z1, tool.raise);
          preview = { kind: 'tiles', tiles: rectTiles(x0, z0, x1, z1), ok: check.ok };
          this.hint(check.ok ? money(check.cost) : check.reason, !check.ok);
          break;
        }
        case 'paint': {
          const { x0, z0, x1, z1 } = brushRect(pick.tile, tool.size);
          preview = { kind: 'tiles', tiles: rectTiles(x0, z0, x1, z1), ok: true };
          this.hint(`${SURFACES[tool.surface]?.name ?? 'Paint'}: ${money(100)} a tile`);
          break;
        }
        case 'bulldoze': {
          const ride = park.rideAt(pick.tile.x, pick.tile.z);
          const tiles = ride
            ? [
                ...Array.from({ length: ride.width * ride.depth }, (_, index) => ({
                  x: ride.x + (index % ride.width),
                  z: ride.z + Math.floor(index / ride.width),
                })),
                ...(ride.entrance ? [ride.entrance] : []),
                ...(ride.exit ? [ride.exit] : []),
              ]
            : [pick.tile];
          preview = { kind: 'tiles', tiles, ok: false };
          break;
        }
      }
    }
    this.view.setPreview(preview);
  }
}

function rectTiles(x0: number, z0: number, x1: number, z1: number): Tile[] {
  const tiles: Tile[] = [];
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) tiles.push({ x, z });
  }
  return tiles;
}
