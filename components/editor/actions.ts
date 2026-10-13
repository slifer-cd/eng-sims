import { chipUsers, designProblems, nameProblem } from "@/lib/editor/chips";
import { hasUnsavedWork, useEditor } from "@/lib/editor/store";

/*
 * User actions that may need to ask or warn the user before calling the store.
 */

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ask before replacing a design that has unsaved changes. */
function confirmDiscard() {
  return !hasUnsavedWork(useEditor.getState()) || window.confirm("Discard unsaved changes to the current design?");
}

export function newDesign() {
  if (!confirmDiscard()) return;
  useEditor.getState().newDesign();
  useEditor.getState().fitView();
}

/** Open a block on the canvas; saving then updates it everywhere it is used. */
export function editChip(chipId: string) {
  if (useEditor.getState().openChipId === chipId || !confirmDiscard()) return;
  useEditor.getState().openChip(chipId);
  useEditor.getState().fitView();
}

/** Save the open block straight away. A new design, or one with problems, goes through the save dialog. */
export function quickSave() {
  const s = useEditor.getState();
  const chip = s.chips.find((c) => c.id === s.openChipId);
  if (!chip || nameProblem(chip.name, s.chips, chip.id) || designProblems(s.circuit, s.library, chip.id).length) {
    s.setSaveDialogOpen(true);
    return;
  }
  s.saveChip({ name: chip.name, color: chip.color }).catch((e) => window.alert(`Couldn't save: ${message(e)}`));
}

export async function deleteChip(chipId: string) {
  const s = useEditor.getState();
  const chip = s.library.get(chipId);
  if (!chip) return;
  const users = chipUsers(chipId, s.chips);
  if (users.length) {
    const names = users.map((c) => `"${c.name}"`).join(", ");
    window.alert(`"${chip.name}" can't be deleted because ${names} ${users.length === 1 ? "uses" : "use"} it.`);
    return;
  }
  const onCanvas = s.circuit.components.some((c) => c.chipId === chipId);
  const note = onCanvas ? " The design on the canvas uses it and will show it as missing." : "";
  if (!window.confirm(`Delete the block "${chip.name}"?${note} This can't be undone.`)) return;
  try {
    await s.deleteChip(chipId);
  } catch (e) {
    window.alert(`Couldn't delete "${chip.name}": ${message(e)}`);
  }
}
