import type { ChipDef, Props } from "../model/types";
import { builtinProps, getBuiltin } from "../sim/builtins";
import type { ChipLibrary } from "../sim/compile";

/*
 * Displays (LED, 7-segment, 16×16 screens) draw on a component's body. A block shows
 * the displays inside it on its own body too, through any depth of nesting, unless a
 * display or nested block has `showOnBlock: false`.
 */

/** A display drawn on a component's body. */
export interface FaceItem {
  /** The display's built-in id. */
  kind: string;
  props: Props;
  /** Component ids from the placed component down to the display, through nested blocks. Empty for a display itself. */
  route: string[];
}

/** Size of a display placed on its own, where it is the whole body (pin labels add to the width). */
export const PART_SIZE: Record<string, { w: number; h: number }> = {
  led: { w: 40, h: 40 },
  seg7: { w: 100, h: 180 },
  dotmatrix: { w: 200, h: 200 },
  rgbmatrix: { w: 200, h: 200 },
};

/** Size of each display's face on a block, in world units. */
export const FACE_SIZE: Record<string, { w: number; h: number }> = {
  led: { w: 24, h: 24 },
  seg7: { w: 56, h: 96 },
  dotmatrix: { w: 136, h: 136 },
  rgbmatrix: { w: 136, h: 136 },
};

export const isDisplay = (chipId: string) => chipId in FACE_SIZE;

/** Lit colours for the LED, 7-segment display and dot matrix. */
export const LED_COLORS: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#facc15",
  green: "#22c55e",
  blue: "#3b82f6",
  white: "#f8fafc",
};

const shown = (props: Props) => props.showOnBlock !== false;

/** The displays a block shows on its body, left to right by their position in its design. */
export function chipFace(chip: ChipDef, library: ChipLibrary, stack: string[] = []): FaceItem[] {
  if (stack.includes(chip.id)) return [];
  const comps = [...chip.circuit.components].sort((a, b) => a.x - b.x || a.y - b.y);
  return comps.flatMap((c): FaceItem[] => {
    if (!shown(c.props)) return [];
    const spec = getBuiltin(c.chipId);
    if (spec) return isDisplay(spec.id) ? [{ kind: spec.id, props: builtinProps(spec, c.props), route: [c.id] }] : [];
    const inner = library.get(c.chipId);
    if (!inner) return [];
    return chipFace(inner, library, [...stack, chip.id]).map((f) => ({ ...f, route: [c.id, ...f.route] }));
  });
}

/** Where a face's display sits in the engine, for the placed component `compId` at instance path `path`. */
export function faceLocation(path: string, compId: string, route: readonly string[]) {
  if (route.length === 0) return { path, compId };
  return { path: `${path}${compId}/${route.slice(0, -1).map((id) => `${id}/`).join("")}`, compId: route.at(-1)! };
}
