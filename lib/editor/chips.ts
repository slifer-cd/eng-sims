import { derivePins } from "../model/pins";
import type { ChipDef, Circuit } from "../model/types";
import type { ChipLibrary } from "../sim/compile";
import { newId } from "./ops";

/*
 * Saving designs as custom chips ("blocks") and the rules that keep them nestable.
 */

/** Block colours. Each is a theme variable `--block-<name>` in app/globals.css. */
export const BLOCK_COLORS = ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] as const;

/** CSS fill for a chip colour: a block colour name, or any CSS colour as-is. */
export const chipFill = (color: string) =>
  // Falls back to the plain chip colour rather than black if the variable is missing.
  (BLOCK_COLORS as readonly string[]).includes(color) ? `var(--block-${color}, var(--chip))` : color;

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
