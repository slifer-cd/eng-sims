import type { Circuit, ComponentInst, Endpoint, Props, Rotation, Wire } from "../../model/types";
import type { ScopeSettings } from "./scope";
import type { AcsSettings } from "./settings";

/*
 * Built-in example circuits, opened from the toolbar. Each is laid out on the grid by hand:
 * terminals sit where lib/acs/parts puts them (a two-terminal part's ends at ±30 along its
 * axis, a source's + at the top), and probes show what to watch.
 */

export interface Example {
  id: string;
  name: string;
  description: string;
  circuit: Circuit;
  scope?: ScopeSettings;
  settings?: Partial<Pick<AcsSettings, "dt" | "speed">>;
}

/** A terminal, or a point on a wire for a junction. */
type End = [compId: string, pinId: string] | { on: string; x: number; y: number };

class Sketch {
  private readonly components: ComponentInst[] = [];
  private readonly wires: Wire[] = [];

  part(id: string, chipId: string, x: number, y: number, props: Props = {}, opts: { rotation?: Rotation; label?: string } = {}) {
    const c: ComponentInst = { id, chipId, x, y, rotation: opts.rotation ?? 0, props };
    if (opts.label) c.label = opts.label;
    this.components.push(c);
  }

  /** Wire two ends, through the given bends. Returns the wire's id. */
  wire(a: End, b: End, ...bends: [number, number][]) {
    const id = `w${this.wires.length + 1}`;
    const end = (e: End): Endpoint =>
      Array.isArray(e) ? { kind: "pin", compId: e[0], pinId: e[1] } : { kind: "wire", wireId: e.on, x: e.x, y: e.y };
    this.wires.push({ id, a: end(a), b: end(b), points: bends.map(([x, y]) => ({ x, y })) });
    return id;
  }

  get circuit(): Circuit {
    return { components: this.components, wires: this.wires };
  }
}

function divider(): Example {
  const s = new Sketch();
  s.part("v1", "vdc", 0, 0, { v: 9 }, { label: "V1" });
  s.part("r1", "resistor", 60, -60, { r: 10e3 }, { label: "R1" });
  s.part("r2", "resistor", 120, 0, { r: 4.7e3 }, { rotation: 90, label: "R2" });
  s.part("g1", "ground", 60, 70);
  s.part("out", "probe", 160, -80, { name: "out" });
  s.wire(["v1", "p"], ["r1", "a"], [0, -60]);
  const mid = s.wire(["r1", "b"], ["r2", "a"], [120, -60]);
  s.wire(["r2", "b"], ["g1", "g"], [120, 60]);
  s.wire(["v1", "n"], ["g1", "g"], [0, 60]);
  s.wire(["out", "in"], { on: mid, x: 120, y: -60 });
  return {
    id: "divider",
    name: "Voltage divider",
    description: "Two resistors split 9 V in the ratio of their values. Change R2 and watch the output.",
    circuit: s.circuit,
  };
}

function rcCharge(): Example {
  const s = new Sketch();
  s.part("v1", "vdc", 0, 0, { v: 5 }, { label: "V1" });
  s.part("s1", "switch", 60, -60, { closed: false }, { label: "Charge" });
  s.part("r1", "resistor", 150, -60, { r: 1e3 }, { label: "R" });
  s.part("c1", "capacitor", 210, 0, { c: 100e-6 }, { rotation: 90, label: "C" });
  s.part("b1", "button", 300, -10, {}, { rotation: 90, label: "Discharge" });
  s.part("r2", "resistor", 300, 60, { r: 100 }, { rotation: 90 });
  s.part("g1", "ground", 0, 80);
  s.part("g2", "ground", 210, 80);
  s.part("g3", "ground", 300, 130);
  s.part("vc", "probe", 210, -110, { name: "vC" });
  s.wire(["v1", "p"], ["s1", "a"], [0, -60]);
  s.wire(["s1", "b"], ["r1", "a"]);
  const top = s.wire(["r1", "b"], ["c1", "a"], [210, -60]);
  s.wire(["b1", "a"], { on: top, x: 210, y: -60 }, [300, -60]);
  s.wire(["b1", "b"], ["r2", "a"]);
  s.wire(["r2", "b"], ["g3", "g"]);
  s.wire(["c1", "b"], ["g2", "g"]);
  s.wire(["v1", "n"], ["g1", "g"]);
  s.wire(["vc", "in"], { on: top, x: 210, y: -60 });
  return {
    id: "rc",
    name: "RC charging",
    description: "Close the switch to charge C through R (τ = RC = 0.1 s); hold the button to discharge it.",
    circuit: s.circuit,
    scope: { traces: [{ compId: "c1", quantity: "i" }], window: 0.5 },
    settings: { speed: 0.1 },
  };
}

