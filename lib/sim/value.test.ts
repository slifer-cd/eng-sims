import { describe, expect, it } from "vitest";
import {
  and,
  concat,
  floating,
  formatValue,
  fromInt,
  make,
  not,
  or,
  parseValue,
  resolveAll,
  slice,
  toBitString,
  unknown,
  xor,
} from "./value";

const b = (s: string) => {
  // Parse an MSB-first string of 0/1/Z/X.
  let v = 0, z = 0, x = 0;
  [...s].reverse().forEach((c, i) => {
    if (c === "1") v |= 1 << i;
    if (c === "Z") z |= 1 << i;
    if (c === "X") x |= 1 << i;
  });
  return make(s.length, v, z, x);
};

describe("logic with unknowns", () => {
  it("NOT turns Z into X", () => {
    expect(toBitString(not(b("01ZX")))).toBe("10XX");
  });

  it("AND: a known 0 dominates, otherwise unknown stays X", () => {
    expect(toBitString(and(b("0000111111"), b("01ZX01ZX01")))).toBe("000001XX01");
  });

  it("OR: a known 1 dominates", () => {
    expect(toBitString(or(b("11110000"), b("01ZX01ZX")))).toBe("111101XX");
  });

  it("XOR needs both bits known", () => {
    expect(toBitString(xor(b("0011Z"), b("01011")))).toBe("0110X");
  });
});

describe("net resolution", () => {
  it("is Z with no active drivers", () => {
    expect(toBitString(resolveAll(2, [floating(2), floating(2)]))).toBe("ZZ");
  });

  it("passes the single active driver through", () => {
    expect(toBitString(resolveAll(4, [b("ZZZZ"), b("10ZZ"), b("ZZ01")]))).toBe("1001");
  });

  it("is X where active drivers disagree", () => {
    expect(toBitString(resolveAll(4, [b("1100"), b("1010")]))).toBe("1XX0");
    expect(toBitString(resolveAll(1, [b("1"), unknown(1)]))).toBe("X");
  });
});

describe("bus slicing", () => {
  it("round-trips through slice and concat, including 32-bit values", () => {
    const v = fromInt(32, 0xdeadbeef);
    const parts = [slice(v, 0, 8), slice(v, 8, 16), slice(v, 24, 8)];
    expect(concat(parts)).toEqual(v);
    expect(slice(v, 28, 4)).toEqual(fromInt(4, 0xd));
  });
});

describe("formatting", () => {
  it("formats known, partial and unknown values", () => {
    expect(formatValue(fromInt(1, 1))).toBe("1");
    expect(formatValue(fromInt(8, 0x3f))).toBe("0x3F");
    expect(formatValue(b("1XZ0"))).toBe("1XZ0");
    expect(formatValue(floating(16))).toBe("Z");
  });

  it("parses hex, binary and decimal", () => {
    expect(parseValue(8, "0x1f")).toEqual(fromInt(8, 31));
    expect(parseValue(8, "0b101")).toEqual(fromInt(8, 5));
    expect(parseValue(8, "12")).toEqual(fromInt(8, 12));
    expect(parseValue(8, "nope")).toBeUndefined();
  });
});
