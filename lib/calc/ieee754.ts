/*
 * IEEE-754 binary32 and binary64: bits ↔ value, the field breakdown, the exact decimal
 * value of what is stored and the rounding error against the typed decimal.
 */

import type { Step } from "../sss/steps";
import { B0, B1, big, group, pad } from "./bases";

export type FloatFormat = "32" | "64";

export interface FormatSpec {
  bits: number;
  exp: number;
  frac: number;
  bias: number;
  name: string;
}

export const FORMATS: Record<FloatFormat, FormatSpec> = {
  "32": { bits: 32, exp: 8, frac: 23, bias: 127, name: "Single precision (float32)" },
  "64": { bits: 64, exp: 11, frac: 52, bias: 1023, name: "Double precision (float64)" },
};

export type FloatKind = "zero" | "subnormal" | "normal" | "infinity" | "nan";

export interface Decoded {
  bits: bigint;
  sign: 0 | 1;
  /** The stored exponent field. */
  expField: number;
  /** The stored fraction field. */
  frac: bigint;
  kind: FloatKind;
  /** The unbiased exponent (1 − bias for subnormals); NaN for ∞ and NaN. */
  e: number;
  value: number;
  /** Every digit of the stored value; "" for ∞ and NaN. */
  exact: string;
}

const view = new DataView(new ArrayBuffer(8));

/** The stored bits of `x` (float32 rounds to nearest, ties to even). */
export function bitsOf(x: number, fmt: FloatFormat): bigint {
  if (fmt === "32") {
    view.setFloat32(0, x);
    return big(view.getUint32(0));
  }
  view.setFloat64(0, x);
  return view.getBigUint64(0);
}

export function valueOf(bits: bigint, fmt: FloatFormat): number {
  if (fmt === "32") {
    view.setUint32(0, Number(bits & big(0xffffffff)));
    return view.getFloat32(0);
  }
  view.setBigUint64(0, bits);
  return view.getFloat64(0);
}

