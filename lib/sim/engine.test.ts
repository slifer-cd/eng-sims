import { describe, expect, it } from "vitest";
import { type ChipLibrary, compile } from "./compile";
import { Engine } from "./engine";
import { CircuitBuilder, library, makeChip } from "./test-utils";
import { type Value, fromInt, toBitString } from "./value";

const empty = library();

function run(b: CircuitBuilder, lib: ChipLibrary = empty) {
  const netlist = compile(b.circuit, lib);
  expect(netlist.errors).toEqual([]);
  return new Engine(netlist);
}

const bits = (v: Value | undefined) => (v ? toBitString(v) : "missing");

/** Set each input to the matching bit of `n` (first input = MSB) and return the output bits. */
function apply(engine: Engine, inputs: string[], outputs: string[], n: number) {
  inputs.forEach((id, i) => engine.setInput(id, fromInt(1, (n >> (inputs.length - 1 - i)) & 1)));
  return outputs.map((id) => bits(engine.outputValue(id))).join("");
}

function truthTable(engine: Engine, inputs: string[], outputs: string[]) {
  return Array.from({ length: 1 << inputs.length }, (_, n) => apply(engine, inputs, outputs, n));
}

/** A single gate wired to two inputs and one output. */
function gateCircuit(chipId: string) {
  const b = new CircuitBuilder();
  const a = b.add("input"), c = b.add("input"), g = b.add(chipId), out = b.add("output");
  b.wire([a, "out"], [g, "in0"]);
  b.wire([c, "out"], [g, "in1"]);
  b.wire([g, "out"], [out, "in"]);
  return { b, inputs: [a, c], outputs: [out] };
}

function halfAdderCircuit() {
  const b = new CircuitBuilder();
  const a = b.add("input", {}, "A"), c = b.add("input", {}, "B");
  const x = b.add("xor"), n = b.add("and");
  const sum = b.add("output", {}, "S"), carry = b.add("output", {}, "C");
  b.wire([a, "out"], [x, "in0"]);
  b.wire([c, "out"], [x, "in1"]);
  b.wire([a, "out"], [n, "in0"]);
  b.wire([c, "out"], [n, "in1"]);
  b.wire([x, "out"], [sum, "in"]);
  b.wire([n, "out"], [carry, "in"]);
  return { b, inputs: [a, c], outputs: [carry, sum] };
}

describe("gates", () => {
  it.each([
    ["and", ["0", "0", "0", "1"]],
    ["or", ["0", "1", "1", "1"]],
    ["nand", ["1", "1", "1", "0"]],
    ["nor", ["1", "0", "0", "0"]],
    ["xor", ["0", "1", "1", "0"]],
    ["xnor", ["1", "0", "0", "1"]],
  ])("%s truth table", (chipId, expected) => {
    const { b, inputs, outputs } = gateCircuit(chipId);
    expect(truthTable(run(b), inputs, outputs)).toEqual(expected);
  });

  it("NOT and constants", () => {
    const b = new CircuitBuilder();
    const vdd = b.add("vdd"), gnd = b.add("gnd"), inv = b.add("not");
    const o1 = b.add("output"), o2 = b.add("output");
    b.wire([vdd, "out"], [inv, "in0"]);
    b.wire([inv, "out"], [o1, "in"]);
    b.wire([gnd, "out"], [o2, "in"]);
    const e = run(b);
    expect(bits(e.outputValue(o1))).toBe("0");
    expect(bits(e.outputValue(o2))).toBe("0");
  });

  it("an unconnected gate input makes the output X", () => {
    const b = new CircuitBuilder();
    const a = b.add("input"), g = b.add("and"), out = b.add("output");
    b.wire([a, "out"], [g, "in0"]);
    b.wire([g, "out"], [out, "in"]);
    const e = run(b);
    e.setInput(a, fromInt(1, 1));
    expect(bits(e.outputValue(out))).toBe("X");
  });

  it("works bitwise on buses", () => {
    const b = new CircuitBuilder();
    const a = b.add("input", { width: 4 }), c = b.add("input", { width: 4 });
    const g = b.add("xor", { width: 4 }), out = b.add("output", { width: 4 });
    b.wire([a, "out"], [g, "in0"]);
    b.wire([c, "out"], [g, "in1"]);
    b.wire([g, "out"], [out, "in"]);
    const e = run(b);
    e.setInput(a, fromInt(4, 0b1100));
    e.setInput(c, fromInt(4, 0b1010));
    expect(bits(e.outputValue(out))).toBe("0110");
  });
});