function rlc(): Example {
  const s = new Sketch();
  s.part("v1", "vdc", 0, 0, { v: 5 }, { label: "V1" });
  s.part("s1", "switch", 60, -60, { closed: false }, { label: "S1" });
  s.part("r1", "resistor", 150, -60, { r: 10 }, { label: "R" });
  s.part("l1", "inductor", 230, -60, { l: 10e-3 }, { label: "L" });
  s.part("c1", "capacitor", 290, 0, { c: 10e-6 }, { rotation: 90, label: "C" });
  s.part("g1", "ground", 0, 80);
  s.part("g2", "ground", 290, 80);
  s.part("vc", "probe", 290, -110, { name: "vC" });
  s.wire(["v1", "p"], ["s1", "a"], [0, -60]);
  s.wire(["s1", "b"], ["r1", "a"]);
  s.wire(["r1", "b"], ["l1", "a"]);
  const top = s.wire(["l1", "b"], ["c1", "a"], [290, -60]);
  s.wire(["c1", "b"], ["g2", "g"]);
  s.wire(["v1", "n"], ["g1", "g"]);
  s.wire(["vc", "in"], { on: top, x: 290, y: -60 });
  return {
    id: "rlc",
    name: "RLC ringing",
    description: "Close or open S1: the series RLC rings at about 500 Hz and dies away. Raise R to damp it.",
    circuit: s.circuit,
    scope: { traces: [{ compId: "l1", quantity: "i" }], window: 0.02 },
  };
}

function halfWave(): Example {
  const s = new Sketch();
  s.part("v1", "vac", 0, 0, { amplitude: 12, frequency: 50 }, { label: "Vin" });
  s.part("d1", "diode", 60, -60, {}, { label: "D1" });
  s.part("c1", "capacitor", 130, 0, { c: 470e-6 }, { rotation: 90, label: "C" });
  s.part("rl", "resistor", 230, 0, { r: 1e3 }, { rotation: 90, label: "Load" });
  s.part("g1", "ground", 0, 80);
  s.part("g2", "ground", 130, 80);
  s.part("g3", "ground", 230, 80);
  s.part("vin", "probe", 0, -100, { name: "in" });
  s.part("vout", "probe", 190, -100, { name: "out" });
  const input = s.wire(["v1", "p"], ["d1", "a"], [0, -60]);
  const top = s.wire(["d1", "k"], ["c1", "a"], [130, -60]);
  const load = s.wire(["rl", "a"], { on: top, x: 130, y: -60 }, [230, -60]);
  s.wire(["c1", "b"], ["g2", "g"]);
  s.wire(["rl", "b"], ["g3", "g"]);
  s.wire(["v1", "n"], ["g1", "g"]);
  s.wire(["vin", "in"], { on: input, x: 0, y: -60 });
  s.wire(["vout", "in"], { on: load, x: 190, y: -60 });
  return {
    id: "half-wave",
    name: "Half-wave rectifier",
    description: "A diode lets the positive half-cycles through and the capacitor holds the peak. Remove C to see the bare half-waves.",
    circuit: s.circuit,
  };
}

