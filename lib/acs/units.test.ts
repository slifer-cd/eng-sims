import { describe, expect, it } from "vitest";
import { formatSI, parseSI } from "./units";

describe("parseSI", () => {
  it.each([
    ["4.7k", 4700],
    ["4k7", 4700],
    ["10u", 10e-6],
    ["10µ", 10e-6],
    ["100n", 100e-9],
    ["2.2M", 2.2e6],
    ["1meg", 1e6],
    ["1MEG", 1e6],
    ["5m", 5e-3],
    ["3p", 3e-12],
    ["1e-14", 1e-14],
    ["-12", -12],
    ["  5 V ", 5],
    ["10 kΩ", 10e3],
    ["47uF", 47e-6],
    ["1 ohm", 1],
    ["50Hz", 50],
    [".5", 0.5],
    ["2R2", 2.2],
  ])("reads %s", (text, value) => {
    expect(parseSI(text)).toBeCloseTo(value, 20);
    expect(parseSI(text)! / value).toBeCloseTo(1, 12);
  });

  it.each(["", "k", "abc", "1..2", "1kk", "--1", "1e"])("rejects %j", (text) => {
    expect(parseSI(text)).toBeNull();
  });
});

describe("formatSI", () => {
  it.each([
    [4700, "Ω", "4.7 kΩ"],
    [1000, "Ω", "1 kΩ"],
    [10e-6, "F", "10 µF"],
    [0, "V", "0 V"],
    [-0.0125, "A", "-12.5 mA"],
    [1e-14, "A", "10 fA"],
    [2.2e6, "Ω", "2.2 MΩ"],
    [999.96, "V", "1 kV"],
    [0.1234567, "V", "123 mV"],
    [5, "", "5"],
  ])("writes %s %s as %s", (value, unit, text) => {
    expect(formatSI(value, unit)).toBe(text);
  });

  it("writes more digits when asked", () => {
    expect(formatSI(4753, "Ω", 6)).toBe("4.753 kΩ");
    expect(formatSI(1 / 3, "V", 6)).toBe("333.333 mV");
  });

  it("round-trips through parseSI", () => {
    for (const v of [1, 4.7e3, 33e-9, 1.5e-3, 0.02, 2.2e6, 1e-14]) {
      expect(parseSI(formatSI(v, "F"))! / v).toBeCloseTo(1, 2);
    }
  });
});
