/*
 * Number prettifier. The engine works in floating point, but the values a student types
 * are nearly always "nice", and so are the results: 1/2, π/2, 2/π, e^{-1}, √2/2. This
 * recognises those forms within rounding and falls back to 4 significant figures.
 */

import { type C, cabs } from "./complex";

export interface Nice {
  /** Full LaTeX, with sign. */
  tex: string;
  /** Plain-text form, with sign (for canvas labels and tables). */
  text: string;
  /** False when the value is shown rounded. */
  exact: boolean;
  /** Sign of the value: the parts below are for its absolute value. */
  sign: 1 | -1;
  /** LaTeX numerator of |x| (the whole value when there is no denominator). */
  num: string;
  /** LaTeX denominator of |x|, or null. */
  den: string | null;
  numText: string;
  denText: string | null;
}

const REL = 1e-9;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= REL * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Best rational p/q with q ≤ maxDen matching x within tolerance, via continued fractions. */
export function rationalize(x: number, maxDen = 64): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  let h0 = 0,
    h1 = 1,
    k0 = 1,
    k1 = 0;
  let v = ax;
  for (let i = 0; i < 32; i++) {
    const a = Math.floor(v);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    if (near(h2 / k2, ax)) return [sign * h2, k2];
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    const frac = v - a;
    if (frac < 1e-15) break;
    v = 1 / frac;
  }
  return null;
}

function make(sign: 1 | -1, num: string, den: string | null, numText: string, denText: string | null, exact: boolean): Nice {
  const s = sign < 0 ? "-" : "";
  const tex = den ? `${s}\\frac{${num}}{${den}}` : `${s}${num}`;
  const text = denText ? `${s}${numText}/${denText}` : `${s}${numText}`;
  return { tex, text, exact, sign, num, den, numText, denText };
}

/** Rational times a symbolic factor: (p/q)·F or p/(q·F). */
function withFactor(p: number, q: number, factorTex: string, factorText: string, inDenominator: boolean): Nice {
  const sign = p < 0 ? -1 : 1;
  const ap = Math.abs(p);
  if (inDenominator) {
    const den = q === 1 ? factorTex : `${q}${factorTex}`;
    const denText = q === 1 ? factorText : `${q}${factorText}`;
    return make(sign, String(ap), den, String(ap), denText, true);
  }
  const num = ap === 1 ? factorTex : `${ap}${factorTex}`;
  const numText = ap === 1 ? factorText : `${ap}${factorText}`;
  return make(sign, num, q === 1 ? null : String(q), numText, q === 1 ? null : String(q), true);
}

export function formatDecimal(x: number, digits = 4): { tex: string; text: string } {
  if (x === 0) return { tex: "0", text: "0" };
  const ax = Math.abs(x);
  if (ax >= 1e-4 && ax < 1e6) {
    // toPrecision, then strip trailing zeros.
    let s = ax.toPrecision(digits);
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    if (s.includes("e")) s = String(Number(s));
    return { tex: s, text: s };
  }
  const exp = Math.floor(Math.log10(ax));
  let mant = (ax / Math.pow(10, exp)).toPrecision(digits);
  if (mant.includes(".")) mant = mant.replace(/0+$/, "").replace(/\.$/, "");
  return { tex: `${mant}\\times10^{${exp}}`, text: `${mant}e${exp}` };
}

const E_PREFACTORS: [number, number][] = [];
for (let q = 1; q <= 6; q++) for (let p = 1; p <= 12; p++) if (gcd(p, q) === 1) E_PREFACTORS.push([p, q]);
E_PREFACTORS.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function expTex(p: number, q: number): string {
  return q === 1 ? `e^{${p}}` : `e^{${p < 0 ? "-" : ""}\\frac{${Math.abs(p)}}{${q}}}`;
}

function expText(p: number, q: number): string {
  return q === 1 ? `e^${p}` : `e^(${p}/${q})`;
}

/** Recognise ±(a/b)·e^{r} with a small rational prefactor and rational r. */
function niceExp(x: number): Nice | null {
  const ax = Math.abs(x);
  const sign = x < 0 ? -1 : 1;
  for (const [a, b] of E_PREFACTORS) {
    const r = Math.log((ax * b) / a);
    if (Math.abs(r) < 1e-6 || Math.abs(r) > 30) continue;
    const rr = rationalize(r, 12);
    if (!rr) continue;
    const [p, q] = rr;
    if (!near(Math.exp(p / q) * (a / b), ax)) continue;
    const e = expTex(p, q);
    const et = expText(p, q);
    const num = a === 1 ? e : `${a}${e}`;
    const numText = a === 1 ? et : `${a}${et}`;
    return make(sign, num, b === 1 ? null : String(b), numText, b === 1 ? null : String(b), true);
  }
  return null;
}

