"use client";

import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { chipFill, wouldContainItself } from "@/lib/editor/chips";
import { useEditor } from "@/lib/editor/store";
import type { ChipDef } from "@/lib/model/types";
import { getBuiltin } from "@/lib/sim/builtins";
import { deleteChip, editChip } from "./actions";

const GROUPS: { title: string; ids: string[] }[] = [
  { title: "Inputs & outputs", ids: ["input", "output", "clock", "vdd", "gnd"] },
  { title: "Gates", ids: ["not", "and", "or", "nand", "nor", "xor", "xnor"] },
  { title: "Wiring", ids: ["tristate", "splitter", "merger"] },
];

const PLACE_HINT = "Click, then click on the canvas, or drag onto the canvas. Shift-click places several.";

export function Palette() {
  return (
    <aside className="w-48 shrink-0 overflow-y-auto border-r border-line bg-panel p-3 text-sm">
      {GROUPS.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.ids.map((id) => (
            <PlaceButton key={id} chipId={id}>
              {getBuiltin(id)!.name}
            </PlaceButton>
          ))}
        </Group>
      ))}
      <MyBlocks />
    </aside>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
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
          className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-xs font-medium tracking-wide text-muted uppercase hover:bg-hover hover:text-foreground"
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

function MyBlocks() {
  const chips = useEditor((s) => s.chips);
  const storageError = useEditor((s) => s.storageError);
  return (
    <Group title="My blocks">
      {storageError ? (
        <p className="text-xs text-sig-x">Saved blocks are unavailable: {storageError}</p>
      ) : (
        chips.length === 0 && (
          <p className="text-xs text-muted">
            Build a design with Input and Output Pins, then save it as a block (Ctrl+S) to reuse it here.
          </p>
        )
      )}
      {chips.map((chip) => (
        <BlockRow key={chip.id} chip={chip} />
      ))}
    </Group>
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
