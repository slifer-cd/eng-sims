import type { ComponentInst, Point, Rotation } from "../model/types";

/** Turn a point about the origin clockwise (screen coordinates, y down). */
export function rotatePoint(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
    default:
      return p;
  }
}

/** World position of a point given in a part's own coordinates: mirrored (if flipped), then rotated. */
export function terminalWorld(comp: Pick<ComponentInst, "x" | "y" | "rotation" | "flip">, local: Point): Point {
  const r = rotatePoint(comp.flip ? { x: local.x, y: -local.y } : local, comp.rotation);
  return { x: comp.x + r.x, y: comp.y + r.y };
}

/** A key for a point, equal for points that coincide. */
export const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
