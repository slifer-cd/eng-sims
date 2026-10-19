import katex from "katex";
import { describe, expect, it } from "vitest";
import { FORMULAS, TRACES, tracePath } from "./backdrop";

/** The y of each sampled point in a path made of M/L commands, keyed by x. */
function samples(d: string): Map<number, number> {
  return new Map(
    d
      .slice(1)
      .split("L")
      .map((p) => p.split(",").map(Number) as [number, number]),
  );
}

describe("FORMULAS", () => {
  it.each(FORMULAS.map((f) => [f.tex]))("%s is valid TeX", (tex) => {
    expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
  });
});

describe("spots", () => {
  it("anchors each item to the top or the bottom of the page, not both", () => {
    for (const spot of [...FORMULAS, ...TRACES]) {
      expect((spot.top === undefined) !== (spot.bottom === undefined)).toBe(true);
    }
  });
});

describe("tracePath", () => {
  it("repeats every period, so the scroll can loop without a seam", () => {
    for (const trace of TRACES.filter((t) => t.kind !== "clock")) {
      const ys = samples(tracePath(trace, 2 * trace.period));
      for (const [x, y] of ys) {
        if (x + trace.period <= 2 * trace.period) expect(ys.get(x + trace.period)).toBeCloseTo(y, 1);
      }
    }
  });

  it("stays within the amplitude", () => {
    for (const trace of TRACES.filter((t) => t.kind !== "clock")) {
      for (const y of samples(tracePath(trace, trace.period)).values()) {
        expect(Math.abs(y)).toBeLessThanOrEqual(trace.amplitude);
      }
    }
  });

  it("draws the clock as a square wave, high for the first half period", () => {
    expect(tracePath({ kind: "clock", period: 120, amplitude: 10 }, 120)).toBe("M0,-10H60V10H120V-10");
  });
});
