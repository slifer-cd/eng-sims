export type PinDir = "in" | "out";
export type Side = "left" | "right" | "top" | "bottom";
export type Rotation = 0 | 90 | 180 | 270;

export type PropValue = number | string | boolean;
export type Props = Record<string, PropValue>;

export interface PinDef {
  id: string;
  name: string;
  dir: PinDir;
  width: number;
  side: Side;
  order: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A wire end attaches to a component pin, or to a point on another wire (a junction).
 * The junction point is kept as drawn and projected onto the target wire when rendering.
 */
export type Endpoint =
  | { kind: "pin"; compId: string; pinId: string }
  | { kind: "wire"; wireId: string; x: number; y: number };

export interface Wire {
  id: string;
  a: Endpoint;
  b: Endpoint;
  /** Bend points between `a` and `b`. */
  points: Point[];
}

export interface ComponentInst {
  id: string;
  /** A built-in id (see lib/sim/builtins.ts) or a custom ChipDef id. */
  chipId: string;
  x: number;
  y: number;
  rotation: Rotation;
  /** Mirrored across the part's own x-axis before rotating. Only the analog simulator uses it. */
  flip?: boolean;
  label?: string;
  props: Props;
}

export interface Circuit {
  components: ComponentInst[];
  wires: Wire[];
}

/**
 * A user-made chip. Its external pins are the Input/Output Pin components inside
 * `circuit`: each PinDef.id equals the id of that inner component.
 */
export interface ChipDef {
  id: string;
  name: string;
  pins: PinDef[];
  color: string;
  circuit: Circuit;
  createdAt: number;
  updatedAt: number;
}
