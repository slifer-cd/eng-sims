import type { Props } from "../../model/types";

/** The unknown index of the ground node. It is not in the matrix, so stamps on it are dropped. */
export const GROUND = -1;

/**
 * Writes element stamps into the MNA system A·x = b. Every row of A is one unknown: a node
 * voltage (its KCL equation) or a branch current (its element equation).
 */
export class Stamper {
  constructor(
    readonly n: number,
    /** Row-major n×n, or null when only the right-hand side may change. */
    readonly a: Float64Array | null,
    readonly b: Float64Array,
  ) {}

  add(row: number, col: number, v: number) {
    if (row < 0 || col < 0) return;
    if (!this.a) throw new Error("This stamp may only change the right-hand side");
    this.a[row * this.n + col] += v;
  }

  rhs(row: number, v: number) {
    if (row >= 0) this.b[row] += v;
  }

  /** A conductance g between nodes p and q. */
  conductance(p: number, q: number, g: number) {
    this.add(p, p, g);
    this.add(q, q, g);
    this.add(p, q, -g);
    this.add(q, p, -g);
  }

  /** A current i flowing from node `from`, through the element, into node `to`. */
  current(from: number, to: number, i: number) {
    this.rhs(from, -i);
    this.rhs(to, i);
  }

  /** A current gm·(V(cp) − V(cn)) flowing from node p, through the element, into node q. */
  vccs(p: number, q: number, cp: number, cn: number, gm: number) {
    this.add(p, cp, gm);
    this.add(p, cn, -gm);
    this.add(q, cp, -gm);
    this.add(q, cn, gm);
  }

  /**
   * The matrix part of an ideal voltage V(p) − V(q) = v whose branch current (unknown k)
   * flows from p through the element to q. The value v goes in with `rhs(k, v)`.
   */
  voltageRow(p: number, q: number, k: number) {
    this.add(p, k, 1);
    this.add(q, k, -1);
    this.add(k, p, 1);
    this.add(k, q, -1);
  }

  /** The matrix part of a branch whose current (unknown k) is forced to zero, as in an open switch. */
  openRow(p: number, q: number, k: number) {
    this.add(p, k, 1);
    this.add(q, k, -1);
    this.add(k, k, 1);
  }
}

export interface StepCtx {
  /** Time at the end of the step being solved. */
  t: number;
  dt: number;
  method: "trap" | "be";
}

/** Values shown for a part. Currents follow the passive sign convention: into the first terminal. */
export interface Readout {
  v?: number;
  i?: number;
  /** Power absorbed (negative while delivering). */
  p?: number;
}

/** Live setting of a switch-like part: closed or not, or which throw. */
export type SwitchValue = boolean | string;

export interface Element {
  readonly compId: string;
  /** Unknowns of the part's terminals, in the part's terminal order (GROUND for ground). */
  readonly nodes: number[];
  readonly nonlinear?: boolean;
  /** Stamps fixed by dt, method and switch positions. Cached until one of those changes. */
  stampStatic?(s: Stamper, ctx: StepCtx): void;
  /** Right-hand-side stamps for this step: source values, companion-model history. */
  stampStep?(s: Stamper, ctx: StepCtx): void;
  /** Linearised stamps around the guess x, for each Newton iteration (nonlinear parts). */
  stampIter?(s: Stamper, x: Float64Array, ctx: StepCtx): void;
  converged?(x: Float64Array): boolean;
  /** Commit state for an accepted step. Returns true if the static stamps changed. */
  accept?(x: Float64Array, ctx: StepCtx): boolean;
  readout?(x: Float64Array): Readout;
  /** Node pairs held at a fixed voltage difference (sources, closed switches): loops are errors. */
  voltageEdges?(): [number, number][];
  /** Node pairs this element conducts between. Default: all of its terminals. */
  paths?(): [number, number][];
  /** An ideal current source: needs a path through other elements from nodes[0] to nodes[1]. */
  readonly currentSource?: boolean;
  /** Switches: set the live position. Returns false if the value doesn't apply. */
  setSwitch?(value: SwitchValue): boolean;
  switchValue?(): SwitchValue;
  /** State that survives a recompile of the same part. */
  save?(): unknown;
  restore?(state: unknown): void;
}

export interface CreateCtx {
  compId: string;
  props: Props;
  nodes: number[];
  /** A new branch-current unknown. */
  branch(): number;
  /** A new internal node-voltage unknown. */
  node(): number;
}

export const vAt = (x: Float64Array, node: number) => (node < 0 ? 0 : x[node]);
