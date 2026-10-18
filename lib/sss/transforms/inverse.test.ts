import { describe, expect, it } from "vitest";
import { parse } from "../expr/parse";
import { cx } from "../math/complex";
import { sigEval } from "../signal/signal";
import { close, sig } from "../test-utils";
import { inverseLaplace, parseSExpr, rocStrips } from "./inverse";
import { laplace } from "./laplace";

function X(text: string, params: Record<string, number> = {}) {
  const p = parse(text, { variable: "s" });
  if (!p.ok) throw new Error(p.error.message);
  const r = parseSExpr(p.ast, params);
  if (!r.ok) throw new Error(r.message);
  return r;
}

const causal = (text: string) => {
  const r = X(text);
  const strips = rocStrips(r.poles);
  return inverseLaplace(r.X, strips[strips.length - 1]);
};

describe("inverse Laplace", () => {
  it("expands simple, repeated and complex poles", () => {
    close(sigEval(causal("1/((s+1)(s+2))").signal, 1), Math.exp(-1) - Math.exp(-2));
    expect(causal("1/((s+1)(s+2))").tex).toBe("\\left(e^{-t}-e^{-2t}\\right)u(t)");
    close(sigEval(causal("1/(s+1)^2").signal, 2), 2 * Math.exp(-2));
    const d = causal("1/(s^2+2s+5)");
    close(sigEval(d.signal, 0.5), 0.5 * Math.exp(-0.5) * Math.sin(1));
    expect(d.tex).toContain("\\sin(2t)");
  });

  it("turns improper parts into impulses", () => {
    const r = causal("s/(s+1)");
    expect(r.signal.impulses).toHaveLength(1);
    close(r.signal.impulses[0].area, 1);
    close(sigEval(r.signal, 1), -Math.exp(-1));
  });

  it("delays with e^(-sT)", () => {
    const r = causal("e^(-2s)/s");
    expect(r.tex).toBe("u(t-2)");
  });

  it("uses the chosen ROC", () => {
    const r = X("1/((s+1)(s-2))");
    const strips = rocStrips(r.poles);
    expect(strips).toEqual([
      { lo: -Infinity, hi: -1 },
      { lo: -1, hi: 2 },
      { lo: 2, hi: Infinity },
    ]);
    const two = inverseLaplace(r.X, strips[1]);
    close(sigEval(two.signal, -1), -Math.exp(-2) / 3);
    close(sigEval(two.signal, 1), -Math.exp(-1) / 3);
  });

  it("round-trips through the forward transform", () => {
    const a = sig("e^(-t)cos(2t)u(t) + 3 e^(-2(t-1))u(t-1)");
    const L = laplace(a as never);
    const back = inverseLaplace(L.X, L.roc!);
    for (const t of [0.3, 1.5, 2.7]) close(sigEval(back.signal, t), sigEval(a.signal, t), 1e-9);
  });

  it("reports unsupported input", () => {
    const p = parse("sin(s)", { variable: "s" });
    if (!p.ok) throw new Error();
    expect(parseSExpr(p.ast, {}).ok).toBe(false);
    expect(X("(s+3)/((s+1)(s+2))", {}).poles.map((r) => r.p.re)).toEqual([-2, -1]);
    void cx;
  });
});
