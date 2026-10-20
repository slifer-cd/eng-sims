import { type CreateCtx, type Element, type StepCtx, vAt } from "../element";

export function resistor(c: CreateCtx, r: number): Element {
  const [a, b] = c.nodes;
  const g = 1 / r;
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic: (s) => s.conductance(a, b, g),
    readout(x) {
      const v = vAt(x, a) - vAt(x, b);
      return { v, i: v * g, p: v * v * g };
    },
    terminalCurrents(x) {
      const i = (vAt(x, a) - vAt(x, b)) * g;
      return [i, -i];
    },
  };
}

/**
 * Capacitor by its companion model: a conductance G in parallel with a current source
 * that carries the history. Trapezoidal: G = 2C/dt, I = G·vₙ + iₙ; backward Euler: G = C/dt, I = G·vₙ.
 */
export function capacitor(c: CreateCtx, cap: number, v0: number): Element {
  const [a, b] = c.nodes;
  let v = v0, i = 0;
  const g = (ctx: StepCtx) => (ctx.method === "trap" ? 2 : 1) * (cap / ctx.dt);
  const history = (ctx: StepCtx) => g(ctx) * v + (ctx.method === "trap" ? i : 0);
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic: (s, ctx) => s.conductance(a, b, g(ctx)),
    // The history current flows from b to a through the part.
    stampStep: (s, ctx) => s.current(b, a, history(ctx)),
    accept(x, ctx) {
      const vNew = vAt(x, a) - vAt(x, b);
      i = g(ctx) * vNew - history(ctx);
      v = vNew;
      return false;
    },
    readout(x) {
      const vx = vAt(x, a) - vAt(x, b);
      return { v: vx, i, p: vx * i };
    },
    terminalCurrents: () => [i, -i],
    save: () => ({ v, i, v0 }),
    restore(state) {
      const st = state as { v?: unknown; i?: unknown; v0?: unknown };
      // A new initial voltage starts the capacitor afresh.
      if (st.v0 === v0 && typeof st.v === "number" && typeof st.i === "number") ({ v, i } = st as { v: number; i: number });
    },
  };
}

/**
 * Inductor by its companion model. Trapezoidal: G = dt/2L, I = iₙ + G·vₙ; backward Euler:
 * G = dt/L, I = iₙ.
 */
export function inductor(c: CreateCtx, l: number, i0: number): Element {
  const [a, b] = c.nodes;
  let v = 0, i = i0;
  const g = (ctx: StepCtx) => ctx.dt / ((ctx.method === "trap" ? 2 : 1) * l);
  const history = (ctx: StepCtx) => i + (ctx.method === "trap" ? g(ctx) * v : 0);
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic: (s, ctx) => s.conductance(a, b, g(ctx)),
    // The history current flows from a to b through the part.
    stampStep: (s, ctx) => s.current(a, b, history(ctx)),
    accept(x, ctx) {
      const vNew = vAt(x, a) - vAt(x, b);
      i = g(ctx) * vNew + history(ctx);
      v = vNew;
      return false;
    },
    readout(x) {
      const vx = vAt(x, a) - vAt(x, b);
      return { v: vx, i, p: vx * i };
    },
    terminalCurrents: () => [i, -i],
    save: () => ({ v, i, i0 }),
    restore(state) {
      const st = state as { v?: unknown; i?: unknown; i0?: unknown };
      if (st.i0 === i0 && typeof st.v === "number" && typeof st.i === "number") ({ v, i } = st as { v: number; i: number });
    },
  };
}

/**
 * Two coupled coils: primary p1–p2 with inductance L1, secondary s1–s2 with L2 = L1/ratio²,
 * mutual M = k·√(L1·L2). Inverting the inductance matrix gives the winding currents from the
 * voltages, stamped as conductances, cross-coupled VCCSs and history currents. The windings
 * share no node, so each side needs its own path to ground (GMIN gives a floating side one).
 */
export function transformer(c: CreateCtx, l1: number, ratio: number, k: number): Element {
  const [p1, p2, s1, s2] = c.nodes;
  const l2 = l1 / (ratio * ratio);
  const m = k * Math.sqrt(l1 * l2);
  const det = l1 * l2 - m * m;
  // Γ = L⁻¹.
  const g11 = l2 / det, g12 = -m / det, g22 = l1 / det;
  let v1 = 0, v2 = 0, i1 = 0, i2 = 0;
  const h = (ctx: StepCtx) => (ctx.method === "trap" ? ctx.dt / 2 : ctx.dt);
  const history = (ctx: StepCtx) => {
    if (ctx.method === "be") return [i1, i2];
    const f = h(ctx);
    return [i1 + f * (g11 * v1 + g12 * v2), i2 + f * (g12 * v1 + g22 * v2)];
  };
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic(s, ctx) {
      const f = h(ctx);
      s.conductance(p1, p2, f * g11);
      s.vccs(p1, p2, s1, s2, f * g12);
      s.vccs(s1, s2, p1, p2, f * g12);
      s.conductance(s1, s2, f * g22);
    },
    stampStep(s, ctx) {
      const [h1, h2] = history(ctx);
      s.current(p1, p2, h1);
      s.current(s1, s2, h2);
    },
    accept(x, ctx) {
      const f = h(ctx);
      const [h1, h2] = history(ctx);
      const n1 = vAt(x, p1) - vAt(x, p2), n2 = vAt(x, s1) - vAt(x, s2);
      i1 = f * (g11 * n1 + g12 * n2) + h1;
      i2 = f * (g12 * n1 + g22 * n2) + h2;
      v1 = n1;
      v2 = n2;
      return false;
    },
    readout(x) {
      const n1 = vAt(x, p1) - vAt(x, p2), n2 = vAt(x, s1) - vAt(x, s2);
      return { v: n1, i: i1, p: n1 * i1 + n2 * i2 };
    },
    terminalCurrents: () => [i1, -i1, i2, -i2],
    paths: () => [
      [p1, p2],
      [s1, s2],
    ],
    save: () => ({ v1, v2, i1, i2 }),
    restore(state) {
      const st = state as Record<string, unknown>;
      if (["v1", "v2", "i1", "i2"].every((key) => typeof st[key] === "number")) {
        ({ v1, v2, i1, i2 } = st as { v1: number; v2: number; i1: number; i2: number });
      }
    },
  };
}
