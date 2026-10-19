/*
 * The calculators' inputs (`/calc`), kept across pages and saved to localStorage. Parsed
 * defensively because a saved value may come from an older version or be damaged.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { CALC_KEY } from "../storage/localKeys";
import type { Base } from "./bases";
import type { FloatFormat } from "./ieee754";
import { cellsFrom } from "./logic/truth";

export interface CalcInputs {
  bases: { text: string; base: Base; width: number };
  signed: { text: string; width: number };
  float: { text: string; format: FloatFormat };
  boolean: { text: string };
  /** `cells` holds one of 0, 1, x per minterm; `names` the variable names, first = most significant. */
  kmap: { names: string[]; cells: string };
}

export const KMAP_VARS = { min: 2, max: 8 } as const;
export const defaultNames = (n: number) => "ABCDEFGH".slice(0, n).split("");

export const DEFAULT_INPUTS: CalcInputs = {
  bases: { text: "42", base: 10, width: 0 },
  signed: { text: "-42", width: 8 },
  float: { text: "0.1", format: "32" },
  boolean: { text: "A B + A' C + B C" },
  kmap: { names: defaultNames(4), cells: cellsFrom(4, [4, 8, 10, 11, 12, 15], [9, 14]).join("") },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" && v.length < 2000 ? v : d);
const oneOf = <T extends string | number>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d);

function kmap(v: unknown, d: CalcInputs["kmap"]): CalcInputs["kmap"] {
  if (!isObj(v) || !Array.isArray(v.names)) return d;
  const names = v.names.filter((x): x is string => typeof x === "string" && /^[A-Za-z]\d*$/.test(x));
  const n = names.length;
  if (n < KMAP_VARS.min || n > KMAP_VARS.max || new Set(names).size !== n) return d;
  const cells = typeof v.cells === "string" && v.cells.length === 1 << n && /^[01x]*$/.test(v.cells) ? v.cells : "0".repeat(1 << n);
  return { names, cells };
}

/** Saved JSON → inputs; anything unreadable falls back to the defaults, field by field. */
export function loadInputs(raw: string | null): CalcInputs {
  const d = DEFAULT_INPUTS;
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return d;
  }
  if (!isObj(data) || data.v !== 1 || !isObj(data.inputs)) return d;
  const i = data.inputs;
  const bases = isObj(i.bases) ? i.bases : {};
  const signed = isObj(i.signed) ? i.signed : {};
  const float = isObj(i.float) ? i.float : {};
  const boolean = isObj(i.boolean) ? i.boolean : {};
  return {
    bases: {
      text: str(bases.text, d.bases.text),
      base: oneOf(bases.base, [2, 8, 10, 16] as const, d.bases.base),
      width: oneOf(bases.width, [0, 8, 16, 32, 64] as const, d.bases.width),
    },
    signed: { text: str(signed.text, d.signed.text), width: oneOf(signed.width, [4, 8, 16, 32, 64] as const, d.signed.width) },
    float: { text: str(float.text, d.float.text), format: oneOf(float.format, ["32", "64"] as const, d.float.format) },
    boolean: { text: str(boolean.text, d.boolean.text) },
    kmap: kmap(i.kmap, d.kmap),
  };
}

export const saveInputs = (inputs: CalcInputs): string => JSON.stringify({ v: 1, inputs });

interface CalcState {
  inputs: CalcInputs;
  set<K extends keyof CalcInputs>(key: K, value: CalcInputs[K]): void;
  replace(inputs: CalcInputs): void;
}

export const useCalc = create<CalcState>()((set) => ({
  inputs: DEFAULT_INPUTS,
  set: (key, value) => set((s) => ({ inputs: { ...s.inputs, [key]: value } })),
  replace: (inputs) => set({ inputs }),
}));

// Restore once per page load: with cacheComponents, leaving /calc hides the pages
// (<Activity>) and their effects run again on return.
let restored = false;

/** Restore saved inputs once, then save (debounced) whenever they change. */
export function useCalcPersistence(): void {
  useEffect(() => {
    if (!restored) {
      restored = true;
      try {
        const raw = localStorage.getItem(CALC_KEY);
        if (raw !== null) useCalc.getState().replace(loadInputs(raw));
      } catch {
        // Blocked storage: keep the defaults.
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      try {
        localStorage.setItem(CALC_KEY, saveInputs(useCalc.getState().inputs));
      } catch {
        // Storage full or blocked; nothing to do.
      }
    };
    const unsubscribe = useCalc.subscribe((s, prev) => {
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
