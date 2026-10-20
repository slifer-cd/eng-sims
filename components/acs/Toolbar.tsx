"use client";

import {
  AlertTriangle,
  BookOpen,
  CircuitBoard,
  Download,
  FilePlus,
  FlipVertical2,
  Info,
  Maximize,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  RotateCw,
  Settings2,
  StepForward,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useRef } from "react";
import { EXAMPLES } from "@/lib/acs/editor/examples";
import { MAX_DT, MIN_DT, SPEEDS, useAcsSettings } from "@/lib/acs/editor/settings";
import { useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";
import { formatSI, parseSI } from "@/lib/acs/units";
import { downloadCircuit, loadExample, newCircuit, openCircuitFile } from "./actions";
import { TextField } from "./TextField";

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
      <Examples />
      <FileButtons />
      <Divider />
      <ToolButton title="Undo (Ctrl+Z)" onClick={s.undo} disabled={!s.past.length}>
        <Undo2 size={16} />
      </ToolButton>
      <ToolButton title="Redo (Ctrl+Shift+Z)" onClick={s.redo} disabled={!s.future.length}>
        <Redo2 size={16} />
      </ToolButton>
      <Divider />
      <ToolButton title="Rotate (Alt+R)" onClick={s.rotateSelection} disabled={!s.selection.comps.length}>
        <RotateCw size={16} />
      </ToolButton>
      <ToolButton title="Flip (Alt+F)" onClick={s.flipSelection} disabled={!s.selection.comps.length}>
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
      <SimSettings />
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

/** Time step and integration method, in a popover. */
function SimSettings() {
  const dt = useAcsSettings((s) => s.dt);
  const method = useAcsSettings((s) => s.method);
  const symbols = useAcsSettings((s) => s.symbols);
  const dots = useAcsSettings((s) => s.dots);
  const update = useAcsSettings((s) => s.update);
  return (
    <>
      <button
        type="button"
        popoverTarget="acs-sim-settings"
        title="Simulation settings"
        aria-label="Simulation settings"
        className="ml-1 shrink-0 rounded-md p-1.5 hover:bg-hover"
      >
        <Settings2 size={16} />
      </button>
      <div
        id="acs-sim-settings"
        popover="auto"
        className="m-auto w-72 rounded-lg border border-line bg-panel p-4 text-sm text-foreground shadow-lg backdrop:bg-black/10"
      >
        <h2 className="mb-3 font-semibold">Settings</h2>
        <div className="grid gap-3">
          <TextField
            label="Time step"
            help={`Smaller is more accurate but slower. Use at most 1/50 of the fastest period. Between ${formatSI(MIN_DT, "s")} and ${formatSI(MAX_DT, "s")}.`}
            value={formatSI(dt, "s", 6)}
            parse={(raw) => {
              const v = parseSI(raw);
              return v !== null && v >= MIN_DT && v <= MAX_DT ? v : null;
            }}
            onCommit={(_, v) => {
              if (v !== dt) update({ dt: v! });
            }}
          />
          <label className="grid gap-1">
            <span className="text-xs text-muted">Integration</span>
            <select
              value={method}
              onChange={(e) => update({ method: e.target.value as "trap" | "be" })}
              className="rounded-md border border-line bg-canvas px-2 py-1 outline-none focus:border-accent"
            >
              <option value="trap">Trapezoidal (accurate)</option>
              <option value="be">Backward Euler (damped, steady)</option>
            </select>
            <span className="text-xs text-muted">
              Trapezoidal keeps oscillations alive; backward Euler damps them but never rings on sudden jumps.
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Symbols</span>
            <select
              value={symbols}
              onChange={(e) => update({ symbols: e.target.value as "ansi" | "iec" })}
              className="rounded-md border border-line bg-canvas px-2 py-1 outline-none focus:border-accent"
            >
              <option value="ansi">ANSI (zigzag resistors)</option>
              <option value="iec">IEC (box resistors)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-accent" checked={dots} onChange={(e) => update({ dots: e.target.checked })} />
            Show current as moving dots
          </label>
        </div>
      </div>
    </>
  );
}

/** The built-in example circuits, in a popover. */
function Examples() {
  const list = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        type="button"
        popoverTarget="acs-examples"
        title="Open an example circuit"
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-hover"
      >
        <BookOpen size={16} aria-hidden />
        Examples
      </button>
      <div
        ref={list}
        id="acs-examples"
        popover="auto"
        className="m-auto max-h-[80vh] w-[28rem] overflow-y-auto rounded-lg border border-line bg-panel p-2 text-sm text-foreground shadow-lg backdrop:bg-black/10"
      >
        <h2 className="px-2 pt-1 pb-2 font-semibold">Example circuits</h2>
        <ul className="grid gap-0.5">
          {EXAMPLES.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => {
                  list.current?.hidePopover();
                  loadExample(ex);
                }}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="font-medium">{ex.name}</span>
                <span className="block text-xs text-muted">{ex.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Save the circuit as a JSON file, or open one. */
function FileButtons() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <ToolButton title="Save the circuit as a file" onClick={downloadCircuit}>
        <Download size={16} />
      </ToolButton>
      <ToolButton title="Open a circuit file" onClick={() => input.current?.click()}>
        <Upload size={16} />
      </ToolButton>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void openCircuitFile(file);
        }}
      />
    </>
  );
}
