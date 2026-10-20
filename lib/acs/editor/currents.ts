import type { Endpoint, Point } from "../../model/types";
import { pointKey } from "../geometry";
import type { Scene } from "./scene";

/*
 * Currents along the drawn wires, for the moving dots. Wires join into nodes with no
 * resistance, so the solver never sees them: their currents come from KCL. Each wire is cut
 * where other wires join it, the parts' terminal currents go in at their pins, and the flows
 * are summed over a spanning tree of each node's wires. A loop of wire carries nothing extra.
 */

export interface WireFlow {
  wireId: string;
  /** A piece of the wire's path, from one join (or end) to the next. */
  points: Point[];
  /** Current along `points`, from the first point to the last. */
  current: number;
}

/**
 * Current into a part at one of its terminals. Undefined for ground and net labels: the current
 * reaching them leaves through the rest of the node (or the other labels).
 */
export type CurrentInto = (compId: string, pinId: string) => number | undefined;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function lengths(points: Point[]) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  return cum;
}

/** Distance along the path to the point on it nearest `q`. */
function arcAt(points: Point[], cum: number[], q: Point) {
  let best = { s: 0, d: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / len2));
    const d = dist(q, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    if (d < best.d) best = { s: cum[i] + t * (cum[i + 1] - cum[i]), d };
  }
  return best.s;
}

function pointAt(points: Point[], cum: number[], s: number): Point {
  for (let i = 0; i < points.length - 1; i++) {
    if (s <= cum[i + 1] || i === points.length - 2) {
      const span = cum[i + 1] - cum[i];
      const t = span === 0 ? 0 : (s - cum[i]) / span;
      const a = points[i], b = points[i + 1];
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
  }
  return points[0];
}

/** The part of the path between distances s0 and s1, bends included. */
function slice(points: Point[], cum: number[], s0: number, s1: number): Point[] {
  const inner = points.filter((_, i) => cum[i] > s0 && cum[i] < s1);
  return [pointAt(points, cum, s0), ...inner, pointAt(points, cum, s1)];
}

export function wireFlows(scene: Scene, currentInto: CurrentInto): WireFlow[] {
  // Terminals on the same point are one vertex: they are connected without a wire.
  const spots = new Map<string, { compId: string; pinId: string }[]>();
  for (const { comp, terminals } of scene.comps.values()) {
    for (const [pinId, at] of terminals) {
      const k = pointKey(at);
      if (!spots.has(k)) spots.set(k, []);
      spots.get(k)!.push({ compId: comp.id, pinId });
    }
  }
  const vertexOf = (e: Endpoint, wireId: string, end: "a" | "b") => {
    if (e.kind === "wire") return `j:${wireId}:${end}`;
    const at = scene.comps.get(e.compId)?.terminals.get(e.pinId);
    return at ? `p:${pointKey(at)}` : `p?:${e.compId}.${e.pinId}`;
  };

  // Where other wires join each wire.
  const joins = new Map<string, { vertex: string; at: Point }[]>();
  for (const { wire, points } of scene.wires.values()) {
    for (const end of ["a", "b"] as const) {
      const e = wire[end];
      if (e.kind !== "wire") continue;
      if (!joins.has(e.wireId)) joins.set(e.wireId, []);
      joins.get(e.wireId)!.push({ vertex: vertexOf(e, wire.id, end), at: end === "a" ? points[0] : points[points.length - 1] });
    }
  }

  // Cut every wire into pieces between consecutive vertices along it.
  const pieces: { wireId: string; points: Point[]; from: string; to: string }[] = [];
  for (const { wire, points } of scene.wires.values()) {
    const cum = lengths(points);
    const cuts = (joins.get(wire.id) ?? [])
      .map((j) => ({ vertex: j.vertex, s: arcAt(points, cum, j.at) }))
      .sort((p, q) => p.s - q.s);
    const stops = [{ vertex: vertexOf(wire.a, wire.id, "a"), s: 0 }, ...cuts, { vertex: vertexOf(wire.b, wire.id, "b"), s: cum[cum.length - 1] }];
    for (let i = 0; i < stops.length - 1; i++) {
      pieces.push({
        wireId: wire.id,
        points: slice(points, cum, stops[i].s, stops[i + 1].s),
        from: stops[i].vertex,
        to: stops[i + 1].vertex,
      });
    }
  }

  // Current entering the wires at each vertex: what the part's terminal sends out.
  const inflow = new Map<string, number | undefined>();
  const neighbours = new Map<string, { to: string; piece: number }[]>();
  pieces.forEach((p, index) => {
    for (const [a, b] of [
      [p.from, p.to],
      [p.to, p.from],
    ]) {
      if (!neighbours.has(a)) neighbours.set(a, []);
      neighbours.get(a)!.push({ to: b, piece: index });
      if (!inflow.has(a)) {
        // What the terminals there send out; undefined if one of them is ground or a label.
        let out: number | undefined = 0;
        for (const t of a.startsWith("p:") ? (spots.get(a.slice(2)) ?? []) : []) {
          const into = currentInto(t.compId, t.pinId);
          out = into === undefined || out === undefined ? undefined : out - into;
        }
        inflow.set(a, out);
      }
    }
  });

  const current = new Float64Array(pieces.length);
  const seen = new Set<string>();
  for (const start of neighbours.keys()) {
    if (seen.has(start)) continue;
    // Collect this node's wires, then root the tree at a ground or label if there is one.
    const members: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const v = stack.pop()!;
      members.push(v);
      for (const n of neighbours.get(v)!) {
        if (seen.has(n.to)) continue;
        seen.add(n.to);
        stack.push(n.to);
      }
    }
    const root = members.find((v) => inflow.get(v) === undefined) ?? members[0];
    const parent = new Map<string, { vertex: string; piece: number }>();
    const order = [root];
    const inTree = new Set([root]);
    for (let i = 0; i < order.length; i++) {
      for (const n of neighbours.get(order[i])!) {
        if (inTree.has(n.to)) continue;
        inTree.add(n.to);
        parent.set(n.to, { vertex: order[i], piece: n.piece });
        order.push(n.to);
      }
    }
    // Whatever enters a subtree leaves it through the piece to its parent.
    const sum = new Map(order.map((v) => [v, inflow.get(v) ?? 0]));
    for (let i = order.length - 1; i > 0; i--) {
      const v = order[i];
      const up = parent.get(v)!;
      sum.set(up.vertex, sum.get(up.vertex)! + sum.get(v)!);
      current[up.piece] = pieces[up.piece].from === v ? sum.get(v)! : -sum.get(v)!;
    }
  }

  return pieces.map((p, i) => ({ wireId: p.wireId, points: p.points, current: current[i] }));
}

/** Dot speed in px per second: by the log of the current, signed with it, zero below 0.1 µA. */
export function dotSpeed(current: number) {
  const a = Math.abs(current);
  if (a < 1e-7) return 0;
  return Math.sign(current) * Math.min(240, 30 * (Math.log10(a) + 7));
}
