/*
 * Signed whole numbers in a fixed number of bits: two's complement, one's complement and
 * sign-magnitude. A bit pattern is a non-negative bigint below 2^width.
 */

import type { Step } from "../sss/steps";
import { abs, B0, B1, big, group, pad } from "./bases";

export type Scheme = "twos" | "ones" | "signmag";
export const SCHEMES: { id: Scheme; name: string }[] = [
  { id: "twos", name: "Two's complement" },
  { id: "ones", name: "One's complement" },
  { id: "signmag", name: "Sign-magnitude" },
];

export const WIDTHS = [4, 8, 16, 32, 64] as const;

const pow2 = (n: number) => B1 << big(n);
export const mask = (width: number) => pow2(width) - B1;

/** The smallest and largest values the scheme can hold in `width` bits. */
export function range(width: number, scheme: Scheme): { min: bigint; max: bigint } {
  const max = pow2(width - 1) - B1;
  return { min: scheme === "twos" ? -pow2(width - 1) : -max, max };
}

/** The bit pattern for `v`, or null if it doesn't fit. */
export function encode(v: bigint, width: number, scheme: Scheme): bigint | null {
  const { min, max } = range(width, scheme);
  if (v < min || v > max) return null;
  if (v >= B0) return v;
  const m = abs(v);
  if (scheme === "twos") return pow2(width) - m;
  if (scheme === "ones") return mask(width) ^ m;
  return pow2(width - 1) | m;
}

/** The value a bit pattern stands for. `negZero` marks the second zero of the other schemes. */
export function decode(bits: bigint, width: number, scheme: Scheme): { value: bigint; negZero: boolean } {
  const b = bits & mask(width);
  const signBit = (b >> big(width - 1)) & B1;
  if (signBit === B0) return { value: b, negZero: false };
  let value: bigint;
  if (scheme === "twos") value = b - pow2(width);
  else if (scheme === "ones") value = -(mask(width) ^ b);
  else value = -(b & (pow2(width - 1) - B1));
  return { value, negZero: value === B0 };
}

export const bitsText = (bits: bigint, width: number) => group(pad(bits.toString(2), width), 4, "\\,");

/** Working for writing `v` in `width`-bit two's complement. */
export function twosSteps(v: bigint, width: number): Step[] {
  const { min, max } = range(width, "twos");
  const steps: Step[] = [
    {
      title: `${width} bits of two's complement hold ${min} up to ${max}`,
      lines: [`-2^{${width - 1}} = ${min} \\;\\le\\; x \\;\\le\\; ${max} = 2^{${width - 1}} - 1`],
    },
  ];
  const bits = encode(v, width, "twos");
  if (bits === null) {
    steps.push({ title: `${v} is outside that range, so it overflows`, lines: [`${v} ${v > max ? ">" : "<"} ${v > max ? max : min}`] });
    return steps;
  }
  if (v >= B0) {
    steps.push({
      title: "A non-negative number is just its binary value, padded with zeros (the sign bit is 0)",
      lines: [`${v}_{10} = ${bitsText(v, width)}_{2}`],
    });
    return steps;
  }
  const m = abs(v);
  const inv = mask(width) ^ m;
  steps.push(
    { title: `Write the magnitude |x| = ${m} in ${width} bits`, lines: [`${m}_{10} = ${bitsText(m, width)}_{2}`] },
    { title: "Invert every bit (this is the one's complement)", lines: [`\\overline{${bitsText(m, width)}} = ${bitsText(inv, width)}`] },
    { title: "Add 1", lines: [`${bitsText(inv, width)} + 1 = ${bitsText(bits, width)}`] },
    {
      title: `Check: the sign bit counts as ${min}, the other bits add on as usual`,
      lines: [`-2^{${width - 1}} + ${bits & (pow2(width - 1) - B1)} = ${v}`],
    },
  );
  return steps;
}

/** Working for reading a bit pattern as two's complement. */
export function readTwosSteps(bits: bigint, width: number): Step[] {
  const b = bits & mask(width);
  const rest = b & (pow2(width - 1) - B1);
  const neg = (b >> big(width - 1)) & B1;
  const { value } = decode(b, width, "twos");
  return [
    {
      title: neg
        ? `The sign bit is 1, so it counts as −${pow2(width - 1)}; the remaining bits add on as unsigned`
        : "The sign bit is 0, so the value is the plain binary number",
      lines: neg
        ? [`${bitsText(b, width)}_{2} \\to -2^{${width - 1}} + ${rest} = -${pow2(width - 1)} + ${rest} = ${value}`]
        : [`${bitsText(b, width)}_{2} = ${value}`],
    },
  ];
}
