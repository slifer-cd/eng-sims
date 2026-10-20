import { nanoid } from "nanoid";
import type { Circuit, ComponentInst, Endpoint, Rotation, Wire } from "../model/types";

/*
 * Pure edits on a Circuit. Mutating functions are written for immer drafts.
 */

export const newId = () => nanoid(10);

/** Remove wires whose ends point at missing wires (repeats, since removals cascade). */
function removeOrphanJunctions(c: Circuit, removed: Set<string>) {
  for (;;) {
    const ids = new Set(c.wires.map((w) => w.id));
    const orphan = (e: Endpoint) => e.kind === "wire" && (!ids.has(e.wireId) || removed.has(e.wireId));
    const keep = c.wires.filter((w) => !orphan(w.a) && !orphan(w.b));
    if (keep.length === c.wires.length) return;
    c.wires = keep;
  }
}

/** Delete components and wires, plus every wire attached to a deleted component or wire. */
export function removeItems(c: Circuit, compIds: Iterable<string>, wireIds: Iterable<string>) {
  const comps = new Set(compIds);
  const wires = new Set(wireIds);
  const touchesComp = (e: Endpoint) => e.kind === "pin" && comps.has(e.compId);
  c.components = c.components.filter((x) => !comps.has(x.id));
  c.wires = c.wires.filter((w) => !wires.has(w.id) && !touchesComp(w.a) && !touchesComp(w.b));
  removeOrphanJunctions(c, wires);
}

/**
 * Delete wires attached to components or pins that no longer exist, e.g. after a gate loses
 * an input. `pinIdsOf` lists a component's current pins (none if it is unknown).
 */
export function pruneWires(c: Circuit, pinIdsOf: (comp: ComponentInst) => Iterable<string> | undefined) {
  const pinsByComp = new Map<string, Set<string>>();
  for (const comp of c.components) pinsByComp.set(comp.id, new Set(pinIdsOf(comp)));
  const valid = (e: Endpoint) => e.kind === "wire" || !!pinsByComp.get(e.compId)?.has(e.pinId);
  const before = c.wires.length;
  c.wires = c.wires.filter((w) => valid(w.a) && valid(w.b));
  if (c.wires.length !== before) removeOrphanJunctions(c, new Set());
}

/**
 * Wires that travel with a group of components: both ends are on those components'
 * pins, or on other wires that travel with them.
 */
export function internalWireIds(c: Circuit, compIds: ReadonlySet<string>, extra: Iterable<string> = []): Set<string> {
  const result = new Set(extra);
  for (let changed = true; changed; ) {
    changed = false;
    for (const w of c.wires) {
      if (result.has(w.id)) continue;
      const inside = (e: Endpoint) => (e.kind === "pin" ? compIds.has(e.compId) : result.has(e.wireId));
      if (inside(w.a) && inside(w.b)) {
        result.add(w.id);
        changed = true;
      }
    }
  }
  return result;
}

export function moveItems(c: Circuit, compIds: ReadonlySet<string>, wireIds: ReadonlySet<string>, dx: number, dy: number) {
  for (const comp of c.components) {
    if (!compIds.has(comp.id)) continue;
    comp.x += dx;
    comp.y += dy;
  }
  for (const w of c.wires) {
    if (!wireIds.has(w.id)) continue;
    for (const p of w.points) {
      p.x += dx;
      p.y += dy;
    }
    for (const e of [w.a, w.b]) {
      if (e.kind === "wire") {
        e.x += dx;
        e.y += dy;
      }
    }
  }
}

export function rotateItems(c: Circuit, compIds: ReadonlySet<string>) {
  for (const comp of c.components) {
    if (compIds.has(comp.id)) comp.rotation = ((comp.rotation + 90) % 360) as Rotation;
  }
}

export interface Clip {
  components: ComponentInst[];
  wires: Wire[];
}

/** Copy components, plus the wires that connect only copied things. */
export function copyItems(c: Circuit, compIds: ReadonlySet<string>): Clip {
  const wires = internalWireIds(c, compIds);
  return structuredClone({
    components: c.components.filter((x) => compIds.has(x.id)),
    wires: c.wires.filter((w) => wires.has(w.id)),
  });
}

/** Paste a clip with fresh ids, shifted by (dx, dy). Returns the new ids. */
export function pasteClip(c: Circuit, clip: Clip, dx: number, dy: number) {
  const ids = new Map<string, string>();
  const idFor = (old: string) => {
    if (!ids.has(old)) ids.set(old, newId());
    return ids.get(old)!;
  };
  const comps = clip.components.map((x) => ({ ...structuredClone(x), id: idFor(x.id), x: x.x + dx, y: x.y + dy }));
  const remap = (e: Endpoint): Endpoint =>
    e.kind === "pin"
      ? { ...e, compId: idFor(e.compId) }
      : { ...e, wireId: idFor(e.wireId), x: e.x + dx, y: e.y + dy };
  const wires = clip.wires.map((w) => ({
    id: idFor(w.id),
    a: remap(w.a),
    b: remap(w.b),
    points: w.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }));
  c.components.push(...comps);
  c.wires.push(...wires);
  return { compIds: comps.map((x) => x.id), wireIds: wires.map((w) => w.id) };
}