/** M·2^e as an exact decimal string. */
function exactDecimal(m: bigint, e: number): string {
  if (e >= 0) return (m << big(e)).toString();
  const k = -e;
  const digits = pad((m * big(5) ** big(k)).toString(), k + 1);
  const int = digits.slice(0, digits.length - k);
  const frac = digits.slice(digits.length - k).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

export function decode(bits: bigint, fmt: FloatFormat): Decoded {
  const f = FORMATS[fmt];
  const sign = Number((bits >> big(f.bits - 1)) & B1) as 0 | 1;
  const expField = Number((bits >> big(f.frac)) & big((1 << f.exp) - 1));
  const frac = bits & ((B1 << big(f.frac)) - B1);
  const allOnes = (1 << f.exp) - 1;
  let kind: FloatKind;
  if (expField === allOnes) kind = frac === B0 ? "infinity" : "nan";
  else if (expField === 0) kind = frac === B0 ? "zero" : "subnormal";
  else kind = "normal";
  const e = kind === "infinity" || kind === "nan" ? NaN : (expField === 0 ? 1 : expField) - f.bias;
  let exact = "";
  if (kind !== "infinity" && kind !== "nan") {
    const m = kind === "normal" ? (B1 << big(f.frac)) | frac : frac;
    exact = (sign ? "-" : "") + exactDecimal(m, e - f.frac);
  }
  return { bits, sign, expField, frac, kind, e, value: valueOf(bits, fmt), exact };
}

export type FloatInput =
  | { ok: true; bits: bigint; from: "decimal"; typed: string }
  | { ok: true; bits: bigint; from: "bits" }
  | { ok: false; error: string };

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** A decimal number (or inf/nan), or a bit pattern written with 0x or 0b. */
export function parseFloatInput(text: string, fmt: FloatFormat): FloatInput {
  const f = FORMATS[fmt];
  const s = text.trim().replace(/[\s_]/g, "");
  if (s === "") return { ok: false, error: "Type a number, or a bit pattern starting with 0x or 0b." };
  const pattern = /^0([xb])([0-9a-f]+)$/i.exec(s);
  if (pattern) {
    const hex = pattern[1].toLowerCase() === "x";
    if (!hex && /[^01]/.test(pattern[2])) return { ok: false, error: "A 0b pattern can only have 0s and 1s." };
    const bits = BigInt(`0${pattern[1]}${pattern[2]}`);
    if (bits >> big(f.bits) !== B0) return { ok: false, error: `That pattern has more than ${f.bits} bits.` };
    return { ok: true, bits, from: "bits" };
  }
  const word = s.toLowerCase().replace(/^\+/, "");
  if (["inf", "infinity", "∞", "-inf", "-infinity", "-∞"].includes(word)) {
    return { ok: true, bits: bitsOf(word.startsWith("-") ? -Infinity : Infinity, fmt), from: "decimal", typed: word };
  }
  if (word === "nan") return { ok: true, bits: bitsOf(NaN, fmt), from: "decimal", typed: word };
  if (!DECIMAL.test(s)) return { ok: false, error: "Type a decimal number like 0.1, -2.5 or 6.02e23, or a pattern like 0x3DCCCCCD." };
  return { ok: true, bits: bitsOf(Number(s), fmt), from: "decimal", typed: s };
}

/** A decimal string as digits·10^exp10. */
function decimalParts(s: string): { neg: boolean; digits: bigint; exp10: number } {
  const m = DECIMAL.exec(s)!;
  const neg = s.startsWith("-");
  const [int, frac = ""] = m[1].split(".");
  const exp10 = (m[2] ? parseInt(m[2].slice(1), 10) : 0) - frac.length;
  return { neg, digits: BigInt((int || "0") + frac), exp10 };
}

/** n·10^−scale in scientific notation with `sig` significant digits: "5.55e-17". */
function sci(n: bigint, scale: number, sig = 4): string {
  if (n === B0) return "0";
  const neg = n < B0;
  const d = (neg ? -n : n).toString();
  const e = d.length - 1 - scale;
  const mant = d.slice(0, 1) + (sig > 1 && d.length > 1 ? "." + d.slice(1, sig).replace(/0+$/, "") : "");
  return `${neg ? "-" : ""}${mant.replace(/\.$/, "")}e${e}`;
}

/**
 * stored − typed, exactly, in scientific notation; "0" when the number is stored exactly.
 * Null for values that don't compare (∞, NaN, or a typed value that overflowed).
 */
export function roundingError(typed: string, d: Decoded): string | null {
  if (d.exact === "" || !DECIMAL.test(typed)) return null;
  const t = decimalParts(typed);
  const st = decimalParts(d.exact);
  const scale = Math.max(-t.exp10, -st.exp10, 0);
  const at = (p: { neg: boolean; digits: bigint; exp10: number }) => (p.neg ? -B1 : B1) * p.digits * big(10) ** big(p.exp10 + scale);
  return sci(at(st) - at(t), scale);
}

export const fieldBits = (v: bigint | number, width: number) => pad(v.toString(2), width);

/** "−", "+": the sign as a factor. */
const signTex = (s: 0 | 1) => (s ? "-" : "+");

/** Trim a long digit string for display: 0.1000000000000000055511151231257827… */
export function shortDigits(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max)}\\ldots` : s;
}

/** Working for the conversion, in whichever direction the input came from. */
export function floatSteps(d: Decoded, fmt: FloatFormat, from: "decimal" | "bits"): Step[] {
  const f = FORMATS[fmt];
  const s = fieldBits(d.sign, 1);
  const ex = fieldBits(d.expField, f.exp);
  const fr = fieldBits(d.frac, f.frac);
  const hex = pad(d.bits.toString(16).toUpperCase(), f.bits / 4);
  const fields = `\\underbrace{${s}}_{\\text{sign}}\\;\\underbrace{${ex}}_{\\text{exponent}}\\;\\underbrace{${group(fr, 4, "\\,")}}_{\\text{fraction}}`;
  const packed: Step = { title: `Pack sign, exponent and fraction into ${f.bits} bits`, lines: [`${fields} = \\mathtt{0x${hex}}`] };
  const split: Step = {
    title: `Split the ${f.bits} bits: 1 sign bit, ${f.exp} exponent bits, ${f.frac} fraction bits`,
    lines: [`\\mathtt{0x${hex}} = ${fields}`],
  };
  const signStep: Step = { title: `Sign bit ${d.sign}: the number is ${d.sign ? "negative" : "positive"}`, lines: [`s = ${d.sign}`] };
  const allOnes = (1 << f.exp) - 1;

  if (d.kind === "infinity" || d.kind === "nan") {
    const body: Step = {
      title:
        d.kind === "infinity"
          ? `An exponent of all ones (${allOnes}) with a zero fraction means infinity`
          : `An exponent of all ones (${allOnes}) with a non-zero fraction means NaN (not a number)`,
      lines: [d.kind === "infinity" ? `${signTex(d.sign)}\\infty` : "\\text{NaN}"],
    };
    return from === "bits" ? [split, body] : [signStep, body, packed];
  }
  if (d.kind === "zero") {
    const body: Step = { title: "Exponent and fraction all zeros: the value is zero (it keeps its sign)", lines: [`${signTex(d.sign)}0`] };
    return from === "bits" ? [split, body] : [signStep, body, packed];
  }

  const lead = d.kind === "normal" ? "1" : "0";
  const fracTrim = fr.replace(/0+$/, "") || "0";
  const mantissa = `${lead}.${fracTrim}`;
  const valueLine = `${d.sign ? "-" : ""}${mantissa}_{2} \\times 2^{${d.e}} = ${shortDigits(d.exact)}`;
  const expStep: Step =
    d.kind === "normal"
      ? {
          title: `Exponent field ${d.expField} minus the bias ${f.bias} gives the power of two`,
          lines: [`E = ${d.expField} - ${f.bias} = ${d.e}`, `${ex}_{2} = ${d.expField}`],
        }
      : {
          title: `Exponent field 0 with a non-zero fraction is a subnormal number: no hidden 1, and the power is fixed at 1 − ${f.bias}`,
          lines: [`E = 1 - ${f.bias} = ${d.e}`],
        };
  const mantStep: Step = {
    title: d.kind === "normal" ? "Put the hidden 1 in front of the fraction bits" : "The fraction bits follow 0. (no hidden 1)",
    lines: [`m = ${mantissa}_{2}`],
  };

  if (from === "bits") {
    return [
      split,
      signStep,
      expStep,
      mantStep,
      { title: "Multiply out: value = (−1)^s × m × 2^E", lines: [valueLine] },
    ];
  }
  return [
    signStep,
    {
      title:
        d.kind === "normal"
          ? `Write |x| in binary and normalise it to 1.something × 2^E (the fraction is rounded to ${f.frac} bits, to the nearest, ties to even)`
          : `|x| is below the smallest normal number, so it is written as 0.something × 2^${d.e} (subnormal)`,
      lines: [`|x| \\approx ${mantissa}_{2} \\times 2^{${d.e}}`],
    },
    d.kind === "normal"
      ? {
          title: `Add the bias ${f.bias} to the exponent and write it in ${f.exp} bits`,
          lines: [`${d.e} + ${f.bias} = ${d.expField} = ${ex}_{2}`],
        }
      : { title: "Subnormal numbers store an exponent field of 0", lines: [`${ex}_{2}`] },
    { title: `Drop the leading ${lead} and keep the ${f.frac} bits after the point as the fraction`, lines: [`${group(fr, 4, "\\,")}`] },
    packed,
    { title: "What is actually stored, exactly", lines: [valueLine] },
  ];
}
