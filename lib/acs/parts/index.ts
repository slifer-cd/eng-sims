import type { Props } from "../../model/types";
import { formatSI } from "../units";
import { resistor } from "../sim/elements/passive";
import { currentSource, dc, voltageSource } from "../sim/elements/sources";
import { spdt, spst } from "../sim/elements/switching";
import type { PartSpec, PropField } from "./types";

export * from "./types";

const num = (props: Props, key: string) => props[key] as number;

const specs: PartSpec[] = [
  {
    id: "vdc",
    name: "DC voltage source",
    group: "sources",
    keywords: ["battery", "supply"],
    terminals: [
      { id: "p", name: "+", x: 0, y: -30 },
      { id: "n", name: "−", x: 0, y: 30 },
    ],
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
    terminals: [{ id: "p", name: "+", x: 0, y: 20 }],
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
    terminals: [
      { id: "p", name: "+", x: 0, y: -30 },
      { id: "n", name: "−", x: 0, y: 30 },
    ],
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
    terminals: [{ id: "p", name: "+", x: 0, y: 20 }],
    bounds: { w: 40, h: 40 },
    fields: [{ key: "i", label: "Current", kind: "number", unit: "A", default: 0.01 }],
    valueLabel: (p) => formatSI(num(p, "i"), "A"),
    create: (c) => [currentSource(c, dc(num(c.props, "i")))],
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
    fields: [{ key: "name", label: "Name", kind: "text", default: "" }],
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
