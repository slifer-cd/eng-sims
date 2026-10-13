"use client";

import { useEffect } from "react";
import { useSim } from "@/lib/editor/simStore";
import { useEditor } from "@/lib/editor/store";
import type { Circuit } from "@/lib/model/types";
import { indexedDbRepository } from "@/lib/storage/indexedDb";
import { quickSave } from "./actions";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { SaveDialog } from "./SaveDialog";
import { Toolbar } from "./Toolbar";

/*
 * The design on the canvas is autosaved as a draft in localStorage, which can be written
 * synchronously when the page goes away. Blocks are saved explicitly, to IndexedDB.
 */
const SCRATCH_KEY = "eng-sims:scratch";

interface Draft {
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

/** Restore the draft, then load saved blocks; restoring first lets the store tell whether the draft is unsaved. */
function usePersistence() {
  useEffect(() => {
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
    void useEditor.getState().attachStorage(indexedDbRepository());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      try {
        const { circuit, openChipId } = useEditor.getState();
        localStorage.setItem(SCRATCH_KEY, JSON.stringify({ circuit, chipId: openChipId } satisfies Draft));
      } catch {
        // Storage full or blocked; nothing to do.
      }
    };
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.circuit === prev.circuit && s.openChipId === prev.openChipId) return;
      clearTimeout(timer);
      timer = setTimeout(save, 300);
    });
    // Don't lose the last edit to the debounce when the page goes away.
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      unsubscribe();
    };
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        // Never the browser's "save page".
        e.preventDefault();
        if (s.saveDialogOpen) return;
        // Blurring commits a half-typed Inspector field before saving.
        (document.activeElement as HTMLElement | null)?.blur();
        quickSave();
        return;
      }
      if (s.saveDialogOpen || document.activeElement?.matches("input, textarea, select")) return;
      let handled = true;
      if (mod && key === "z") (e.shiftKey ? s.redo : s.undo)();
      else if (mod && key === "y") s.redo();
      else if (mod && key === "c") s.copySelection();
      else if (mod && key === "v") s.paste();
      else if (mod && key === "a") s.selectAll();
      else if (!mod && key === "r") s.rotateSelection();
      else if (key === "delete" || key === "backspace") s.deleteSelection();
      else if (key === "escape") s.cancel();
      else if (mod && key === "enter") useSim.getState().setRunning(!useSim.getState().running);
      else if (mod && key === ".") useSim.getState().step();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Keep the engine compiled from the current circuit, and run the clock while playing. */
function useSimulation() {
  useEffect(() => {
    const rebuild = () => {
      const { circuit, library } = useEditor.getState();
      useSim.getState().rebuild(circuit, library);
    };
    rebuild();
    return useEditor.subscribe((s, prev) => {
      if (s.circuit !== prev.circuit || s.library !== prev.library) rebuild();
    });
  }, []);

  const running = useSim((s) => s.running);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      useSim.getState().advance(now - last);
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);
}

export function Editor() {
  usePersistence();
  useShortcuts();
  useSimulation();
  return (
    <div className="flex h-dvh flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="min-w-0 flex-1">
          <Canvas />
        </main>
        <Inspector />
      </div>
      <SaveDialog />
    </div>
  );
}
