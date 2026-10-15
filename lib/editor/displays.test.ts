import { describe as group, expect, it } from "vitest";
import { CircuitBuilder, library, makeChip } from "../sim/test-utils";
import { chipFace, faceLocation } from "./displays";
import { GRID, describe, layoutChip } from "./layout";

/** A block with an Input Pin driving an LED, and a 7-segment display to its right. */
function panel() {
  const b = new CircuitBuilder();
  const a = b.add("input");
  const led = b.add("led");
  const seg = b.add("seg7");
  b.circuit.components.find((c) => c.id === seg)!.x = 100;
  b.wire([a, "out"], [led, "in"]);
  return { chip: makeChip("panel", "Panel", b.circuit), b, led, seg };
}

group("chipFace", () => {
  it("lists a block's displays left to right", () => {
    const { chip, led, seg } = panel();
    expect(chipFace(chip, library(chip)).map((f) => f.route)).toEqual([[led], [seg]]);
  });

  it("leaves out displays with Show on block turned off", () => {
    const { b, seg } = panel();
    b.circuit.components.find((c) => c.id === seg)!.props.showOnBlock = false;
    const chip = makeChip("panel", "Panel", b.circuit);
    expect(chipFace(chip, library(chip)).map((f) => f.kind)).toEqual(["led"]);
  });

  it("shows nested blocks' displays, unless the nested block is hidden", () => {
    const { chip: inner, led } = panel();
    const b = new CircuitBuilder();
    const sub = b.add("panel");
    const outer = makeChip("outer", "Outer", b.circuit);
    const lib = library(inner, outer);
    expect(chipFace(outer, lib)[0].route).toEqual([sub, led]);

    b.circuit.components[0].props.showOnBlock = false;
    expect(chipFace(makeChip("outer", "Outer", b.circuit), lib)).toEqual([]);
  });
});

group("faceLocation", () => {
  it("maps a route to the display's instance path", () => {
    expect(faceLocation("", "led1", [])).toEqual({ path: "", compId: "led1" });
    expect(faceLocation("", "top", ["sub", "led"])).toEqual({ path: "top/sub/", compId: "led" });
  });
});

group("layout with displays", () => {
  it("makes room for the face and keeps pins on the grid", () => {
    const { chip } = panel();
    const look = describe({ chipId: "panel", props: {} }, library(chip))!;
    const layout = layoutChip(look);
    expect(layout.face).toHaveLength(2);
    for (const f of layout.face) {
      expect(f.x).toBeGreaterThanOrEqual(-layout.w / 2);
      expect(f.x + f.w).toBeLessThanOrEqual(layout.w / 2);
      expect(f.y).toBeGreaterThan(-layout.h / 2);
      expect(f.y + f.h).toBeLessThanOrEqual(layout.h / 2);
    }
    for (const p of layout.pins) {
      expect(Math.abs(p.x) % GRID).toBe(0);
      expect(Math.abs(p.y) % GRID).toBe(0);
    }
  });

  it.each(["led", "seg7", "dotmatrix", "rgbmatrix"])("sizes %s to the grid", (chipId) => {
    const layout = layoutChip(describe({ chipId, props: {} })!);
    expect(layout.w % (2 * GRID)).toBe(0);
    expect(layout.h % (2 * GRID)).toBe(0);
    expect(layout.face).toHaveLength(1);
  });
});

group("bus endpoint layout", () => {
  it("is one grid cell with its pin on the grid at any rotation", () => {
    const layout = layoutChip(describe({ chipId: "busend", props: { width: 8 } })!);
    expect([layout.w, layout.h]).toEqual([2 * GRID, 2 * GRID]);
    expect(layout.pins).toHaveLength(1);
    expect(Math.abs(layout.pins[0].x) % GRID).toBe(0);
    expect(Math.abs(layout.pins[0].y) % GRID).toBe(0);
  });
});
