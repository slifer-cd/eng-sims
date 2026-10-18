import { describe, expect, it } from "vitest";
import { type C, cexp, cmul, cscale, cx } from "../math/complex";
import { close, num, sig } from "../test-utils";
import { sigEval } from "../signal/signal";
import { fourier } from "./fourier";
import { laplace } from "./laplace";
import { sexprEval } from "./sdomain";

/** ∫ x(t) e^{−st} dt numerically over the pieces, plus impulses. */
function numericLaplace(text: string, s: C): C {
  const a = sig(text);
  let acc = cx(0);
  for (const p of a.signal.pieces) {
    const v = num((t) => cmul(sigEval(a.signal, t), cexp(cscale(s, -t))), Math.max(p.from, -200), Math.min(p.to, 200));
    acc = { re: acc.re + v.re, im: acc.im + v.im };
  }
  for (const i of a.signal.impulses) {
    const v = cmul(i.area, cexp(cscale(s, -i.at)));
    acc = { re: acc.re + v.re, im: acc.im + v.im };
  }
  return acc;
}

const L = (text: string) => laplace(sig(text) as never);

describe("laplace", () => {
  const cases: [string, C[]][] = [
    ["e^(-2t)u(t)", [cx(1), cx(0, 2), cx(-1, 1)]],
    ["u(t)-u(t-1)", [cx(1), cx(-2, 3), cx(0.5, -1)]],
    ["e^(-|t|)", [cx(0.5), cx(0, 1), cx(-0.5, 2)]],
    ["t e^(-t)u(t)", [cx(1), cx(0, 3)]],
    ["sin(3t)u(t)", [cx(1), cx(2, 1)]],
    ["tri(t-1) + 2rect(t/2)", [cx(1), cx(-3, 2)]],
    ["e^(t)u(-t)", [cx(0), cx(0.5, 1)]],
    ["(t^2 - 1)e^(-t/2)cos(2t)u(t-1)", [cx(1), cx(0, 1)]],
  ];
  it.each(cases)("matches numeric integration for %s", (text, points) => {
    const r = L(text);
    for (const s of points) {
      close(r.at(s), numericLaplace(text, s), 1e-6, `${text} at s=${s.re}+${s.im}j (direct)`);
      close(sexprEval(r.X, s), numericLaplace(text, s), 1e-6, `${text} at s=${s.re}+${s.im}j (formula)`);
    }
  });

  it("finds the ROC, poles and zeros", () => {
    const a = L("e^(-2t)u(t)");
    expect(a.tex).toBe("\\frac{1}{s+2}");
    expect(a.roc).toEqual({ lo: -2, hi: Infinity });
    expect(a.poles).toEqual([{ p: cx(-2), mult: 1 }]);
    const b = L("u(t)-u(t-1)");
    expect(b.tex).toBe("\\frac{1-e^{-s}}{s}");
    expect(b.roc).toEqual({ lo: -Infinity, hi: Infinity });
    expect(b.poles).toEqual([]);
    const c = L("e^(-|t|)");
    expect(c.roc).toEqual({ lo: -1, hi: 1 });
    close(c.at(cx(0.5)), 2 / 0.75);
    expect(L("t e^(-t)u(t)").poles).toEqual([{ p: cx(-1), mult: 2 }]);
    expect(L("sin(3t)u(t)").tex).toBe("\\frac{3}{s^{2}+9}");
    expect(L("delta(t-2)").tex).toBe("e^{-2s}");
    expect(L("1").roc).toBeNull();
    const z = L("(s+3)"); // not a time signal: s is a parameter here
    expect(z.X).toBeDefined();
  });

  it("writes shifted exponentials compactly", () => {
    expect(L("e^(-t)(u(t)-u(t-1))").tex).toBe("\\frac{1-e^{-(s+1)}}{s+1}");
    expect(L("e^(-(t-1))u(t-1)").tex).toBe("\\frac{e^{-s}}{s+1}");
  });

  it("stays finite for extreme values", () => {
    const r = L("e^(-500t)u(t-3)");
    const v = r.at(cx(1));
    expect(Number.isFinite(v.re)).toBe(true);
  });
});

describe("fourier", () => {
  const F = (text: string) => {
    const r = fourier(sig(text));
    if (r.kind !== "exact") throw new Error(`${text}: ${r.kind}`);
    return r;
  };

  it("transforms pulses with trig simplification", () => {
    const r = F("rect(t)");
    close(r.at(Math.PI), 2 / Math.PI);
    close(r.at(0), 1);
    expect(r.tex).toBe("\\frac{2\\sin(\\frac{\\omega}{2})}{\\omega}");
    const t = F("tri(t)");
    close(t.at(1), 2 - 2 * Math.cos(1));
  });

  it("adds impulses for undamped tails", () => {
    const u = F("u(t)");
    expect(u.impulses).toHaveLength(1);
    close(u.impulses[0].area, Math.PI);
    close(u.at(2), cx(0, -0.5));
    const c = F("cos(2t)");
    expect(c.impulses.map((i) => [i.at, i.area.re])).toEqual([
      [-2, Math.PI],
      [2, Math.PI],
    ]);
    const r = F("t u(t)");
    expect(r.impulses[0]).toMatchObject({ at: 0, order: 1 });
    close(r.impulses[0].area, cx(0, Math.PI));
    const one = F("1");
    close(one.impulses[0].area, 2 * Math.PI);
    const sin = F("sin(t)");
    expect(sin.tex).toBe("j\\pi\\delta(\\omega+1)-j\\pi\\delta(\\omega-1)");
    // Only impulses: the regular part is exactly 0, not rounding noise (which plots as a random phase).
    for (const w of [0.3, 0.7, 0.999, 1.5, 4]) expect(sin.at(w)).toEqual(cx(0));
    // 1/s² at s = jω is 1/(jω)² = −1/ω², not 1/(jω²).
    expect(r.tex).toBe("\\frac{1}{(j\\omega)^{2}}+j\\pi\\delta'(\\omega)");
    expect(F("e^(j pi t/2)u(t)").tex).toBe("\\frac{1}{j\\omega-\\frac{j\\pi}{2}}+\\pi\\delta(\\omega-\\frac{\\pi}{2})");
  });

  it("has no transform for growing signals", () => {
    expect(fourier(sig("e^t u(t)")).kind).toBe("none");
  });

  it("uses the table for sinc and Gaussians", () => {
    const s = F("sinc(t)");
    close(s.at(1), 1);
    close(s.at(4), 0);
    close(F("e^(-t^2)").at(0), Math.sqrt(Math.PI));
  });

  it("gives magnitude and phase formulas", () => {
    const r = F("e^(-2t)u(t)");
    expect(r.magPhase?.mag).toBe("\\frac{1}{\\sqrt{\\omega^{2}+4}}");
    expect(r.magPhase?.phase).toBe("-\\tan^{-1}\\!\\left(\\frac{\\omega}{2}\\right)");
  });

  it("computes numeric transforms", () => {
    const r = fourier({ kind: "numeric", f: (t) => cx(1 / (1 + t * t)), reason: "" });
    if (r.kind !== "numeric") throw new Error();
    close(r.at(1), Math.PI * Math.exp(-1), 1e-2);
  });
});
