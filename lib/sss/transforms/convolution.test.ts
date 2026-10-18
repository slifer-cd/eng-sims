import { describe, expect, it } from "vitest";
import { cx } from "../math/complex";
import { sigEval } from "../signal/signal";
import { close, sig } from "../test-utils";
import { convolve, convolveNumeric } from "./convolution";

const conv = (a: string, b: string) => {
  const r = convolve(sig(a).signal, sig(b).signal);
  if (!r.ok) throw new Error(r.message);
  return r;
};
const at = (r: ReturnType<typeof conv>, t: number) => sigEval(r.y, t).re;

describe("convolution", () => {
  it("rect * rect = tri", () => {
    const r = conv("rect(t)", "rect(t)");
    close(at(r, 0), 1);
    close(at(r, 0.5), 0.5);
    close(at(r, -0.25), 0.75);
    close(at(r, 1.2), 0);
    expect(r.intervals.map((i) => [i.from, i.to])).toEqual([
      [-1, 0],
      [0, 1],
    ]);
  });

  it("exponentials and steps", () => {
    close(at(conv("e^(-t)u(t)", "u(t)"), 1), 1 - Math.exp(-1));
    close(at(conv("e^(-t)u(t)", "e^(-2t)u(t)"), 1), Math.exp(-1) - Math.exp(-2));
    close(at(conv("e^(-t)u(t)", "e^(-t)u(t)"), 2), 2 * Math.exp(-2));
    close(at(conv("u(t)", "u(t)"), 3), 3);
    close(at(conv("e^(-|t|)", "e^(-|t|)"), 1), 2 * Math.exp(-1));
    close(at(conv("e^(-|t|)", "e^(-|t|)"), -0.5), 1.5 * Math.exp(-0.5));
  });

  it("shifts with impulses", () => {
    const r = conv("tri(t)", "delta(t-2)");
    close(at(r, 2), 1);
    close(at(r, 2.5), 0.5);
    const d = conv("u(t)", "2delta(t) + delta(t-1)");
    close(at(d, 0.5), 2);
    close(at(d, 1.5), 3);
    const dd = conv("delta(t-1)", "delta(t+3)");
    expect(dd.y.impulses.map((i) => i.at)).toEqual([-2]);
  });

  it("reports divergence", () => {
    const r = convolve(sig("u(t)").signal, sig("1").signal);
    expect(r.ok).toBe(false);
  });

  it("agrees with sampled convolution", () => {
    const a = sig("e^(-t)u(t) + rect(t-1)");
    const b = sig("tri(t/2)cos(3t)");
    const exact = conv("e^(-t)u(t) + rect(t-1)", "tri(t/2)cos(3t)");
    const n = convolveNumeric(a.f, b.f, [-1, 12], [-2, 2], 4000);
    for (const t of [0.3, 1.7, 3.1]) {
      const k = n.t.findIndex((v) => v >= t);
      close(n.y[k], at(exact, n.t[k]), 2e-2);
    }
    void cx;
  });
});

describe("convolution display", () => {
  it("splits a coefficient like e − 1 over two shifts", async () => {
    const { texCases } = await import("../signal/format");
    const r = conv("e^(-t)u(t)", "rect(t - 1/2)");
    expect(texCases(r.y)).toContain("e^{-(t-1)}-e^{-t}");
  });
});
