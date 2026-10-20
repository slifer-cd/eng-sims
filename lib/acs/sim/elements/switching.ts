import { type CreateCtx, type Element, type Stamper, vAt } from "../element";

/** One contact between nodes a and b. Closed holds V(a) = V(b); open forces its current to 0. */
function contact(s: Stamper, a: number, b: number, k: number, closed: boolean) {
  if (closed) s.voltageRow(a, b, k);
  else s.openRow(a, b, k);
}

/** On/off switch. `initial` is the starting position from the part's props. */
export function spst(c: CreateCtx, initial: boolean): Element {
  const [a, b] = c.nodes;
  const k = c.branch();
  let closed = initial;
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic: (s) => contact(s, a, b, k, closed),
    readout(x) {
      const v = vAt(x, a) - vAt(x, b);
      return { v, i: x[k], p: v * x[k] };
    },
    voltageEdges: () => (closed ? [[a, b]] : []),
    paths: () => (closed ? [[a, b]] : []),
    setSwitch(value) {
      if (typeof value !== "boolean") return false;
      closed = value;
      return true;
    },
    switchValue: () => closed,
    save: () => ({ initial, closed }),
    restore(state) {
      const s = state as { initial?: unknown; closed?: unknown };
      if (s.initial === initial && typeof s.closed === "boolean") closed = s.closed;
    },
  };
}

/** Two-way switch: nodes are [com, a, b], and `initial` is the starting throw ("a" or "b"). */
export function spdt(c: CreateCtx, initial: "a" | "b"): Element {
  const [com, a, b] = c.nodes;
  const ka = c.branch(), kb = c.branch();
  let position = initial;
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic(s) {
      contact(s, com, a, ka, position === "a");
      contact(s, com, b, kb, position === "b");
    },
    readout(x) {
      const [to, k] = position === "a" ? [a, ka] : [b, kb];
      const v = vAt(x, com) - vAt(x, to);
      return { v, i: x[k], p: v * x[k] };
    },
    voltageEdges: () => [[com, position === "a" ? a : b]],
    paths: () => [[com, position === "a" ? a : b]],
    setSwitch(value) {
      if (value !== "a" && value !== "b") return false;
      position = value;
      return true;
    },
    switchValue: () => position,
    save: () => ({ initial, position }),
    restore(state) {
      const s = state as { initial?: unknown; position?: unknown };
      if (s.initial === initial && (s.position === "a" || s.position === "b")) position = s.position;
    },
  };
}
