import type { Circuit, ComponentInst, Endpoint, Point, Wire } from "../model/types";
import type { ChipLibrary } from "../sim/compile";
import { type ChipLayout, type ChipLook, bodyBounds, describe, layoutChip, pinWorld, projectOntoPolyline } from "./layout";
import { internalWireIds } from "./ops";

export interface SceneComp {
  comp: ComponentInst;
  look: ChipLook;
  layout: ChipLayout;
  /** World position of each pin. */
  pins: Map<string, Point>;
  bounds: { x: number; y: number; w: number; h: number };
}

export interface SceneWire {
  wire: Wire;
  /** Full path in world space, from end `a` through the bends to end `b`. */
  points: Point[];
  /** Widest pin this wire touches; > 1 draws as a bus. */
  width: number;
}

export interface Scene {
  comps: Map<string, SceneComp>;
  wires: Map<string, SceneWire>;
}

/** Components and wires being dragged, drawn shifted by (dx, dy) until the drop commits. */
export interface MovePreview {
  compIds: ReadonlySet<string>;
  wireIds: ReadonlySet<string>;
  dx: number;
  dy: number;
}

const UNKNOWN: ChipLook = { name: "Missing chip", short: "?", pins: [], pinLabels: false };

export function sceneComp(comp: ComponentInst, library?: ChipLibrary): SceneComp {
  const look = describe(comp, library) ?? UNKNOWN;
  const layout = layoutChip(look);
  const pins = new Map(layout.pins.map((p) => [p.pin.id, pinWorld(comp, p)]));
  return { comp, look, layout, pins, bounds: bodyBounds(comp, layout) };
}

export function buildScene(circuit: Circuit, library?: ChipLibrary, move?: MovePreview): Scene {
  const movingWires = move ? internalWireIds(circuit, move.compIds, move.wireIds) : new Set<string>();
  const shift = (p: Point): Point => (move ? { x: p.x + move.dx, y: p.y + move.dy } : p);

  const comps = new Map<string, SceneComp>();
  for (const comp of circuit.components) {
    const placed = move?.compIds.has(comp.id) ? { ...comp, ...shift(comp) } : comp;
    comps.set(comp.id, sceneComp(placed, library));
  }

  const wireById = new Map(circuit.wires.map((w) => [w.id, w]));
  const wires = new Map<string, SceneWire>();

  const pinWidth = (e: Endpoint) => {
    if (e.kind !== "pin") return 0;
    return comps.get(e.compId)?.look.pins.find((p) => p.id === e.pinId)?.width ?? 0;
  };

  // Junctions depend on the wire they attach to, so wires resolve recursively.
  const resolving = new Set<string>();
  function resolveWire(w: Wire): SceneWire {
    const done = wires.get(w.id);
    if (done) return done;
    resolving.add(w.id);
    const moves = movingWires.has(w.id);
    const bends = moves ? w.points.map(shift) : w.points;
    const end = (e: Endpoint, neighbour: Point | undefined): Point => {
      if (e.kind === "pin") return comps.get(e.compId)?.pins.get(e.pinId) ?? neighbour ?? { x: 0, y: 0 };
      const at = moves ? shift(e) : { x: e.x, y: e.y };
      const target = wireById.get(e.wireId);
      if (!target || resolving.has(target.id)) return at;
      return projectOntoPolyline(at, resolveWire(target).points);
    };
    const a = end(w.a, bends[0]);
    const b = end(w.b, bends[bends.length - 1]);
    const width = Math.max(1, pinWidth(w.a), pinWidth(w.b));
    const result = { wire: w, points: [a, ...bends, b], width };
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
