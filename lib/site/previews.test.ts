import { describe, expect, it } from "vitest";
import { halfAdder, squareWaveIdealPath, squareWavePath, squareWaveSum } from "./previews";

describe("halfAdder", () => {
  it("adds two bits", () => {
    expect(halfAdder(false, false)).toEqual({ sum: false, carry: false });
    expect(halfAdder(true, false)).toEqual({ sum: true, carry: false });
    expect(halfAdder(false, true)).toEqual({ sum: true, carry: false });
    expect(halfAdder(true, true)).toEqual({ sum: false, carry: true });
  });
});

describe("squareWaveSum", () => {
  it("is the fundamental alone for one term", () => {
    expect(squareWaveSum(0.25, 1)).toBeCloseTo(4 / Math.PI);
    expect(squareWaveSum(0.1, 1)).toBeCloseTo((4 / Math.PI) * Math.sin(2 * Math.PI * 0.1));
  });

  it("adds only odd harmonics", () => {
    const t = 0.1;
    const term = (k: number) => (4 / Math.PI) * (Math.sin(2 * Math.PI * k * t) / k);
    expect(squareWaveSum(t, 3)).toBeCloseTo(term(1) + term(3) + term(5));
  });

  it("fades the next harmonic in for a fractional term count", () => {
    const t = 0.1;
    const term3 = (4 / Math.PI) * (Math.sin(2 * Math.PI * 3 * t) / 3);
    expect(squareWaveSum(t, 1.5)).toBeCloseTo(squareWaveSum(t, 1) + 0.5 * term3);
  });

  it("approaches the square wave as terms are added", () => {
    expect(squareWaveSum(0.25, 200)).toBeCloseTo(1, 2);
    expect(squareWaveSum(0.75, 200)).toBeCloseTo(-1, 2);
    expect(squareWaveSum(0, 200)).toBeCloseTo(0);
  });
});

describe("squareWavePath", () => {
  const box = { width: 300, height: 100, periods: 2, samples: 120 };

  it("draws one point per sample across the full width", () => {
    const d = squareWavePath(5, box);
    const points = d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g)!;
    expect(d.startsWith("M")).toBe(true);
    expect(points).toHaveLength(box.samples + 1);
    expect(points[0]).toBe("0.00,50.00");
    expect(points.at(-1)!.startsWith("300.00,")).toBe(true);
  });

  it("draws the ideal wave at the level the sum converges to", () => {
    // Sample 1 of 8 over two periods is t = 1/4, the middle of the first high half.
    const nearHigh = Number(squareWavePath(400, { ...box, samples: 8 }).match(/L[\d.]+,([\d.]+)/)![1]);
    const d = squareWaveIdealPath(box);
    const high = Number(d.match(/^M0\.00,([\d.]+)/)![1]);
    expect(high).toBeCloseTo(nearHigh, 0);
    expect(high).toBeCloseTo(box.height - Number(d.match(/V([\d.]+)/)![1]));
    expect(d.endsWith("H300.00")).toBe(true);
  });

  it("keeps the Gibbs overshoot inside the box", () => {
    const ys = squareWavePath(9, box)
      .match(/,(-?\d+(\.\d+)?)/g)!
      .map((s) => Number(s.slice(1)));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(box.height);
  });
});
