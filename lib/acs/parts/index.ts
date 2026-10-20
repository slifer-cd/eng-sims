import type { Props } from "../../model/types";
import { formatSI } from "../units";
import { comparator, opamp } from "../sim/elements/amps";
import { capacitor, inductor, resistor, transformer } from "../sim/elements/passive";
import { bjt, diode, fet } from "../sim/elements/semis";
import { type WaveformProps, currentSource, dc, voltageSource, waveform } from "../sim/elements/sources";
import { button, relay, spdt, spst } from "../sim/elements/switching";
import type { PartSpec, PropField } from "./types";

export * from "./types";

const num = (props: Props, key: string) => props[key] as number;

const WAVEFORMS = [
  { value: "sine", label: "Sine" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
  { value: "sawtooth", label: "Sawtooth" },
];

/** Fields of an AC source whose amplitude and offset are in `unit`. */
function acFields(unit: "V" | "A", amplitude: number): PropField[] {
  return [
    { key: "waveform", label: "Waveform", kind: "select", default: "sine", options: WAVEFORMS },
    { key: "amplitude", label: "Amplitude (peak)", kind: "number", unit, default: amplitude },
    { key: "frequency", label: "Frequency", kind: "number", unit: "Hz", default: 50, positive: true },
    { key: "phase", label: "Phase", kind: "number", unit: "°", default: 0, help: "90° starts at the peak." },
    { key: "offset", label: "DC offset", kind: "number", unit, default: 0 },
  ];
}

const acWave = (props: Props) => waveform(props as unknown as WaveformProps);

function acLabel(props: Props, unit: string) {
  const shape = props.waveform === "sine" ? "" : ` ${props.waveform}`;
  const offset = num(props, "offset") ? ` ${num(props, "offset") > 0 ? "+" : ""}${formatSI(num(props, "offset"), unit)}` : "";
  return `${formatSI(num(props, "amplitude"), unit)} ${formatSI(num(props, "frequency"), "Hz")}${shape}${offset}`;
}

const TWO_TERMINAL_SOURCE = [
  { id: "p", name: "+", x: 0, y: -30 },
  { id: "n", name: "−", x: 0, y: 30 },
];
const RAIL = [{ id: "p", name: "+", x: 0, y: 20 }];
const TWO_TERMINAL = [
  { id: "a", name: "A", x: -30, y: 0 },
  { id: "b", name: "B", x: 30, y: 0 },
];
const DIODE_PINS = [
  { id: "a", name: "Anode", x: -30, y: 0 },
  { id: "k", name: "Cathode", x: 30, y: 0 },
];
const BJT_PINS = [
  { id: "b", name: "Base", x: -30, y: 0 },
  { id: "c", name: "Collector", x: 10, y: -30 },
  { id: "e", name: "Emitter", x: 10, y: 30 },
];
const FET_PINS = [
  { id: "g", name: "Gate", x: -30, y: 0 },
  { id: "d", name: "Drain", x: 10, y: -30 },
  { id: "s", name: "Source", x: 10, y: 30 },
];
const AMP_PINS = [
  { id: "minus", name: "− input", x: -30, y: -10 },
  { id: "plus", name: "+ input", x: -30, y: 10 },
  { id: "out", name: "Output", x: 30, y: 0 },
];

const IS_FIELD: PropField = {
  key: "is",
  label: "Saturation current Is",
  kind: "number",
  unit: "A",
  default: 1e-14,
  positive: true,
  max: 1e-3,
};
const N_FIELD: PropField = { key: "n", label: "Emission coefficient n", kind: "number", default: 1, min: 0.5, max: 10, positive: true };

function bjtSpec(id: "npn" | "pnp"): PartSpec {
  const npn = id === "npn";
  return {
    id,
    name: npn ? "NPN transistor" : "PNP transistor",
    group: "semis",
    keywords: ["bjt", "bipolar", "transistor"],
    terminals: BJT_PINS,
    bounds: { w: 60, h: 60 },
    fields: [
      { key: "beta", label: "Current gain βF", kind: "number", default: 100, positive: true, max: 1e5 },
      { key: "betaR", label: "Reverse gain βR", kind: "number", default: 1, positive: true, max: 1e5 },
      IS_FIELD,
    ],
    create: (c) => [bjt(c, npn ? 1 : -1, { is: num(c.props, "is"), bf: num(c.props, "beta"), br: num(c.props, "betaR") })],
  };
}

function jfetSpec(id: "njfet" | "pjfet"): PartSpec {
  const n = id === "njfet";
  return {
    id,
    name: n ? "N-channel JFET" : "P-channel JFET",
    group: "semis",
    keywords: ["fet", "jfet", "transistor"],
    terminals: FET_PINS,
    bounds: { w: 60, h: 60 },
    fields: [
      { key: "idss", label: "Idss (gate at source)", kind: "number", unit: "A", default: 10e-3, positive: true },
      { key: "vp", label: "Pinch-off |Vp|", kind: "number", unit: "V", default: 2, positive: true },
      { key: "lambda", label: "Channel-length λ", kind: "number", unit: "/V", default: 0, min: 0, max: 1 },
    ],
    create(c) {
      const vp = num(c.props, "vp");
      const model = { vto: -vp, beta: (2 * num(c.props, "idss")) / (vp * vp), lambda: num(c.props, "lambda"), gateIs: 1e-14 };
      return [fet(c, n ? 1 : -1, model)];
    },
  };
}

function mosSpec(id: "nmos" | "pmos"): PartSpec {
  const n = id === "nmos";
  return {
    id,
    name: n ? "N-channel MOSFET" : "P-channel MOSFET",
    group: "semis",
    keywords: ["fet", "mosfet", "transistor", "enhancement"],
    terminals: FET_PINS,
    bounds: { w: 60, h: 60 },
    fields: [
      { key: "vth", label: "Threshold |Vth|", kind: "number", unit: "V", default: 1.5, min: 0 },
      {
        key: "beta",
        label: "Gain β",
        kind: "number",
        unit: "A/V²",
        default: 0.02,
        positive: true,
        help: "Id = β/2 · (Vgs − Vth)² in saturation.",
      },
      { key: "lambda", label: "Channel-length λ", kind: "number", unit: "/V", default: 0, min: 0, max: 1 },
    ],
    create: (c) => [
      fet(c, n ? 1 : -1, { vto: num(c.props, "vth"), beta: num(c.props, "beta"), lambda: num(c.props, "lambda"), gateIs: 0 }),
    ],
  };
}

const specs: PartSpec[] = [
  {
    id: "vdc",
    name: "DC voltage source",
    group: "sources",
    keywords: ["battery", "supply"],
    terminals: TWO_TERMINAL_SOURCE,
    bounds: { w: 40, h: 60 },
    fields: [{ key: "v", label: "Voltage", kind: "number", unit: "V", default: 5 }],
    valueLabel: (p) => formatSI(num(p, "v"), "V"),
    create: (c) => [voltageSource(c, dc(num(c.props, "v")))],
    reference: "n",
  },
  {
    id: "vrail-dc",
    name: "DC voltage rail",
    group: "sources",
    keywords: ["supply", "vcc", "vdd", "single terminal"],
    terminals: RAIL,
    bounds: { w: 40, h: 40 },
    fields: [{ key: "v", label: "Voltage", kind: "number", unit: "V", default: 5 }],
    valueLabel: (p) => formatSI(num(p, "v"), "V"),
    create: (c) => [voltageSource(c, dc(num(c.props, "v")))],
    grounded: true,
  },
  {
    id: "idc",
    name: "DC current source",
    group: "sources",
    terminals: TWO_TERMINAL_SOURCE,
    bounds: { w: 40, h: 60 },
    fields: [{ key: "i", label: "Current", kind: "number", unit: "A", default: 0.01 }],
    valueLabel: (p) => formatSI(num(p, "i"), "A"),
    create: (c) => [currentSource(c, dc(num(c.props, "i")))],
    reference: "n",
  },
  {
    id: "irail-dc",
    name: "DC current rail",
    group: "sources",
    keywords: ["single terminal"],
    terminals: RAIL,
    bounds: { w: 40, h: 40 },
    fields: [{ key: "i", label: "Current", kind: "number", unit: "A", default: 0.01 }],
    valueLabel: (p) => formatSI(num(p, "i"), "A"),
    create: (c) => [currentSource(c, dc(num(c.props, "i")))],
    grounded: true,
  },
  {
    id: "vac",
    name: "AC voltage source",
    group: "sources",
    keywords: ["sine", "square", "triangle", "sawtooth", "signal", "generator", "function"],
    terminals: TWO_TERMINAL_SOURCE,
    bounds: { w: 40, h: 60 },
    fields: acFields("V", 5),
    valueLabel: (p) => acLabel(p, "V"),
    create: (c) => [voltageSource(c, acWave(c.props))],
    reference: "n",
  },
  {
    id: "vrail-ac",
    name: "AC voltage rail",
    group: "sources",
    keywords: ["sine", "square", "signal", "single terminal"],
    terminals: RAIL,
    bounds: { w: 40, h: 40 },
    fields: acFields("V", 5),
    valueLabel: (p) => acLabel(p, "V"),
    create: (c) => [voltageSource(c, acWave(c.props))],
    grounded: true,
  },
  {
    id: "iac",
    name: "AC current source",
    group: "sources",
    keywords: ["sine", "square", "signal"],
    terminals: TWO_TERMINAL_SOURCE,
    bounds: { w: 40, h: 60 },
    fields: acFields("A", 0.01),
    valueLabel: (p) => acLabel(p, "A"),
    create: (c) => [currentSource(c, acWave(c.props))],
    reference: "n",
  },
  {
    id: "irail-ac",
    name: "AC current rail",
    group: "sources",
    keywords: ["sine", "square", "signal", "single terminal"],
    terminals: RAIL,
    bounds: { w: 40, h: 40 },
    fields: acFields("A", 0.01),
    valueLabel: (p) => acLabel(p, "A"),
    create: (c) => [currentSource(c, acWave(c.props))],
    grounded: true,
  },
  {
    id: "ground",
    name: "Ground",
    group: "sources",
    keywords: ["0v", "earth", "common"],
    terminals: [{ id: "g", name: "Ground", x: 0, y: -10 }],
    bounds: { w: 30, h: 20 },
    fields: [],
  },
  {
    id: "resistor",
    name: "Resistor",
    group: "passive",
    terminals: [
      { id: "a", name: "A", x: -30, y: 0 },
      { id: "b", name: "B", x: 30, y: 0 },
    ],
    bounds: { w: 60, h: 20 },
    fields: [{ key: "r", label: "Resistance", kind: "number", unit: "Ω", default: 1000, positive: true }],
    valueLabel: (p) => formatSI(num(p, "r"), "Ω"),
    create: (c) => [resistor(c, num(c.props, "r"))],
  },
  {
    id: "capacitor",
    name: "Capacitor",
    group: "passive",
    terminals: TWO_TERMINAL,
    bounds: { w: 60, h: 30 },
    fields: [
      { key: "c", label: "Capacitance", kind: "number", unit: "F", default: 10e-6, positive: true },
      { key: "v0", label: "Starting voltage (A − B)", kind: "number", unit: "V", default: 0 },
    ],
    valueLabel: (p) => formatSI(num(p, "c"), "F"),
    create: (c) => [capacitor(c, num(c.props, "c"), num(c.props, "v0"))],
  },
  {
    id: "inductor",
    name: "Inductor",
    group: "passive",
    keywords: ["coil", "choke"],
    terminals: TWO_TERMINAL,
    bounds: { w: 60, h: 20 },
    fields: [
      { key: "l", label: "Inductance", kind: "number", unit: "H", default: 1, positive: true },
      { key: "i0", label: "Starting current (A → B)", kind: "number", unit: "A", default: 0 },
    ],
    valueLabel: (p) => formatSI(num(p, "l"), "H"),
    create: (c) => [inductor(c, num(c.props, "l"), num(c.props, "i0"))],
  },
  {
    id: "transformer",
    name: "Transformer",
    group: "passive",
    keywords: ["coupled", "mutual", "coil"],
    terminals: [
      { id: "p1", name: "Primary •", x: -30, y: -20 },
      { id: "p2", name: "Primary", x: -30, y: 20 },
      { id: "s1", name: "Secondary •", x: 30, y: -20 },
      { id: "s2", name: "Secondary", x: 30, y: 20 },
    ],
    bounds: { w: 60, h: 60 },
    fields: [
      { key: "l1", label: "Primary inductance", kind: "number", unit: "H", default: 4, positive: true },
      {
        key: "ratio",
        label: "Turns ratio N1 : N2",
        kind: "number",
        default: 1,
        positive: true,
        help: "2 steps the voltage down by 2. The dotted ends rise together.",
      },
      { key: "k", label: "Coupling k", kind: "number", default: 0.999, min: 0.01, max: 0.9999, positive: true },
    ],
    valueLabel: (p) => `${formatSI(num(p, "ratio"))}:1`,
    create: (c) => [transformer(c, num(c.props, "l1"), num(c.props, "ratio"), num(c.props, "k"))],
  },
  {
    id: "diode",
    name: "Diode",
    group: "semis",
    keywords: ["rectifier", "pn"],
    terminals: DIODE_PINS,
    bounds: { w: 60, h: 20 },
    fields: [IS_FIELD, N_FIELD],
    create: (c) => [diode(c, { is: num(c.props, "is"), n: num(c.props, "n"), vz: 0 })],
  },
  {
    id: "zener",
    name: "Zener diode",
    group: "semis",
    keywords: ["regulator", "breakdown", "reference"],
    terminals: DIODE_PINS,
    bounds: { w: 60, h: 20 },
    fields: [
      { key: "vz", label: "Breakdown voltage Vz", kind: "number", unit: "V", default: 5.6, positive: true, max: 1000 },
      IS_FIELD,
      N_FIELD,
    ],
    valueLabel: (p) => formatSI(num(p, "vz"), "V"),
    create: (c) => [diode(c, { is: num(c.props, "is"), n: num(c.props, "n"), vz: num(c.props, "vz") })],
  },
  bjtSpec("npn"),
  bjtSpec("pnp"),
  jfetSpec("njfet"),
  jfetSpec("pjfet"),
  mosSpec("nmos"),
  mosSpec("pmos"),
  {
    id: "opamp",
    name: "Op-amp",
    group: "amps",
    keywords: ["operational amplifier", "amplifier"],
    terminals: AMP_PINS,
    bounds: { w: 60, h: 50 },
    fields: [
      { key: "gain", label: "Open-loop gain", kind: "number", default: 1e5, positive: true, max: 1e9 },
      { key: "vmax", label: "Output high limit", kind: "number", unit: "V", default: 15 },
      { key: "vmin", label: "Output low limit", kind: "number", unit: "V", default: -15 },
    ],
    create: (c) => [opamp(c, { gain: num(c.props, "gain"), vmax: num(c.props, "vmax"), vmin: num(c.props, "vmin") })],
    grounded: true,
  },
  {
    id: "comparator",
    name: "Comparator",
    group: "amps",
    keywords: ["schmitt", "threshold"],
    terminals: AMP_PINS,
    bounds: { w: 60, h: 50 },
    fields: [
      { key: "vhigh", label: "Output high", kind: "number", unit: "V", default: 5 },
      { key: "vlow", label: "Output low", kind: "number", unit: "V", default: 0 },
      {
        key: "hysteresis",
        label: "Hysteresis",
        kind: "number",
        unit: "V",
        default: 0,
        min: 0,
        help: "Switches high at +h/2 and low at −h/2 of input difference.",
      },
    ],
    valueLabel: (p) => (num(p, "hysteresis") ? `±${formatSI(num(p, "hysteresis") / 2, "V")}` : ""),
    create: (c) => [
      comparator(c, { vhigh: num(c.props, "vhigh"), vlow: num(c.props, "vlow"), hysteresis: num(c.props, "hysteresis") }),
    ],
    grounded: true,
  },
  {
    id: "switch",
    name: "Switch",
    group: "switching",
    keywords: ["spst", "toggle"],
    terminals: [
      { id: "a", name: "A", x: -30, y: 0 },
      { id: "b", name: "B", x: 30, y: 0 },
    ],
    bounds: { w: 60, h: 20 },
    fields: [{ key: "closed", label: "Starts closed", kind: "bool", default: false }],
    create: (c) => [spst(c, c.props.closed as boolean)],
    interactive: "toggle",
  },
  {
    id: "switch2",
    name: "Two-way switch",
    group: "switching",
    keywords: ["spdt", "changeover", "toggle"],
    terminals: [
      { id: "com", name: "Common", x: -30, y: 0 },
      { id: "a", name: "A", x: 30, y: -10 },
      { id: "b", name: "B", x: 30, y: 10 },
    ],
    bounds: { w: 60, h: 40 },
    fields: [
      {
        key: "position",
        label: "Starts at",
        kind: "select",
        default: "a",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
    ],
    create: (c) => [spdt(c, c.props.position as "a" | "b")],
    interactive: "toggle",
  },
  {
    id: "button",
    name: "Push button",
    group: "switching",
    keywords: ["momentary", "push", "key"],
    terminals: TWO_TERMINAL,
    bounds: { w: 60, h: 30 },
    fields: [
      {
        key: "normally",
        label: "When not pressed",
        kind: "select",
        default: "open",
        options: [
          { value: "open", label: "Open (makes contact when pressed)" },
          { value: "closed", label: "Closed (breaks contact when pressed)" },
        ],
      },
    ],
    create: (c) => [button(c, c.props.normally === "closed")],
    interactive: "momentary",
  },
  {
    id: "relay",
    name: "Relay",
    group: "switching",
    keywords: ["coil", "contactor", "spdt"],
    terminals: [
      { id: "c1", name: "Coil", x: -30, y: -20 },
      { id: "c2", name: "Coil", x: -30, y: 20 },
      { id: "com", name: "Common", x: 30, y: 0 },
      { id: "nc", name: "Normally closed", x: 30, y: -20 },
      { id: "no", name: "Normally open", x: 30, y: 20 },
    ],
    bounds: { w: 60, h: 60 },
    fields: [
      { key: "coilR", label: "Coil resistance", kind: "number", unit: "Ω", default: 100, positive: true },
      { key: "coilL", label: "Coil inductance", kind: "number", unit: "H", default: 0.2, positive: true },
      { key: "pullIn", label: "Pull-in current", kind: "number", unit: "A", default: 20e-3, positive: true },
      {
        key: "dropOut",
        label: "Drop-out current",
        kind: "number",
        unit: "A",
        default: 15e-3,
        positive: true,
        help: "The contacts go back below this current; keep it under the pull-in current.",
      },
    ],
    valueLabel: (p) => formatSI(num(p, "coilR"), "Ω"),
    create: (c) =>
      relay(c, {
        coilR: num(c.props, "coilR"),
        coilL: num(c.props, "coilL"),
        pullIn: num(c.props, "pullIn"),
        dropOut: num(c.props, "dropOut"),
      }),
  },
  {
    id: "probe",
    name: "Probe",
    group: "probes",
    keywords: ["voltmeter", "measure", "scope", "label"],
    terminals: [{ id: "in", name: "Node", x: 0, y: 20 }],
    bounds: { w: 30, h: 40 },
    fields: [
      { key: "name", label: "Name", kind: "text", default: "" },
      { key: "plot", label: "Plot on the scope", kind: "bool", default: true },
    ],
    valueLabel: (p) => String(p.name),
  },
  {
    id: "netlabel",
    name: "Net label",
    group: "probes",
    keywords: ["name", "tag", "connect"],
    terminals: [{ id: "in", name: "Node", x: -20, y: 0 }],
    bounds: { w: 40, h: 20 },
    fields: [
      {
        key: "name",
        label: "Name",
        kind: "text",
        default: "A",
        help: "Every net label with the same name is connected.",
      },
    ],
    valueLabel: (p) => String(p.name),
  },
];

export const PARTS: ReadonlyMap<string, PartSpec> = new Map(specs.map((s) => [s.id, s]));
export const getPart = (id: string) => PARTS.get(id);

/** A field's value from raw props: the default when missing or invalid, clamped to its limits. */
export function fieldValue(field: PropField, raw: unknown) {
  switch (field.kind) {
    case "number": {
      const v = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(v) || (field.positive && v <= 0)) return field.default;
      return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, v));
    }
    case "bool":
      return typeof raw === "boolean" ? raw : field.default;
    case "select":
      return field.options?.some((o) => o.value === raw) ? (raw as string) : field.default;
    case "text":
      return typeof raw === "string" ? raw : field.default;
  }
}

/** Every field of a part, with defaults filled in and bad values replaced. */
export function partProps(spec: PartSpec, props: Props): Props {
  const out: Props = {};
  for (const f of spec.fields) out[f.key] = fieldValue(f, props[f.key]);
  return out;
}
