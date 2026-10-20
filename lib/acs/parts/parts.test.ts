import { describe, expect, it } from "vitest";
import { GRID } from "../../editor/layout";
import { PARTS, getPart, partProps } from ".";

describe("part catalogue", () => {
  it.each([...PARTS.keys()])("%s has unique terminals on grid points", (id) => {
    const spec = getPart(id)!;
    expect(new Set(spec.terminals.map((t) => t.id)).size).toBe(spec.terminals.length);
    for (const t of spec.terminals) {
      expect(Math.abs(t.x % GRID)).toBe(0);
      expect(Math.abs(t.y % GRID)).toBe(0);
    }
  });

  it.each([...PARTS.keys()])("%s has unique fields with valid defaults", (id) => {
    const spec = getPart(id)!;
    expect(new Set(spec.fields.map((f) => f.key)).size).toBe(spec.fields.length);
    expect(partProps(spec, {})).toEqual(Object.fromEntries(spec.fields.map((f) => [f.key, f.default])));
  });
});

describe("partProps", () => {
  const resistor = getPart("resistor")!;
  const switch2 = getPart("switch2")!;

  it("keeps good values", () => {
    expect(partProps(resistor, { r: 470 })).toEqual({ r: 470 });
    expect(partProps(switch2, { position: "b" })).toEqual({ position: "b" });
  });

  it("replaces bad values with the default", () => {
    for (const r of [-5, 0, NaN, "abc", null, Infinity]) expect(partProps(resistor, { r: r as number })).toEqual({ r: 1000 });
    expect(partProps(switch2, { position: "c" })).toEqual({ position: "a" });
    expect(partProps(getPart("switch")!, { closed: "yes" })).toEqual({ closed: false });
  });

  it("reads numbers saved as text", () => {
    expect(partProps(resistor, { r: "220" })).toEqual({ r: 220 });
  });

  it("drops props that are not fields", () => {
    expect(partProps(resistor, { r: 1, junk: 2 })).toEqual({ r: 1 });
  });
});
