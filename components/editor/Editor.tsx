"use client";

import { useEffect } from "react";
import { useSim } from "@/lib/editor/simStore";
import { useEditor } from "@/lib/editor/store";
import type { Circuit } from "@/lib/model/types";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";

// Temporary scratch autosave until projects are stored in IndexedDB (milestone 4).
const SCRATCH_KEY = "eng-sims:scratch";

function useScratchAutosave() {
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SCRATCH_KEY) ?? "null") as Circuit | null;
      if (saved && Array.isArray(saved.components) && Array.isArray(saved.wires)) {
        useEditor.getState().load(saved);
        useEditor.getState().fitView();
      }
    } catch {
      // Unreadable or blocked storage: start empty.
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      try {
        localStorage.setItem(SCRATCH_KEY, JSON.stringify(useEditor.getState().circuit));
      } catch {
        // Storage full or blocked; nothing to do.
      }
    };
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.circuit === prev.circuit) return;
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
      if (document.activeElement?.matches("input, textarea, select")) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
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
  useScratchAutosave();
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
    </div>
  );
}
