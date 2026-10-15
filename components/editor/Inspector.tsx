"use client";

import { useState } from "react";
import { describe } from "@/lib/editor/layout";
import { useSim } from "@/lib/editor/simStore";
import { useEditor } from "@/lib/editor/store";
import type { ComponentInst, Props } from "@/lib/model/types";
import { getBuiltin } from "@/lib/sim/builtins";
import { formatValue, parseValue } from "@/lib/sim/value";
import { editChip } from "./actions";

/** Editable props per built-in prop key: label, bounds and help text. */
const FIELDS: Record<string, { label: string; min?: number; max?: number; help?: string }> = {
  width: { label: "Bit width", min: 1, max: 32 },
  inputs: { label: "Inputs", min: 2, max: 16 },
  period: { label: "Half period (ticks)", min: 1, max: 1000 },
  parts: { label: "Parts (bits, low first)", help: "e.g. 4,4 or 1,3,4. Empty = one pin per bit." },
};

const SHORTCUTS: [string, string][] = [
  ["Ctrl+S", "Save as a block (asks for a name the first time)"],
  ["Ctrl+L", "Arrange the lists in the left bar"],
  ["Click pin → click pin", "Draw a wire (click empty space for bends, or end on a wire)"],
  ["Drag / Shift-click", "Box-select / add to selection"],
  ["Click an Input Pin", "Toggle it (one cell per bit)"],
  ["Ctrl+Enter / Ctrl+.", "Run-pause clock / step one tick"],
  ["R", "Rotate"],
  ["Delete", "Delete selection"],
  ["Ctrl+C / Ctrl+V", "Copy / paste"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
  ["Ctrl+A", "Select all"],
  ["Esc / right-click", "Cancel"],
  ["Wheel", "Zoom"],
  ["Space+drag / middle-drag", "Pan"],
];

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const circuit = useEditor((s) => s.circuit);
  const comp =
    selection.comps.length === 1 && selection.wires.length === 0
      ? circuit.components.find((c) => c.id === selection.comps[0])
      : undefined;

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-line bg-panel p-3 text-sm">
      {comp ? (
        // Keyed so field drafts reset when the selection changes.
        <ComponentForm key={comp.id} comp={comp} />
      ) : (
        <>
          <p className="mb-3 text-muted">
            {selection.comps.length + selection.wires.length > 0
              ? `${selection.comps.length} parts, ${selection.wires.length} wires selected`
              : "Nothing selected"}
          </p>
          <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-accent uppercase">Controls</h2>
          <dl className="grid gap-1.5 text-xs">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </aside>
  );
}

function ComponentForm({ comp }: { comp: ComponentInst }) {
  const update = useEditor((s) => s.updateComponent);
  const library = useEditor((s) => s.library);
  const spec = getBuiltin(comp.chipId);
  const look = describe(comp, library);
  const props: Props = { ...spec?.defaultProps, ...comp.props };
  const keys = Object.keys(spec?.defaultProps ?? {}).filter((k) => k in FIELDS);

  return (
    <div className="grid gap-3">
      <h2 className="font-semibold">{look?.name ?? "Missing chip"}</h2>
      <Field label="Label" value={comp.label ?? ""} onCommit={(v) => update(comp.id, { label: v })} />
      {comp.chipId === "input" && <InputValueField compId={comp.id} width={look!.pins[0].width} />}
      {!spec && look && (
        <button
          type="button"
          onClick={() => editChip(comp.chipId)}
          className="rounded-md border border-line px-2 py-1 text-left hover:bg-hover"
        >
          Open this block for editing
        </button>
      )}
      {keys.map((k) => {
        const f = FIELDS[k];
        const numeric = typeof spec!.defaultProps[k] === "number";
        return (
          <Field
            key={k}
            label={f.label}
            help={f.help}
            type={numeric ? "number" : "text"}
            min={f.min}
            max={f.max}
            value={String(props[k])}
            onCommit={(raw) => {
              if (!numeric) return update(comp.id, { props: { [k]: raw.trim() } });
              const n = Math.round(Number(raw));
              if (Number.isFinite(n)) {
                update(comp.id, { props: { [k]: Math.min(f.max ?? n, Math.max(f.min ?? n, n)) } });
              }
            }}
          />
        );
      })}
    </div>
  );
}

/** A text/number input that commits on Enter or blur, so typing makes one undo step. */
function Field(props: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  help?: string;
}) {
  const [draft, setDraft] = useState(props.value);
  const commit = () => {
    if (draft !== props.value) props.onCommit(draft);
  };
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted">{props.label}</span>
      <input
        className="rounded-md border border-line bg-canvas px-2 py-1 outline-none focus:border-accent"
        type={props.type ?? "text"}
        min={props.min}
        max={props.max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(props.value);
            e.currentTarget.blur();
          }
        }}
      />
      {props.help && <span className="text-xs text-muted">{props.help}</span>}
    </label>
  );
}

/** Set an Input Pin's simulated value as decimal, 0x hex or 0b binary. Not part of undo history. */
function InputValueField({ compId, width }: { compId: string; width: number }) {
  const engine = useSim((s) => s.engine);
  useSim((s) => s.version);
  const setInput = useSim((s) => s.setInput);
  const current = engine?.pinValue("", compId, "out");
  const text = current ? formatValue(current) : "";
  return (
    <Field
      // Re-key so the draft follows the value when it changes elsewhere (e.g. clicking the pin).
      key={text}
      label="Value"
      help="Decimal, 0x hex or 0b binary"
      value={text}
      onCommit={(raw) => {
        const v = parseValue(width, raw);
        if (v) setInput(compId, v);
      }}
    />
  );
}
