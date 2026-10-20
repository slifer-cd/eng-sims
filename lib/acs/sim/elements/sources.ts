import { type CreateCtx, type Element, GROUND, vAt } from "../element";

/** A value over time, in V or A. */
export type Waveform = (t: number) => number;

export const dc = (value: number): Waveform => () => value;

/**
 * An ideal voltage source from nodes[0] (+) to nodes[1] (−), or to ground for a rail.
 * Its branch current flows into + and out of −.
 */
export function voltageSource(c: CreateCtx, wave: Waveform): Element {
  const [p, n = GROUND] = c.nodes;
  const k = c.branch();
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic: (s) => s.voltageRow(p, n, k),
    stampStep: (s, ctx) => s.rhs(k, wave(ctx.t)),
    readout(x) {
      const v = vAt(x, p) - vAt(x, n);
      return { v, i: x[k], p: v * x[k] };
    },
    voltageEdges: () => [[p, n]],
  };
}

/**
 * An ideal current source pushing its current out of nodes[0] (+) into the circuit, back in
 * at nodes[1] (−), or drawn from ground for a rail.
 */
export function currentSource(c: CreateCtx, wave: Waveform): Element {
  const [p, n = GROUND] = c.nodes;
  let value = wave(0);
  return {
    compId: c.compId,
    nodes: c.nodes,
    currentSource: true,
    stampStep(s, ctx) {
      value = wave(ctx.t);
      s.current(n, p, value);
    },
    readout(x) {
      const v = vAt(x, p) - vAt(x, n);
      return { v, i: -value, p: -v * value };
    },
    paths: () => [],
  };
}
