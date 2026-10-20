import { UnionFind } from "../../model/unionFind";
import { type Element, GROUND } from "./element";

export interface Problem {
  message: string;
  /** Components to highlight. */
  compIds: string[];
}

const key = (node: number) => (node === GROUND ? "g" : String(node));

/**
 * Problems that make the circuit unsolvable, found from its shape before solving:
 * loops of ideal voltages (sources, closed switches) and current sources with no path.
 */
export function findProblems(elements: readonly Element[]): Problem[] {
  return [...voltageLoops(elements), ...currentSourcesWithoutPath(elements)];
}

function voltageLoops(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  const uf = new UnionFind();
  // The forest of ideal-voltage edges so far, to name the parts on a loop.
  const adjacent = new Map<string, { to: string; compId: string }[]>();
  const link = (a: string, b: string, compId: string) => {
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!adjacent.has(from)) adjacent.set(from, []);
      adjacent.get(from)!.push({ to, compId });
    }
  };
  for (const e of elements) {
    for (const [p, q] of e.voltageEdges?.() ?? []) {
      const a = key(p), b = key(q);
      uf.add(a);
      uf.add(b);
      if (uf.find(a) === uf.find(b)) {
        const loop = new Set([e.compId, ...pathBetween(adjacent, a, b)]);
        problems.push({ message: "Voltage sources and closed switches form a loop with no resistance", compIds: [...loop] });
        continue;
      }
      uf.union(a, b);
      link(a, b, e.compId);
    }
  }
  return problems;
}

function pathBetween(adjacent: Map<string, { to: string; compId: string }[]>, from: string, to: string): string[] {
  const via = new Map<string, { prev: string; compId: string }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const edge of adjacent.get(at) ?? []) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      via.set(edge.to, { prev: at, compId: edge.compId });
      queue.push(edge.to);
    }
  }
  const comps: string[] = [];
  for (let at = to; via.has(at); at = via.get(at)!.prev) comps.push(via.get(at)!.compId);
  return comps;
}

function currentSourcesWithoutPath(elements: readonly Element[]): Problem[] {
  const uf = new UnionFind();
  uf.add("g");
  const join = (p: number, q: number) => {
    uf.add(key(p));
    uf.add(key(q));
    uf.union(key(p), key(q));
  };
  for (const e of elements) {
    if (e.currentSource) continue;
    const paths = e.paths?.() ?? e.nodes.slice(1).map((n): [number, number] => [e.nodes[0], n]);
    for (const [p, q] of paths) join(p, q);
  }
  const problems: Problem[] = [];
  for (const e of elements) {
    if (!e.currentSource) continue;
    const [p, n = GROUND] = e.nodes;
    uf.add(key(p));
    uf.add(key(n));
    if (uf.find(key(p)) !== uf.find(key(n))) {
      problems.push({ message: "This current source has no path for its current", compIds: [e.compId] });
    }
  }
  return problems;
}
