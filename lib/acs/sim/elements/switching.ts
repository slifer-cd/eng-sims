import { type CreateCtx, type Element, type Stamper, vAt } from "../element";
import { inductor, resistor } from "./passive";

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
    terminalCurrents: (x) => [x[k], -x[k]],
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
    terminalCurrents: (x) => [x[ka] + x[kb], -x[ka], -x[kb]],
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

/** Push button: conducts while pressed (normally open) or while not pressed (normally closed). */
export function button(c: CreateCtx, normallyClosed: boolean): Element {
  const [a, b] = c.nodes;
  const k = c.branch();
  let pressed = false;
  const closed = () => pressed !== normallyClosed;
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic: (s) => contact(s, a, b, k, closed()),
    readout(x) {
      const v = vAt(x, a) - vAt(x, b);
      return { v, i: x[k], p: v * x[k] };
    },
    terminalCurrents: (x) => [x[k], -x[k]],
    voltageEdges: () => (closed() ? [[a, b]] : []),
    paths: () => (closed() ? [[a, b]] : []),
    setSwitch(value) {
      if (typeof value !== "boolean") return false;
      pressed = value;
      return true;
    },
    switchValue: () => pressed,
  };
}

export interface RelayModel {
  coilR: number;
  coilL: number;
  /** Coil current that pulls the contacts over, and the lower one that lets them go back. */
  pullIn: number;
  dropOut: number;
}

/**
 * Relay with a coil from nodes[0] to nodes[1] (an inductor in series with its resistance) and
 * changeover contacts: common nodes[2], normally closed nodes[3], normally open nodes[4].
 */
export function relay(c: CreateCtx, { coilR, coilL, pullIn, dropOut }: RelayModel): Element[] {
  const [c1, c2, com, nc, no] = c.nodes;
  const mid = c.node();
  const coil = inductor({ ...c, nodes: [c1, mid] }, coilL, 0);
  const wire = resistor({ ...c, nodes: [mid, c2] }, coilR);
  const kNc = c.branch(), kNo = c.branch();
  const release = Math.min(dropOut, pullIn);
  let energized = false;
  const contacts: Element = {
    compId: c.compId,
    nodes: [com, nc, no],
    stampStatic(s) {
      contact(s, com, nc, kNc, !energized);
      contact(s, com, no, kNo, energized);
    },
    // Runs after the coil's accept (it comes later in the list), so the coil current is current.
    accept(x) {
      const i = Math.abs(coil.readout!(x).i!);
      const next = energized ? i >= release : i > pullIn;
      if (next === energized) return false;
      energized = next;
      return true;
    },
    voltageEdges: () => [[com, energized ? no : nc]],
    paths: () => [[com, energized ? no : nc]],
    switchValue: () => energized,
    save: () => energized,
    restore(state) {
      if (typeof state === "boolean") energized = state;
    },
  };
  // The part's readout is the whole coil: terminal to terminal.
  const coilView: Element = {
    ...coil,
    readout(x) {
      const v = vAt(x, c1) - vAt(x, c2);
      const i = coil.readout!(x).i!;
      return { v, i, p: v * i };
    },
    terminalCurrents(x) {
      const i = coil.readout!(x).i!;
      return [i, -i, x[kNc] + x[kNo], -x[kNc], -x[kNo]];
    },
  };
  return [coilView, { ...wire, readout: undefined, terminalCurrents: undefined }, contacts];
}
