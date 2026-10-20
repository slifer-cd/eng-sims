"use client";

import { useEffect } from "react";
import { restoreAcsSession, saveAcsDraft } from "@/lib/acs/editor/draft";
import { activeTraces, autoWindow, useAcsScope } from "@/lib/acs/editor/scope";
import { useAcsSettings } from "@/lib/acs/editor/settings";
import { useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";
import { newCircuit } from "./actions";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { ScopePanel } from "./ScopePanel";
import { Toolbar } from "./Toolbar";

/** Restore the session once, then autosave the draft whenever the circuit or settings change. */
function usePersistence() {
  useEffect(() => {
    restoreAcsSession();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      saveAcsDraft();
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 300);
    };
    const unsubCircuit = useAcsEditor.subscribe((s, prev) => {
      if (s.circuit !== prev.circuit) later();
    });
    const unsubSettings = useAcsSettings.subscribe(later);
    const unsubScope = useAcsScope.subscribe(later);
    // Don't lose the last edit to the debounce when the page goes away.
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      unsubCircuit();
      unsubSettings();
      unsubScope();
    };
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAcsEditor.getState();
      const sim = useAcsSim.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        // The draft saves itself; never the browser's "save page".
        e.preventDefault();
        return;
      }
      // Matched by key code because Alt+N types a character on macOS.
      if (e.altKey && !mod && e.code === "KeyN") {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        newCircuit();
        return;
      }
      if (document.activeElement?.matches("input, textarea, select")) return;
      let handled = true;
      if (mod && key === "z") (e.shiftKey ? s.redo : s.undo)();
      else if (mod && key === "y") s.redo();
      else if (mod && key === "c") s.copySelection();
      else if (mod && key === "v") s.paste();
      else if (mod && key === "a") s.selectAll();
      else if (!mod && key === "r") s.rotateSelection();
      else if (!mod && key === "f") s.flipSelection();
      else if (key === "delete" || key === "backspace") s.deleteSelection();
      else if (key === "escape") s.cancel();
      else if (mod && key === "enter") {
        if (!sim.engine?.error) sim.setRunning(!sim.running);
      } else if (mod && key === ".") sim.step();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Keep the engine compiled from the current circuit, and run it while playing. */
function useSimulation() {
  useEffect(() => {
    const rebuild = () => useAcsSim.getState().rebuild(useAcsEditor.getState().circuit);
    rebuild();
    const unsubCircuit = useAcsEditor.subscribe((s, prev) => {
      if (s.circuit !== prev.circuit) rebuild();
    });
    const unsubSettings = useAcsSettings.subscribe((s, prev) => {
      if (s.dt !== prev.dt || s.method !== prev.method) rebuild();
    });
    return () => {
      unsubCircuit();
      unsubSettings();
    };
  }, []);

  // Tell the simulation what the scope records.
  useEffect(() => {
    const sync = () => {
      const { circuit } = useAcsEditor.getState();
      const { traces, window } = useAcsScope.getState();
      useAcsSim.getState().setScope(activeTraces(circuit, traces), window === "auto" ? autoWindow(circuit) : window);
    };
    sync();
    const unsubCircuit = useAcsEditor.subscribe((s, prev) => {
      if (s.circuit !== prev.circuit) sync();
    });
    const unsubScope = useAcsScope.subscribe(sync);
    return () => {
      unsubCircuit();
      unsubScope();
    };
  }, []);

  const running = useAcsSim((s) => s.running);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      useAcsSim.getState().advance(now - last);
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);
}

export function AcsEditor() {
  usePersistence();
  useShortcuts();
  useSimulation();
  return (
    <div className="flex h-dvh flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <Canvas />
          </div>
          <ScopePanel />
        </main>
        <Inspector />
      </div>
    </div>
  );
}
