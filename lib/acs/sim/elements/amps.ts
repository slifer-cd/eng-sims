import { type CreateCtx, type Element, GROUND, type Stamper, vAt } from "../element";

/*
 * Op-amps and comparators with implicit supplies: the output is an ideal voltage source to
 * ground following a smooth limiter, out = mid + half·tanh(k·(vd − threshold)/half), with
 * vd = V(+) − V(−). Inputs draw no current.
 *
 * Newton's method stamps the true limiter value and slope, which settles in an iteration or
 * two, saturated or not. Only when that fails (an output stuck on the wrong rail, where the
 * limiter is flat, bounces between the rails) does a damped retry floor the slope so the
 * iterations walk back to the linear region.
 */

interface Limiter {
  lo: number;
  hi: number;
  /** Slope at the threshold (the open-loop gain). */
  gain: number;
  /** Floor for the slope used in a damped Newton stamp, as a fraction of `gain`. */
  minSlope: number;
}

function limiter({ lo, hi, gain }: Limiter) {
  const mid = (hi + lo) / 2, half = (hi - lo) / 2;
  return (vd: number) => {
    const t = Math.tanh((gain * vd) / half);
    return { v: mid + half * t, d: gain * (1 - t * t) };
  };
}

function amplifier(c: CreateCtx, lim: Limiter, threshold: () => number, onAccept?: (out: number) => void): Element {
  const [minus, plus, out] = c.nodes;
  const k = c.branch();
  const f = limiter(lim);
  const vd = (x: Float64Array) => vAt(x, plus) - vAt(x, minus) - threshold();
  return {
    compId: c.compId,
    nodes: c.nodes,
    nonlinear: true,
    stampStatic(s: Stamper) {
      // The branch current leaves the output node into the source.
      s.add(out, k, 1);
      s.add(k, out, 1);
    },
    stampIter(s, x, ctx) {
      const v0 = vd(x);
      const { v, d } = f(v0);
      const slope = ctx.damped ? Math.max(d, lim.gain * lim.minSlope) : d;
      s.add(k, plus, -slope);
      s.add(k, minus, slope);
      // out = f(v0) + slope·(V(+) − V(−) − threshold − v0)
      s.rhs(k, v - slope * (v0 + threshold()));
    },
    converged(x) {
      const o = vAt(x, out);
      return Math.abs(o - f(vd(x)).v) <= 1e-6 + 1e-4 * Math.abs(o);
    },
    accept(x) {
      onAccept?.(vAt(x, out));
      return false;
    },
    readout(x) {
      // Current out of the output pin into the circuit.
      return { v: vAt(x, out), i: -x[k] };
    },
    terminalCurrents: (x) => [0, 0, x[k]],
    voltageEdges: () => [[out, GROUND]],
    paths: () => [[out, GROUND]],
  };
}

export interface OpAmpModel {
  gain: number;
  vmax: number;
  vmin: number;
}

/** Op-amp, nodes [−, +, out]. */
export function opamp(c: CreateCtx, { gain, vmax, vmin }: OpAmpModel): Element {
  const hi = Math.max(vmax, vmin), lo = Math.min(vmax, vmin);
  return amplifier(c, { lo, hi: hi > lo ? hi : lo + 1e-3, gain, minSlope: 1e-3 }, () => 0);
}

export interface ComparatorModel {
  vhigh: number;
  vlow: number;
  /** Width of the hysteresis band around 0 V difference. */
  hysteresis: number;
}

/** Width of the comparator's switching region, in volts of input difference. */
const SWITCH_WIDTH = 1e-4;

/**
 * Comparator, nodes [−, +, out]. With hysteresis h it switches high when V(+) − V(−) rises past
 * +h/2 and low when it falls past −h/2; which threshold applies is decided once per step.
 */
export function comparator(c: CreateCtx, { vhigh, vlow, hysteresis }: ComparatorModel): Element {
  const hi = Math.max(vhigh, vlow), lo = Math.min(vhigh, vlow);
  const top = hi > lo ? hi : lo + 1e-3;
  let high = false;
  const element = amplifier(
    c,
    { lo, hi: top, gain: (top - lo) / 2 / SWITCH_WIDTH, minSlope: 1e-3 },
    () => (high ? -hysteresis / 2 : hysteresis / 2),
    (out) => {
      high = out > (top + lo) / 2;
    },
  );
  return {
    ...element,
    save: () => high,
    restore(state) {
      if (typeof state === "boolean") high = state;
    },
  };
}
