import { projectOntoPolyline, rotate } from "../../editor/layout";
import { internalWireIds } from "../../editor/ops";
import type { MovePreview } from "../../editor/scene";
import type { Circuit, ComponentInst, Endpoint, Point, Props, Wire } from "../../model/types";
import { type PartSpec, getPart, partProps } from "../parts";

export type { MovePreview } from "../../editor/scene";

export interface PartItem {
  comp: ComponentInst;
  /** Undefined for a part this version doesn't know. */
  spec?: PartSpec;
  /** Props with defaults filled in and bad values replaced. */
  props: Props;
  /** World position of each terminal. */
  terminals: Map<string, Point>;
  bounds: { x: number; y: number; w: number; h: number };
}

export interface WireItem {
  wire: Wire;
  /** Full path in world space, from end `a` through the bends to end `b`. */
  points: Point[];
}

export interface Scene {
  comps: Map<string, PartItem>;
  wires: Map<string, WireItem>;
}

const UNKNOWN_SIZE = { w: 40, h: 40 };

/** World position of a point given in a part's own coordinates: mirrored (if flipped), then rotated. */
export function terminalWorld(comp: Pick<ComponentInst, "x" | "y" | "rotation" | "flip">, local: Point): Point {
  const r = rotate(comp.flip ? { x: local.x, y: -local.y } : local, comp.rotation);
  return { x: comp.x + r.x, y: comp.y + r.y };
}

export function partItem(comp: ComponentInst): PartItem {
  const spec = getPart(comp.chipId);
  const size = spec?.bounds ?? UNKNOWN_SIZE;
  const turned = comp.rotation === 90 || comp.rotation === 270;
  const w = turned ? size.h : size.w;
  const h = turned ? size.w : size.h;
  return {
    comp,
    spec,
    props: spec ? partProps(spec, comp.props) : {},
    terminals: new Map(spec?.terminals.map((t) => [t.id, terminalWorld(comp, t)]) ?? []),
    bounds: { x: comp.x - w / 2, y: comp.y - h / 2, w, h },
  };
}

export function buildScene(circuit: Circuit, move?: MovePreview): Scene {
  const movingWires = move ? internalWireIds(circuit, move.compIds, move.wireIds) : new Set<string>();
  const shift = (p: Point): Point => (move ? { x: p.x + move.dx, y: p.y + move.dy } : p);

  const comps = new Map<string, PartItem>();
  for (const comp of circuit.components) {
    comps.set(comp.id, partItem(move?.compIds.has(comp.id) ? { ...comp, ...shift(comp) } : comp));
  }

  const wireById = new Map(circuit.wires.map((w) => [w.id, w]));
  const wires = new Map<string, WireItem>();
  // Junctions depend on the wire they attach to, so wires resolve recursively.
  const resolving = new Set<string>();
  function resolveWire(w: Wire): WireItem {
    const done = wires.get(w.id);
    if (done) return done;
    resolving.add(w.id);
    const moves = movingWires.has(w.id);
    const bends = moves ? w.points.map(shift) : w.points;
    const end = (e: Endpoint, neighbour: Point | undefined): Point => {
      if (e.kind === "pin") return comps.get(e.compId)?.terminals.get(e.pinId) ?? neighbour ?? { x: 0, y: 0 };
      const at = moves ? shift(e) : { x: e.x, y: e.y };
      const target = wireById.get(e.wireId);
      if (!target || resolving.has(target.id)) return at;
      return projectOntoPolyline(at, resolveWire(target).points);
    };
    const result = { wire: w, points: [end(w.a, bends[0]), ...bends, end(w.b, bends[bends.length - 1])] };
    resolving.delete(w.id);
    wires.set(w.id, result);
    return result;
  }
  for (const w of circuit.wires) resolveWire(w);

  return { comps, wires };
}

/** Bounding box of everything in the scene, or null when empty. */
export function sceneBounds(scene: Scene) {
  const xs: number[] = [], ys: number[] = [];
  for (const { bounds: b } of scene.comps.values()) {
    xs.push(b.x, b.x + b.w);
    ys.push(b.y, b.y + b.h);
  }
  for (const { points } of scene.wires.values()) {
    for (const p of points) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  if (xs.length === 0) return null;
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
