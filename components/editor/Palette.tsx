"use client";

import { ChevronDown, ChevronUp, ListTree, Pencil, Trash2 } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { chipFill, wouldContainItself } from "@/lib/editor/chips";
import { arrangePalette, blocksGroupId } from "@/lib/editor/palette";
import { useEditor } from "@/lib/editor/store";
import type { ChipDef } from "@/lib/model/types";
import { getBuiltin } from "@/lib/sim/builtins";
import { deleteChip, editChip } from "./actions";

const PLACE_HINT = "Click, then click on the canvas, or drag onto the canvas. Shift-click places several.";

export function Palette() {
  const stored = useEditor((s) => s.paletteGroups);
  const chips = useEditor((s) => s.chips);
  const groups = useMemo(() => arrangePalette(stored, chips.map((c) => c.id)), [stored, chips]);
  const blocksId = blocksGroupId(groups);
  const chipById = useMemo(() => new Map(chips.map((c) => [c.id, c])), [chips]);

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-line bg-panel text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {groups.map((g, i) => (
          // Only the first two lists start open, to keep the bar short.
          <Group key={g.id} title={g.title} defaultOpen={i < 2}>
            {g.id === blocksId && <BlocksHint />}
            {g.items.map((id) => {
              const chip = chipById.get(id);
              return chip ? (
                <BlockRow key={id} chip={chip} />
              ) : (
                <PlaceButton key={id} chipId={id}>
                  {getBuiltin(id)!.name}
                </PlaceButton>
              );
            })}
          </Group>
        ))}
      </div>
      <button
        type="button"
        title="Rename lists and choose which list each part is in (Ctrl+L)"
        onClick={() => useEditor.getState().setPaletteDialogOpen(true)}
        className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-muted hover:bg-hover hover:text-foreground"
      >
        <ListTree size={14} aria-hidden />
        Arrange lists
        <kbd className="ml-auto font-mono text-[10px]">Ctrl+L</kbd>
      </button>
    </aside>
  );
}

function Group({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <section className="mb-4">
      <h2 className="mb-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          title={open ? `Collapse ${title}` : `Expand ${title}`}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-xs font-semibold tracking-wide text-accent uppercase hover:bg-hover"
        >
          {title}
          <Chevron size={14} aria-hidden />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="grid gap-1">
          {children}
        </div>
      )}
    </section>
  );
}

/** Shown in the list new blocks go to: how to make one, or why they're missing. */
function BlocksHint() {
  const hasChips = useEditor((s) => s.chips.length > 0);
  const storageError = useEditor((s) => s.storageError);
  if (storageError) return <p className="text-xs text-sig-x">Saved blocks are unavailable: {storageError}</p>;
  if (hasChips) return null;
  return (
    <p className="text-xs text-muted">
      Build a design with Input and Output Pins, then save it as a block (Ctrl+S) to reuse it here.
    </p>
  );
}

function BlockRow({ chip }: { chip: ChipDef }) {
  const library = useEditor((s) => s.library);
  const openChipId = useEditor((s) => s.openChipId);
  const isOpen = chip.id === openChipId;
  const nested = !isOpen && wouldContainItself(chip.id, openChipId, library);
  const title = isOpen
    ? "This block is open on the canvas. A block can't contain itself."
    : nested
      ? `"${chip.name}" contains the block being edited, so it can't go inside it.`
      : PLACE_HINT;

  return (
    <div className="flex items-center">
      <PlaceButton chipId={chip.id} disabled={isOpen || nested} title={title}>
        <span className={`flex min-w-0 items-center gap-2 ${nested ? "opacity-40" : ""}`}>
          <span
            className="size-3 shrink-0 rounded-sm border border-chip-stroke/50"
            style={{ colorScheme: "light dark", background: chipFill(chip.color) }}
          />
          <span className={`truncate ${isOpen ? "font-medium text-accent" : ""}`}>{chip.name}</span>
        </span>
      </PlaceButton>
      {!isOpen && (
        <IconButton title={`Edit "${chip.name}"`} onClick={() => editChip(chip.id)}>
          <Pencil size={13} />
        </IconButton>
      )}
      <IconButton title={`Delete "${chip.name}"`} onClick={() => void deleteChip(chip.id)}>
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

function PlaceButton(props: { chipId: string; disabled?: boolean; title?: string; children: ReactNode }) {
  const { chipId, disabled } = props;
  const active = useEditor((s) => s.placing?.chipId === chipId);
  const setPlacing = useEditor((s) => s.setPlacing);
  return (
    <button
      type="button"
      // aria-disabled rather than disabled, so the tooltip still explains why.
      aria-disabled={disabled}
      title={props.title ?? PLACE_HINT}
      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left select-none ${
        active ? "bg-accent text-white" : disabled ? "cursor-not-allowed" : "hover:bg-hover"
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!disabled) setPlacing({ chipId, props: {}, fromDrag: true });
      }}
      // Released on the palette itself: switch to click-to-place.
      onPointerUp={() => {
        if (!disabled) setPlacing({ chipId, props: {}, fromDrag: false });
      }}
    >
      {props.children}
    </button>
  );
}

function IconButton(props: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      className="shrink-0 rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground"
    >
      {props.children}
    </button>
  );
}
