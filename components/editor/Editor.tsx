"use client";

import { useEffect } from "react";
import { type Draft, restoreSession } from "@/lib/editor/draft";
import { useSim } from "@/lib/editor/simStore";
import { parsePaletteGroups } from "@/lib/editor/palette";
import { dialogOpen, useEditor } from "@/lib/editor/store";
import { indexedDbRepository } from "@/lib/storage/indexedDb";
import { PALETTE_KEY, SCRATCH_KEY } from "@/lib/storage/localKeys";
import { newDesign, quickSave } from "./actions";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { PaletteDialog } from "./PaletteDialog";
import { SaveDialog } from "./SaveDialog";
import { Toolbar } from "./Toolbar";

/** Load the left bar's layout and save it whenever it changes. */
function usePaletteLayout() {
  useEffect(() => {
    try {
      const groups = parsePaletteGroups(JSON.parse(localStorage.getItem(PALETTE_KEY) ?? "null"));
      if (groups) useEditor.getState().setPaletteGroups(groups);
    } catch {
      // Unreadable or blocked storage: keep the default lists.
    }
    return useEditor.subscribe((s, prev) => {
      if (s.paletteGroups === prev.paletteGroups) return;
      try {
        localStorage.setItem(PALETTE_KEY, JSON.stringify(s.paletteGroups));
      } catch {
        // Storage full or blocked; nothing to do.
      }
    });
  }, []);
}

/** Restore the session once, then autosave the draft whenever the design changes. */
function usePersistence() {
  useEffect(() => {
    restoreSession(indexedDbRepository);

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
        if (dialogOpen(s)) return;
        // Blurring commits a half-typed Inspector field before saving.
        (document.activeElement as HTMLElement | null)?.blur();
        quickSave();
        return;
      }
      // Not Ctrl+N: browsers keep it for a new window and never send it to the page.
      // Matched by key code because Alt+N types a character on macOS.
      if (e.altKey && !mod && e.code === "KeyN") {
        e.preventDefault();
        if (dialogOpen(s)) return;
        // Blurring commits a half-typed Inspector field first.
        (document.activeElement as HTMLElement | null)?.blur();
        newDesign();
        return;
      }
      if (mod && key === "l") {
        // Never the browser's address bar.
        e.preventDefault();
        if (!dialogOpen(s)) s.setPaletteDialogOpen(true);
        return;
      }
      if (dialogOpen(s) || document.activeElement?.matches("input, textarea, select")) return;
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
  usePaletteLayout();
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
      <PaletteDialog />
    </div>
  );
}
