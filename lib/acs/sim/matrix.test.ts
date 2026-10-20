import { describe, expect, it } from "vitest";
import { LU, SingularMatrixError } from "./matrix";

const mat = (rows: number[][]) => Float64Array.from(rows.flat());

describe("LU", () => {
  it("solves a system that needs row swaps", () => {
    // A zero on the first diagonal forces partial pivoting.
    const lu = new LU(3);
    lu.factor(mat([[0, 2, 1], [1, 1, 1], [2, 1, 3]]));
    const x = lu.solve(Float64Array.from([5, 4, 7]));
    expect([...x].map((v) => +v.toFixed(12))).toEqual([1, 2, 1].map((v) => +v.toFixed(12)));
  });

  it("reuses one factorisation for many right-hand sides", () => {
    const lu = new LU(2);
    lu.factor(mat([[4, 1], [2, 3]]));
    expect([...lu.solve(Float64Array.from([5, 5]))].map((v) => +v.toFixed(12))).toEqual([1, 1]);
    expect([...lu.solve(Float64Array.from([1, 3]))].map((v) => +v.toFixed(12))).toEqual([0, 1]);
  });

  it("leaves the input matrix untouched", () => {
    const a = mat([[2, 1], [1, 3]]);
    new LU(2).factor(a);
    expect([...a]).toEqual([2, 1, 1, 3]);
  });

  it("reports the unknown it cannot solve for", () => {
    // Two voltage sources fixing the same node at different voltages.
    const lu = new LU(3);
    let err: unknown;
    try {
      lu.factor(mat([[1e-12, 1, 1], [1, 0, 0], [1, 0, 0]]));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SingularMatrixError);
    expect((err as SingularMatrixError).column).toBeGreaterThanOrEqual(1);
  });

  it("accepts a tiny leak conductance as the only path to ground", () => {
    // A floating node held only by gmin next to a 1 kΩ resistor to a 1 V source.
    const g = 1e-3, gmin = 1e-12;
    const lu = new LU(3);
    lu.factor(mat([[g + gmin, -g, 0], [-g, g + gmin, 1], [0, 1, 0]]));
    const x = lu.solve(Float64Array.from([0, 0, 1]));
    expect(x[0]).toBeCloseTo(1, 6);
  });
});
