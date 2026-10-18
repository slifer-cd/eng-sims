import { describe, expect, it } from "vitest";
import { cx } from "../math/complex";
import { an, close, samplePoints, sig } from "../test-utils";
import { epConst, epEval, epIntegral, epPoly, epVar } from "./exppoly";
import {
  sigAdd,
  sigBreaks,
  sigCompose,
  sigDeriv,
  sigEval,
  sigIsReal,
  sigMul,
  sigPiece,
} from "./signal";
import { specialEval } from "./special";

describe("exp-polynomials", () => {
  it("integrates, including tiny exponents and infinite bounds", () => {
    close(epIntegral([{ rate: cx(-1), poly: [cx(1)] }], 0, Infinity), 1);
    close(epIntegral([{ rate: cx(0, 1e-12), poly: [cx(1)] }], -0.5, 0.5), 1);
    close(epIntegral([{ rate: cx(-2), poly: [cx(0), cx(1)] }], 0, Infinity), 0.25);
    expect(Number.isNaN(epIntegral(epConst(1), 0, Infinity).re)).toBe(true);
    expect(Number.isNaN(epIntegral([{ rate: cx(0, 1), poly: [cx(1)] }], 0, Infinity).re)).toBe(true);
  });

  it("evaluates", () => {
    close(epEval(epPoly([cx(1), cx(2)]), 3), 7);
    close(epEval(epVar(), 2), 2);
  });
});

describe("signal algebra", () => {
  it("normalizes u(t) - u(t-1) + u(t-1) to one piece", () => {
    const s = sig("u(t) - u(t-1) + u(t-1)").signal;
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0].from).toBe(0);
    expect(s.pieces[0].to).toBe(Infinity);
  });

  it("composes with a negative scale", () => {
    const s = sigCompose(sigPiece(0, 1, epVar()), -2, 1); // x(1 - 2t)
    expect(s.pieces[0].from).toBe(0);
    expect(s.pieces[0].to).toBe(0.5);
    close(sigEval(s, 0.25), 0.5);
  });

  it("differentiates jumps into impulses", () => {
    const d = sigDeriv(sig("u(t) - u(t-1)").signal);
    expect(d.pieces).toHaveLength(0);
    expect(d.impulses.map((i) => [i.at, i.area.re, i.order])).toEqual([
      [0, 1, 0],
      [1, -1, 0],
    ]);
  });

  it("multiplies pointwise", () => {
    const a = sig("e^(-t)u(t) + rect(t)").signal;
    const b = sig("cos(3t) + t").signal;
    const p = sigMul(a, b);
    for (const t of samplePoints(-3, 5, 40, [...sigBreaks(a), ...sigBreaks(b)])) {
      close(sigEval(p, t), cx(sigEval(a, t).re * sigEval(b, t).re, 0), 1e-9);
    }
    const s = sigAdd(a, b);
    close(sigEval(s, 0.2), sigEval(a, 0.2).re + sigEval(b, 0.2).re);
  });

  it("knows when a signal is real", () => {
    expect(sigIsReal(sig("cos(2t)u(t)").signal)).toBe(true);
    expect(sigIsReal(sig("e^(j t)").signal)).toBe(false);
  });
});

describe("analyze", () => {
  const exact = [
    "rect(t)",
    "tri(2t-1)",
    "e^(-|t|)",
    "|t^2-1|",
    "r(t) - 2r(t-1) + r(t-2)",
    "sgn(t)",
    "cos(3t)u(t)",
    "2^t u(-t)",
    "e^(-2t)u(t)",
    "t^2 e^(-t) u(t)",
    "sin(2pi t + 1)",
    "sinh(t)u(-t)",
    "cosh(t/2)rect(t/4)",
    "e^(-t)sin(2t)u(t)",
    "u(t)-u(t-1)",
    "3e^(-|t|/2)",
    "rect((t-1)/2) - tri(t)",
    "(t+1)^3 rect(t)",
    "e^(2t)/e^(t)",
    "u(-t+2) u(t+2)",
    "tri(t/3)cos(5t)",
    "(1-e^(-t))u(t)",
    "e^(-at)u(t)",
    "e^(j 2 t)",
    "abs(t-1) rect(t)",
  ];
  it.each(exact)("evaluates %s exactly", (text) => {
    const a = sig(text, { a: 1.5 });
    const breaks = sigBreaks(a.signal);
    for (const t of samplePoints(-6, 6, 40, breaks)) {
      close(sigEval(a.signal, t), a.f(t), 1e-9, `${text} at t=${t}`);
    }
  });

  it("scales impulses", () => {
    const s = sig("delta(2t-2)").signal;
    expect(s.impulses).toHaveLength(1);
    expect(s.impulses[0].at).toBe(1);
    close(s.impulses[0].area, 0.5);
  });

  it("sifts at a jump with the midpoint value", () => {
    const s = sig("u(t)delta(t)").signal;
    close(s.impulses[0].area, 0.5);
  });

  it("rejects impulse products and impulses in numeric expressions", () => {
    expect(an("delta(t)delta(t)").kind).toBe("error");
    expect(an("delta(t) log(t+2)").kind).toBe("error");
    expect(an("delta(3)").kind).toBe("error");
  });

  it("falls back to numeric with a reason", () => {
    const a = an("1/(1+t^2)");
    expect(a.kind).toBe("numeric");
    if (a.kind === "numeric") expect(a.reason).toMatch(/numerically/);
    expect(an("u(sin(t))").kind).toBe("numeric");
  });

  it("keeps sinc and Gaussians as table terms", () => {
    const a = sig("sinc(2t)cos(5t)");
    expect(a.special).toHaveLength(2);
    close(
      specialEval(a.special[0], 0.3).re + specialEval(a.special[1], 0.3).re,
      (Math.sin(Math.PI * 0.6) / (Math.PI * 0.6)) * Math.cos(1.5),
    );
    const g = sig("e^(-t^2 + 2t)");
    expect(g.special[0].kind).toBe("gauss");
    close(specialEval(g.special[0], 0.7), Math.exp(-0.49 + 1.4));
    expect(sig("sinc(t)^2").special[0].kind).toBe("sinc2");
  });

  it("builds discrete sequences on integers", () => {
    const s = sig("u(-n)", {}, "dt").signal;
    expect(s.pieces[0].to).toBe(1); // n ≤ 0 includes n = 0
    const d = sig("delta(n-2)", {}, "dt").signal;
    expect(d.pieces[0]).toMatchObject({ from: 2, to: 3 });
    const g = sig("(-0.5)^n u(n)", {}, "dt");
    close(sigEval(g.signal, 3), -0.125);
  });
});