describe("combinational circuits", () => {
  it("half adder", () => {
    const { b, inputs, outputs } = halfAdderCircuit();
    expect(truthTable(run(b), inputs, outputs)).toEqual(["00", "01", "01", "10"]);
  });

  it("full adder from two nested half adders matches the expected table", () => {
    const ha = makeChip("ha", "Half Adder", halfAdderCircuit().b.circuit);
    // derivePins orders inputs A, B and outputs S, C (by y position).
    const [pa, pb, ps, pc] = ha.pins.map((p) => p.id);

    const b = new CircuitBuilder();
    const a = b.add("input"), bIn = b.add("input"), cin = b.add("input");
    const h1 = b.add("ha"), h2 = b.add("ha"), or = b.add("or");
    const sum = b.add("output"), cout = b.add("output");
    b.wire([a, "out"], [h1, pa]);
    b.wire([bIn, "out"], [h1, pb]);
    b.wire([h1, ps], [h2, pa]);
    b.wire([cin, "out"], [h2, pb]);
    b.wire([h1, pc], [or, "in0"]);
    b.wire([h2, pc], [or, "in1"]);
    b.wire([h2, ps], [sum, "in"]);
    b.wire([or, "out"], [cout, "in"]);

    const table = truthTable(run(b, library(ha)), [a, bIn, cin], [cout, sum]);
    expect(table).toEqual(["00", "01", "01", "10", "01", "10", "10", "11"]);
  });

  it("can read values on pins inside a nested chip", () => {
    const ha = makeChip("ha", "Half Adder", halfAdderCircuit().b.circuit);
    const b = new CircuitBuilder();
    const a = b.add("input"), c = b.add("input"), h = b.add("ha");
    b.wire([a, "out"], [h, ha.pins[0].id]);
    b.wire([c, "out"], [h, ha.pins[1].id]);
    const e = run(b, library(ha));
    e.setInput(a, fromInt(1, 1));
    e.setInput(c, fromInt(1, 1));
    // c3 is the AND gate inside the half adder.
    expect(bits(e.pinValue(`${h}/`, "c3", "out"))).toBe("1");
  });
});

describe("sequential circuits", () => {
  function srLatch() {
    const b = new CircuitBuilder();
    const s = b.add("input"), r = b.add("input");
    const n1 = b.add("nor"), n2 = b.add("nor");
    const q = b.add("output"), qn = b.add("output");
    b.wire([r, "out"], [n1, "in0"]);
    b.wire([s, "out"], [n2, "in0"]);
    const qWire = b.wire([n1, "out"], [n2, "in1"]);
    const qnWire = b.wire([n2, "out"], [n1, "in1"]);
    b.junction(qWire, [q, "in"]);
    b.junction(qnWire, [qn, "in"]);
    return { b, s, r, q, qn };
  }

  it("SR NOR latch settles, sets, holds and resets", () => {
    const { b, s, r, q, qn } = srLatch();
    const e = run(b);
    const state = () => bits(e.outputValue(q)) + bits(e.outputValue(qn));
    expect(e.oscillating).toBe(false);
    expect(["01", "10"]).toContain(state());

    e.setInput(s, fromInt(1, 1));
    expect(state()).toBe("10");
    e.setInput(s, fromInt(1, 0));
    expect(state()).toBe("10");
    e.setInput(r, fromInt(1, 1));
    expect(state()).toBe("01");
    e.setInput(r, fromInt(1, 0));
    expect(state()).toBe("01");
    expect(e.oscillating).toBe(false);
  });

  it("detects a ring oscillator", () => {
    const b = new CircuitBuilder();
    const g = [b.add("not"), b.add("not"), b.add("not")];
    g.forEach((id, i) => b.wire([id, "out"], [g[(i + 1) % 3], "in0"]));
    const e = run(b);
    expect(e.oscillating).toBe(true);
  });

  it("clock toggles every `period` ticks", () => {
    const b = new CircuitBuilder();
    const clk = b.add("clock", { period: 2 }), out = b.add("output");
    b.wire([clk, "out"], [out, "in"]);
    const e = run(b);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(bits(e.outputValue(out)));
      e.tick();
    }
    expect(seen.join("")).toBe("001100");
  });

  it("keeps latch state, inputs and time when the circuit is recompiled", () => {
    const { b, s, q, qn } = srLatch();
    const e1 = run(b);
    e1.setInput(s, fromInt(1, 1));
    e1.setInput(s, fromInt(1, 0));
    e1.tick(3);
    // An unrelated edit: add a gate.
    b.add("not");
    const e2 = new Engine(compile(b.circuit, empty), { previous: e1 });
    expect(bits(e2.outputValue(q)) + bits(e2.outputValue(qn))).toBe("10");
    expect(e2.time).toBe(3);

    e1.setInput(s, fromInt(1, 1));
    const e3 = new Engine(compile(b.circuit, empty), { previous: e1 });
    expect(bits(e3.getInput(s))).toBe("1");
  });

  it("reads values on wires", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdd"), o = b.add("output");
    const w = b.wire([v, "out"], [o, "in"]);
    expect(bits(run(b).wireValue(w))).toBe("1");
  });

  it("carries input values over into a new engine", () => {
    const { b, inputs, outputs } = gateCircuit("and");
    const e1 = run(b);
    inputs.forEach((id) => e1.setInput(id, fromInt(1, 1)));
    const e2 = new Engine(compile(b.circuit, empty), { inputs: e1.inputSnapshot() });
    expect(bits(e2.outputValue(outputs[0]))).toBe("1");
  });
});

