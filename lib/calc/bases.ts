/*
 * Whole numbers in bases 2, 8, 10 and 16, as bigints so 64-bit values stay exact.
 * The tsconfig target has no bigint literals, so constants are built with BigInt().
 */

import type { Step } from "../sss/steps";

export type Base = 2 | 8 | 10 | 16;
export const BASES: readonly Base[] = [2, 8, 10, 16];

export const B0 = BigInt(0);
export const B1 = BigInt(1);
export const big = (n: number | string) => BigInt(n);

export const BASE_NAMES: Record<Base, string> = { 2: "Binary", 8: "Octal", 10: "Decimal", 16: "Hexadecimal" };
const PREFIX: Record<string, Base> = { b: 2, o: 8, x: 16 };
const DIGITS = "0123456789ABCDEF";

export type ParsedNumber = { ok: true; value: bigint; base: Base } | { ok: false; error: string };

/**
 * Read a whole number. A `0b`/`0o`/`0x` prefix sets the base; otherwise `base` does,
 * defaulting to 10. Spaces, underscores and apostrophes between digits are ignored.
 */
export function parseNumber(text: string, base?: Base): ParsedNumber {
  let s = text.trim().replace(/[\s_']/g, "");
  if (s === "") return { ok: false, error: "Type a number." };
  let neg = false;
  if (s[0] === "-" || s[0] === "+") {
    neg = s[0] === "-";
    s = s.slice(1);
  }
  let b: Base = base ?? 10;
  const m = /^0([box])/i.exec(s);
  // In hex, "0b1" is the number B1, not a prefix.
  const isDigit = m !== null && base !== undefined && DIGITS.slice(0, base).includes(m[1].toUpperCase());
  if (m && s.length > 2 && !isDigit) {
    const p = PREFIX[m[1].toLowerCase()];
    if (base !== undefined && base !== p) return { ok: false, error: `The 0${m[1]} prefix means base ${p}, but base ${base} is selected.` };
    b = p;
    s = s.slice(2);
  }
  if (s === "") return { ok: false, error: "Type some digits after the prefix." };
  const allowed = DIGITS.slice(0, b);
  for (const ch of s.toUpperCase()) {
    if (!allowed.includes(ch)) return { ok: false, error: `“${ch}” is not a base-${b} digit (use ${allowed.length > 10 ? "0–9 and A–F" : `0–${b - 1}`}).` };
  }
  if (s.length > 300) return { ok: false, error: "That number is too long." };
  let v = B0;
  const bb = big(b);
  for (const ch of s.toUpperCase()) v = v * bb + big(DIGITS.indexOf(ch));
  return { ok: true, value: neg ? -v : v, base: b };
}

export const abs = (v: bigint) => (v < B0 ? -v : v);

/** Digits of `v` (sign included) in `base`, upper-case. */
export function toBase(v: bigint, base: Base): string {
  return (v < B0 ? "-" : "") + abs(v).toString(base).toUpperCase();
}

/** Split digits into groups of `size` from the right: "101101", 4 → "10 1101". */
export function group(digits: string, size: number, sep = " "): string {
  const out: string[] = [];
  for (let end = digits.length; end > 0; end -= size) out.unshift(digits.slice(Math.max(0, end - size), end));
  return out.join(sep);
}

/** Left-pad with zeros to `width` digits. */
export const pad = (digits: string, width: number) => digits.padStart(width, "0");

/** Bits needed for the magnitude of `v` (at least 1). */
export const bitLength = (v: bigint) => (v === B0 ? 1 : abs(v).toString(2).length);

/** A number with a base subscript: 1011_{2}. */
export const subscript = (digits: string, base: Base) => `${digits}_{${base}}`;

const MAX_ROWS = 24;

/** Working for converting the magnitude of `value` from base `from` to every other base. */
export function conversionSteps(value: bigint, from: Base): Step[] {
  const v = abs(value);
  const steps: Step[] = [];
  const src = v.toString(from).toUpperCase();
  const dec = v.toString(10);
  if (value < B0) {
    steps.push({ title: "Work with the magnitude and put the minus sign back at the end", lines: [`|${subscript("-" + src, from)}| = ${subscript(src, from)}`] });
  }

  if (from !== 10) steps.push(positionalStep(src, from, dec));

  // Binary is the hub between octal and hex: group bits instead of dividing.
  if (from === 2) {
    steps.push(groupStep(src, 8, "from"), groupStep(src, 16, "from"));
  } else if (from === 8 || from === 16) {
    const bin = v.toString(2);
    steps.push(groupStep(bin, from, "to"));
    steps.push(groupStep(bin, from === 8 ? 16 : 8, "from"));
  } else {
    for (const b of [2, 8, 16] as const) steps.push(divisionStep(v, b));
  }
  return steps;
}

/** base → decimal: Σ dᵢ·bⁱ. */
function positionalStep(src: string, base: Base, dec: string): Step {
  const terms: string[] = [];
  const values: string[] = [];
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const d = DIGITS.indexOf(src[i]);
    const p = n - 1 - i;
    // Long binary numbers: skip the zero digits, they add nothing.
    if (d === 0 && n > 8) continue;
    terms.push(`${d}\\cdot ${base}^{${p}}`);
    values.push((big(d) * big(base) ** big(p)).toString());
  }
  const shown = terms.length > MAX_ROWS ? [...terms.slice(0, 6), "\\cdots", ...terms.slice(-3)] : terms;
  const shownV = values.length > MAX_ROWS ? [...values.slice(0, 6), "\\cdots", ...values.slice(-3)] : values;
  const lines = [`${subscript(src, base)} = ${shown.join(" + ") || "0"}`];
  if (terms.length > 1) lines.push(`= ${shownV.join(" + ")}`);
  lines.push(`= ${subscript(dec, 10)}`);
  return {
    title: `${BASE_NAMES[base]} to decimal: multiply each digit by ${base} raised to its position${n > 8 && base === 2 ? " (zero bits left out)" : ""}`,
    lines,
  };
}

/** decimal → base: repeated division, remainders read bottom to top. */
function divisionStep(v: bigint, base: Base): Step {
  const bb = big(base);
  const rows: string[] = [];
  let q = v;
  do {
    const r = q % bb;
    rows.push(`${q} \\div ${base} & = ${q / bb} & \\text{remainder } ${DIGITS[Number(r)]}`);
    q = q / bb;
  } while (q > B0);
  const shown = rows.length > MAX_ROWS ? [...rows.slice(0, 10), "\\vdots & & \\vdots", ...rows.slice(-4)] : rows;
  return {
    title: `Decimal to ${BASE_NAMES[base].toLowerCase()}: divide by ${base} until the quotient is 0, then read the remainders from the bottom up`,
    lines: [`\\begin{array}{rll} ${shown.join(" \\\\ ")} \\end{array}`, `${subscript(v.toString(10), 10)} = ${subscript(v.toString(base).toUpperCase(), base)}`],
  };
}

/** Binary ↔ octal/hex: each octal digit is 3 bits, each hex digit 4. */
function groupStep(bin: string, base: 8 | 16, dir: "from" | "to"): Step {
  const size = base === 8 ? 3 : 4;
  const padded = pad(bin, Math.ceil(bin.length / size) * size);
  const groups = group(padded, size).split(" ");
  // Very long values: keep the formula readable.
  const shown = groups.length > 16 ? [...groups.slice(0, 6), null, ...groups.slice(-4)] : groups;
  const parts = shown.map((g) => (g === null ? "\\cdots" : `\\underbrace{${g}}_{${DIGITS[parseInt(g, 2)]}}`));
  const out = BigInt("0b" + bin).toString(base).toUpperCase();
  const title =
    dir === "from"
      ? `Binary to ${BASE_NAMES[base].toLowerCase()}: split the bits into groups of ${size} from the right (pad with zeros) and write each group as one digit`
      : `${BASE_NAMES[base]} to binary: each digit becomes ${size} bits`;
  const line = `\\;${parts.join("\\;")}`;
  return {
    title,
    lines: dir === "from" ? [`${subscript(bin, 2)} = ${line} = ${subscript(out, base)}`] : [`${subscript(out, base)} = ${line} = ${subscript(bin, 2)}`],
  };
}
