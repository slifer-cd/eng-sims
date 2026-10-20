/** A pivot this small next to the rest of its row means the system has no unique solution. */
const SINGULAR = 1e-14;

export class SingularMatrixError extends Error {
  /** The unknown (matrix column) that could not be solved for. */
  constructor(readonly column: number) {
    super(`Singular matrix at column ${column}`);
  }
}

/**
 * Dense LU factorisation with partial pivoting, for the small systems of a circuit.
 * Factor once, then solve for as many right-hand sides as needed.
 */
export class LU {
  private lu: Float64Array;
  private perm: Int32Array;
  private rowMax: Float64Array;

  constructor(readonly n: number) {
    this.lu = new Float64Array(n * n);
    this.perm = new Int32Array(n);
    this.rowMax = new Float64Array(n);
  }

  /** Factor the row-major n×n matrix `a` (not modified). Throws SingularMatrixError. */
  factor(a: Float64Array) {
    const { n, lu, perm, rowMax } = this;
    lu.set(a);
    for (let i = 0; i < n; i++) {
      perm[i] = i;
      let m = 0;
      for (let j = 0; j < n; j++) m = Math.max(m, Math.abs(lu[i * n + j]));
      rowMax[i] = m;
    }
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(lu[i * n + k]) > Math.abs(lu[p * n + k])) p = i;
      if (!(Math.abs(lu[p * n + k]) > SINGULAR * rowMax[p])) throw new SingularMatrixError(k);
      if (p !== k) {
        for (let j = 0; j < n; j++) {
          const t = lu[k * n + j];
          lu[k * n + j] = lu[p * n + j];
          lu[p * n + j] = t;
        }
        [perm[k], perm[p]] = [perm[p], perm[k]];
        [rowMax[k], rowMax[p]] = [rowMax[p], rowMax[k]];
      }
      const pivot = lu[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = (lu[i * n + k] /= pivot);
        if (f === 0) continue;
        for (let j = k + 1; j < n; j++) lu[i * n + j] -= f * lu[k * n + j];
      }
    }
  }

  /** Solve A·x = b with the last factorisation. */
  solve(b: Float64Array): Float64Array {
    const { n, lu, perm } = this;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = b[perm[i]];
      for (let j = 0; j < i; j++) s -= lu[i * n + j] * x[j];
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * x[j];
      x[i] = s / lu[i * n + i];
    }
    return x;
  }
}
