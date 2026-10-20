import type { Netlist, Problem } from "./compile";
import { type Element, type Readout, type StepCtx, type SwitchValue, GROUND, Stamper } from "./element";
import { LU, SingularMatrixError } from "./matrix";
import { findProblems } from "./validate";

export interface SimSettings {
  /** Time step in seconds. */
  dt: number;
  /** Integration for capacitors and inductors. Backward Euler is always used for the step after a jump. */
  method: "trap" | "be";
}

export const DEFAULT_SETTINGS: SimSettings = { dt: 5e-6, method: "trap" };

/** Leak from every node to ground, so a floating node still has a (tiny) path. */
const GMIN = 1e-12;

export interface EngineOptions {
  settings?: Partial<SimSettings>;
  /**
   * Engine for an earlier version of the same circuit. Its time and the state of parts that
   * still exist (switch positions, capacitor voltages, …) carry over.
   */
  previous?: Engine;
}

/** Transient simulation of a compiled circuit by modified nodal analysis. */
export class Engine {
  readonly netlist: Netlist;
  readonly settings: SimSettings;
  time = 0;
  /** Why the circuit can't be simulated, if it can't. */
  error: Problem | null = null;

  private x: Float64Array;
  private readonly lu: LU;
  private readonly base: Float64Array;
  private baseFor: { dt: number; method: StepCtx["method"] } | null = null;
  /** Use backward Euler for the next step: at the start and after a jump such as a switch flip. */
  private jump = true;
  private lag = 0;

  constructor(netlist: Netlist, options: EngineOptions = {}) {
    const { previous } = options;
    this.netlist = netlist;
    this.settings = { ...DEFAULT_SETTINGS, ...previous?.settings, ...options.settings };
    const n = netlist.size;
    this.x = new Float64Array(n);
    this.lu = new LU(n);
    this.base = new Float64Array(n * n);
    if (previous) {
      this.time = previous.time;
      this.restoreFrom(previous);
    }
    if (netlist.errors.length) {
      this.error = netlist.errors[0];
      return;
    }
    this.solve(false);
  }

  /** Advance one time step. Returns false, with `error` set, if the circuit can't be solved. */
  step(): boolean {
    return !this.error && this.solve(true);
  }

  /**
   * Step through `simSeconds` of circuit time, stopping early once `budgetMs` of real time
   * is used up. Time that doesn't fill a whole step carries over to the next call.
   */
  run(simSeconds: number, budgetMs: number, now: () => number = () => performance.now(), onStep?: () => void) {
    let steps = 0;
    let behind = false;
    if (this.error) return { steps, behind };
    const { dt } = this.settings;
    const start = now();
    this.lag += simSeconds;
    while (this.lag >= dt * (1 - 1e-9)) {
      if (!this.step()) break;
      this.lag -= dt;
      steps++;
      onStep?.();
      if (now() - start >= budgetMs) {
        behind = this.lag >= dt;
        if (behind) this.lag = 0;
        break;
      }
    }
    return { steps, behind };
  }

  voltage(unknown: number | undefined): number | undefined {
    if (unknown === undefined) return undefined;
    return unknown === GROUND ? 0 : this.x[unknown];
  }

  /** Largest |V| over all nodes, e.g. to scale wire colours. */
  maxVoltage() {
    let max = 0;
    for (let i = 0; i < this.netlist.size; i++) if (!this.netlist.isCurrent[i]) max = Math.max(max, Math.abs(this.x[i]));
    return max;
  }

  pinVoltage(compId: string, terminalId: string) {
    return this.voltage(this.netlist.nodeOf(compId, terminalId));
  }

  readout(compId: string): Readout | undefined {
    const e = this.netlist.elements.find((x) => x.compId === compId && x.readout);
    return e?.readout!(this.x);
  }

  /**
   * One quantity of a part: its voltage, current or power, or for a one-terminal part (a probe,
   * a rail) the voltage of its node. Undefined if the part doesn't have it.
   */
  measure(compId: string, quantity: "v" | "i" | "p"): number | undefined {
    const r = this.readout(compId);
    if (r) return r[quantity];
    if (quantity !== "v") return undefined;
    const nodes = this.netlist.terminals.get(compId);
    return nodes?.length === 1 ? this.voltage(nodes[0]) : undefined;
  }

  /** A switch's live position, or undefined for other parts. */
  switchValue(compId: string): SwitchValue | undefined {
    return this.netlist.elements.find((x) => x.compId === compId && x.switchValue)?.switchValue!();
  }

  /** Flip a switch while simulating (not part of the circuit or its undo history). */
  setSwitch(compId: string, value: SwitchValue) {
    const e = this.netlist.elements.find((x) => x.compId === compId && x.setSwitch);
    if (!e?.setSwitch!(value)) return;
    this.baseFor = null;
    this.jump = true;
    // A switch can make or clear a short, or cut a current source's path.
    this.error = this.netlist.fixedErrors[0] ?? findProblems(this.netlist.elements)[0] ?? null;
    if (!this.error) this.solve(false);
  }

  /** Solve for the end of the next step. Only a committed step moves time and part state on. */
  private solve(commit: boolean): boolean {
    const n = this.netlist.size;
    const ctx: StepCtx = {
      t: this.time + this.settings.dt,
      dt: this.settings.dt,
      method: this.jump ? "be" : this.settings.method,
    };
    try {
      if (this.baseFor?.dt !== ctx.dt || this.baseFor.method !== ctx.method) this.buildBase(ctx);
      const b = new Float64Array(n);
      const s = new Stamper(n, null, b);
      for (const e of this.netlist.elements) e.stampStep?.(s, ctx);
      this.x = this.lu.solve(b);
    } catch (err) {
      if (!(err instanceof SingularMatrixError)) throw err;
      this.error = this.explain(err.column);
      return false;
    }
    if (commit) {
      for (const e of this.netlist.elements) {
        if (e.accept?.(this.x, ctx)) {
          this.baseFor = null;
          this.jump = true;
        }
      }
      this.time = ctx.t;
      if (this.baseFor) this.jump = false;
    }
    return true;
  }

  private buildBase(ctx: StepCtx) {
    const { size: n, isCurrent, elements } = this.netlist;
    this.base.fill(0);
    for (let i = 0; i < n; i++) if (!isCurrent[i]) this.base[i * n + i] = GMIN;
    const s = new Stamper(n, this.base, new Float64Array(n));
    for (const e of elements) e.stampStatic?.(s, ctx);
    this.lu.factor(this.base);
    this.baseFor = { dt: ctx.dt, method: ctx.method };
  }

  private explain(column: number): Problem {
    return (
      findProblems(this.netlist.elements)[0] ?? {
        message: "The circuit has no unique solution here",
        compIds: this.netlist.compsAt(column),
      }
    );
  }

  private restoreFrom(previous: Engine) {
    const saved = new Map<string, unknown>();
    const indexOf = new Map<string, number>();
    const keyOf = (e: Element) => {
      const i = indexOf.get(e.compId) ?? 0;
      indexOf.set(e.compId, i + 1);
      return `${e.compId}#${i}`;
    };
    for (const e of previous.netlist.elements) {
      const k = keyOf(e);
      if (e.save && previous.netlist.parts.get(e.compId) === this.netlist.parts.get(e.compId)) saved.set(k, e.save());
    }
    indexOf.clear();
    for (const e of this.netlist.elements) {
      const k = keyOf(e);
      if (saved.has(k)) e.restore?.(saved.get(k));
    }
  }
}
