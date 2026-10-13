import { create } from "zustand";
import type { Circuit } from "../model/types";
import { type ChipLibrary, type CompileError, compile } from "../sim/compile";
import { Engine } from "../sim/engine";
import { type Value, fromInt, zeros } from "../sim/value";

export const SPEEDS = [1, 2, 5, 10, 50, 200, 1000];
/** Cap on ticks simulated per animation frame, so a slow circuit can't freeze the page. */
const MAX_TICKS_PER_FRAME = 2000;

export interface SimState {
  engine: Engine | null;
  errors: CompileError[];
  /** Bumped whenever simulated values may have changed; components subscribe to re-read them. */
  version: number;
  running: boolean;
  /** Clock ticks per second while running. */
  speed: number;

  /** Recompile after an edit, keeping input values, latch state and time. */
  rebuild(circuit: Circuit, library: ChipLibrary): void;
  /** Start over from time 0 with every primitive reset, keeping input values. */
  reset(circuit: Circuit, library: ChipLibrary): void;
  /** Flip one bit of a top-level Input Pin. */
  toggleInput(compId: string, bit: number, width: number): void;
  setInput(compId: string, value: Value): void;
  step(): void;
  setRunning(running: boolean): void;
  setSpeed(speed: number): void;
  /** Advance by elapsed wall time while running; called once per animation frame. */
  advance(ms: number): void;
}

let tickDebt = 0;

export const useSim = create<SimState>()((set, get) => ({
  engine: null,
  errors: [],
  version: 0,
  running: false,
  speed: 5,

  rebuild(circuit, library) {
    const netlist = compile(circuit, library);
    const engine = new Engine(netlist, { previous: get().engine ?? undefined });
    set({ engine, errors: netlist.errors, version: get().version + 1 });
  },

  reset(circuit, library) {
    const netlist = compile(circuit, library);
    const engine = new Engine(netlist, { inputs: get().engine?.inputSnapshot() });
    tickDebt = 0;
    set({ engine, errors: netlist.errors, version: get().version + 1 });
  },

  toggleInput(compId, bit, width) {
    const engine = get().engine;
    if (!engine) return;
    const current = engine.getInput(compId) ?? zeros(width);
    get().setInput(compId, fromInt(width, current.v ^ (1 << bit)));
  },

  setInput(compId, value) {
    const engine = get().engine;
    if (!engine) return;
    engine.setInput(compId, value);
    set({ version: get().version + 1 });
  },

  step() {
    get().engine?.tick();
    set({ version: get().version + 1 });
  },

  setRunning(running) {
    tickDebt = 0;
    set({ running });
  },

  setSpeed(speed) {
    set({ speed });
  },

  advance(ms) {
    const { engine, speed } = get();
    if (!engine) return;
    tickDebt += (ms / 1000) * speed;
    const n = Math.min(MAX_TICKS_PER_FRAME, Math.floor(tickDebt));
    // Drop debt we can't catch up on rather than spiralling.
    tickDebt = n === MAX_TICKS_PER_FRAME ? 0 : tickDebt - n;
    if (n === 0) return;
    engine.tick(n);
    set({ version: get().version + 1 });
  },
}));
