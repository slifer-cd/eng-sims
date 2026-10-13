import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Circuit, Endpoint, Point, Props } from "../model/types";
import type { ChipLibrary } from "../sim/compile";
import { GRID } from "./layout";
import {
  type Clip,
  copyItems,
  internalWireIds,
  moveItems,
  newId,
  pasteClip,
  pruneWires,
  removeItems,
  rotateItems,
} from "./ops";
import { buildScene, sceneBounds } from "./scene";

const HISTORY_LIMIT = 200;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export interface Selection {
  comps: string[];
  wires: string[];
}

export interface Viewport {
  /** Screen offset of the world origin, in CSS pixels. */
  x: number;
  y: number;
  zoom: number;
}

export interface Placing {
  chipId: string;
  props: Props;
  /** Started by dragging from the palette: dropping on the canvas places it once. */
  fromDrag: boolean;
}

export interface DrawingWire {
  from: Endpoint;
  /** World position of the start, for the preview. */
  start: Point;
  points: Point[];
}

export interface EditorState {
  circuit: Circuit;
  /** Earlier circuits for undo; immer keeps them immutable, so snapshots share structure. */
  past: Circuit[];
  future: Circuit[];
  selection: Selection;
  viewport: Viewport;
  canvasSize: { w: number; h: number };
  placing: Placing | null;
  drawing: DrawingWire | null;
  clipboard: Clip | null;
  library: ChipLibrary;

  /** Apply one undoable change to the circuit. */
  edit(recipe: (c: Circuit) => void): void;
  undo(): void;
  redo(): void;
  /** Replace the circuit and clear history, e.g. when opening a saved design. */
  load(circuit: Circuit): void;

  addComponent(chipId: string, at: Point, props?: Props): string;
  updateComponent(compId: string, patch: { label?: string; props?: Props }): void;
  addWire(a: Endpoint, b: Endpoint, points: Point[]): void;
  moveSelection(compIds: string[], wireIds: string[], dx: number, dy: number): void;
  rotateSelection(): void;
  deleteSelection(): void;
  copySelection(): void;
  paste(): void;

  select(sel: Selection, additive?: boolean): void;
  toggleSelected(kind: "comps" | "wires", id: string): void;
  selectAll(): void;
  clearSelection(): void;

  setViewport(v: Viewport): void;
  setCanvasSize(w: number, h: number): void;
  zoomBy(factor: number, around?: Point): void;
  fitView(): void;

  setPlacing(p: Placing | null): void;
  setDrawing(d: DrawingWire | null): void;
  /** Cancel whatever is in progress: drawing, placing, or else the selection. */
  cancel(): void;
}

const emptyLibrary: ChipLibrary = { get: () => undefined };
const emptySelection = (): Selection => ({ comps: [], wires: [] });

