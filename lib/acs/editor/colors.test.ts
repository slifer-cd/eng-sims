import { describe, expect, it } from "vitest";
import { VOLT_NEG, VOLT_POS, VOLT_ZERO, WIRE_IDLE, voltColor } from "./colors";

describe("voltColor", () => {
  it("is the zero colour at 0 V", () => {
    expect(voltColor(0, 5)).toBe(VOLT_ZERO);
  });

  it("mixes towards green for positive and red for negative voltages", () => {
    expect(voltColor(5, 5)).toBe(`color-mix(in oklab, ${VOLT_POS} 100%, ${VOLT_ZERO})`);
    expect(voltColor(-2.5, 5)).toBe(`color-mix(in oklab, ${VOLT_NEG} 50%, ${VOLT_ZERO})`);
  });

  it("clamps outside the range and rounds to 5% steps", () => {
    expect(voltColor(12, 5)).toBe(voltColor(5, 5));
    expect(voltColor(1.01, 5)).toBe(voltColor(1, 5));
  });

  it("uses the plain wire colour when there is no voltage", () => {
    expect(voltColor(undefined, 5)).toBe(WIRE_IDLE);
    expect(voltColor(NaN, 5)).toBe(WIRE_IDLE);
  });
});
