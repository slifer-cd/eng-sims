/**
 * 4-state, N-bit signal values (N = 1..32) packed into three bitplanes.
 * For each bit: z set → Z (floating), else x set → X (unknown/conflict), else v is 0 or 1.
 * Construction via `make` keeps the planes disjoint, so equal signals compare equal.
 */
export interface Value {
  readonly width: number;
  readonly v: number;
  readonly z: number;
  readonly x: number;
}

export const MAX_WIDTH = 32;

export function mask(width: number): number {
  return width >= 32 ? 0xffffffff : ((1 << width) >>> 0) - 1;
}

export function make(width: number, v: number, z: number, x: number): Value {
  const m = mask(width);
  const zz = (z & m) >>> 0;
  const xx = (x & m & ~zz) >>> 0;
  return { width, v: (v & m & ~zz & ~xx) >>> 0, z: zz, x: xx };
}

export const fromInt = (width: number, n: number): Value => make(width, n, 0, 0);
export const zeros = (width: number): Value => make(width, 0, 0, 0);
export const ones = (width: number): Value => make(width, 0xffffffff, 0, 0);
export const floating = (width: number): Value => make(width, 0, 0xffffffff, 0);
export const unknown = (width: number): Value => make(width, 0, 0, 0xffffffff);

export function equals(a: Value, b: Value): boolean {
  return a.width === b.width && a.v === b.v && a.z === b.z && a.x === b.x;
}

export function isKnown(a: Value): boolean {
  return a.z === 0 && a.x === 0;
}

export function bit(a: Value, i: number): "0" | "1" | "Z" | "X" {
  if ((a.z >>> i) & 1) return "Z";
  if ((a.x >>> i) & 1) return "X";
  return (a.v >>> i) & 1 ? "1" : "0";
}

/** MSB-first, e.g. "10Z1". */
export function toBitString(a: Value): string {
  let s = "";
  for (let i = a.width - 1; i >= 0; i--) s += bit(a, i);
  return s;
}

/** Bits that are a definite 0 or 1. Z inputs to logic behave like X. */
const known = (a: Value) => ~(a.z | a.x);

export function not(a: Value): Value {
  const k = known(a);
  return make(a.width, ~a.v & k, 0, ~k);
}

export function and(a: Value, b: Value): Value {
  const ka = known(a), kb = known(b);
  const zero = (ka & ~a.v) | (kb & ~b.v);
  const one = ka & a.v & kb & b.v;
  return make(a.width, one, 0, ~(zero | one));
}

export function or(a: Value, b: Value): Value {
  const ka = known(a), kb = known(b);
  const one = (ka & a.v) | (kb & b.v);
  const zero = ka & ~a.v & kb & ~b.v;
  return make(a.width, one, 0, ~(zero | one));
}

export function xor(a: Value, b: Value): Value {
  const k = known(a) & known(b);
  return make(a.width, (a.v ^ b.v) & k, 0, ~k);
}

/**
 * Combine two drivers of the same net: Z yields to the other driver, and two
 * drivers that disagree (or either is X) produce X.
 */
export function resolve(a: Value, b: Value, width = a.width): Value {
  const da = ~a.z, db = ~b.z;
  const onlyA = da & ~db, onlyB = db & ~da, both = da & db;
  const x = (onlyA & a.x) | (onlyB & b.x) | (both & (a.x | b.x | (a.v ^ b.v)));
  const v = (onlyA & a.v) | (onlyB & b.v) | (both & a.v);
  return make(width, v, a.z & b.z, x);
}

export function resolveAll(width: number, drivers: Value[]): Value {
  let acc = floating(width);
  for (const d of drivers) acc = resolve(acc, d, width);
  return acc;
}

export function slice(a: Value, lo: number, width: number): Value {
  return make(width, a.v >>> lo, a.z >>> lo, a.x >>> lo);
}

/** Join parts into one value, first part in the lowest bits. */
export function concat(parts: Value[]): Value {
  let v = 0, z = 0, x = 0, off = 0;
  for (const p of parts) {
    v |= p.v << off;
    z |= p.z << off;
    x |= p.x << off;
    off += p.width;
  }
  return make(off, v, z, x);
}

export type SignalKind = "one" | "zero" | "z" | "x";

/** How a value reads at a glance: X if any bit conflicts, Z if any floats, else high if any bit is set. */
export function signalKind(a: Value): SignalKind {
  if (a.x) return "x";
  if (a.z) return "z";
  return a.v ? "one" : "zero";
}

/** Short display text: "1", "0x3F", or bits when some are unknown ("1XZ0"). */
export function formatValue(a: Value): string {
  if (a.width === 1) return bit(a, 0);
  if (isKnown(a)) return "0x" + a.v.toString(16).toUpperCase().padStart(Math.ceil(a.width / 4), "0");
  if (a.width <= 8) return toBitString(a);
  return a.z === mask(a.width) ? "Z" : "X";
}

/** Parse "0x1F", "0b101" or decimal into a value; undefined if invalid. */
export function parseValue(width: number, text: string): Value | undefined {
  const t = text.trim().toLowerCase();
  if (!/^(0b[01]+|0x[0-9a-f]+|\d+)$/.test(t)) return undefined;
  const n = t.startsWith("0b") ? parseInt(t.slice(2), 2) : Number(t);
  return fromInt(width, n);
}
