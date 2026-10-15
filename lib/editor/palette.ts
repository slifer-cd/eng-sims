/**
 * How the left bar groups parts into lists. The user can rename, add, remove and reorder
 * lists and move any part (built-in or block) between them. The saved layout may be stale
 * (blocks deleted or added since), so it is always passed through `arrangePalette`.
 */
export interface PaletteGroup {
  id: string;
  title: string;
  /** Built-in ids and block ids, in display order. */
  items: string[];
}

/** New blocks land in this list, or in the last list if it has been removed. */
export const BLOCKS_GROUP = "blocks";

export const DEFAULT_GROUPS: readonly PaletteGroup[] = [
  { id: "io", title: "Inputs & outputs", items: ["input", "output", "clock", "vdd", "gnd"] },
  { id: "gates", title: "Gates", items: ["not", "and", "or", "nand", "nor", "xor", "xnor"] },
  { id: "wiring", title: "Wiring", items: ["tristate", "splitter", "merger", "busend"] },
  { id: "displays", title: "Displays", items: ["led", "seg7", "dotmatrix", "rgbmatrix"] },
  { id: BLOCKS_GROUP, title: "My blocks", items: [] },
];

const PALETTE_BUILTINS = DEFAULT_GROUPS.flatMap((g) => g.items);

/** The list that receives blocks not placed anywhere yet. */
export const blocksGroupId = (groups: readonly PaletteGroup[]) =>
  (groups.find((g) => g.id === BLOCKS_GROUP) ?? groups.at(-1))?.id;

/**
 * The layout to show: unknown and duplicate ids dropped, and every built-in and block
 * placed exactly once. A missing built-in goes back to its default list, which is added
 * at the end if the layout lacks it; a missing block goes to the blocks list. Removing
 * a list in the Ctrl+L menu moves its parts, so built-ins only go missing when they are
 * new since the layout was saved. Never returns an empty layout.
 */
export function arrangePalette(groups: readonly PaletteGroup[], chipIds: readonly string[]): PaletteGroup[] {
  const blocks = new Set(chipIds);
  const known = (id: string) => blocks.has(id) || PALETTE_BUILTINS.includes(id);
  const seen = new Set<string>();
  const out = (groups.length ? groups : DEFAULT_GROUPS).map((g) => ({
    ...g,
    items: g.items.filter((id) => known(id) && !seen.has(id) && !!seen.add(id)),
  }));
  const byId = (id: string | undefined) => out.find((g) => g.id === id);

  for (const id of PALETTE_BUILTINS) {
    if (seen.has(id)) continue;
    const home = DEFAULT_GROUPS.find((g) => g.items.includes(id))!;
    let group = byId(home.id);
    if (!group) {
      group = { ...home, items: [] };
      // Keep the blocks list last if it is.
      const blocksAt = out.length && out.at(-1)!.id === BLOCKS_GROUP ? out.length - 1 : out.length;
      out.splice(blocksAt, 0, group);
    }
    group.items.push(id);
  }
  const blockList = byId(blocksGroupId(out))!;
  for (const id of chipIds) if (!seen.has(id)) blockList.items.push(id);
  return out;
}

/** A layout read from storage, or null if it isn't one. */
export function parsePaletteGroups(raw: unknown): PaletteGroup[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ok = raw.every(
    (g) =>
      g &&
      typeof g.id === "string" &&
      typeof g.title === "string" &&
      Array.isArray(g.items) &&
      g.items.every((i: unknown) => typeof i === "string"),
  );
  return ok ? raw.map((g) => ({ id: g.id, title: g.title, items: [...g.items] })) : null;
}

/** Why a list title can't be used, or null. Titles are compared ignoring case. */
export function groupTitleProblem(title: string, groups: readonly PaletteGroup[], groupId: string): string | null {
  const t = title.trim();
  if (!t) return "Every list needs a name.";
  if (groups.some((g) => g.id !== groupId && g.title.trim().toLowerCase() === t.toLowerCase()))
    return `There are two lists named "${t}".`;
  return null;
}
