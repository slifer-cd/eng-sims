import { describe, expect, it } from "vitest";
import { parse } from "../expr/parse";
import { cx } from "../math/complex";
import { sigEval } from "../signal/signal";
import { close, sig } from "../test-utils";
import { parseSExpr } from "./inverse";
import { laplace } from "./laplace";
import { sexprEval, sexprMul } from "./sdomain";
import { analyzeSystem, bode, systemOutput } from "./system";

function H(text: string) {
  const p = parse(text, { variable: "s" });
  if (!p.ok) throw new Error(p.error.message);
  const r = parseSExpr(p.ast, {});
  if (!r.ok) throw new Error(r.message);
  return analyzeSystem(r.X);
}

describe("LTI system", () => {
  it("first-order low-pass", () => {
    const sys = H("1/(s+1)");
    expect(sys.stable).toBe(true);
    const b = bode(sys, [1]);
    close(b.db[0], -10 * Math.log10(2));
    close(b.phase[0], -Math.PI / 4);
    close(sigEval(sys.step.signal, 1), 1 - Math.exp(-1));
    close(sigEval(sys.impulse.signal, 1), Math.exp(-1));
    expect(sys.dcGain).toBeCloseTo(1);
  });

  it("detects instability", () => {
    expect(H("1/(s-1)").stable).toBe(false);
    expect(H("1/s").marginal).toBe(true);
  });

  it("output for a step input equals the step response", () => {
    const sys = H("1/(s+1)");
    const out = systemOutput(sys, laplace(sig("u(t)") as never));
    if ("error" in out) throw new Error(out.error);
    for (const t of [0.5, 2]) close(sigEval(out.signal, t), sigEval(sys.step.signal, t));
  });

  it("multiplies s-expressions into partial fractions", () => {
    const a = H("1/(s+1)").H;
    const b = H("1/(s+2)").H;
    const p = sexprMul(a, b);
    expect(p[0].fracs.map((f) => [f.pole.re, f.coefs[0].re])).toEqual([
      [-2, -1],
      [-1, 1],
    ]);
    close(sexprEval(p, cx(1)), 1 / 6);
  });
});
