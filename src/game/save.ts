import { Park, type SavedPark } from '../sim/park';
import { createScenario, SCENARIOS, type ScenarioDef } from '../sim/scenarios';

const KEY = 'loopland.park.v1';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Saves the park (not its guests: they go home when you leave). Returns false if it can't. */
export function savePark(park: Park, store: Pick<Storage, 'setItem'> | null = storage()): boolean {
  try {
    store?.setItem(KEY, JSON.stringify(park.toJSON()));
    return !!store;
  } catch {
    return false;
  }
}

export function loadPark(store: Pick<Storage, 'getItem'> | null = storage()): Park | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedPark;
    if (
      (saved as { version: unknown }).version !== 1 ||
      saved.width * saved.depth !== saved.use.length
    )
      return null;
    return Park.fromJSON(saved);
  } catch {
    return null;
  }
}

export function clearSave(store: Pick<Storage, 'removeItem'> | null = storage()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** A scenario's park, fresh. With no scenario given, the first (easiest) one. */
export function newPark(def: ScenarioDef | undefined = SCENARIOS[0]): Park {
  if (!def) throw new Error('no scenarios');
  return createScenario(def);
}

const PROGRESS = 'loopland.progress.v1';

/** Scenarios the player has completed. */
export function loadProgress(store: Pick<Storage, 'getItem'> | null = storage()): string[] {
  try {
    const raw: unknown = JSON.parse(store?.getItem(PROGRESS) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markCompleted(id: string, store: Storage | null = storage()): void {
  const done = loadProgress(store);
  if (done.includes(id)) return;
  try {
    store?.setItem(PROGRESS, JSON.stringify([...done, id]));
  } catch {
    // Private browsing: forget it.
  }
}
