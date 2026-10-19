import { describe, expect, it } from "vitest";
import { big, conversionSteps, group, parseNumber, toBase } from "./bases";
import { bitsOf, decode, parseFloatInput, roundingError, valueOf } from "./ieee754";
import { decode as decodeInt, encode, range, twosSteps } from "./signed";

describe("bases", () => {
  it("reads prefixes, separators and signs", () => {
    expect(parseNumber("0x2A")).toEqual({ ok: true, value: big(42), base: 16 });
    expect(parseNumber("0b1010_1010")).toEqual({ ok: true, value: big(170), base: 2 });
    expect(parseNumber("-0o17")).toEqual({ ok: true, value: big(-15), base: 8 });
    expect(parseNumber("ff", 16)).toEqual({ ok: true, value: big(255), base: 16 });
    // In hex, 0b1 is the number B1.
    expect(parseNumber("0b1", 16)).toEqual({ ok: true, value: big(0xb1), base: 16 });
    expect(parseNumber("102", 2).ok).toBe(false);
    expect(parseNumber("0x", undefined).ok).toBe(false);
    expect(parseNumber("0x1F", 2).ok).toBe(false);
  });

  it("round-trips numbers beyond 2^53", () => {
    const v = BigInt("18446744073709551615");
    for (const b of [2, 8, 10, 16] as const) {
      const p = parseNumber(toBase(v, b), b);
      expect(p.ok && p.value).toBe(v);
    }
  });

  it("groups digits from the right", () => {
    expect(group("101101", 4)).toBe("10 1101");
    expect(group("1234567", 3, ",")).toBe("1,234,567");
  });

  it("writes working for every direction", () => {
    expect(conversionSteps(big(42), 10).map((s) => s.title)).toHaveLength(3);
    expect(conversionSteps(big(42), 2)).toHaveLength(3);
    expect(conversionSteps(big(-42), 16)).toHaveLength(4);
    expect(conversionSteps(big(42), 10)[0].lines[1]).toBe("42_{10} = 101010_{2}");
  });
});

describe("signed integers", () => {
  it("has the right ranges", () => {
    expect(range(8, "twos")).toEqual({ min: big(-128), max: big(127) });
    expect(range(8, "ones")).toEqual({ min: big(-127), max: big(127) });
  });

  it("encodes and decodes every 8-bit value in every scheme", () => {
    for (const scheme of ["twos", "ones", "signmag"] as const) {
      const { min, max } = range(8, scheme);
      for (let v = min; v <= max; v++) {
        const bits = encode(v, 8, scheme)!;
        expect(bits >= big(0) && bits < big(256)).toBe(true);
        expect(decodeInt(bits, 8, scheme).value).toBe(v);
      }
      expect(encode(max + big(1), 8, scheme)).toBeNull();
    }
    expect(encode(big(-1), 8, "twos")).toBe(big(0xff));
    expect(encode(big(-1), 8, "ones")).toBe(big(0xfe));
    expect(encode(big(-1), 8, "signmag")).toBe(big(0x81));
    expect(decodeInt(big(0xff), 8, "ones").negZero).toBe(true);
    expect(decodeInt(big(0x80), 8, "signmag").negZero).toBe(true);
  });

  it("explains invert and add one", () => {
    const steps = twosSteps(big(-5), 8);
    expect(steps.map((s) => s.title)).toContain("Add 1");
    expect(twosSteps(big(200), 8)[1].title).toMatch(/overflows/);
  });
});

describe("IEEE-754", () => {
  it("matches the typed arrays", () => {
    for (const x of [0, -0, 1, -2.5, 0.1, 1 / 3, 5e-324, 1e-310, 1.7976931348623157e308, Infinity, -Infinity, 3.4028234663852886e38, 1e-45]) {
      for (const fmt of ["32", "64"] as const) {
        const want = fmt === "32" ? new Float32Array([x])[0] : new Float64Array([x])[0];
        expect(Object.is(valueOf(bitsOf(x, fmt), fmt), want)).toBe(true);
        expect(Object.is(decode(bitsOf(x, fmt), fmt).value, want)).toBe(true);
      }
    }
  });

  it("classifies and shows the exact stored value", () => {
    expect(decode(bitsOf(0.1, "32"), "32")).toMatchObject({ kind: "normal", e: -4, expField: 123, exact: "0.100000001490116119384765625" });
    expect(decode(bitsOf(0.1, "64"), "64").exact).toBe("0.1000000000000000055511151231257827021181583404541015625");
    expect(decode(big(1), "32")).toMatchObject({ kind: "subnormal", e: -126 });
    expect(decode(bitsOf(-0, "32"), "32")).toMatchObject({ kind: "zero", sign: 1, exact: "-0" });
    expect(decode(bitsOf(NaN, "64"), "64").kind).toBe("nan");
    expect(decode(bitsOf(-Infinity, "32"), "32")).toMatchObject({ kind: "infinity", sign: 1 });
  });

  it("measures the rounding error exactly", () => {
    const d = decode(bitsOf(0.1, "64"), "64");
    expect(roundingError("0.1", d)).toBe("5.551e-18");
    expect(roundingError("0.5", decode(bitsOf(0.5, "32"), "32"))).toBe("0");
    expect(roundingError("1e400", decode(bitsOf(1e400, "64"), "64"))).toBeNull();
  });

  it("reads decimals, words and bit patterns", () => {
    expect(parseFloatInput("0x3DCCCCCD", "32")).toEqual({ ok: true, bits: big(0x3dcccccd), from: "bits" });
    expect(parseFloatInput("0x1FFFFFFFF", "32").ok).toBe(false);
    expect(parseFloatInput("-inf", "64")).toMatchObject({ ok: true, from: "decimal" });
    expect(parseFloatInput("1.5e3", "32")).toMatchObject({ ok: true, bits: bitsOf(1500, "32") });
    expect(parseFloatInput("1..2", "32").ok).toBe(false);
  });
});
