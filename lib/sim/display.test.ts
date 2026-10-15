import { describe, expect, it } from "vitest";
import { compile } from "./compile";
import { SCREEN_SIZE, type ScreenState } from "./display";
import { Engine } from "./engine";
import { CircuitBuilder, library, makeChip } from "./test-utils";
import { fromInt } from "./value";

/** A screen with an Input Pin on every input, keyed by pin id. */
function screenRig(kind: "dotmatrix" | "rgbmatrix") {
  const b = new CircuitBuilder();
  const scr = b.add(kind);
  const data = kind === "dotmatrix" ? [["d", 1]] : [["r", 4], ["g", 4], ["b", 4]];
  const pins: [string, number][] = [["x", 4], ["y", 4], ...(data as [string, number][]), ["write", 1], ["clear", 1], ["show", 1], ["clk", 1]];
  const inputs: Record<string, [id: string, width: number]> = {};
  for (const [pin, width] of pins) {
    const id = b.add("input", { width });
    b.wire([id, "out"], [scr, pin]);
    inputs[pin] = [id, width];
  }
  const engine = new Engine(compile(b.circuit, library()));
  const set = (values: Record<string, number>) => {
    for (const [pin, n] of Object.entries(values)) engine.setInput(inputs[pin][0], fromInt(inputs[pin][1], n));
  };
  const clock = (values: Record<string, number> = {}) => {
    set({ ...values, clk: 0 });
    set({ clk: 1 });
  };
  const screen = () => (engine.state("", scr) as ScreenState).screen;
  return { b, scr, engine, set, clock, screen };
}

describe("16×16 screens", () => {
  it("writes to the buffer and shows it only on show", () => {
    const { clock, screen } = screenRig("dotmatrix");
    clock({ x: 3, y: 2, d: 1, write: 1 });
    expect(screen()[2 * SCREEN_SIZE + 3]).toBe(0);
    clock({ write: 0, show: 1 });
    expect(screen()[2 * SCREEN_SIZE + 3]).toBe(1);
  });

  it("acts only on a rising clock edge", () => {
    const { set, screen } = screenRig("dotmatrix");
    set({ clk: 1, x: 1, d: 1, write: 1, show: 1 });
    expect(screen()[1]).toBe(0);
    set({ clk: 0 });
    expect(screen()[1]).toBe(0);
    set({ clk: 1 });
    expect(screen()[1]).toBe(1);
  });

  it("clear wipes the buffer but not the screen", () => {
    const { clock, screen } = screenRig("dotmatrix");
    clock({ x: 0, d: 1, write: 1, show: 1 });
    clock({ write: 0, show: 0, clear: 1 });
    expect(screen()[0]).toBe(1);
    clock({ clear: 0, show: 1 });
    expect(screen()[0]).toBe(0);
  });

  it("packs r, g, b into a 12-bit colour", () => {
    const { clock, screen } = screenRig("rgbmatrix");
    clock({ x: 15, y: 15, r: 0xf, g: 0x8, b: 0x1, write: 1, show: 1 });
    expect(screen()[255]).toBe(0xf81);
  });

  it("keeps the same screen array until show changes it", () => {
    const { clock, screen } = screenRig("dotmatrix");
    const before = screen();
    clock({ x: 5, d: 1, write: 1 });
    expect(screen()).toBe(before);
  });

  it("keeps its pixels when the circuit is edited", () => {
    const { b, scr, engine, clock } = screenRig("dotmatrix");
    clock({ x: 7, d: 1, write: 1, show: 1 });
    b.add("not");
    const next = new Engine(compile(b.circuit, library()), { previous: engine });
    expect((next.state("", scr) as ScreenState).screen[7]).toBe(1);
  });

  it("works inside a block, read by instance path", () => {
    const { b } = screenRig("dotmatrix");
    const chip = makeChip("scr", "Screen", b.circuit);
    const top = new CircuitBuilder();
    const inst = top.add("scr");
    const engine = new Engine(compile(top.circuit, library(chip)));
    expect(engine.state(`${inst}/`, "c0")).toBeDefined();
  });
});

describe("LED and 7-segment display", () => {
  it("are not evaluated, but their pins carry values", () => {
    const b = new CircuitBuilder();
    const vdd = b.add("vdd"), led = b.add("led"), seg = b.add("seg7");
    b.wire([vdd, "out"], [led, "in"]);
    b.wire([vdd, "out"], [seg, "dp"]);
    const netlist = compile(b.circuit, library());
    expect(netlist.prims.map((p) => p.specId)).toEqual(["vdd"]);
    const engine = new Engine(netlist);
    expect(engine.pinValue("", led, "in")?.v).toBe(1);
    expect(engine.pinValue("", seg, "dp")?.v).toBe(1);
  });
});
