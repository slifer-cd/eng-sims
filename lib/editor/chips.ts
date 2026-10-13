import { derivePins } from "../model/pins";
import type { ChipDef, Circuit } from "../model/types";
import type { ChipLibrary } from "../sim/compile";
import { newId } from "./ops";

/*
 * Saving designs as custom chips ("blocks") and the rules that keep them nestable.
 */

/** Block body colours by name: [light theme, dark theme]. */
const BLOCK_PALETTE: Record<string, [string, string]> = {
  slate: ["#e2e8f0", "#334155"],
  red: ["#fecaca", "#7f1d1d"],
  orange: ["#fed7aa", "#7c2d12"],
  amber: ["#fde68a", "#78350f"],
  green: ["#bbf7d0", "#14532d"],
  teal: ["#99f6e4", "#134e4a"],
  blue: ["#bfdbfe", "#1e3a8a"],
  violet: ["#ddd6fe", "#4c1d95"],
  pink: ["#fbcfe8", "#831843"],
};

export const BLOCK_COLORS = Object.keys(BLOCK_PALETTE);

/**
 * CSS colour for a chip: a block colour name, or any CSS colour as-is. Block colours use
 * `light-dark()`, so the element needs `colorScheme: "light dark"` in its style. They are
 * kept out of globals.css because the dev server sometimes serves that file stale.
 */
export function chipFill(color: string) {
  const shades = BLOCK_PALETTE[color];
  return shades ? `light-dark(${shades[0]}, ${shades[1]})` : color;
}

/** A colour not used yet, so new blocks are easy to tell apart. */
export function nextColor(chips: readonly ChipDef[]): string {
  const used = new Set(chips.map((c) => c.color));
  return BLOCK_COLORS.find((c) => !used.has(c)) ?? BLOCK_COLORS[chips.length % BLOCK_COLORS.length];
}

export const sortChips = (chips: ChipDef[]) => chips.sort((a, b) => a.name.localeCompare(b.name));

/** Ids of every custom chip used inside `circuit`, directly or nested. */
export function usedChipIds(circuit: Circuit, library: ChipLibrary): Set<string> {
  const used = new Set<string>();
  const visit = (c: Circuit) => {
    for (const comp of c.components) {
      const chip = used.has(comp.chipId) ? undefined : library.get(comp.chipId);
      if (!chip) continue;
      used.add(chip.id);
      visit(chip.circuit);
    }
  };
  visit(circuit);
  return used;
}

/** Saved chips that place `chipId` directly in their own circuit. */
export const chipUsers = (chipId: string, chips: readonly ChipDef[]) =>
  chips.filter((c) => c.circuit.components.some((x) => x.chipId === chipId));

/** Whether placing `chipId` in the open chip's circuit would make that chip contain itself. */
export function wouldContainItself(chipId: string, openChipId: string | null, library: ChipLibrary): boolean {
  if (!openChipId) return false;
  if (chipId === openChipId) return true;
  const chip = library.get(chipId);
  return !!chip && usedChipIds(chip.circuit, library).has(openChipId);
}

/** Why `name` can't be used for a block, ignoring the block being updated. */
export function nameProblem(name: string, chips: readonly ChipDef[], exceptId: string | null): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the block a name.";
  const key = trimmed.toLowerCase();
  if (chips.some((c) => c.id !== exceptId && c.name.toLowerCase() === key)) {
    return `A block named "${trimmed}" already exists.`;
  }
  return null;
}

/** Why the circuit can't be saved as a block, or as an update of block `chipId`. */
export function designProblems(circuit: Circuit, library: ChipLibrary, chipId: string | null): string[] {
  const problems: string[] = [];
  const pins = derivePins(circuit);
  if (pins.length === 0) {
    problems.push("Add at least one Input or Output Pin. They become the block's pins.");
  }
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const p of pins) (seen.has(p.name) ? dupes : seen).add(p.name);
  for (const name of dupes) problems.push(`Two pins are named "${name}". Give them different labels.`);
  if (chipId && usedChipIds(circuit, library).has(chipId)) {
    problems.push("This design uses the block itself, so it would contain itself.");
  }
  return problems;
}

export interface ChipMeta {
  name: string;
  color: string;
}

/** A chip saved from `circuit`. Updating `existing` keeps its id, so designs using it pick up the change. */
export function makeChipDef(circuit: Circuit, meta: ChipMeta, existing?: ChipDef, now = Date.now()): ChipDef {
  return {
    id: existing?.id ?? newId(),
    name: meta.name.trim(),
    pins: derivePins(circuit),
    color: meta.color,
    circuit,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
