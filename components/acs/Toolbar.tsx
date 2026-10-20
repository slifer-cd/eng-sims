"use client";

import {
  AlertTriangle,
  CircuitBoard,
  FilePlus,
  FlipVertical2,
  Info,
  Maximize,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  RotateCw,
  StepForward,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SPEEDS, useAcsSettings } from "@/lib/acs/editor/settings";
import { useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";
import { formatSI } from "@/lib/acs/units";
import { newCircuit } from "./actions";

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

const Divider = () => <div className="mx-2 h-5 w-px shrink-0 bg-line" />;

export function Toolbar() {
  const s = useAcsEditor();
  const hasSelection = s.selection.comps.length + s.selection.wires.length > 0;

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel bg-linear-to-r from-accent/15 via-panel to-panel px-3">
      <h1 className="mr-4 shrink-0 text-sm font-semibold">
        <Link
          href="/"
          title="Back to the home page"
          className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-hover"
        >
          <span className="grid size-6 place-items-center rounded-md bg-accent text-white shadow-sm">
            <CircuitBoard size={14} aria-hidden />
          </span>
          Eng Sims
          <span className="font-normal text-muted">/ Circuits</span>
        </Link>
      </h1>
      <ToolButton title="New circuit (Alt+N)" onClick={newCircuit}>
        <FilePlus size={16} />
      </ToolButton>
      <Divider />
      <ToolButton title="Undo (Ctrl+Z)" onClick={s.undo} disabled={!s.past.length}>
        <Undo2 size={16} />
      </ToolButton>
      <ToolButton title="Redo (Ctrl+Shift+Z)" onClick={s.redo} disabled={!s.future.length}>
        <Redo2 size={16} />
      </ToolButton>
      <Divider />
      <ToolButton title="Rotate (R)" onClick={s.rotateSelection} disabled={!s.selection.comps.length}>
        <RotateCw size={16} />
      </ToolButton>
      <ToolButton title="Flip (F)" onClick={s.flipSelection} disabled={!s.selection.comps.length}>
        <FlipVertical2 size={16} />
      </ToolButton>
      <ToolButton title="Delete (Del)" onClick={s.deleteSelection} disabled={!hasSelection}>
        <Trash2 size={16} />
      </ToolButton>
      <Divider />
      <ToolButton title="Zoom out" onClick={() => s.zoomBy(1 / 1.25)}>
        <ZoomOut size={16} />
      </ToolButton>
      <span className="w-12 shrink-0 text-center font-mono text-xs text-muted">{Math.round(s.viewport.zoom * 100)}%</span>
      <ToolButton title="Zoom in" onClick={() => s.zoomBy(1.25)}>
        <ZoomIn size={16} />
      </ToolButton>
      <ToolButton title="Fit to view" onClick={s.fitView}>
        <Maximize size={16} />
      </ToolButton>
      <Divider />
      <SimControls />
    </header>
  );
}

function SimControls() {
  const sim = useAcsSim();
  const speed = useAcsSettings((s) => s.speed);
  const update = useAcsSettings((s) => s.update);
  const engine = sim.engine;
  const error = engine?.error;
  const reset = () => sim.reset(useAcsEditor.getState().circuit);

  return (
    <>
      <ToolButton
        title={sim.running ? "Pause (Ctrl+Enter)" : "Run (Ctrl+Enter)"}
        onClick={() => sim.setRunning(!sim.running)}
        disabled={!!error}
      >
        {sim.running ? <Pause size={16} /> : <Play size={16} />}
      </ToolButton>
      <ToolButton title="Step once (Ctrl+.)" onClick={sim.step} disabled={sim.running || !!error}>
        <StepForward size={16} />
      </ToolButton>
      <ToolButton title="Reset: back to time 0, switches to their starting positions" onClick={reset}>
        <RotateCcw size={16} />
      </ToolButton>
      <select
        aria-label="Simulation speed"
        title="Simulated time per real second"
        value={speed}
        onChange={(e) => update({ speed: Number(e.target.value) })}
        className="ml-1 shrink-0 rounded-md border border-line bg-panel px-1.5 py-1 text-xs"
      >
        {SPEEDS.map((n) => (
          <option key={n} value={n}>
            {formatSI(n, "s")}/s
          </option>
        ))}
      </select>
      <span className="ml-2 shrink-0 font-mono text-xs text-muted tabular-nums" title="Simulated time since reset">
        t = {formatSI(engine?.time ?? 0, "s")}
      </span>
      {sim.behind && (
        <span className="ml-3 shrink-0 text-xs text-muted" title="The circuit takes longer to simulate than the speed allows">
          slower than set
        </span>
      )}
      {error ? (
        <span className="ml-3 flex shrink-0 items-center gap-1 text-xs text-sig-x" title={error.message}>
          <AlertTriangle size={14} /> Stopped: {error.message}
        </span>
      ) : (
        sim.warnings.length > 0 && (
          <span className="ml-3 flex shrink-0 items-center gap-1 text-xs text-muted" title={sim.warnings.map((w) => w.message).join("\n")}>
            <Info size={14} /> {sim.warnings[0].message}
            {sim.warnings.length > 1 && ` (+${sim.warnings.length - 1})`}
          </span>
        )
      )}
    </>
  );
}
