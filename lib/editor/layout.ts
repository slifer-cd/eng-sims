import type { ComponentInst, PinDef, Point, Props, Rotation, Side } from "../model/types";
import { builtinProps, getBuiltin } from "../sim/builtins";
import type { ChipLibrary } from "../sim/compile";
import { type FaceItem, FACE_SIZE, PART_SIZE, chipFace, isDisplay } from "./displays";

/** World units per grid step. Component centres and every pin sit on grid points. */
export const GRID = 10;
const PIN_SPACING = 2 * GRID;

export const snap = (n: number) => Math.round(n / GRID) * GRID;
export const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

export interface ChipLook {
  name: string;
  short: string;
  pins: PinDef[];
  pinLabels: boolean;
  /** Custom chip colour; built-ins use the theme colour. */
  color?: string;
  /** Minimum body width, e.g. to fit an Input Pin's bit buttons. */
  minWidth?: number;
  /** Displays drawn on the body. */
  face?: FaceItem[];
  /** A display part: the display is the whole body rather than sitting on a chip. */
  bare?: boolean;
  /** Exact body size, for parts smaller than the usual minimum. */
  size?: { w: number; h: number };
}

/** Input/Output Pins up to this width show one cell per bit; wider ones show hex. */
export const MAX_BIT_CELLS = 8;
export const BIT_CELL = 12;
export const BIT_GAP = 2;

/** Name, pins and drawing hints for a component, whether built-in or custom. */
export function describe(comp: Pick<ComponentInst, "chipId" | "props">, library?: ChipLibrary): ChipLook | undefined {
  const spec = getBuiltin(comp.chipId);
  if (spec) {
    const props: Props = builtinProps(spec, comp.props);
    const look: ChipLook = { name: spec.name, short: spec.short, pins: spec.pins(props), pinLabels: !!spec.pinLabels };
    if (spec.id === "input" || spec.id === "output") {
      const width = look.pins[0].width;
      look.minWidth =
        width <= MAX_BIT_CELLS ? width * (BIT_CELL + BIT_GAP) + 16 : (Math.ceil(width / 4) + 2) * 8 + 16;
    }
    if (spec.id === "busend") {
      const width = look.pins[0].width;
      look.short = width > 1 ? String(width) : "";
      look.size = { w: 2 * GRID, h: 2 * GRID };
    }
    if (isDisplay(spec.id)) {
      look.face = [{ kind: spec.id, props, route: [] }];
      look.bare = true;
    }
    return look;
  }
  const chip = library?.get(comp.chipId);
  if (!chip) return undefined;
  const face = library ? chipFace(chip, library) : [];
  return {
    name: chip.name,
    short: chip.name,
    pins: chip.pins,
    pinLabels: true,
    color: chip.color,
    ...(face.length > 0 && { face }),
  };
}

export interface PinPlacement {
  pin: PinDef;
  /** Position relative to the component centre, before rotation. */
  x: number;
  y: number;
}

export interface FacePlacement {
  item: FaceItem;
  /** Top-left corner relative to the component centre, before rotation. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The display is the component's whole body, so it draws no bezel of its own. */
  bare?: boolean;
}

export interface ChipLayout {
  w: number;
  h: number;
  pins: PinPlacement[];
  face: FacePlacement[];
  /** Where the name is drawn, relative to the centre: at the top when there is a face. */
  nameY: number;
}

const FACE_PAD = 8;
const FACE_GAP = 8;
const NAME_ROOM = 16;

/**
 * Size a rectangular body to fit its pins and text. Width and height are multiples
 * of 2·GRID, so with the centre on the grid every pin lands on a grid point too.
 */
