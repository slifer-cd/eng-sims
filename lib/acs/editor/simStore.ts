import { create } from "zustand";
import type { Circuit } from "../../model/types";
import { type Problem, compileCircuit } from "../sim/compile";
import { Engine } from "../sim/engine";
import { useAcsSettings } from "./settings";

/** Real time the simulation may use per animation frame, so a heavy circuit can't freeze the page. */
const FRAME_BUDGET_MS = 12;
/** Longest gap between frames that counts, e.g. after the tab was in the background. */
const MAX_FRAME_MS = 100;

export interface AcsSimState {
  engine: Engine | null;
  warnings: Problem[];
  /** Bumped whenever simulated values may have changed; views subscribe to re-read them. */
  version: number;
  running: boolean;
  /** The last frame couldn't simulate as much time as the speed asks for. */
  behind: boolean;

  /** Recompile after an edit, keeping time and part state (switches, charges). */
  rebuild(circuit: Circuit): void;
  /** Start over from time 0 with every part in its starting state. */
  reset(circuit: Circuit): void;
  step(): void;
  setRunning(running: boolean): void;
  /** Flip a switch, or throw a two-way switch to its other side. */
  toggleSwitch(compId: string): void;
  /** Advance by elapsed wall time while running; called once per animation frame. */
  advance(ms: number): void;
}

function makeEngine(circuit: Circuit, previous?: Engine) {
  const { dt } = useAcsSettings.getState();
  const netlist = compileCircuit(circuit);
  return { engine: new Engine(netlist, { previous, settings: { dt } }), warnings: netlist.warnings };
}

export const useAcsSim = create<AcsSimState>()((set, get) => ({
  engine: null,
  warnings: [],
  version: 0,
  running: true,
  behind: false,

  rebuild(circuit) {
    set({ ...makeEngine(circuit, get().engine ?? undefined), version: get().version + 1 });
  },

  reset(circuit) {
    set({ ...makeEngine(circuit), behind: false, version: get().version + 1 });
  },

  step() {
    get().engine?.step();
    set({ version: get().version + 1 });
  },

  setRunning(running) {
    set({ running, behind: false });
  },

  toggleSwitch(compId) {
    const engine = get().engine;
    const value = engine?.switchValue(compId);
    if (!engine || value === undefined) return;
    engine.setSwitch(compId, typeof value === "boolean" ? !value : value === "a" ? "b" : "a");
    set({ version: get().version + 1 });
  },

  advance(ms) {
    const { engine } = get();
    if (!engine) return;
    const { speed } = useAcsSettings.getState();
    const { steps, behind } = engine.run((Math.min(ms, MAX_FRAME_MS) / 1000) * speed, FRAME_BUDGET_MS);
    if (engine.error) {
      set({ running: false, behind: false, version: get().version + 1 });
      return;
    }
    if (steps > 0 || behind !== get().behind) set({ behind, version: get().version + 1 });
  },
}));