function bridge(): Example {
  const s = new Sketch();
  s.part("v1", "vac", -80, 0, { amplitude: 12, frequency: 50 }, { label: "Vin" });
  s.part("la", "netlabel", -40, -50, { name: "AC1" });
  s.part("lb", "netlabel", -40, 50, { name: "AC2" });
  s.part("d1", "diode", 100, -50, {}, { rotation: 270 });
  s.part("d3", "diode", 100, 50, {}, { rotation: 270 });
  s.part("d2", "diode", 180, -50, {}, { rotation: 270 });
  s.part("d4", "diode", 180, 50, {}, { rotation: 270 });
  s.part("lc", "netlabel", 140, 0, { name: "AC1" });
  s.part("ld", "netlabel", 220, 0, { name: "AC2" });
  s.part("rl", "resistor", 280, 0, { r: 1e3 }, { rotation: 90, label: "Load" });
  s.part("c1", "capacitor", 380, 0, { c: 220e-6 }, { rotation: 90, label: "C" });
  s.part("g1", "ground", 220, 100);
  s.part("out", "probe", 230, -120, { name: "out" });
  s.wire(["v1", "p"], ["la", "in"], [-80, -50]);
  s.wire(["v1", "n"], ["lb", "in"], [-80, 50]);
  const left = s.wire(["d1", "a"], ["d3", "k"]);
  const right = s.wire(["d2", "a"], ["d4", "k"]);
  s.wire(["lc", "in"], { on: left, x: 100, y: 0 });
  s.wire(["ld", "in"], { on: right, x: 180, y: 0 });
  s.wire(["d1", "k"], ["d2", "k"]);
  const plus = s.wire(["d2", "k"], ["rl", "a"], [280, -80]);
  s.wire(["c1", "a"], { on: plus, x: 280, y: -80 }, [380, -80]);
  s.wire(["d3", "a"], ["d4", "a"]);
  const minus = s.wire(["d4", "a"], ["rl", "b"], [280, 80]);
  s.wire(["c1", "b"], { on: minus, x: 280, y: 80 }, [380, 80]);
  s.wire(["g1", "g"], { on: minus, x: 220, y: 80 });
  s.wire(["out", "in"], { on: plus, x: 230, y: -80 });
  return {
    id: "bridge",
    name: "Bridge rectifier",
    description: "Four diodes turn both half-cycles positive. The source connects to the bridge through net labels AC1 and AC2.",
    circuit: s.circuit,
    scope: { traces: [{ compId: "v1", quantity: "v" }], window: "auto" },
  };
}

function zener(): Example {
  const s = new Sketch();
  s.part("v1", "vac", 0, 0, { amplitude: 2, offset: 12, frequency: 100 });
  s.part("r1", "resistor", 150, -60, { r: 220 }, { label: "R" });
  s.part("z1", "zener", 210, 0, { vz: 5.6 }, { rotation: 270, label: "Z" });
  s.part("rl", "resistor", 290, 0, { r: 1e3 }, { rotation: 90, label: "Load" });
  s.part("g1", "ground", 0, 80);
  s.part("g2", "ground", 210, 80);
  s.part("g3", "ground", 290, 80);
  s.part("vin", "probe", 0, -100, { name: "in" });
  s.part("vout", "probe", 250, -100, { name: "out" });
  const input = s.wire(["v1", "p"], ["r1", "a"], [0, -60]);
  const top = s.wire(["r1", "b"], ["z1", "k"], [210, -60]);
  const load = s.wire(["rl", "a"], { on: top, x: 210, y: -60 }, [290, -60]);
  s.wire(["z1", "a"], ["g2", "g"]);
  s.wire(["rl", "b"], ["g3", "g"]);
  s.wire(["v1", "n"], ["g1", "g"]);
  s.wire(["vin", "in"], { on: input, x: 0, y: -60 });
  s.wire(["vout", "in"], { on: load, x: 250, y: -60 });
  return {
    id: "zener",
    name: "Zener regulator",
    description: "A rippling 10–14 V supply comes out as a steady 5.6 V: the zener takes whatever current the load doesn't.",
    circuit: s.circuit,
  };
}

