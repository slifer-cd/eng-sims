import { describe, expect, it } from "vitest";
import { CircuitBuilder } from "../test-utils";
import { compileCircuit } from "../sim/compile";
import { Engine } from "../sim/engine";
import { Recorder, TraceBuffer, activeTraces, autoWindow, repairScope, sampleAt } from "./scope";

describe("activeTraces", () => {
  it("plots probes unless they opt out, then the traces added by hand", () => {
    const b = new CircuitBuilder();
    const p1 = b.add("probe"), p2 = b.add("probe", { plot: false }), r = b.add("resistor");
    const traces = activeTraces(b.circuit, [
      { compId: r, quantity: "i" },
      { compId: p1, quantity: "v" },
      { compId: "gone", quantity: "v" },
    ]);
    expect(traces).toEqual([
      { compId: p1, quantity: "v" },
      { compId: r, quantity: "i" },
    ]);
    expect(traces.some((t) => t.compId === p2)).toBe(false);
  });
});

describe("TraceBuffer", () => {
  it("keeps the newest samples once full", () => {
    const buf = new TraceBuffer(3);
    for (let i = 1; i <= 5; i++) buf.push(i, i * 10);
    expect(buf.length).toBe(3);
    const { ts, ys } = buf.since(-Infinity);
    expect([...ts]).toEqual([3, 4, 5]);
    expect([...ys]).toEqual([30, 40, 50]);
  });

  it("returns the samples from a time on, with the one just before for a continuous line", () => {
    const buf = new TraceBuffer(10);
    for (let i = 0; i < 6; i++) buf.push(i, i);
    expect([...buf.since(2.5).ts]).toEqual([2, 3, 4, 5]);
  });
});

describe("Recorder", () => {
  function divider() {
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 4 }), r = b.add("resistor"), g = b.add("ground");
    b.wire([v, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    return { e: new Engine(compileCircuit(b.circuit), { settings: { dt: 1e-5 } }), r };
  }

  it("samples each trace no more often than the gap", () => {
    const { e, r } = divider();
    const rec = new Recorder(100);
    const traces = [{ compId: r, quantity: "v" as const }, { compId: r, quantity: "i" as const }];
    for (let i = 0; i < 10; i++) {
      e.step();
      rec.record(e, traces, 3e-5);
    }
    const { ts, ys } = rec.series(`${r}:v`, -Infinity);
    expect(ts.length).toBe(4);
    expect([...ys]).toEqual([4, 4, 4, 4].map((v) => expect.closeTo(v, 6)));
    expect(rec.series(`${r}:i`, -Infinity).ys[0]).toBeCloseTo(4e-3, 9);
  });

  it("starts over when time goes back", () => {
    const rec = new Recorder(100);
    const a = divider();
    for (let i = 0; i < 3; i++) a.e.step();
    rec.record(a.e, [{ compId: a.r, quantity: "v" }], 0);
    const b = divider();
    b.e.step();
    rec.record(b.e, [{ compId: b.r, quantity: "v" }], 1e-5);
    expect([...rec.series(`${b.r}:v`, -Infinity).ts]).toEqual([b.e.time]);
  });

  it("starts over for a new run that reaches the same time", () => {
    const rec = new Recorder(100);
    const a = divider(), b = divider();
    a.e.step();
    rec.record(a.e, [{ compId: a.r, quantity: "v" }], 1e-6);
    b.e.step();
    rec.record(b.e, [{ compId: b.r, quantity: "i" }], 1e-6);
    expect(rec.series(`${b.r}:i`, -Infinity).ts.length).toBe(1);
    expect(rec.series(`${a.r}:v`, -Infinity).ts.length).toBe(0);
  });

  it("forgets everything on clear", () => {
    const { e, r } = divider();
    const rec = new Recorder(100);
    e.step();
    rec.record(e, [{ compId: r, quantity: "v" }], 0);
    rec.clear();
    expect(rec.series(`${r}:v`, -Infinity).ts.length).toBe(0);
  });
});

describe("autoWindow", () => {
  it("shows two periods of the slowest AC source", () => {
    const b = new CircuitBuilder();
    b.add("vac", { frequency: 1000 });
    b.add("iac", { frequency: 50 });
    expect(autoWindow(b.circuit)).toBeCloseTo(0.04, 12);
  });

  it("falls back to 100 ms without AC sources", () => {
    const b = new CircuitBuilder();
    b.add("vdc");
    expect(autoWindow(b.circuit)).toBe(0.1);
  });
});

describe("repairScope", () => {
  it("keeps good traces and window, and drops the rest", () => {
    expect(
      repairScope({ traces: [{ compId: "r1", quantity: "i" }, { compId: 3, quantity: "v" }, { compId: "r2", quantity: "x" }], window: 0.02 }),
    ).toEqual({ traces: [{ compId: "r1", quantity: "i" }], window: 0.02 });
    expect(repairScope({ window: 7 })).toEqual({ traces: [], window: "auto" });
    expect(repairScope(null)).toEqual({ traces: [], window: "auto" });
  });
});

describe("sampleAt", () => {
  const ts = Float64Array.from([0, 1, 2, 3]), ys = Float64Array.from([10, 11, 12, 13]);
  it("reads the sample nearest a time", () => {
    expect(sampleAt(ts, ys, 1.4)).toBe(11);
    expect(sampleAt(ts, ys, 1.6)).toBe(12);
    expect(sampleAt(ts, ys, -5)).toBe(10);
    expect(sampleAt(ts, ys, 9)).toBe(13);
  });

  it("has nothing to read without samples", () => {
    expect(sampleAt(new Float64Array(0), new Float64Array(0), 1)).toBeUndefined();
  });
});
