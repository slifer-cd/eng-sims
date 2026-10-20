import { type CreateCtx, type Element, vAt } from "../element";

/*
 * Semiconductor devices from the standard textbook / SPICE level-1 equations: Shockley diodes,
 * Ebers–Moll bipolar transistors and square-law FETs. Each is linearised at the current guess
 * on every Newton iteration. P-type parts run the N-type equations on negated voltages
 * (`polarity` −1) and negate the currents.
 */

/** Thermal voltage kT/q at 27 °C. */
export const VT = 0.025852;
/** Conductance added across junctions so a reverse-biased one still has a slope. */
const GJ = 1e-12;
/**
 * Junction current past which the exponential carries on as a straight line, like a small
 * series resistance. Without it a diode straight across a source asks for ~10²⁰ A and a
 * conductance that swamps the rest of the matrix.
 */
const I_MAX = 100;
/** The exponent at which a junction with saturation current `is` reaches I_MAX. */
const expLimit = (is: number) => Math.log(1 + I_MAX / is);

/** e^x and its derivative, continued linearly past `max`. */
function expd(x: number, max: number) {
  if (x <= max) {
    const e = Math.exp(x);
    return { v: e, d: e };
  }
  const e = Math.exp(max);
  return { v: e * (1 + x - max), d: e };
}

/**
 * Limit the step of a junction voltage between Newton iterations (SPICE's pnjlim): above the
 * critical voltage, move by the log of the change instead of the change itself.
 */
export function pnjlim(vnew: number, vold: number, vt: number, vcrit: number) {
  if (vnew <= vcrit || Math.abs(vnew - vold) <= 2 * vt) return vnew;
  if (vold > 0) {
    const arg = 1 + (vnew - vold) / vt;
    return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
  }
  return vt * Math.log(vnew / vt);
}

const vcritOf = (is: number, nvt: number) => nvt * Math.log(nvt / (Math.SQRT2 * is));
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 + 1e-3 * Math.abs(b);

/** Reverse current that sets a zener's knee: at −Vz the breakdown current is this. */
const ZENER_KNEE = 5e-3;

export interface DiodeModel {
  is: number;
  n: number;
  /** Breakdown voltage of a zener, or 0 for a plain diode. */
  vz: number;
}

/** Diode from anode nodes[0] to cathode nodes[1]. */
export function diode(c: CreateCtx, { is, n, vz }: DiodeModel): Element {
  const [a, k] = c.nodes;
  const nvt = n * VT;
  const vcrit = vcritOf(is, nvt);
  const vzcrit = vcritOf(ZENER_KNEE, VT);
  const cap = expLimit(is), zcap = expLimit(ZENER_KNEE);

  const model = (v: number) => {
    const f = expd(v / nvt, cap);
    let i = is * (f.v - 1), g = (is * f.d) / nvt;
    if (vz > 0) {
      const r = expd(-(v + vz) / VT, zcap);
      i -= ZENER_KNEE * r.v;
      g += (ZENER_KNEE * r.d) / VT;
    }
    return { i, g };
  };
  const limit = (vnew: number, vold: number) => {
    if (vz > 0 && vnew < 0) {
      // In breakdown the reverse exponential is the one to tame: limit −(v + Vz).
      return -pnjlim(-(vnew + vz), -(vold + vz), VT, vzcrit) - vz;
    }
    return pnjlim(vnew, vold, nvt, vcrit);
  };

  let vd = 0, accepted = 0;
  const across = (x: Float64Array) => vAt(x, a) - vAt(x, k);
  return {
    compId: c.compId,
    nodes: c.nodes,
    nonlinear: true,
    beginSolve() {
      vd = accepted;
    },
    stampIter(s, x) {
      vd = limit(across(x), vd);
      const { i, g } = model(vd);
      s.conductance(a, k, g + GJ);
      s.current(a, k, i - (g + GJ) * vd);
    },
    converged: (x) => near(across(x), vd),
    accept(x) {
      accepted = vd = across(x);
      return false;
    },
    readout(x) {
      const v = across(x);
      const { i } = model(v);
      return { v, i, p: v * i };
    },
    terminalCurrents(x) {
      const { i } = model(across(x));
      return [i, -i];
    },
    save: () => accepted,
    restore(state) {
      if (typeof state === "number") accepted = vd = state;
    },
  };
}

