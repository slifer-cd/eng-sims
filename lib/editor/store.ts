import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ChipDef, Circuit, Endpoint, Point, Props } from "../model/types";
import { type ChipLibrary, chipLibrary } from "../sim/compile";
import { type ChipRepository, memoryRepository } from "../storage/repository";
import { type ChipMeta, chipUsers, designProblems, makeChipDef, nameProblem, sortChips } from "./chips";
import { GRID, describe } from "./layout";
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
import { DEFAULT_GROUPS, type PaletteGroup } from "./palette";
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
  /** Saved custom chips ("blocks"), sorted by name. */
  chips: ChipDef[];
  library: ChipLibrary;
  /** The block open for editing: saving updates it. Null for a design not saved as a block. */
  openChipId: string | null;
  /** The circuit as last saved or opened. Any other circuit has unsaved changes. */
  savedCircuit: Circuit | null;
  /** Why saved blocks couldn't be loaded, e.g. storage blocked by the browser. */
  storageError: string | null;
  saveDialogOpen: boolean;
  /** How the left bar groups parts; may be stale, so show it through `arrangePalette`. */
  paletteGroups: PaletteGroup[];
  paletteDialogOpen: boolean;

  /** Apply one undoable change to the circuit. */
  edit(recipe: (c: Circuit) => void): void;
  undo(): void;
  redo(): void;
  /**
   * Replace the circuit and clear history. `saved` says whether it matches what is
   * stored, e.g. true when opening a block, false when restoring a draft.
   */
  load(circuit: Circuit, doc?: { chipId: string | null; saved: boolean }): void;
  newDesign(): void;
  openChip(chipId: string): void;

  /** Use `repo` for blocks from now on and load the ones it holds. */
  attachStorage(repo: ChipRepository): Promise<void>;
  /** Save the circuit as a block: updates the open block unless `asNew`. Rejects with the first problem. */
  saveChip(meta: ChipMeta, options?: { asNew?: boolean }): Promise<ChipDef>;
  /** Delete a block. Rejects if other blocks use it. */
  deleteChip(chipId: string): Promise<void>;
  setSaveDialogOpen(open: boolean): void;
  setPaletteGroups(groups: PaletteGroup[]): void;
  setPaletteDialogOpen(open: boolean): void;

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

const emptySelection = (): Selection => ({ comps: [], wires: [] });
const emptyCircuit = (): Circuit => ({ components: [], wires: [] });

/** While a dialog is open, editor shortcuts are off. */
export const dialogOpen = (s: EditorState) => s.saveDialogOpen || s.paletteDialogOpen;

/** Whether leaving the current design would lose work. */
export const hasUnsavedWork = (s: EditorState) => s.circuit !== s.savedCircuit && s.circuit.components.length > 0;

const sameCircuit = (a: Circuit, b: Circuit) => JSON.stringify(a) === JSON.stringify(b);

let repository: ChipRepository = memoryRepository();

const initialCircuit = emptyCircuit();

export const useEditor = create<EditorState>()(
  immer((set, get) => ({
    circuit: initialCircuit,
    past: [],
    future: [],
    selection: emptySelection(),
    viewport: { x: 0, y: 0, zoom: 1 },
    canvasSize: { w: 0, h: 0 },
    placing: null,
    drawing: null,
    clipboard: null,
    chips: [],
    library: chipLibrary([]),
    openChipId: null,
    savedCircuit: initialCircuit,
    storageError: null,
    saveDialogOpen: false,
    paletteGroups: structuredClone(DEFAULT_GROUPS) as PaletteGroup[],
    paletteDialogOpen: false,

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

    load(circuit, doc = { chipId: null, saved: true }) {
      set((s) => {
        s.circuit = circuit;
        s.past = [];
        s.future = [];
        s.selection = emptySelection();
        s.drawing = null;
        s.openChipId = doc.chipId;
        s.savedCircuit = doc.saved ? circuit : null;
      });
    },

    newDesign() {
      get().load(emptyCircuit());
    },

    openChip(chipId) {
      const chip = get().library.get(chipId);
      if (chip) get().load(chip.circuit, { chipId, saved: true });
    },

    async attachStorage(repo) {
      repository = repo;
      let chips: ChipDef[];
      try {
        chips = sortChips(await repo.list());
      } catch (e) {
        set((s) => {
          s.storageError = e instanceof Error ? e.message : String(e);
        });
        return;
      }
      const { circuit, openChipId, savedCircuit } = get();
      const open = chips.find((c) => c.id === openChipId);
      set((s) => {
        s.chips = chips;
        s.library = chipLibrary(chips);
        s.storageError = null;
        if (!open) s.openChipId = null;
        // A restored draft that matches its block has nothing unsaved.
        else if (!savedCircuit && sameCircuit(open.circuit, circuit)) s.savedCircuit = circuit;
      });
    },

    async saveChip(meta, { asNew = false } = {}) {
      const { circuit, chips, library, openChipId } = get();
      const existing = asNew ? undefined : chips.find((c) => c.id === openChipId);
      const problem =
        nameProblem(meta.name, chips, existing?.id ?? null) ?? designProblems(circuit, library, existing?.id ?? null)[0];
      if (problem) throw new Error(problem);

      const chip = makeChipDef(circuit, meta, existing);
      await repository.put(chip);
      // Read again: the library may have changed while saving.
      const next = sortChips([...get().chips.filter((c) => c.id !== chip.id), chip]);
      set((s) => {
        s.chips = next;
        s.library = chipLibrary(next);
        s.openChipId = chip.id;
        s.savedCircuit = circuit;
      });
      return chip;
    },

    async deleteChip(chipId) {
      const users = chipUsers(chipId, get().chips);
      if (users.length) {
        throw new Error(`It is used inside ${users.map((c) => `"${c.name}"`).join(", ")}. Remove it from there first.`);
      }
      await repository.delete(chipId);
      const next = get().chips.filter((c) => c.id !== chipId);
      set((s) => {
        s.chips = next;
        s.library = chipLibrary(next);
        if (s.placing?.chipId === chipId) s.placing = null;
        if (s.openChipId === chipId) {
          // The design stays on the canvas, but is no longer saved anywhere.
          s.openChipId = null;
          s.savedCircuit = null;
        }
      });
    },

    setSaveDialogOpen(open) {
      set((s) => {
        s.saveDialogOpen = open;
      });
    },

    setPaletteGroups(groups) {
      set((s) => {
        s.paletteGroups = groups;
      });
    },

    setPaletteDialogOpen(open) {
      set((s) => {
        s.paletteDialogOpen = open;
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
        pruneWires(c, (x) => describe(x, library)?.pins.map((p) => p.id));
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
