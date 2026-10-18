import { describe, expect, it } from "vitest";
import { cabs, cdiv, cexp, cmul, cpow, csub, cx, J } from "./complex";
import { nice, niceC, rationalize } from "./nice";
import { fft, integrate } from "./numeric";
import { findRoots, pdivmod, peval, pfromRoots, pmul, ptaylor, seriesDiv } from "./poly";

const real = (xs: number[]) => xs.map((x) => cx(x));

describe("complex", () => {
  it("does basic arithmetic", () => {
    expect(cmul(cx(1, 2), cx(3, -1))).toEqual(cx(5, 5));
    const q = cdiv(cx(5, 5), cx(3, -1));
    expect(q.re).toBeCloseTo(1);
    expect(q.im).toBeCloseTo(2);
    const e = cexp(cx(0, Math.PI / 2));
    expect(e.re).toBeCloseTo(0);
    expect(e.im).toBeCloseTo(1);
    expect(cpow(J, 2).re).toBeCloseTo(-1);
  });
});

describe("nice", () => {
  it("recognises common exact forms", () => {
    expect(nice(0.5).tex).toBe("\\frac{1}{2}");
    expect(nice(-1 / 3).tex).toBe("-\\frac{1}{3}");
    expect(nice(3).tex).toBe("3");
    expect(nice(Math.PI / 2).tex).toBe("\\frac{\\pi}{2}");
    expect(nice(2 / Math.PI).tex).toBe("\\frac{2}{\\pi}");
    expect(nice(Math.exp(-1)).tex).toBe("e^{-1}");
    expect(nice(Math.SQRT2 / 2).tex).toBe("\\frac{\\sqrt{2}}{2}");
    expect(nice(2 * Math.PI).tex).toBe("2\\pi");
  });

  it("rounds values with no exact form", () => {
    const n = nice(0.1234321);
    expect(n.text).toBe("0.1234");
    expect(n.exact).toBe(false);
  });

  it("formats complex numbers", () => {
    expect(niceC(cx(0, -1 / Math.PI)).tex).toBe("-\\frac{j}{\\pi}");
    expect(niceC(cx(1, 2)).tex).toBe("1+2j");
    expect(niceC(cx(0, 1)).tex).toBe("j");
  });

  it("rationalizes", () => {
    expect(rationalize(0.75)).toEqual([3, 4]);
    expect(rationalize(Math.PI)).toBeNull();
  });
});

describe("polynomials", () => {
  it("finds repeated and complex roots", () => {
    // (s+1)^2 (s^2 + 2s + 5)
    const p = pmul(pfromRoots(real([-1, -1])), real([5, 2, 1]));
    const roots = findRoots(p).sort((a, b) => a.p.im - b.p.im);
    expect(roots).toHaveLength(3);
    const double = roots.find((r) => r.mult === 2)!;
    expect(double.p.re).toBeCloseTo(-1, 9);
    expect(double.p.im).toBe(0);
    const complexRoots = roots.filter((r) => r.mult === 1);
    expect(complexRoots.map((r) => [r.p.re, r.p.im])).toEqual([
      [-1, -2],
      [-1, 2],
    ]);
  });

  it("finds roots at zero exactly", () => {
    const roots = findRoots(real([0, 0, 1, 1]));
    expect(roots.find((r) => r.p.re === 0 && r.p.im === 0)?.mult).toBe(2);
  });

  it("divides", () => {
    const { q, r } = pdivmod(real([1, 0, 1]), real([1, 1]));
    expect(q.map((c) => c.re)).toEqual([-1, 1]);
    expect(r.map((c) => c.re)).toEqual([2]);
  });

  it("takes Taylor coefficients", () => {
    expect(ptaylor(real([0, 0, 0, 1]), cx(1)).map((c) => c.re)).toEqual([1, 3, 3, 1]);
  });

  it("divides power series", () => {
    // 1 / (1 - h) = 1 + h + h^2 + ...
    expect(seriesDiv(real([1]), real([1, -1]), 4).map((c) => c.re)).toEqual([1, 1, 1, 1]);
  });

  it("evaluates", () => {
    const v = peval(real([1, 2, 3]), cx(0, 1));
    expect(cabs(csub(v, cx(-2, 2)))).toBeLessThan(1e-12);
  });
});

describe("numeric", () => {
  it("integrates over infinite ranges", () => {
    expect(integrate((t) => Math.exp(-t), 0, Infinity)).toBeCloseTo(1, 8);
    expect(integrate((t) => Math.exp(-t * t), -Infinity, Infinity)).toBeCloseTo(Math.sqrt(Math.PI), 8);
    expect(integrate((t) => (t < 1 ? 1 : 0), 0, 3)).toBeCloseTo(1, 6);
  });

  it("FFTs an impulse to all ones", () => {
    const re = new Float64Array(8);
    const im = new Float64Array(8);
    re[0] = 1;
    fft(re, im);
    expect(Array.from(re)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    fft(re, im, true);
    expect(re[0]).toBeCloseTo(1);
    expect(re[1]).toBeCloseTo(0);
  });
});