export interface BjtModel {
  is: number;
  /** Forward and reverse current gains. */
  bf: number;
  br: number;
}

/** Bipolar transistor (Ebers–Moll transport model), nodes [b, c, e]. */
export function bjt(c: CreateCtx, polarity: 1 | -1, { is, bf, br }: BjtModel): Element {
  const [b, col, e] = c.nodes;
  const p = polarity;
  const vcrit = vcritOf(is, VT);
  const cap = expLimit(is);

  /** Currents into base and collector, and their slopes, in the NPN frame. */
  const model = (vbe: number, vbc: number) => {
    const f = expd(vbe / VT, cap), r = expd(vbc / VT, cap);
    const iF = is * (f.v - 1), iR = is * (r.v - 1);
    const gF = (is * f.d) / VT, gR = (is * r.d) / VT;
    return {
      ic: iF - iR * (1 + 1 / br),
      ib: iF / bf + iR / br,
      dIc: { be: gF, bc: -gR * (1 + 1 / br) },
      dIb: { be: gF / bf, bc: gR / br },
    };
  };
  const junctions = (x: Float64Array) => ({ be: p * (vAt(x, b) - vAt(x, e)), bc: p * (vAt(x, b) - vAt(x, col)) });

  let vbe = 0, vbc = 0;
  let accepted = { vbe: 0, vbc: 0 };
  return {
    compId: c.compId,
    nodes: c.nodes,
    nonlinear: true,
    beginSolve() {
      ({ vbe, vbc } = accepted);
    },
    stampIter(s, x) {
      const raw = junctions(x);
      vbe = pnjlim(raw.be, vbe, VT, vcrit);
      vbc = pnjlim(raw.bc, vbc, VT, vcrit);
      const m = model(vbe, vbc);
      // Slopes against [Vb, Vc, Ve]; the polarity cancels (p² = 1).
      const rowC = [m.dIc.be + m.dIc.bc, -m.dIc.bc, -m.dIc.be];
      const rowB = [m.dIb.be + m.dIb.bc, -m.dIb.bc, -m.dIb.be];
      const rowE = rowC.map((v, j) => -(v + rowB[j]));
      const ic = p * m.ic, ib = p * m.ib;
      s.linearized([b, col, e], [ib, ic, -(ib + ic)], [rowB, rowC, rowE], [p * vbe, p * (vbe - vbc), 0]);
      s.conductance(b, e, GJ);
      s.conductance(b, col, GJ);
    },
    converged(x) {
      const raw = junctions(x);
      return near(raw.be, vbe) && near(raw.bc, vbc);
    },
    accept(x) {
      const raw = junctions(x);
      accepted = { vbe: raw.be, vbc: raw.bc };
      ({ vbe, vbc } = accepted);
      return false;
    },
    readout(x) {
      const raw = junctions(x);
      const m = model(raw.be, raw.bc);
      const vce = vAt(x, col) - vAt(x, e), vbeA = vAt(x, b) - vAt(x, e);
      const ic = p * m.ic, ib = p * m.ib;
      return { v: vce, i: ic, p: vce * ic + vbeA * ib };
    },
    terminalCurrents(x) {
      const raw = junctions(x);
      const m = model(raw.be, raw.bc);
      return [p * m.ib, p * m.ic, -p * (m.ib + m.ic)];
    },
    save: () => accepted,
    restore(state) {
      const st = state as { vbe?: unknown; vbc?: unknown };
      if (typeof st?.vbe === "number" && typeof st.vbc === "number") {
        accepted = { vbe: st.vbe, vbc: st.vbc };
        ({ vbe, vbc } = accepted);
      }
    },
  };
}

export interface FetModel {
  /** Threshold in the N-type frame: Vth for a MOSFET, −|Vp| for a JFET. */
  vto: number;
  /** Square-law gain: Id = β/2·(Vgs − Vto)² in saturation. */
  beta: number;
  lambda: number;
  /** Saturation current of the gate junctions (JFET), or 0 for an insulated gate. */
  gateIs: number;
}