function commonEmitter(): Example {
  const s = new Sketch();
  s.part("q1", "npn", 200, 0, { beta: 100 });
  s.part("vcc1", "vrail-dc", 120, -130, { v: 12 });
  s.part("r1", "resistor", 120, -60, { r: 47e3 }, { rotation: 90, label: "R1" });
  s.part("r2", "resistor", 120, 50, { r: 10e3 }, { rotation: 90, label: "R2" });
  s.part("g1", "ground", 120, 110);
  s.part("vcc2", "vrail-dc", 210, -170, { v: 12 });
  s.part("rc", "resistor", 210, -100, { r: 2.2e3 }, { rotation: 90, label: "RC" });
  s.part("re", "resistor", 210, 90, { r: 1e3 }, { rotation: 90, label: "RE" });
  s.part("g2", "ground", 210, 150);
  s.part("ce", "capacitor", 290, 90, { c: 10e-6, v0: 1.35 }, { rotation: 90, label: "CE" });
  s.part("g3", "ground", 290, 150);
  s.part("vin", "vac", 0, 60, { amplitude: 0.02, frequency: 1e3 });
  s.part("cin", "capacitor", 60, 0, { c: 1e-6, v0: -2 }, { label: "Cin" });
  s.part("g4", "ground", 0, 130);
  s.part("cout", "capacitor", 260, -50, { c: 1e-6, v0: 9.1 }, { label: "Cout" });
  s.part("rl", "resistor", 340, 0, { r: 10e3 }, { rotation: 90, label: "Load" });
  s.part("g5", "ground", 340, 70);
  s.part("pin", "probe", 0, -60, { name: "in" });
  s.part("pout", "probe", 380, -90, { name: "out" });
  s.wire(["vcc1", "p"], ["r1", "a"]);
  const base = s.wire(["r1", "b"], ["r2", "a"]);
  s.wire(["q1", "b"], { on: base, x: 120, y: 0 });
  s.wire(["r2", "b"], ["g1", "g"]);
  s.wire(["vcc2", "p"], ["rc", "a"]);
  const collector = s.wire(["rc", "b"], ["q1", "c"]);
  const emitter = s.wire(["q1", "e"], ["re", "a"]);
  s.wire(["re", "b"], ["g2", "g"]);
  s.wire(["ce", "a"], { on: emitter, x: 210, y: 50 }, [290, 50]);
  s.wire(["ce", "b"], ["g3", "g"]);
  const input = s.wire(["vin", "p"], ["cin", "a"], [0, 0]);
  s.wire(["cin", "b"], { on: base, x: 120, y: 0 });
  s.wire(["vin", "n"], ["g4", "g"]);
  s.wire(["cout", "a"], { on: collector, x: 210, y: -50 });
  const output = s.wire(["cout", "b"], ["rl", "a"], [340, -50]);
  s.wire(["rl", "b"], ["g5", "g"]);
  s.wire(["pin", "in"], { on: input, x: 0, y: 0 });
  s.wire(["pout", "in"], { on: output, x: 340, y: -50 }, [380, -50]);
  return {
    id: "common-emitter",
    name: "Common-emitter amplifier",
    description: "R1 and R2 bias Q1 into its active region; a 20 mV input comes out about 50 times larger and inverted.",
    circuit: s.circuit,
    settings: { speed: 1e-3 },
  };
}

function mosfetSwitch(): Example {
  const s = new Sketch();
  s.part("m1", "nmos", 190, 10);
  s.part("vdd", "vrail-dc", 200, -140, { v: 12 });
  s.part("rl", "resistor", 200, -80, { r: 100 }, { rotation: 90, label: "Lamp" });
  s.part("vg", "vac", 0, 40, { waveform: "square", amplitude: 5, offset: 5, frequency: 2 });
  s.part("rg", "resistor", 60, 10, { r: 100 }, { label: "RG" });
  s.part("g1", "ground", 200, 80);
  s.part("g2", "ground", 0, 110);
  s.part("pd", "probe", 240, -60, { name: "drain" });
  s.part("pg", "probe", 110, -30, { name: "gate" });
  s.wire(["vdd", "p"], ["rl", "a"]);
  const drain = s.wire(["rl", "b"], ["m1", "d"]);
  s.wire(["m1", "s"], ["g1", "g"]);
  s.wire(["vg", "p"], ["rg", "a"]);
  const gate = s.wire(["rg", "b"], ["m1", "g"]);
  s.wire(["vg", "n"], ["g2", "g"]);
  s.wire(["pd", "in"], { on: drain, x: 200, y: -30 }, [240, -30]);
  s.wire(["pg", "in"], { on: gate, x: 110, y: 10 });
  return {
    id: "mosfet-switch",
    name: "MOSFET switch",
    description: "A 0–10 V square wave on the gate turns the MOSFET fully on and off, switching 120 mA through the lamp.",
    circuit: s.circuit,
    scope: { traces: [{ compId: "rl", quantity: "i" }], window: 1 },
    settings: { dt: 1e-4, speed: 0.1 },
  };
}

