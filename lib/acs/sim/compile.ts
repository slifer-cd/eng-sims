import type { Circuit, ComponentInst, Endpoint } from "../../model/types";
import { UnionFind } from "../../model/unionFind";
import { pinKey, wireKey } from "../../sim/compile";
import { pointKey, terminalWorld } from "../geometry";
import { type PartSpec, getPart, partProps } from "../parts";
import { type Element, GROUND } from "./element";
import { type Problem, findProblems } from "./validate";

export type { Problem } from "./validate";

export interface Netlist {
  /** Number of unknowns: node voltages, then branch currents and internal nodes as allocated. */
  size: number;
  /** 1 where the unknown is a branch current rather than a node voltage. */
  isCurrent: Uint8Array;
  elements: Element[];
  /** Part id of every component that compiled. */
  parts: Map<string, string>;
  /** Unknowns of every component's terminals, in its part's terminal order. */
  terminals: Map<string, number[]>;
  /** Unknown of a terminal or wire (GROUND for ground), keyed by `pinKey("", …)` / `wireKey("", …)`. */
  nodeByKey: Map<string, number>;
  nodeOf(compId: string, terminalId: string): number | undefined;
  /** Components touching an unknown, to point at a problem found while solving. */
  compsAt(unknown: number): string[];
  /** Problems that stop the simulation. */
  errors: Problem[];
  /** The errors that no switch position can fix, such as unknown parts. */
  fixedErrors: Problem[];
  warnings: Problem[];
}

const GROUND_KEY = "#ground";
const spotKey = (point: string) => `#at:${point}`;
const labelKey = (name: string) => `#label:${name}`;

const displayName = (comp: ComponentInst, spec: PartSpec) => comp.label || spec.name;

/** Turn a drawn circuit into numbered nodes and simulation elements. */
export function compileCircuit(circuit: Circuit): Netlist {
  const uf = new UnionFind();
  uf.add(GROUND_KEY);
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const placed: { comp: ComponentInst; spec: PartSpec }[] = [];
  const parts = new Map<string, string>();

  for (const comp of circuit.components) {
    const spec = getPart(comp.chipId);
    if (!spec) {
      errors.push({ message: `Unknown part "${comp.chipId}"`, compIds: [comp.id] });
      continue;
    }
    placed.push({ comp, spec });
    parts.set(comp.id, spec.id);
    for (const t of spec.terminals) {
      const k = pinKey("", comp.id, t.id);
      uf.add(k);
      // Terminals on the same point are connected, wire or not.
      const spot = spotKey(pointKey(terminalWorld(comp, t)));
      uf.add(spot);
      uf.union(k, spot);
    }
    if (spec.id === "ground") uf.union(pinKey("", comp.id, "g"), GROUND_KEY);
    if (spec.id === "netlabel") {
      const name = String(partProps(spec, comp.props).name).trim();
      if (name) {
        uf.add(labelKey(name));
        uf.union(pinKey("", comp.id, "in"), labelKey(name));
      }
    }
  }

  for (const w of circuit.wires) uf.add(wireKey("", w.id));
  const endpointKey = (e: Endpoint) => (e.kind === "pin" ? pinKey("", e.compId, e.pinId) : wireKey("", e.wireId));
  for (const w of circuit.wires) {
    for (const e of [w.a, w.b]) {
      const k = endpointKey(e);
      if (uf.has(k)) uf.union(wireKey("", w.id), k);
      else warnings.push({ message: "A wire is attached to a terminal that no longer exists", compIds: [] });
    }
  }

  // Without a ground, pick a reference so the circuit still has a 0 V node.
  const simulated = placed.filter((p) => p.spec.create);
  const hasReference = placed.some((p) => p.spec.id === "ground" || p.spec.grounded);
  if (!hasReference && simulated.length > 0) {
    const pick = simulated.find((p) => p.spec.reference) ?? simulated[0];
    const terminal = pick.spec.terminals.find((t) => t.id === pick.spec.reference) ?? pick.spec.terminals[0];
    uf.union(pinKey("", pick.comp.id, terminal.id), GROUND_KEY);
    warnings.push({
      message: `No ground: using ${displayName(pick.comp, pick.spec)} ${terminal.name} as 0 V`,
      compIds: [pick.comp.id],
    });
  }

  // Node voltages first, numbered in order of first appearance.
  const groundRoot = uf.find(GROUND_KEY);
  const unknownOfRoot = new Map<string, number>();
  const nodeByKey = new Map<string, number>();
  for (const k of uf.keys()) {
    if (k.startsWith("#")) continue;
    const root = uf.find(k);
    if (root === groundRoot) {
      nodeByKey.set(k, GROUND);
      continue;
    }
    if (!unknownOfRoot.has(root)) unknownOfRoot.set(root, unknownOfRoot.size);
    nodeByKey.set(k, unknownOfRoot.get(root)!);
  }

  const isCurrent: number[] = Array(unknownOfRoot.size).fill(0);
  const touching: Set<string>[] = Array.from({ length: unknownOfRoot.size }, () => new Set<string>());
  const elements: Element[] = [];
  const terminals = new Map<string, number[]>();
  for (const { comp, spec } of placed) {
    const nodes = spec.terminals.map((t) => nodeByKey.get(pinKey("", comp.id, t.id))!);
    terminals.set(comp.id, nodes);
    for (const n of nodes) if (n !== GROUND) touching[n].add(comp.id);
  }
  for (const { comp, spec } of placed) {
    if (!spec.create) continue;
    const nodes = terminals.get(comp.id)!;
    const alloc = (current: boolean) => {
      isCurrent.push(current ? 1 : 0);
      touching.push(new Set([comp.id]));
      return isCurrent.length - 1;
    };
    const made = spec.create({
      compId: comp.id,
      props: partProps(spec, comp.props),
      nodes,
      branch: () => alloc(true),
      node: () => alloc(false),
    });
    // A current source just placed, with nothing on its terminals yet, would stop the whole
    // simulation (its current has nowhere to go), so it sits out until it is wired.
    const alone = nodes.every((n) => n === GROUND || touching[n].size === 1);
    if (alone && made.every((e) => e.currentSource)) {
      warnings.push({ message: `${displayName(comp, spec)} is not connected, so it is left out`, compIds: [comp.id] });
      continue;
    }
    elements.push(...made);
  }

  const fixedErrors = [...errors];
  errors.push(...findProblems(elements));

  return {
    size: isCurrent.length,
    isCurrent: Uint8Array.from(isCurrent),
    elements,
    parts,
    terminals,
    nodeByKey,
    nodeOf: (compId, terminalId) => nodeByKey.get(pinKey("", compId, terminalId)),
    compsAt: (unknown) => [...(touching[unknown] ?? [])],
    errors,
    fixedErrors,
    warnings,
  };
}
