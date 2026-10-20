"use client";

import { useEffect } from "react";
import { restoreAcsSession, saveAcsDraft } from "@/lib/acs/editor/draft";
import { activeTraces, autoWindow, useAcsScope } from "@/lib/acs/editor/scope";
import { partShortcut, shortcutFor } from "@/lib/acs/editor/shortcuts";
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
      const typing = document.activeElement?.matches("input, textarea, select") ?? false;
      const action = shortcutFor(e, typing);
      const part = action ? null : partShortcut(e, typing);
      if (part) {
        // Pick the part up: it follows the cursor until a click puts it down.
        e.preventDefault();
        useAcsEditor.getState().setPlacing({ partId: part, fromDrag: false });
        return;
      }
      if (!action) return;
      e.preventDefault();
      const s = useAcsEditor.getState();
      const sim = useAcsSim.getState();
      switch (action) {
        case "save":
          // The draft saves itself; this only keeps the browser's "save page" away.
          break;
        case "new":
          (document.activeElement as HTMLElement | null)?.blur();
          newCircuit();
          break;
        case "undo":
          s.undo();
          break;
        case "redo":
          s.redo();
          break;
        case "copy":
          s.copySelection();
          break;
        case "paste":
          s.paste();
          break;
        case "selectAll":
          s.selectAll();
          break;
        case "rotate":
          s.rotateSelection();
          break;
        case "flip":
          s.flipSelection();
          break;
        case "delete":
          s.deleteSelection();
          break;
        case "cancel":
          s.cancel();
          break;
        case "run":
          if (!sim.engine?.error) sim.setRunning(!sim.running);
          break;
        case "step":
          sim.step();
          break;
      }
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