/** Pretty form of a real number. */
export function nice(x: number): Nice {
  if (Number.isNaN(x)) return make(1, "\\text{NaN}", null, "NaN", null, false);
  if (!Number.isFinite(x)) return make(x < 0 ? -1 : 1, "\\infty", null, "∞", null, true);
  if (Math.abs(x) < 1e-12) return make(1, "0", null, "0", null, true);
  const sign: 1 | -1 = x < 0 ? -1 : 1;
  const ax = Math.abs(x);

  // Integers and plain fractions.
  if (ax < 1e7) {
    const r = rationalize(x, 64);
    if (r) {
      const [p, q] = r;
      return make(sign, String(Math.abs(p)), q === 1 ? null : String(q), String(Math.abs(p)), q === 1 ? null : String(q), true);
    }
  }
  // Multiples of π, 1/π, π², √2, √3.
  const factors: [number, string, string, boolean][] = [
    [Math.PI, "\\pi", "π", false],
    [1 / Math.PI, "\\pi", "π", true],
    [Math.PI * Math.PI, "\\pi^{2}", "π²", false],
    [1 / (Math.PI * Math.PI), "\\pi^{2}", "π²", true],
    [Math.SQRT2, "\\sqrt{2}", "√2", false],
    [Math.sqrt(3), "\\sqrt{3}", "√3", false],
  ];
  for (const [f, tex, text, inDen] of factors) {
    const r = rationalize(x / f, 24);
    if (r && Math.abs(r[0]) <= 400) return withFactor(r[0], r[1], tex, text, inDen);
  }
  const e = niceExp(x);
  if (e) return e;
  const d = formatDecimal(ax);
  return make(sign, d.tex, null, d.text, null, false);
}

/**
 * Juxtapose two LaTeX factors, with a space after a command (\pi t, never the undefined \pit)
 * and a thin space between letters (t\,u).
 */
export function joinFactor(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (/\\[A-Za-z]+$/.test(a)) return `${a} ${b}`;
  if (/[A-Za-z]$/.test(a) && /^([A-Za-z]|\\[A-Za-z])/.test(b)) return `${a}\\,${b}`;
  return `${a}${b}`;
}

/** j times a magnitude: 2j after a plain number, j\pi or j\sqrt{2} before a symbol. */
function timesJ(num: string): string {
  if (num === "1") return "j";
  return /^[\d.]+$/.test(num) ? `${num}j` : `j${num}`;
}

/** Pretty form of a complex number: a + jb. */
export function niceC(z: C): Nice {
  const scale = Math.max(1e-300, cabs(z));
  const re = Math.abs(z.re) < 1e-10 * scale ? 0 : z.re;
  const im = Math.abs(z.im) < 1e-10 * scale ? 0 : z.im;
  if (im === 0) return nice(re);
  const ni = nice(Math.abs(im));
  const jTex = ni.den ? `\\frac{${timesJ(ni.num)}}{${ni.den}}` : timesJ(ni.num);
  const jText = ni.denText ? `${timesJ(ni.numText)}/${ni.denText}` : timesJ(ni.numText);
  if (re === 0) {
    const sign: 1 | -1 = im < 0 ? -1 : 1;
    return {
      tex: `${sign < 0 ? "-" : ""}${jTex}`,
      text: `${sign < 0 ? "-" : ""}${jText}`,
      exact: ni.exact,
      sign,
      num: jTex,
      den: null,
      numText: jText,
      denText: null,
    };
  }
  const nr = nice(re);
  const op = im < 0 ? "-" : "+";
  const tex = `${nr.tex}${op}${jTex}`;
  const text = `${nr.text} ${op} ${jText}`;
  return { tex, text, exact: nr.exact && ni.exact, sign: 1, num: `\\left(${tex}\\right)`, den: null, numText: `(${text})`, denText: null };
}

/** How "simple" a number looks: lower is nicer. Used to choose between display forms. */
export function complexity(x: number): number {
  const n = nice(x);
  if (!n.exact) return 100;
  return n.tex.length;
}

export function complexityC(z: C): number {
  const n = niceC(z);
  if (!n.exact) return 100;
  return n.tex.length;
}
