import { describe, expect, it } from "vitest";
import { close, sig } from "../test-utils";
import { classify, energy, evenOdd, power, timeRange } from "./properties";
import { sigEval } from "./signal";

describe("properties", () => {
  it("computes energy", () => {
    close(energy(sig("e^(-t)u(t)").signal), 0.5);
    close(energy(sig("rect(t)").signal), 1);
    close(energy(sig("e^(-|t|)").signal), 1);
    expect(energy(sig("u(t)").signal)).toBe(Infinity);
    expect(energy(sig("delta(t)").signal)).toBe(Infinity);
  });

  it("computes average power", () => {
    close(power(sig("cos(t)").signal), 0.5);
    close(power(sig("u(t)").signal), 0.5);
    close(power(sig("2cos(t) + sin(3t)").signal), 2.5);
    close(power(sig("rect(t)").signal), 0);
    expect(power(sig("t u(t)").signal)).toBe(Infinity);
  });

  it("splits even and odd parts", () => {
    const { even, odd } = evenOdd(sig("u(t)").signal);
    close(sigEval(even, 2), 0.5);
    close(sigEval(even, -2), 0.5);
    close(sigEval(odd, -2), -0.5);
  });

  it("classifies", () => {
    expect(classify(sig("e^(-t)u(t)").signal)).toMatchObject({ causal: true, finiteDuration: false, real: true });
    expect(classify(sig("rect(t)").signal)).toMatchObject({ causal: false, finiteDuration: true, even: true });
    expect(classify(sig("sgn(t)").signal).odd).toBe(true);
  });

  it("frames the signal", () => {
    const [lo, hi] = timeRange(sig("e^(-2t)u(t)"));
    expect(lo).toBeLessThanOrEqual(-0.5);
    expect(hi).toBeGreaterThanOrEqual(3);
    const [a, b] = timeRange(sig("rect(t-5)"));
    expect(a).toBeLessThan(4.5);
    expect(b).toBeGreaterThan(5.5);
  });
});
