import type { PropValue, Props } from "../../model/types";
import type { CreateCtx, Element } from "../sim/element";

export type PartGroup = "sources" | "passive" | "semis" | "amps" | "switching" | "probes";

export const GROUP_TITLES: Record<PartGroup, string> = {
  sources: "Sources",
  passive: "Passive",
  semis: "Semiconductors",
  amps: "Amplifiers",
  switching: "Switching",
  probes: "Probes & labels",
};

/** A connection point, in the part's own coordinates (multiples of GRID). */
export interface TerminalDef {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface PropField {
  key: string;
  label: string;
  kind: "number" | "select" | "bool" | "text";
  default: PropValue;
  /** Shown after the value and used by the SI formatter, e.g. "Ω". */
  unit?: string;
  min?: number;
  max?: number;
  /** Must be greater than zero (e.g. a resistance). */
  positive?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
}

export interface PartSpec {
  id: string;
  name: string;
  group: PartGroup;
  /** Extra words for the palette search. */
  keywords?: string[];
  terminals: TerminalDef[];
  /** Body size for hit-testing and selection, centred on the origin. */
  bounds: { w: number; h: number };
  fields: PropField[];
  /** Short value text drawn next to the symbol, from sanitised props. */
  valueLabel?(props: Props): string;
  /** Simulation elements. Parts without one (ground, probes, labels) only shape the nodes. */
  create?(c: CreateCtx): Element[];
  /** References ground itself (rails), so a circuit with it needs no ground part. */
  grounded?: boolean;
  /** Terminal used as 0 V when the circuit has no ground. */
  reference?: string;
  /** Clicking it while simulating flips it, or holds it while pressed. */
  interactive?: "toggle" | "momentary";
}