export function layoutChip(look: ChipLook): ChipLayout {
  const bySide = (side: Side) => look.pins.filter((p) => p.side === side).sort((a, b) => a.order - b.order);
  const sides = { left: bySide("left"), right: bySide("right"), top: bySide("top"), bottom: bySide("bottom") };
  const roundUp = (n: number) => Math.ceil(n / PIN_SPACING) * PIN_SPACING;

  const maxNameLen = (pins: PinDef[]) => Math.max(0, ...pins.map((p) => p.name.length));
  const labelRoom = look.pinLabels ? (maxNameLen(sides.left) + maxNameLen(sides.right)) * 6 : 0;

  // Displays sit in a row between the pin labels, below the name.
  const faces = (look.face ?? []).map((item) => ({ item, ...FACE_SIZE[item.kind] }));
  const faceW = faces.reduce((sum, f) => sum + f.w, 0) + FACE_GAP * Math.max(0, faces.length - 1);
  const faceH = Math.max(0, ...faces.map((f) => f.h));
  const labelW = (pins: PinDef[]) => (look.pinLabels && pins.length ? maxNameLen(pins) * 6 + 6 : 0);
  const leftRoom = labelW(sides.left), rightRoom = labelW(sides.right);
  const nameRoom = faces.length && look.short ? NAME_ROOM : 0;

  if (look.size) {
    const { w, h } = look.size;
    return { w, h, pins: placePins(sides, w, h), face: [], nameY: 0 };
  }

  const pinsH = Math.max(2, Math.max(sides.left.length, sides.right.length) + 1) * PIN_SPACING;
  if (look.bare && faces.length === 1) {
    // The display fills the body right of the pin labels.
    const size = PART_SIZE[faces[0].item.kind];
    const w = roundUp(leftRoom + size.w);
    const h = Math.max(pinsH, roundUp(size.h));
    const face = [{ item: faces[0].item, x: -w / 2 + leftRoom, y: -h / 2, w: w - leftRoom, h, bare: true }];
    return { w, h, pins: placePins(sides, w, h), face, nameY: 0 };
  }

  const w = roundUp(
    Math.max(
      3 * PIN_SPACING,
      look.short.length * 8 + 16 + labelRoom,
      look.minWidth ?? 0,
      (Math.max(sides.top.length, sides.bottom.length) + 1) * PIN_SPACING,
      faces.length ? leftRoom + faceW + rightRoom + 2 * FACE_PAD : 0,
    ),
  );
  const h = Math.max(
    pinsH,
    faces.length ? roundUp(faceH + 2 * FACE_PAD + nameRoom) : 0,
  );

  const faceTop = -h / 2 + nameRoom;
  const cx = (-w / 2 + leftRoom + w / 2 - rightRoom) / 2;
  let fx = cx - faceW / 2;
  const fy = (faceTop + h / 2) / 2 - faceH / 2;
  const face = faces.map((f) => {
    const placed = { ...f, x: fx, y: fy + (faceH - f.h) / 2 };
    fx += f.w + FACE_GAP;
    return placed;
  });

  return { w, h, pins: placePins(sides, w, h), face, nameY: faces.length ? -h / 2 + 4 + NAME_ROOM / 2 : 0 };
}

/** Pins are centred along their side, PIN_SPACING apart. */
function placePins(sides: Record<Side, PinDef[]>, w: number, h: number): PinPlacement[] {
  const offset = (i: number, n: number) => (2 * i + 1 - n) * GRID;
  return [
    ...sides.left.map((pin, i, a) => ({ pin, x: -w / 2, y: offset(i, a.length) })),
    ...sides.right.map((pin, i, a) => ({ pin, x: w / 2, y: offset(i, a.length) })),
    ...sides.top.map((pin, i, a) => ({ pin, x: offset(i, a.length), y: -h / 2 })),
    ...sides.bottom.map((pin, i, a) => ({ pin, x: offset(i, a.length), y: h / 2 })),
  ];
}

/** Rotate a centre-relative point clockwise (screen coordinates, y down). */
export function rotate(p: Point, rotation: Rotation): Point {
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

export function pinWorld(comp: Pick<ComponentInst, "x" | "y" | "rotation">, placement: Point): Point {
  const r = rotate(placement, comp.rotation);
  return { x: comp.x + r.x, y: comp.y + r.y };
}

/** Axis-aligned bounds of a component's body in world space. */
export function bodyBounds(comp: Pick<ComponentInst, "x" | "y" | "rotation">, layout: ChipLayout) {
  const turned = comp.rotation === 90 || comp.rotation === 270;
  const w = turned ? layout.h : layout.w;
  const h = turned ? layout.w : layout.h;
  return { x: comp.x - w / 2, y: comp.y - h / 2, w, h };
}

/** Closest point to `p` on a polyline. */
export function projectOntoPolyline(p: Point, line: Point[]): Point {
  let best = line[0] ?? p;
  let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}
