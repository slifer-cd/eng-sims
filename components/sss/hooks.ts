"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { ParseResult } from "@/lib/sss/expr/ast";
import { parse } from "@/lib/sss/expr/parse";
import { type C, cadd, ZERO } from "@/lib/sss/math/complex";
import { type Analysis, analyze, type Domain } from "@/lib/sss/signal/analyze";
import { sigEval } from "@/lib/sss/signal/signal";
import { specialsEval } from "@/lib/sss/signal/special";
import type { ExprInput } from "@/lib/sss/store";

export interface AnalysisState {
  parsed: ParseResult;
  /** The analysis of the current text, or null while it doesn't parse. */
  analysis: Analysis | null;
  /** The latest usable analysis (kept while the user is mid-edit). */
  shown: Analysis | null;
  /** True when `shown` is from an earlier text. */
  stale: boolean;
}

/** Parse and analyse an input, deferred so typing stays responsive. */
export function useAnalysis(input: ExprInput, domain: Domain): AnalysisState {
  const text = useDeferredValue(input.text);
  const params = useDeferredValue(input.params);
  const parsed = useMemo(() => parse(text, { variable: domain === "dt" ? "n" : "t" }), [text, domain]);
  const analysis = useMemo(() => (parsed.ok ? analyze(parsed.ast, params, domain) : null), [parsed, params, domain]);
  const usable = analysis && analysis.kind !== "error" ? analysis : null;
  const [last, setLast] = useState<Analysis | null>(usable);
  if (usable && usable !== last) setLast(usable);
  const shown = usable ?? last;
  return { parsed, analysis, shown, stale: shown !== null && shown !== usable };
}

/** x(t) for readouts: the exact value when there is one. */
export function valueAt(an: Analysis, t: number): C {
  if (an.kind === "exact") {
    const v = sigEval(an.signal, t);
    return an.special.length ? cadd(v, specialsEval(an.special, t)) : v;
  }
  if (an.kind === "numeric") return an.f(t);
  return ZERO;
}

/** True when the signal takes complex values somewhere (so Im must be shown too). */
export function isComplexValued(an: Analysis, range: [number, number]): boolean {
  if (an.kind === "error") return false;
  const [a, b] = range;
  for (let i = 0; i <= 64; i++) {
    const v = valueAt(an, a + ((b - a) * (i + 0.31)) / 64.5);
    if (Math.abs(v.im) > 1e-9 * Math.max(1, Math.abs(v.re))) return true;
  }
  return false;
}
