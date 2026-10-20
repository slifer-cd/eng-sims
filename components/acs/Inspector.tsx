"use client";

import { useState } from "react";
import { useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";
import { type PropField, fieldValue, getPart, partProps } from "@/lib/acs/parts";
import { formatSI, parseSI } from "@/lib/acs/units";
import type { ComponentInst, PropValue } from "@/lib/model/types";

const SHORTCUTS: [string, string][] = [
  ["Click pin → click pin", "Draw a wire (click empty space for bends, or end on a wire)"],
  ["Drag / Shift-click", "Box-select / add to selection"],
  ["Click a switch", "Flip it while simulating"],
  ["Ctrl+Enter / Ctrl+.", "Run-pause / step once"],
  ["R / F", "Rotate / flip"],
  ["Delete", "Delete selection"],
  ["Ctrl+C / Ctrl+V", "Copy / paste"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
  ["Ctrl+A", "Select all"],
  ["Esc / right-click", "Cancel"],
  ["Wheel", "Zoom"],
  ["Space+drag / middle-drag", "Pan"],
];

export function Inspector() {
  const selection = useAcsEditor((s) => s.selection);
  const circuit = useAcsEditor((s) => s.circuit);
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
  const update = useAcsEditor((s) => s.updateComponent);
  const spec = getPart(comp.chipId);
  if (!spec) {
    return (
      <div className="grid gap-2">
        <h2 className="font-semibold">Unknown part</h2>
        <p className="text-xs text-muted">This version doesn’t have a part called “{comp.chipId}”. Delete it to run the circuit.</p>
      </div>
    );
  }
  const props = partProps(spec, comp.props);
  const set = (key: string, v: PropValue) => update(comp.id, { props: { [key]: v } });

  return (
    <div className="grid gap-3">
      <h2 className="font-semibold">{spec.name}</h2>
      <TextField label="Label" value={comp.label ?? ""} onCommit={(v) => update(comp.id, { label: v.trim() })} />
      {spec.fields.map((f) => (
        <FieldInput key={f.key} field={f} value={props[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
      <Readouts compId={comp.id} />
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: PropField; value: PropValue; onChange: (v: PropValue) => void }) {
  switch (field.kind) {
    case "bool":
      return (
        <label className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1">
          <input type="checkbox" className="mt-0.5 accent-accent" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{field.label}</span>
          {field.help && <span className="col-start-2 text-xs text-muted">{field.help}</span>}
        </label>
      );
    case "select":
      return (
        <label className="grid gap-1">
          <span className="text-xs text-muted">{field.label}</span>
          <select
            className="rounded-md border border-line bg-canvas px-2 py-1 outline-none focus:border-accent"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options!.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {field.help && <span className="text-xs text-muted">{field.help}</span>}
        </label>
      );
    case "text":
      return <TextField label={field.label} help={field.help} value={String(value)} onCommit={(v) => onChange(v.trim())} />;
    case "number":
      return (
        <TextField
          label={field.label}
          help={field.help ?? "SI prefixes work: 4.7k, 10u, 100n, 2.2M"}
          value={formatSI(value as number, field.unit, 6)}
          parse={(raw) => {
            const n = parseSI(raw);
            if (n === null || (field.positive && n <= 0)) return null;
            return fieldValue(field, n) as number;
          }}
          onCommit={(_, n) => {
            if (n !== value) onChange(n!);
          }}
        />
      );
  }
}

/**
 * A text input that commits on Enter or blur, so typing makes one undo step. With `parse`,
 * text it rejects is marked and not committed.
 */
function TextField(props: {
  label: string;
  value: string;
  help?: string;
  parse?: (raw: string) => number | null;
  onCommit: (raw: string, parsed?: number) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  const [bad, setBad] = useState(false);
  // Follow the value when it changes elsewhere, or comes back formatted after a commit.
  const [shown, setShown] = useState(props.value);
  if (shown !== props.value) {
    setShown(props.value);
    setDraft(props.value);
    setBad(false);
  }
  const commit = () => {
    if (draft === props.value) return;
    if (!props.parse) return props.onCommit(draft);
    const n = props.parse(draft);
    if (n === null) setBad(true);
    else props.onCommit(draft, n);
  };
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted">{props.label}</span>
      <input
        className={`rounded-md border bg-canvas px-2 py-1 font-mono outline-none ${bad ? "border-sig-x" : "border-line focus:border-accent"}`}
        aria-invalid={bad}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(props.value);
            setBad(false);
            e.currentTarget.blur();
          }
        }}
      />
      {bad ? (
        <span className="text-xs text-sig-x">Not a valid value</span>
      ) : (
        props.help && <span className="text-xs text-muted">{props.help}</span>
      )}
    </label>
  );
}

/** Live voltage, current and power of the selected part. */
function Readouts({ compId }: { compId: string }) {
  const engine = useAcsSim((s) => s.engine);
  useAcsSim((s) => s.version);
  const r = engine?.readout(compId);
  const rows: [string, string][] = [];
  if (r?.v !== undefined) rows.push(["Voltage", formatSI(r.v, "V")]);
  if (r?.i !== undefined) rows.push(["Current", formatSI(r.i, "A")]);
  if (r?.p !== undefined) rows.push(["Power", formatSI(r.p, "W")]);
  if (!r && engine) {
    const spec = getPart(engine.netlist.parts.get(compId) ?? "");
    const t = spec?.terminals.length === 1 ? spec.terminals[0] : undefined;
    const v = t && engine.pinVoltage(compId, t.id);
    if (v !== undefined) rows.push(["Voltage", formatSI(v, "V")]);
  }
  if (!rows.length) return null;
  return (
    <section className="mt-1 rounded-md border border-line bg-canvas p-2">
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-accent uppercase">Now</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-sans text-muted">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {r?.p !== undefined && <p className="mt-1 text-[11px] text-muted">Power is what the part absorbs; negative means it delivers.</p>}
    </section>
  );
}
