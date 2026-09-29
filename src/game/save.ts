import { createPark, Park, type SavedPark } from '../sim/park';

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

export function newPark(): Park {
  return createPark(Math.floor(Math.random() * 1_000_000) + 1);
}