/** Drain current for Vds ≥ 0 and its slopes against Vgs (gm) and Vds (gds). */
function channel(vgs: number, vds: number, { vto, beta, lambda }: FetModel) {
  const vov = vgs - vto;
  if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
  const clm = 1 + lambda * vds;
  if (vds < vov) {
    const core = vov * vds - (vds * vds) / 2;
    return { id: beta * core * clm, gm: beta * vds * clm, gds: beta * (vov - vds) * clm + beta * core * lambda };
  }
  return { id: (beta / 2) * vov * vov * clm, gm: beta * vov * clm, gds: (beta / 2) * vov * vov * lambda };
}

/** Largest change of Vgs and Vds per Newton iteration, against hopping between regions. */
const FET_STEP = { gs: 1, ds: 2 };
const clampStep = (vnew: number, vold: number, max: number) => vold + Math.max(-max, Math.min(max, vnew - vold));

/** Field-effect transistor, nodes [g, d, s]. Drain and source swap roles when Vds < 0. */
export function fet(c: CreateCtx, polarity: 1 | -1, model: FetModel): Element {
  const [g, d, s] = c.nodes;
  const p = polarity;
  const gateVcrit = model.gateIs > 0 ? vcritOf(model.gateIs, VT) : 0;
  const gateCap = model.gateIs > 0 ? expLimit(model.gateIs) : 0;

  /** Currents into [g, d, s] and their slopes against [Vg, Vd, Vs], in the actual frame. */
  const evaluate = (vgs: number, vds: number) => {
    let id: number, row: number[];
    if (vds >= 0) {
      const m = channel(vgs, vds, model);
      id = m.id;
      row = [m.gm, m.gds, -m.gm - m.gds];
    } else {
      // The terminal called the drain is the source now.
      const m = channel(vgs - vds, -vds, model);
      id = -m.id;
      row = [-m.gm, m.gm + m.gds, -m.gds];
    }
    const currents = [0, p * id, -p * id];
    const jac = [[0, 0, 0], row, row.map((v) => -v)];
    if (model.gateIs > 0) {
      // Gate–source and gate–drain junctions (anode at the gate for N-type).
      for (const [term, v] of [
        [2, vgs],
        [1, vgs - vds],
      ] as const) {
        const f = expd(v / VT, gateCap);
        const ij = model.gateIs * (f.v - 1), gj = (model.gateIs * f.d) / VT + GJ;
        currents[0] += p * ij;
        currents[term] -= p * ij;
        jac[0][0] += gj;
        jac[0][term] -= gj;
        jac[term][0] -= gj;
        jac[term][term] += gj;
      }
    }
    return { id: p * id, currents, jac };
  };
  const frame = (x: Float64Array) => ({ gs: p * (vAt(x, g) - vAt(x, s)), ds: p * (vAt(x, d) - vAt(x, s)) });

  let vgs = 0, vds = 0;
  let accepted = { gs: 0, ds: 0 };
  return {
    compId: c.compId,
    nodes: c.nodes,
    nonlinear: true,
    beginSolve() {
      ({ gs: vgs, ds: vds } = accepted);
    },
    stampIter(st, x) {
      const raw = frame(x);
      let gs = clampStep(raw.gs, vgs, FET_STEP.gs);
      const ds = clampStep(raw.ds, vds, FET_STEP.ds);
      if (model.gateIs > 0) gs = pnjlim(gs, vgs, VT, gateVcrit);
      vgs = gs;
      vds = ds;
      const { currents, jac } = evaluate(vgs, vds);
      st.linearized([g, d, s], currents, jac, [p * vgs, p * vds, 0]);
      st.conductance(d, s, GJ);
    },
    converged(x) {
      const raw = frame(x);
      return near(raw.gs, vgs) && near(raw.ds, vds);
    },
    accept(x) {
      accepted = frame(x);
      ({ gs: vgs, ds: vds } = accepted);
      return false;
    },
    readout(x) {
      const raw = frame(x);
      const { id } = evaluate(raw.gs, raw.ds);
      const v = vAt(x, d) - vAt(x, s);
      return { v, i: id, p: v * id };
    },
    terminalCurrents(x) {
      const raw = frame(x);
      return evaluate(raw.gs, raw.ds).currents;
    },
    save: () => accepted,
    restore(state) {
      const st = state as { gs?: unknown; ds?: unknown };
      if (typeof st?.gs === "number" && typeof st.ds === "number") {
        accepted = { gs: st.gs, ds: st.ds };
        ({ gs: vgs, ds: vds } = accepted);
      }
    },
  };
}