/** The op-amp at (150, −50): − at (120, −60), + at (120, −40), out at (180, −50). */
function inverting(): Example {
  const s = new Sketch();
  s.part("v1", "vac", 0, 0, { amplitude: 1, frequency: 1e3 }, { label: "Vin" });
  s.part("rin", "resistor", 60, -60, { r: 1e3 }, { label: "Rin" });
  s.part("rf", "resistor", 150, -110, { r: 4.7e3 }, { label: "Rf" });
  s.part("u1", "opamp", 150, -50);
  s.part("g1", "ground", 120, 0);
  s.part("g2", "ground", 0, 80);
  s.part("pi", "probe", 0, -110, { name: "in" });
  s.part("po", "probe", 220, -80, { name: "out" });
  const input = s.wire(["v1", "p"], ["rin", "a"], [0, -60]);
  s.wire(["rin", "b"], ["u1", "minus"]);
  s.wire(["rf", "a"], ["u1", "minus"]);
  s.wire(["rf", "b"], ["u1", "out"]);
  s.wire(["u1", "plus"], ["g1", "g"]);
  s.wire(["v1", "n"], ["g2", "g"]);
  s.wire(["pi", "in"], { on: input, x: 0, y: -60 });
  s.wire(["po", "in"], ["u1", "out"], [220, -50]);
  return {
    id: "inverting",
    name: "Inverting amplifier",
    description: "Gain −Rf/Rin = −4.7: the output is the input upside down and larger. Push Rf up until it clips at ±15 V.",
    circuit: s.circuit,
    settings: { speed: 1e-3 },
  };
}

function nonInverting(): Example {
  const s = new Sketch();
  s.part("u1", "opamp", 150, -50);
  s.part("v1", "vac", 60, 30, { amplitude: 1, frequency: 1e3 }, { label: "Vin" });
  s.part("rf", "resistor", 150, -110, { r: 2e3 }, { label: "Rf" });
  s.part("rg", "resistor", 60, -80, { r: 1e3 }, { label: "Rg" });
  s.part("g1", "ground", 30, -50);
  s.part("g2", "ground", 60, 100);
  s.part("pi", "probe", 90, 0, { name: "in" }, { rotation: 180 });
  s.part("po", "probe", 220, -80, { name: "out" });
  const input = s.wire(["v1", "p"], ["u1", "plus"], [60, -40]);
  const feedback = s.wire(["rf", "a"], ["u1", "minus"]);
  s.wire(["rf", "b"], ["u1", "out"]);
  s.wire(["rg", "b"], { on: feedback, x: 120, y: -80 });
  s.wire(["rg", "a"], ["g1", "g"]);
  s.wire(["v1", "n"], ["g2", "g"]);
  s.wire(["pi", "in"], { on: input, x: 90, y: -40 });
  s.wire(["po", "in"], ["u1", "out"], [220, -50]);
  return {
    id: "non-inverting",
    name: "Non-inverting amplifier",
    description: "Gain 1 + Rf/Rg = 3, in phase with the input.",
    circuit: s.circuit,
    settings: { speed: 1e-3 },
  };
}

function schmitt(): Example {
  const s = new Sketch();
  s.part("u1", "opamp", 150, -50);
  s.part("v1", "vac", -60, 0, { waveform: "triangle", amplitude: 10, frequency: 10 });
  s.part("r1", "resistor", 150, 0, { r: 10e3 }, { label: "R1" });
  s.part("r2", "resistor", 120, 50, { r: 10e3 }, { rotation: 90, label: "R2" });
  s.part("g1", "ground", 120, 110);
  s.part("g2", "ground", -60, 80);
  s.part("pi", "probe", 40, -100, { name: "in" });
  s.part("po", "probe", 220, -80, { name: "out" });
  const input = s.wire(["v1", "p"], ["u1", "minus"], [-60, -60]);
  s.wire(["u1", "out"], ["r1", "b"]);
  s.wire(["u1", "plus"], ["r1", "a"]);
  s.wire(["r1", "a"], ["r2", "a"]);
  s.wire(["r2", "b"], ["g1", "g"]);
  s.wire(["v1", "n"], ["g2", "g"]);
  s.wire(["pi", "in"], { on: input, x: 40, y: -60 });
  s.wire(["po", "in"], ["u1", "out"], [220, -50]);
  return {
    id: "schmitt",
    name: "Schmitt trigger",
    description: "Positive feedback through R1 and R2 gives the op-amp two thresholds, ±7.5 V: the output only flips once the input crosses the far one.",
    circuit: s.circuit,
    settings: { dt: 1e-5, speed: 0.1 },
    scope: { traces: [], window: 0.2 },
  };
}

