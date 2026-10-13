import type { PinDef, Props } from "../model/types";
import {
  type Value,
  MAX_WIDTH,
  and,
  concat,
  floating,
  fromInt,
  make,
  not,
  ones,
  or,
  slice,
  unknown,
  xor,
  zeros,
} from "./value";

export interface EvalContext {
  /** Simulation time in clock ticks. */
  time: number;
  /** The externally set value of a top-level Input Pin. */
  input?: Value;
}

export interface PrimitiveSpec {
  id: string;
  name: string;
  /** Text drawn on the chip body. */
  short: string;
  /** Draw pin names inside the body. */
  pinLabels?: boolean;
  defaultProps: Props;
  pins(props: Props): PinDef[];
  /** Outputs in the order of the output pins, from inputs in the order of the input pins. */
  evaluate(inputs: Value[], props: Props, ctx: EvalContext): Value[];
  /** Output values before the first evaluation. Defaults to all zeros. */
  initial?(props: Props): Value[];
}

const clampWidth = (w: unknown) =>
  Math.min(MAX_WIDTH, Math.max(1, Math.floor(Number(w) || 1)));

const widthOf = (props: Props) => clampWidth(props.width);

function pin(id: string, dir: "in" | "out", width: number, order: number, name = id): PinDef {
  return { id, name, dir, width, side: dir === "in" ? "left" : "right", order };
}

/** Splitter/merger part widths, low bits first. Falls back to all 1-bit parts if invalid. */
export function splitParts(props: Props): number[] {
  const width = widthOf(props);
  const parts = String(props.parts ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const sum = parts.reduce((a, b) => a + b, 0);
  return sum === width ? parts : Array.from({ length: width }, () => 1);
}

/** Bit-range names for splitter/merger parts, e.g. ["0", "1", "2:5"]. */
function partPins(props: Props, dir: "in" | "out"): PinDef[] {
  let lo = 0;
  return splitParts(props).map((w, i) => {
    const name = w === 1 ? `${lo}` : `${lo}:${lo + w - 1}`;
    lo += w;
    return pin(`p${i}`, dir, w, i, name);
  });
}

function gate(id: string, name: string, op: (a: Value, b: Value) => Value, invert: boolean): PrimitiveSpec {
  return {
    id,
    name,
    short: name,
    defaultProps: { width: 1, inputs: 2 },
    pins(props) {
      const w = widthOf(props);
      const n = Math.min(16, Math.max(2, Math.floor(Number(props.inputs) || 2)));
      const ins = Array.from({ length: n }, (_, i) => pin(`in${i}`, "in", w, i, String.fromCharCode(65 + i)));
      return [...ins, pin("out", "out", w, 0)];
    },
    evaluate(inputs) {
      const r = inputs.reduce(op);
      return [invert ? not(r) : r];
    },
  };
}

function constant(id: string, name: string, value: (w: number) => Value): PrimitiveSpec {
  return {
    id,
    name,
    short: name,
    defaultProps: { width: 1 },
    pins: (props) => [pin("out", "out", widthOf(props), 0)],
    evaluate: (_, props) => [value(widthOf(props))],
  };
}

const specs: PrimitiveSpec[] = [
  {
    id: "input",
    name: "Input Pin",
    short: "IN",
    defaultProps: { width: 1 },
    pins: (props) => [pin("out", "out", widthOf(props), 0)],
    evaluate(_, props, ctx) {
      const w = widthOf(props);
      const v = ctx.input;
      return [v ? make(w, v.v, v.z, v.x) : zeros(w)];
    },
  },
  {
    id: "output",
    name: "Output Pin",
    short: "OUT",
    defaultProps: { width: 1 },
    pins: (props) => [pin("in", "in", widthOf(props), 0)],
    evaluate: () => [],
  },
  constant("vdd", "VDD", ones),
  constant("gnd", "GND", zeros),
  {
    id: "clock",
    name: "Clock",
    short: "CLK",
    // Ticks per half period.
    defaultProps: { period: 1 },
    pins: () => [pin("out", "out", 1, 0, "clk")],
    evaluate(_, props, ctx) {
      const period = Math.max(1, Math.floor(Number(props.period) || 1));
      return [fromInt(1, Math.floor(ctx.time / period) % 2)];
    },
  },
  {
    id: "not",
    name: "NOT",
    short: "NOT",
    defaultProps: { width: 1 },
    pins: (props) => [pin("in0", "in", widthOf(props), 0, "A"), pin("out", "out", widthOf(props), 0)],
    evaluate: ([a]) => [not(a)],
  },
  gate("and", "AND", and, false),
  gate("or", "OR", or, false),
  gate("nand", "NAND", and, true),
  gate("nor", "NOR", or, true),
  gate("xor", "XOR", xor, false),
  gate("xnor", "XNOR", xor, true),
  {
    id: "tristate",
    name: "Tri-State Buffer",
    short: "TRI",
    pinLabels: true,
    defaultProps: { width: 1 },
    pins(props) {
      const w = widthOf(props);
      return [pin("data", "in", w, 0), { ...pin("en", "in", 1, 0), side: "bottom" }, pin("out", "out", w, 0)];
    },
    evaluate([data, en], props) {
      const w = widthOf(props);
      if (en.z || en.x) return [unknown(w)];
      return [en.v ? data : floating(w)];
    },
    initial: (props) => [floating(widthOf(props))],
  },
  {
    id: "splitter",
    name: "Splitter",
    short: "SPLIT",
    pinLabels: true,
    defaultProps: { width: 4, parts: "" },
    pins(props) {
      return [pin("bus", "in", widthOf(props), 0), ...partPins(props, "out")];
    },
    evaluate([bus], props) {
      let lo = 0;
      return splitParts(props).map((w) => {
        const part = slice(bus, lo, w);
        lo += w;
        return part;
      });
    },
  },
  {
    id: "merger",
    name: "Merger",
    short: "MERGE",
    pinLabels: true,
    defaultProps: { width: 4, parts: "" },
    pins(props) {
      return [...partPins(props, "in"), pin("bus", "out", widthOf(props), 0)];
    },
    evaluate: (parts) => [concat(parts)],
  },
];

export const BUILTINS: ReadonlyMap<string, PrimitiveSpec> = new Map(specs.map((s) => [s.id, s]));

export const getBuiltin = (id: string) => BUILTINS.get(id);

export function builtinProps(spec: PrimitiveSpec, props: Props): Props {
  return { ...spec.defaultProps, ...props };
}