describe("tri-state buses", () => {
  function sharedBus() {
    const b = new CircuitBuilder();
    const d1 = b.add("input", { width: 4 }), e1 = b.add("input");
    const d2 = b.add("input", { width: 4 }), e2 = b.add("input");
    const t1 = b.add("tristate", { width: 4 }), t2 = b.add("tristate", { width: 4 });
    const out = b.add("output", { width: 4 });
    b.wire([d1, "out"], [t1, "data"]);
    b.wire([e1, "out"], [t1, "en"]);
    b.wire([d2, "out"], [t2, "data"]);
    b.wire([e2, "out"], [t2, "en"]);
    b.wire([t1, "out"], [out, "in"]);
    b.wire([t2, "out"], [out, "in"]);
    const e = run(b);
    e.setInput(d1, fromInt(4, 0b1100));
    e.setInput(d2, fromInt(4, 0b1010));
    return { e, e1, e2, out };
  }

  it("is Z when no driver is enabled", () => {
    const { e, out } = sharedBus();
    expect(bits(e.outputValue(out))).toBe("ZZZZ");
  });

  it("passes the one enabled driver through", () => {
    const { e, e1, e2, out } = sharedBus();
    e.setInput(e2, fromInt(1, 1));
    expect(bits(e.outputValue(out))).toBe("1010");
    e.setInput(e2, fromInt(1, 0));
    e.setInput(e1, fromInt(1, 1));
    expect(bits(e.outputValue(out))).toBe("1100");
  });

  it("is X where two enabled drivers disagree", () => {
    const { e, e1, e2, out } = sharedBus();
    e.setInput(e1, fromInt(1, 1));
    e.setInput(e2, fromInt(1, 1));
    expect(bits(e.outputValue(out))).toBe("1XX0");
  });
});

describe("splitter and merger", () => {
  it("split then merge round-trips an 8-bit bus with uneven parts", () => {
    const b = new CircuitBuilder();
    const props = { width: 8, parts: "3,1,4" };
    const a = b.add("input", { width: 8 }), sp = b.add("splitter", props), mg = b.add("merger", props);
    const out = b.add("output", { width: 8 }), hi = b.add("output", { width: 4 });
    b.wire([a, "out"], [sp, "bus"]);
    for (const p of ["p0", "p1", "p2"]) b.wire([sp, p], [mg, p]);
    b.wire([mg, "bus"], [out, "in"]);
    b.wire([sp, "p2"], [hi, "in"]);
    const e = run(b);
    e.setInput(a, fromInt(8, 0b1011_0110));
    expect(bits(e.outputValue(out))).toBe("10110110");
    expect(bits(e.outputValue(hi))).toBe("1011");
  });
});

describe("compile errors", () => {
  it("reports width mismatches", () => {
    const b = new CircuitBuilder();
    const a = b.add("input", { width: 4 }), out = b.add("output");
    b.wire([a, "out"], [out, "in"]);
    expect(compile(b.circuit, empty).errors).toHaveLength(1);
  });

  it("rejects a chip that contains itself", () => {
    const inner = new CircuitBuilder();
    inner.add("self");
    const self = makeChip("self", "Self", inner.circuit);
    const b = new CircuitBuilder();
    b.add("self");
    const { errors } = compile(b.circuit, library(self));
    expect(errors.map((e) => e.message)).toEqual(['Chip "Self" contains itself']);
  });

  it("reports wires to pins a chip no longer has", () => {
    const b = new CircuitBuilder();
    const a = b.add("input"), g = b.add("not");
    b.wire([a, "out"], [g, "in7"]);
    expect(compile(b.circuit, empty).errors).toHaveLength(1);
  });
});

describe("bus endpoints", () => {
  it("only join wires: a bus between two endpoints carries the value", () => {
    const b = new CircuitBuilder();
    const a = b.add("input", { width: 8 }), e1 = b.add("busend", { width: 8 }), e2 = b.add("busend", { width: 8 });
    const o = b.add("output", { width: 8 });
    b.wire([a, "out"], [e1, "bus"]);
    b.wire([e1, "bus"], [e2, "bus"]);
    b.wire([e2, "bus"], [o, "in"]);
    const netlist = compile(b.circuit, library());
    expect(netlist.prims.map((p) => p.specId)).toEqual(["input"]);
    const engine = new Engine(netlist);
    engine.setInput(a, fromInt(8, 0xa5));
    expect(engine.outputValue(o)?.v).toBe(0xa5);
  });

  it("reports a width mismatch", () => {
    const b = new CircuitBuilder();
    const a = b.add("input", { width: 4 }), e = b.add("busend", { width: 8 });
    b.wire([a, "out"], [e, "bus"]);
    expect(compile(b.circuit, library()).errors.map((x) => x.message)).toEqual([
      expect.stringContaining("Width mismatch"),
    ]);
  });
});