function relayLamp(): Example {
  const s = new Sketch();
  s.part("vcc", "vrail-dc", 0, -110, { v: 12 });
  s.part("b1", "button", 0, -40, {}, { rotation: 90, label: "Press" });
  s.part("k1", "relay", 80, 20, {}, { label: "K1" });
  s.part("d1", "diode", 20, 40, {}, { rotation: 270 });
  s.part("g1", "ground", 50, 80);
  s.part("v2", "vrail-dc", 260, -30, { v: 5 });
  s.part("l2", "resistor", 140, -70, { r: 50 }, { rotation: 270, label: "NC lamp" });
  s.part("g2", "ground", 140, -120, {}, { rotation: 180 });
  s.part("l1", "resistor", 140, 110, { r: 50 }, { rotation: 90, label: "NO lamp" });
  s.part("g3", "ground", 140, 170);
  s.wire(["vcc", "p"], ["b1", "a"]);
  const coil = s.wire(["b1", "b"], ["k1", "c1"], [0, 0]);
  s.wire(["d1", "k"], { on: coil, x: 20, y: 0 });
  s.wire(["k1", "c2"], ["g1", "g"]);
  s.wire(["d1", "a"], ["g1", "g"]);
  s.wire(["v2", "p"], ["k1", "com"], [260, 20]);
  s.wire(["k1", "nc"], ["l2", "a"], [140, 0]);
  s.wire(["l2", "b"], ["g2", "g"]);
  s.wire(["k1", "no"], ["l1", "a"], [140, 40]);
  s.wire(["l1", "b"], ["g3", "g"]);
  return {
    id: "relay",
    name: "Relay and push button",
    description: "Hold the button: the coil current builds up, the relay pulls in and moves the 5 V from the NC lamp to the NO lamp. The diode catches the coil's kick on release.",
    circuit: s.circuit,
    scope: {
      traces: [
        { compId: "k1", quantity: "i" },
        { compId: "l1", quantity: "i" },
        { compId: "l2", quantity: "i" },
      ],
      window: 0.05,
    },
  };
}

function transformerSupply(): Example {
  const s = new Sketch();
  s.part("v1", "vac", -60, 0, { amplitude: 24, frequency: 50 });
  s.part("t1", "transformer", 80, -10, { l1: 4, ratio: 2, k: 0.999 }, { label: "T1" });
  s.part("g0", "ground", -60, 70);
  s.part("rw", "resistor", 150, -30, { r: 4.7 }, { label: "Winding" });
  s.part("d1", "diode", 230, -30, {}, { label: "D1" });
  s.part("c1", "capacitor", 290, 0, { c: 470e-6 }, { rotation: 90, label: "C" });
  s.part("rl", "resistor", 380, 0, { r: 470 }, { rotation: 90, label: "Load" });
  s.part("g1", "ground", 200, 60);
  s.part("pp", "probe", 0, -70, { name: "in" });
  s.part("ps", "probe", 110, -110, { name: "sec" });
  s.part("po", "probe", 340, -70, { name: "out" });
  const primary = s.wire(["v1", "p"], ["t1", "p1"]);
  s.wire(["v1", "n"], ["t1", "p2"], [50, 30]);
  s.wire(["v1", "n"], ["g0", "g"]);
  s.wire(["t1", "s1"], ["rw", "a"]);
  s.wire(["rw", "b"], ["d1", "a"]);
  s.wire(["d1", "k"], ["c1", "a"]);
  const out = s.wire(["c1", "a"], ["rl", "a"]);
  const bottom = s.wire(["t1", "s2"], ["c1", "b"], [110, 30]);
  s.wire(["c1", "b"], ["rl", "b"]);
  s.wire(["g1", "g"], { on: bottom, x: 200, y: 30 });
  s.wire(["pp", "in"], { on: primary, x: 0, y: -30 });
  s.wire(["ps", "in"], ["t1", "s1"]);
  s.wire(["po", "in"], { on: out, x: 340, y: -30 });
  return {
    id: "transformer",
    name: "Transformer power supply",
    description: "A 2:1 transformer halves the 24 V peak, then a diode and capacitor turn it into roughly 11 V DC. The winding's resistance keeps the first charge from overshooting.",
    circuit: s.circuit,
  };
}

export const EXAMPLES: readonly Example[] = [
  divider(),
  rcCharge(),
  rlc(),
  halfWave(),
  bridge(),
  zener(),
  commonEmitter(),
  mosfetSwitch(),
  inverting(),
  nonInverting(),
  schmitt(),
  relayLamp(),
  transformerSupply(),
];
