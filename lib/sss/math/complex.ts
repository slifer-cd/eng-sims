/*
 * Complex numbers as plain immutable objects. Every value in the signal engine is
 * complex (sinusoids are stored as pairs of complex exponentials), so these helpers
 * are small and allocation-light rather than clever.
 */

export interface C {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): C => ({ re, im });

export const ZERO: C = cx(0);
export const ONE: C = cx(1);
export const J: C = cx(0, 1);

export const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
export const cneg = (a: C): C => ({ re: -a.re, im: -a.im });
export const cconj = (a: C): C => ({ re: a.re, im: -a.im });
export const cscale = (a: C, k: number): C => ({ re: a.re * k, im: a.im * k });

export const cmul = (a: C, b: C): C => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export function cdiv(a: C, b: C): C {
  // Smith's algorithm: avoids overflow when |b| is large or small.
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    if (b.re === 0 && b.im === 0) return { re: NaN, im: NaN };
    const r = b.im / b.re;
    const d = b.re + b.im * r;
    return { re: (a.re + a.im * r) / d, im: (a.im - a.re * r) / d };
  }
  const r = b.re / b.im;
  const d = b.re * r + b.im;
  return { re: (a.re * r + a.im) / d, im: (a.im * r - a.re) / d };
}

export const cinv = (a: C): C => cdiv(ONE, a);

export function cexp(a: C): C {
  const m = Math.exp(a.re);
  if (a.im === 0) return { re: m, im: 0 };
  return { re: m * Math.cos(a.im), im: m * Math.sin(a.im) };
}

export const cabs = (a: C): number => Math.hypot(a.re, a.im);
export const carg = (a: C): number => Math.atan2(a.im, a.re);

/** Principal logarithm. */
export const clog = (a: C): C => ({ re: Math.log(cabs(a)), im: carg(a) });

export function csqrt(a: C): C {
  const r = cabs(a);
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sqrt(Math.max(0, (r - a.re) / 2));
  return { re, im: a.im < 0 ? -im : im };
}

/** Integer power by repeated squaring (negative powers invert). */
export function cpow(a: C, n: number): C {
  if (n < 0) return cinv(cpow(a, -n));
  let result = ONE;
  let base = a;
  let k = n;
  while (k > 0) {
    if (k & 1) result = cmul(result, base);
    base = cmul(base, base);
    k >>= 1;
  }
  return result;
}

export const cisFinite = (a: C): boolean => Number.isFinite(a.re) && Number.isFinite(a.im);

/** True when a and b differ by at most tol, relative to their size (absolute below 1). */
export function cnear(a: C, b: C, tol = 1e-9): boolean {
  const scale = Math.max(1, cabs(a), cabs(b));
  return Math.abs(a.re - b.re) <= tol * scale && Math.abs(a.im - b.im) <= tol * scale;
}

export const cisZero = (a: C, tol = 1e-12): boolean => Math.abs(a.re) <= tol && Math.abs(a.im) <= tol;

export const cisReal = (a: C, tol = 1e-12): boolean => Math.abs(a.im) <= tol * Math.max(1, Math.abs(a.re));

/** Snap parts that are rounding noise relative to the other part to exactly zero. */
export function cclean(a: C, tol = 1e-12): C {
  const m = cabs(a);
  return {
    re: Math.abs(a.re) <= tol * Math.max(1, m) ? 0 : a.re,
    im: Math.abs(a.im) <= tol * Math.max(1, m) ? 0 : a.im,
  };
}
