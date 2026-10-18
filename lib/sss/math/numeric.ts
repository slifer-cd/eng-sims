/*
 * Numeric helpers: adaptive quadrature (also used by tests to check every exact result)
 * and an in-place radix-2 FFT for the numeric fallbacks.
 */

// 7-point Gauss / 15-point Kronrod nodes and weights on [-1, 1].
const XK = [
  0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691,
  0.405845151377397, 0.207784955007898, 0,
];
const WK = [
  0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267,
  0.190350578064785, 0.204432940075298, 0.209482141084728,
];
const WG = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];

function gk15(f: (x: number) => number, a: number, b: number): [number, number] {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  let k = fc * WK[7];
  let g = fc * WG[3];
  for (let i = 0; i < 7; i++) {
    const dx = h * XK[i];
    const f1 = f(c - dx);
    const f2 = f(c + dx);
    k += WK[i] * (f1 + f2);
    if (i % 2 === 1) g += WG[(i - 1) / 2] * (f1 + f2);
  }
  return [k * h, Math.abs((k - g) * h)];
}

/** Adaptive bisection with a global budget, so a nasty integrand can't hang the page. */
function adaptive(f: (x: number) => number, a: number, b: number, tol: number, depth: number): number {
  let budget = 4000;
  const go = (a: number, b: number, tol: number, depth: number): number => {
    const [val, err] = gk15(f, a, b);
    budget--;
    if (depth <= 0 || err <= tol || budget <= 0 || !Number.isFinite(val)) return val;
    const m = (a + b) / 2;
    return go(a, m, tol / 2, depth - 1) + go(m, b, tol / 2, depth - 1);
  };
  return go(a, b, tol, depth);
}

/** ∫_a^b f. Infinite bounds are mapped onto finite ones (t = a + u/(1-u)). */
export function integrate(f: (x: number) => number, a: number, b: number, tol = 1e-10): number {
  if (a === b) return 0;
  if (a > b) return -integrate(f, b, a, tol);
  if (a === -Infinity && b === Infinity) return integrate(f, -Infinity, 0, tol) + integrate(f, 0, Infinity, tol);
  if (b === Infinity) {
    const g = (u: number) => {
      const w = 1 - u;
      const v = f(a + u / w) / (w * w);
      return Number.isFinite(v) ? v : 0;
    };
    return adaptive(g, 0, 1, tol, 40);
  }
  if (a === -Infinity) {
    const g = (u: number) => {
      const w = 1 - u;
      const v = f(b - u / w) / (w * w);
      return Number.isFinite(v) ? v : 0;
    };
    return adaptive(g, 0, 1, tol, 40);
  }
  return adaptive(f, a, b, tol, 40);
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 FFT. Length must be a power of two. Inverse is scaled by 1/n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2];
        const ai = im[i + k + len / 2];
        const tr = ar * cr - ai * ci;
        const ti = ar * ci + ai * cr;
        re[i + k + len / 2] = re[i + k] - tr;
        im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

export function linspace(a: number, b: number, n: number): number[] {
  if (n === 1) return [a];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
