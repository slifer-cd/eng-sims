"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { chipFill } from "@/lib/editor/chips";
import { newId } from "@/lib/editor/ops";
import {
  arrangePalette,
  blocksGroupId,
  DEFAULT_GROUPS,
  groupTitleProblem,
  type PaletteGroup,
} from "@/lib/editor/palette";
import { useEditor } from "@/lib/editor/store";
import { getBuiltin } from "@/lib/sim/builtins";

export function PaletteDialog() {
  const open = useEditor((s) => s.paletteDialogOpen);
  // Mounted only while open, so the draft starts from the current layout each time.
  return open ? <PaletteForm /> : null;
}

/** `list` with the entry at `i` swapped with its neighbour in direction `dir`. */
function swap<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function PaletteForm() {
  const ref = useRef<HTMLDialogElement>(null);
  const chips = useEditor((s) => s.chips);
  const chipIds = chips.map((c) => c.id);
  const [groups, setGroups] = useState<PaletteGroup[]>(() =>
    arrangePalette(useEditor.getState().paletteGroups, chipIds),
  );

  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    // showModal focuses the first focusable thing, the scrolling list; start on the first name instead.
    dialog.querySelector("input")?.focus();
  }, []);
  const close = () => useEditor.getState().setPaletteDialogOpen(false);

  const problems = [...new Set(groups.map((g) => groupTitleProblem(g.title, groups, g.id)).filter((p) => p !== null))];
  const blocksTitle = groups.find((g) => g.id === blocksGroupId(groups))?.title.trim();

  const update = (groupId: string, recipe: (g: PaletteGroup) => PaletteGroup) =>
    setGroups((gs) => gs.map((g) => (g.id === groupId ? recipe(g) : g)));

  const moveItem = (itemId: string, toGroupId: string) =>
    setGroups((gs) =>
      gs.map((g) => {
        const items = g.items.filter((i) => i !== itemId);
        return { ...g, items: g.id === toGroupId ? [...items, itemId] : items };
      }),
    );

  // A removed list's parts move to the list above it (or below, for the first one).
  const removeGroup = (index: number) =>
    setGroups((gs) => {
      const target = index > 0 ? index - 1 : 1;
      return gs
        .map((g, i) => (i === target ? { ...g, items: [...g.items, ...gs[index].items] } : g))
        .filter((_, i) => i !== index);
    });

  const addGroup = () =>
    setGroups((gs) => {
      let n = 1;
      while (gs.some((g) => g.title.trim().toLowerCase() === `new list${n > 1 ? ` ${n}` : ""}`)) n++;
      return [...gs, { id: newId(), title: `New list${n > 1 ? ` ${n}` : ""}`, items: [] }];
    });

  const label = (id: string) => {
    const chip = chips.find((c) => c.id === id);
    return chip ? (
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-sm border border-chip-stroke/50"
          style={{ colorScheme: "light dark", background: chipFill(chip.color) }}
        />
        <span className="truncate">{chip.name}</span>
      </span>
    ) : (
      <span className="truncate">{getBuiltin(id)?.name ?? id}</span>
    );
  };

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="palette-title"
      className="m-auto w-[34rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-panel text-sm text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form
        className="flex max-h-[85vh] flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (problems.length) return;
          useEditor.getState().setPaletteGroups(groups.map((g) => ({ ...g, title: g.title.trim() })));
          close();
        }}
      >
        <div className="border-b border-line p-4">
          <h2 id="palette-title" className="text-base font-semibold">
            Arrange lists
          </h2>
          <p className="mt-1 text-xs text-muted">
            Rename and reorder the lists in the left bar, and pick the list each part appears in.
            {blocksTitle && <> New blocks go to &ldquo;{blocksTitle}&rdquo;.</>}
          </p>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4">
          {groups.map((g, gi) => (
            <section key={g.id} className="rounded-md border border-line bg-canvas p-2">
              <div className="flex items-center gap-1">
                <input
                  aria-label="List name"
                  value={g.title}
                  maxLength={30}
                  onChange={(e) => update(g.id, (x) => ({ ...x, title: e.target.value }))}
                  className={`min-w-0 flex-1 rounded-md border bg-panel px-2 py-1 font-medium outline-none focus:border-accent ${
                    groupTitleProblem(g.title, groups, g.id) ? "border-sig-x" : "border-line"
                  }`}
                />
                <IconButton title="Move list up" disabled={gi === 0} onClick={() => setGroups((gs) => swap(gs, gi, -1))}>
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton
                  title="Move list down"
                  disabled={gi === groups.length - 1}
                  onClick={() => setGroups((gs) => swap(gs, gi, 1))}
                >
                  <ArrowDown size={14} />
                </IconButton>
                <IconButton
                  title={
                    groups.length === 1
                      ? "The left bar needs at least one list"
                      : g.items.length
                        ? `Remove list (its parts move to "${groups[gi > 0 ? gi - 1 : 1].title.trim()}")`
                        : "Remove list"
                  }
                  disabled={groups.length === 1}
                  onClick={() => removeGroup(gi)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>

              <ul className="mt-2 grid gap-1">
                {g.items.length === 0 && <li className="px-2 text-xs text-muted">Empty</li>}
                {g.items.map((id, ii) => (
                  <li key={id} className="flex items-center gap-1 rounded-md px-2 hover:bg-hover">
                    <span className="min-w-0 flex-1">{label(id)}</span>
                    <select
                      aria-label="List"
                      value={g.id}
                      onChange={(e) => moveItem(id, e.target.value)}
                      className="max-w-36 rounded-md border border-line bg-panel px-1 py-0.5 text-xs"
                    >
                      {groups.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.title.trim() || "(unnamed)"}
                        </option>
                      ))}
                    </select>
                    <IconButton
                      title="Move up"
                      disabled={ii === 0}
                      onClick={() => update(g.id, (x) => ({ ...x, items: swap(x.items, ii, -1) }))}
                    >
                      <ArrowUp size={13} />
                    </IconButton>
                    <IconButton
                      title="Move down"
                      disabled={ii === g.items.length - 1}
                      onClick={() => update(g.id, (x) => ({ ...x, items: swap(x.items, ii, 1) }))}
                    >
                      <ArrowDown size={13} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <button
            type="button"
            onClick={addGroup}
            className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-line py-1.5 text-muted hover:bg-hover hover:text-foreground"
          >
            <Plus size={14} aria-hidden />
            Add list
          </button>
        </div>

        <div className="grid gap-2 border-t border-line p-4">
          {problems.length > 0 && (
            <ul className="grid gap-1 text-xs text-sig-x">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Go back to the original lists"
              onClick={() => setGroups(arrangePalette(DEFAULT_GROUPS, chipIds))}
              className="mr-auto rounded-md px-3 py-1.5 text-muted hover:bg-hover hover:text-foreground"
            >
              Reset to default
            </button>
            <button type="button" onClick={close} className="rounded-md px-3 py-1.5 hover:bg-hover">
              Cancel
            </button>
            <button
              type="submit"
              disabled={problems.length > 0}
              className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

function IconButton(props: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  );
}