export const useEditor = create<EditorState>()(
  immer((set, get) => ({
    circuit: { components: [], wires: [] },
    past: [],
    future: [],
    selection: emptySelection(),
    viewport: { x: 0, y: 0, zoom: 1 },
    canvasSize: { w: 0, h: 0 },
    placing: null,
    drawing: null,
    clipboard: null,
    library: emptyLibrary,

    edit(recipe) {
      set((s) => {
        const before = get().circuit;
        recipe(s.circuit);
        s.past.push(before);
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
        // Drop selected ids that no longer exist.
        const comps = new Set(s.circuit.components.map((c) => c.id));
        const wires = new Set(s.circuit.wires.map((w) => w.id));
        s.selection.comps = s.selection.comps.filter((id) => comps.has(id));
        s.selection.wires = s.selection.wires.filter((id) => wires.has(id));
      });
    },

    undo() {
      set((s) => {
        const prev = s.past.pop();
        if (!prev) return;
        s.future.push(get().circuit);
        s.circuit = prev;
        s.selection = emptySelection();
      });
    },

    redo() {
      set((s) => {
        const next = s.future.pop();
        if (!next) return;
        s.past.push(get().circuit);
        s.circuit = next;
        s.selection = emptySelection();
      });
    },

    load(circuit) {
      set((s) => {
        s.circuit = circuit;
        s.past = [];
        s.future = [];
        s.selection = emptySelection();
      });
    },

    addComponent(chipId, at, props = {}) {
      const id = newId();
      get().edit((c) => {
        c.components.push({ id, chipId, x: at.x, y: at.y, rotation: 0, props: structuredClone(props) });
      });
      set((s) => {
        s.selection = { comps: [id], wires: [] };
      });
      return id;
    },

    updateComponent(compId, patch) {
      const { library } = get();
      get().edit((c) => {
        const comp = c.components.find((x) => x.id === compId);
        if (!comp) return;
        if (patch.label !== undefined) comp.label = patch.label || undefined;
        if (patch.props) Object.assign(comp.props, patch.props);
        pruneWires(c, library);
      });
    },

    addWire(a, b, points) {
      get().edit((c) => {
        c.wires.push({ id: newId(), a, b, points });
      });
    },

    moveSelection(compIds, wireIds, dx, dy) {
      if (dx === 0 && dy === 0) return;
      get().edit((c) => {
        const comps = new Set(compIds);
        moveItems(c, comps, internalWireIds(c, comps, wireIds), dx, dy);
      });
    },

    rotateSelection() {
      const { comps } = get().selection;
      if (comps.length) get().edit((c) => rotateItems(c, new Set(comps)));
    },

    deleteSelection() {
      const { comps, wires } = get().selection;
      if (comps.length || wires.length) get().edit((c) => removeItems(c, comps, wires));
    },

    copySelection() {
      const { comps } = get().selection;
      if (!comps.length) return;
      const clip = copyItems(get().circuit, new Set(comps));
      set((s) => {
        s.clipboard = clip;
      });
    },

    paste() {
      const clip = get().clipboard;
      if (!clip) return;
      let pasted = emptySelection();
      get().edit((c) => {
        const ids = pasteClip(c, clip, 2 * GRID, 2 * GRID);
        pasted = { comps: ids.compIds, wires: ids.wireIds };
      });
      // Paste again lands one step further on, not on top of this copy.
      const next = copyItems(get().circuit, new Set(pasted.comps));
      set((s) => {
        s.selection = pasted;
        s.clipboard = next;
      });
    },

    select(sel, additive = false) {
      set((s) => {
        s.selection = additive
          ? {
              comps: [...new Set([...s.selection.comps, ...sel.comps])],
              wires: [...new Set([...s.selection.wires, ...sel.wires])],
            }
          : sel;
      });
    },

    toggleSelected(kind, id) {
      set((s) => {
        const list = s.selection[kind];
        s.selection[kind] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      });
    },

    selectAll() {
      set((s) => {
        s.selection = {
          comps: s.circuit.components.map((c) => c.id),
          wires: s.circuit.wires.map((w) => w.id),
        };
      });
    },

    clearSelection() {
      set((s) => {
        s.selection = emptySelection();
      });
    },

    setViewport(v) {
      set((s) => {
        s.viewport = v;
      });
    },

    setCanvasSize(w, h) {
      set((s) => {
        s.canvasSize = { w, h };
      });
    },

    zoomBy(factor, around) {
      const { viewport: v, canvasSize } = get();
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const p = around ?? { x: canvasSize.w / 2, y: canvasSize.h / 2 };
      // Keep the world point under `p` fixed on screen.
      const k = zoom / v.zoom;
      get().setViewport({ zoom, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k });
    },

    fitView() {
      const { circuit, library, canvasSize } = get();
      const b = sceneBounds(buildScene(circuit, library));
      if (!b) {
        get().setViewport({ x: canvasSize.w / 2, y: canvasSize.h / 2, zoom: 1 });
        return;
      }
      const pad = 60;
      const zoom = Math.min(
        2,
        Math.max(MIN_ZOOM, Math.min((canvasSize.w - pad) / Math.max(b.w, 1), (canvasSize.h - pad) / Math.max(b.h, 1))),
      );
      get().setViewport({
        zoom,
        x: canvasSize.w / 2 - (b.x + b.w / 2) * zoom,
        y: canvasSize.h / 2 - (b.y + b.h / 2) * zoom,
      });
    },

    setPlacing(p) {
      set((s) => {
        s.placing = p;
        if (p) s.drawing = null;
      });
    },

    setDrawing(d) {
      set((s) => {
        s.drawing = d;
      });
    },

    cancel() {
      set((s) => {
        if (s.drawing) s.drawing = null;
        else if (s.placing) s.placing = null;
        else s.selection = emptySelection();
      });
    },
  })),
);
