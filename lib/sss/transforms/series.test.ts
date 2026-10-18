import { describe, expect, it } from "vitest";
import { cx } from "../math/complex";
import { an, close } from "../test-utils";
import { fourierSeries, numericSeries } from "./series";

const fs = (text: string, T: number, t0 = 0) => fourierSeries(an(text), T, t0);

describe("Fourier series", () => {
  it("square wave", () => {
    const r = fs("u(t) - u(t-1)", 2);
    close(r.coef(0), 0.5);
    close(r.coef(1), cx(0, -1 / Math.PI));
    close(r.coef(2), 0);
    close(r.coef(-3), cx(0, 1 / (3 * Math.PI)));
    close(r.power, 0.5);
    expect(r.tex?.ck).toContain("(-1)^{k}");
    expect(r.tex?.special).toEqual([{ k: 0, tex: "\\frac{1}{2}" }]);
    expect(r.tex?.trig?.bk).toBe("\\frac{1-(-1)^{k}}{\\pi k}");
    expect(r.tex?.trig?.ak).toBe("0");
  });

  it("sawtooth", () => {
    const r = fs("t", 1);
    close(r.coef(1), cx(0, 1 / (2 * Math.PI)));
    close(r.coef(3), cx(0, 1 / (6 * Math.PI)));
    close(r.coef(0), 0.5);
  });

  it("full-wave rectified sine", () => {
    const r = fs("sin(pi t)", 1);
    for (const k of [0, 1, 2, -3]) close(r.coef(k), 2 / (Math.PI * (1 - 4 * k * k)));
  });

  it("impulse train", () => {
    const r = fs("delta(t)", 1, -0.5);
    for (const k of [0, 1, 5]) close(r.coef(k), 1);
  });

  it("resonant harmonics", () => {
    const r = fs("cos(2 pi t)", 1);
    close(r.coef(1), 0.5);
    close(r.coef(-1), 0.5);
    close(r.coef(2), 0);
    expect(r.tex?.special.map((s) => s.k)).toEqual([-1, 1]);
  });

  it("exponential in each period", () => {
    const r = fs("e^(-t)", 1);
    // (1 − e^{−1}) / (1 + j4π)
    const d = 1 + 16 * Math.PI * Math.PI;
    close(r.coef(2), cx((1 - Math.exp(-1)) / d, (-(1 - Math.exp(-1)) * 4 * Math.PI) / d));
    expect(r.tex?.ck).toBe("\\frac{1-e^{-1}}{1+j2\\pi k}");
  });

  it("matches the FFT fallback", () => {
    const a = an("u(t) - u(t-1)");
    const exact = fourierSeries(a, 2, 0);
    const numeric = numericSeries(a.kind === "exact" ? a.f : () => cx(0), 2, 0, "");
    for (const k of [0, 1, 3, -5]) close(numeric.coef(k), exact.coef(k), 1e-3);
  });

  it("stays finite for tiny periods", () => {
    const r = fs("t", 1e-3);
    expect(Number.isFinite(r.coef(1).re)).toBe(true);
    expect(Number.isFinite(r.coef(1).im)).toBe(true);
  });
});

