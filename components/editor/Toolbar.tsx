"use client";

import {
  AlertTriangle,
  Cpu,
  FilePlus,
  Maximize,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  StepForward,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SPEEDS, useSim } from "@/lib/editor/simStore";
import { useEditor } from "@/lib/editor/store";
import { newDesign } from "./actions";

function ToolButton(props: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded-md p-1.5 hover:bg-hover disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  );
}

export function Toolbar() {
  const s = useEditor();
  const hasSelection = s.selection.comps.length + s.selection.wires.length > 0;

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel bg-linear-to-r from-accent/15 via-panel to-panel px-3">
      <h1 className="mr-4 text-sm font-semibold">
        {/* No unsaved-work prompt: the canvas draft is autosaved when the editor is hidden or unmounts. */}
        <Link
          href="/"
          title="Back to the home page"
          className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-hover"
        >
          <span className="grid size-6 place-items-center rounded-md bg-accent text-white shadow-sm">
            <Cpu size={14} aria-hidden />
          </span>
          Eng Sims
        </Link>
      </h1>
      <DesignName />
      <ToolButton title="New design (Alt+N)" onClick={newDesign}>
        <FilePlus size={16} />
      </ToolButton>
      <ToolButton title={s.openChipId ? "Save block…" : "Save as block…"} onClick={() => s.setSaveDialogOpen(true)}>
        <Save size={16} />
      </ToolButton>
      <div className="mx-2 h-5 w-px bg-line" />
      <ToolButton title="Undo (Ctrl+Z)" onClick={s.undo} disabled={!s.past.length}>
        <Undo2 size={16} />
      </ToolButton>
      <ToolButton title="Redo (Ctrl+Shift+Z)" onClick={s.redo} disabled={!s.future.length}>
        <Redo2 size={16} />
      </ToolButton>
      <div className="mx-2 h-5 w-px bg-line" />
      <ToolButton title="Rotate (R)" onClick={s.rotateSelection} disabled={!s.selection.comps.length}>
        <RotateCw size={16} />
      </ToolButton>
      <ToolButton title="Delete (Del)" onClick={s.deleteSelection} disabled={!hasSelection}>
        <Trash2 size={16} />
      </ToolButton>
      <div className="mx-2 h-5 w-px bg-line" />
      <ToolButton title="Zoom out" onClick={() => s.zoomBy(1 / 1.25)}>
        <ZoomOut size={16} />
      </ToolButton>
      <span className="w-12 text-center font-mono text-xs text-muted">{Math.round(s.viewport.zoom * 100)}%</span>
      <ToolButton title="Zoom in" onClick={() => s.zoomBy(1.25)}>
        <ZoomIn size={16} />
      </ToolButton>
      <ToolButton title="Fit to view" onClick={s.fitView}>
        <Maximize size={16} />
      </ToolButton>
      <div className="mx-2 h-5 w-px bg-line" />
      <SimControls />
    </header>
  );
}

/** The open block's name, or "Untitled design", marked when there are unsaved changes. */
function DesignName() {
  const name = useEditor((s) => s.chips.find((c) => c.id === s.openChipId)?.name);
  const unsaved = useEditor((s) => s.circuit !== s.savedCircuit);
  return (
    <span className="mr-2 flex max-w-48 items-center gap-1 text-sm">
      <span className={`truncate ${name ? "" : "text-muted"}`} title={name ? `Editing block "${name}"` : undefined}>
        {name ?? "Untitled design"}
      </span>
      {unsaved && (
        <span className="text-muted" title="Unsaved changes" aria-label="Unsaved changes">
          •
        </span>
      )}
    </span>
  );
}

function SimControls() {
  const sim = useSim();
  const time = sim.engine?.time ?? 0;
  const oscillating = sim.engine?.oscillating ?? false;
  const reset = () => {
    const { circuit, library } = useEditor.getState();
    sim.reset(circuit, library);
  };

  return (
    <>
      <ToolButton title={sim.running ? "Pause clock (Ctrl+Enter)" : "Run clock (Ctrl+Enter)"} onClick={() => sim.setRunning(!sim.running)}>
        {sim.running ? <Pause size={16} /> : <Play size={16} />}
      </ToolButton>
      <ToolButton title="Step one clock tick (Ctrl+.)" onClick={sim.step} disabled={sim.running}>
        <StepForward size={16} />
      </ToolButton>
      <ToolButton title="Reset simulation (keeps input values)" onClick={reset}>
        <RotateCcw size={16} />
      </ToolButton>
      <select
        aria-label="Clock speed"
        title="Clock ticks per second"
        value={sim.speed}
        onChange={(e) => sim.setSpeed(Number(e.target.value))}
        className="ml-1 rounded-md border border-line bg-panel px-1.5 py-1 text-xs"
      >
        {SPEEDS.map((n) => (
          <option key={n} value={n}>
            {n} ticks/s
          </option>
        ))}
      </select>
      <span className="ml-2 font-mono text-xs text-muted" title="Clock ticks since reset">
        t={time}
      </span>
      {oscillating && (
        <span
          className="ml-3 flex items-center gap-1 text-xs text-sig-x"
          title="The circuit never settles (e.g. a loop of inverters). Values shown are a snapshot."
        >
          <AlertTriangle size={14} /> Oscillating
        </span>
      )}
      {sim.errors.length > 0 && (
        <span
          className="ml-3 flex items-center gap-1 text-xs text-sig-x"
          title={sim.errors.map((e) => e.message).join("\n")}
        >
          <AlertTriangle size={14} /> {sim.errors.length} {sim.errors.length === 1 ? "problem" : "problems"}
        </span>
      )}
    </>
  );
}
