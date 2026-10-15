"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_COLORS, chipFill, designProblems, makeChipDef, nameProblem, nextColor } from "@/lib/editor/chips";
import { chipFace } from "@/lib/editor/displays";
import { sceneComp } from "@/lib/editor/scene";
import { useEditor } from "@/lib/editor/store";
import { derivePins } from "@/lib/model/pins";
import { chipLibrary } from "@/lib/sim/compile";
import { ChipView } from "./ChipView";

export function SaveDialog() {
  const open = useEditor((s) => s.saveDialogOpen);
  // Mounted only while open, so the form starts fresh each time.
  return open ? <SaveForm /> : null;
}

function SaveForm() {
  const ref = useRef<HTMLDialogElement>(null);
  const circuit = useEditor((s) => s.circuit);
  const chips = useEditor((s) => s.chips);
  const library = useEditor((s) => s.library);
  const storageError = useEditor((s) => s.storageError);
  const current = useEditor((s) => s.chips.find((c) => c.id === s.openChipId));
  const currentId = current?.id ?? null;

  const [name, setName] = useState(current?.name ?? "");
  const [color, setColor] = useState(current?.color ?? nextColor(chips));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
  }, []);
  const close = () => useEditor.getState().setSaveDialogOpen(false);

  const design = useMemo(() => designProblems(circuit, library, currentId), [circuit, library, currentId]);
  const nameIssue = nameProblem(name, chips, currentId);
  const blocked = busy || !!nameIssue || design.length > 0;
  // Saving a copy of the open block: it needs its own name.
  const copyIssue = nameProblem(name, chips, null) ?? designProblems(circuit, library, null)[0];
  // An empty name just disables saving; no need to say so.
  const problems = [...(name.trim() && nameIssue ? [nameIssue] : []), ...design];
  const hasFace = useMemo(
    () => chipFace(makeChipDef(circuit, { name: "", color: "" }), library).length > 0,
    [circuit, library],
  );

  async function save(asNew: boolean) {
    setBusy(true);
    setError(null);
    try {
      await useEditor.getState().saveChip({ name, color }, { asNew });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="save-title"
      className="m-auto w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-panel text-sm text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form
        className="grid gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) void save(false);
        }}
      >
        <div>
          <h2 id="save-title" className="text-base font-semibold">
            {current ? "Save block" : "Save as block"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {current
              ? "Designs that use this block pick up the changes."
              : "It appears under My blocks, ready to use in other designs."}
          </p>
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-muted">Name</span>
          <input
            className="rounded-md border border-line bg-canvas px-2 py-1 outline-none focus:border-accent"
            value={name}
            maxLength={40}
            placeholder="e.g. Half Adder"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="grid gap-1">
          <span className="text-xs text-muted">Colour</span>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1.5">
            {BLOCK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                title={c}
                onClick={() => setColor(c)}
                className={`size-6 rounded-full border border-chip-stroke/40 ${
                  color === c ? "ring-2 ring-accent ring-offset-2 ring-offset-panel" : ""
                }`}
                style={{ colorScheme: "light dark", background: chipFill(c) }}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-1">
          <span className="text-xs text-muted">Preview</span>
          <BlockPreview name={name} color={color} />
          <span className="text-xs text-muted">
            Pins are the Input and Output Pins in the design, top to bottom, named by their labels.
            {hasFace && " Displays appear on the block; to hide one, select it and untick Show on block."}
          </span>
        </div>

        {(problems.length > 0 || error || storageError) && (
          <ul className="grid gap-1 text-xs text-sig-x">
            {storageError && <li>Blocks can&apos;t be saved in this browser: {storageError}</li>}
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
            {error && !problems.includes(error) && <li>{error}</li>}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md px-3 py-1.5 hover:bg-hover">
            Cancel
          </button>
          {current && (
            <button
              type="button"
              disabled={busy || !!copyIssue}
              title={copyIssue ?? "Keep the original and save this as another block"}
              onClick={() => void save(true)}
              className="rounded-md border border-line px-3 py-1.5 hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Save as new
            </button>
          )}
          <button
            type="submit"
            disabled={blocked}
            className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-40"
          >
            {current ? "Save changes" : "Save block"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** The block as it will look when placed, drawn the same way as on the canvas. */
function BlockPreview({ name, color }: { name: string; color: string }) {
  const circuit = useEditor((s) => s.circuit);
  const item = useMemo(() => {
    const chip = { id: "preview", name: name.trim() || "Block", color, pins: derivePins(circuit), circuit, createdAt: 0, updatedAt: 0 };
    return sceneComp({ id: "preview", chipId: chip.id, x: 0, y: 0, rotation: 0, props: {} }, chipLibrary([chip]));
  }, [circuit, name, color]);
  const pad = 12;
  const { w, h } = item.layout;
  return (
    <div className="flex justify-center rounded-md border border-line bg-canvas p-2">
      <svg
        viewBox={`${-w / 2 - pad} ${-h / 2 - pad} ${w + 2 * pad} ${h + 2 * pad}`}
        width={w + 2 * pad}
        height={h + 2 * pad}
        className="pointer-events-none max-h-48 max-w-full"
        aria-hidden
      >
        <ChipView item={item} />
      </svg>
    </div>
  );
}
