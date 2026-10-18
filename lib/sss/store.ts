/*
 * The simulator's inputs, shared by every page under /sss (x(t) typed on the Signal page
 * is the same x(t) on the Fourier page). Persisted to localStorage; parsed defensively
 * because a saved value may come from an older version or be damaged.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { SSS_KEY } from "../storage/localKeys";

export interface ExprInput {
  text: string;
  params: Record<string, number>;
}

export interface SeqInput extends ExprInput {
  mode: "formula" | "values";
  /** Comma-separated values for the "values" mode. */
  values: string;
  /** Index of the first value. */
  start: number;
}

export interface SssInputs {
  x: ExprInput;
  h: ExprInput;
  ops: { A: number; a: number; b: number; order: "shift-first" | "scale-first" };
  series: { x: ExprInput; T: number; t0: number; N: number };
  inverse: ExprInput;
  system: { H: ExprInput; input: "x" | "impulse" | "step" | "sine"; w0: number };
  dx: SeqInput;
  dh: SeqInput;
  /** X(z) for the inverse Z-transform. */
  zinv: ExprInput;
}

export const DEFAULT_INPUTS: SssInputs = {
  x: { text: "e^(-2t)u(t)", params: {} },
  h: { text: "rect(t - 1/2)", params: {} },
  ops: { A: 1, a: 2, b: 1, order: "shift-first" },
  series: { x: { text: "1 - 2u(t - 1)", params: {} }, T: 2, t0: 0, N: 9 },
  inverse: { text: "(s + 3)/((s + 1)(s + 2))", params: {} },
  system: { H: { text: "1/(s^2 + 0.6s + 1)", params: {} }, input: "step", w0: 1 },
  dx: { mode: "formula", text: "0.8^n u(n)", values: "1, 2, 3", start: 0, params: {} },
  dh: { mode: "formula", text: "u(n) - u(n - 4)", values: "1, 1, 1, 1", start: 0, params: {} },
  zinv: { text: "z/((z - 0.5)(z - 0.8))", params: {} },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v.length < 2000 ? v : d);
const oneOf = <T extends string>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d);

function params(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) if (/^[A-Za-z]+\d*$/.test(k) && typeof x === "number" && Number.isFinite(x)) out[k] = x;
  return out;
}

function expr(v: unknown, d: ExprInput): ExprInput {
  if (!isObj(v)) return d;
  return { text: str(v.text, d.text), params: params(v.params) };
}

function seq(v: unknown, d: SeqInput): SeqInput {
  if (!isObj(v)) return d;
  return {
    ...expr(v, d),
    mode: oneOf(v.mode, ["formula", "values"] as const, d.mode),
    values: str(v.values, d.values),
    start: Math.round(num(v.start, d.start)),
  };
}

/** Saved JSON → inputs; anything unreadable falls back to the defaults, field by field. */
export function loadInputs(raw: string | null): SssInputs {
  const d = DEFAULT_INPUTS;
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return d;
  }
  if (!isObj(data) || data.v !== 1 || !isObj(data.inputs)) return d;
  const i = data.inputs;
  const ops = isObj(i.ops) ? i.ops : {};
  const series = isObj(i.series) ? i.series : {};
  const system = isObj(i.system) ? i.system : {};
  return {
    x: expr(i.x, d.x),
    h: expr(i.h, d.h),
    ops: {
      A: num(ops.A, d.ops.A),
      a: num(ops.a, d.ops.a) || d.ops.a,
      b: num(ops.b, d.ops.b),
      order: oneOf(ops.order, ["shift-first", "scale-first"] as const, d.ops.order),
    },
    series: {
      x: expr(series.x, d.series.x),
      T: num(series.T, d.series.T) > 0 ? num(series.T, d.series.T) : d.series.T,
      t0: num(series.t0, d.series.t0),
      N: Math.min(200, Math.max(1, Math.round(num(series.N, d.series.N)))),
    },
    inverse: expr(i.inverse, d.inverse),
    system: {
      H: expr(system.H, d.system.H),
      input: oneOf(system.input, ["x", "impulse", "step", "sine"] as const, d.system.input),
      w0: num(system.w0, d.system.w0),
    },
    dx: seq(i.dx, d.dx),
    dh: seq(i.dh, d.dh),
    zinv: expr(i.zinv, d.zinv),
  };
}

export const saveInputs = (inputs: SssInputs): string => JSON.stringify({ v: 1, inputs });

interface SssState {
  inputs: SssInputs;
  set<K extends keyof SssInputs>(key: K, value: SssInputs[K]): void;
  replace(inputs: SssInputs): void;
}

export const useSss = create<SssState>()((set) => ({
  inputs: DEFAULT_INPUTS,
  set: (key, value) => set((s) => ({ inputs: { ...s.inputs, [key]: value } })),
  replace: (inputs) => set({ inputs }),
}));

// Restore once per page load: with cacheComponents, leaving /sss hides the pages
// (<Activity>) and their effects run again on return.
let restored = false;

/** Restore saved inputs once, then save (debounced) whenever they change. */
export function useSssPersistence(): void {
  useEffect(() => {
    if (!restored) {
      restored = true;
      try {
        const raw = localStorage.getItem(SSS_KEY);
        if (raw !== null) useSss.getState().replace(loadInputs(raw));
      } catch {
        // Blocked storage: keep the defaults.
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      try {
        localStorage.setItem(SSS_KEY, saveInputs(useSss.getState().inputs));
      } catch {
        // Storage full or blocked; nothing to do.
      }
    };
    const unsubscribe = useSss.subscribe((s, prev) => {
      if (s.inputs === prev.inputs) return;
      clearTimeout(timer);
      timer = setTimeout(save, 300);
    });
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", save);
      unsubscribe();
    };
  }, []);
}
