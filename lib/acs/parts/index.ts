import type { Props } from "../../model/types";
import { formatSI } from "../units";
import { capacitor, inductor, resistor, transformer } from "../sim/elements/passive";
import { type WaveformProps, currentSource, dc, voltageSource, waveform } from "../sim/elements/sources";
import { spdt, spst } from "../sim/elements/switching";
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
