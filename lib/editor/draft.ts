import type { Circuit } from "../model/types";
import type { ChipRepository } from "../storage/repository";
import { SCRATCH_KEY } from "../storage/localKeys";
import { useEditor } from "./store";

/*
 * The design on the canvas is autosaved as a draft in localStorage, which can be written
 * synchronously when the page goes away. Blocks are saved explicitly, to IndexedDB.
 */

export interface Draft {
  circuit: Circuit;
  /** The block the draft is an edit of. */
  chipId: string | null;
}

function readDraft(): Draft | null {
  const raw = JSON.parse(localStorage.getItem(SCRATCH_KEY) ?? "null");
  // Older drafts are a bare circuit.
  const draft: Draft | null = raw && "circuit" in raw ? raw : raw && { circuit: raw, chipId: null };
  const c = draft?.circuit;
  return c && Array.isArray(c.components) && Array.isArray(c.wires) ? draft : null;
}

let restored = false;

/**
 * Restore the draft, then load saved blocks; restoring first lets the store tell whether the
 * draft is unsaved. Runs once per page load: with `cacheComponents`, leaving /dls hides the
 * editor instead of unmounting it and its effects run again on return, while the store
 * still holds the session. Restoring again would only wipe undo history and the viewport.
 */
export function restoreSession(repository: () => ChipRepository) {
  if (restored) return;
  restored = true;
  try {
    const draft = readDraft();
    if (draft) {
      const { chipId, circuit } = draft;
      useEditor.getState().load(circuit, { chipId, saved: !chipId && circuit.components.length === 0 });
      useEditor.getState().fitView();
    }
  } catch {
    // Unreadable or blocked storage: start empty.
  }
  void useEditor.getState().attachStorage(repository());
}
