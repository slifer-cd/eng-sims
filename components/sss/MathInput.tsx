"use client";

import { ChevronDown, Keyboard, TriangleAlert } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ParseResult } from "@/lib/sss/expr/ast";
import { toTex } from "@/lib/sss/expr/latex";
import { paramTex, type Variable } from "@/lib/sss/expr/names";
import { parse } from "@/lib/sss/expr/parse";
import type { ExprInput } from "@/lib/sss/store";
import { Keypad } from "./Keypad";
import { Tex } from "./Tex";

export interface Example {
  label: string;
  text: string;
  params?: Record<string, number>;
}

/** Parse an input (memoized): shared by the input box and the page that analyses it. */
export function useParsed(text: string, variable: Variable): ParseResult {
  return useMemo(() => parse(text, { variable }), [text, variable]);
}

/**
 * The equation line: a typeset label, a monospace input, the parsed preview, symbol
 * keypad, examples and a slider for every parameter in the expression.
 */
export function MathInput(props: {
  /** LaTeX label, e.g. x(t). */
  label: string;
  variable: Variable;
  value: ExprInput;
  onChange: (v: ExprInput) => void;
  examples?: Example[];
  discrete?: boolean;
  placeholder?: string;
}) {
  const { value, onChange, variable } = props;
  const parsed = useParsed(value.text, variable);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const id = useId();

  const previewTex = parsed.ok ? toTex(parsed.ast, { discrete: props.discrete }) : null;
  // Keep showing the last good preview (dimmed) while the text is being edited.
  const [lastGood, setLastGood] = useState<string | null>(previewTex);
  if (previewTex !== null && previewTex !== lastGood) setLastGood(previewTex);

  const insert = (template: string) => {
    const el = inputRef.current;
    const text = value.text;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    const selected = text.slice(start, end);
    const caret = template.indexOf("|");
    const filled = template.replace("|", selected);
    const next = text.slice(0, start) + filled + text.slice(end);
    const pos = start + (caret >= 0 ? caret + selected.length : filled.length);
    onChange({ ...value, text: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const error = parsed.ok ? null : parsed.error;
  const showError = error && value.text.trim() !== "";
  const before = error ? value.text.slice(0, error.from) : value.text;
  const bad = error ? value.text.slice(error.from, Math.max(error.to, error.from + 1)) : "";
  const after = error ? value.text.slice(Math.max(error.to, error.from + 1)) : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={id} className="shrink-0 text-xl">
          <Tex tex={`${props.label} =`} />
        </label>
        <div className="relative min-w-0 flex-1 basis-64">
          {/* Mirror behind the transparent input, to underline the part with the error. */}
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre rounded-lg border border-transparent px-3 py-2 font-mono text-base text-transparent"
          >
            {before}
            {showError && <span className="underline decoration-sig-x decoration-wavy decoration-2 underline-offset-4">{bad || " "}</span>}
            {after}
          </div>
          <input
            ref={inputRef}
            id={id}
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder={props.placeholder}
            aria-invalid={showError ? true : undefined}
            aria-describedby={showError ? `${id}-err` : undefined}
            className={`relative w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-base outline-none focus:ring-2 focus:ring-accent/40 ${
              showError ? "border-sig-x/60" : "border-line focus:border-accent"
            }`}
          />
        </div>
        <div className="flex gap-2">
          {props.examples && <ExamplesMenu examples={props.examples} variable={variable} discrete={props.discrete} onPick={(ex) => onChange({ text: ex.text, params: { ...value.params, ...ex.params } })} />}
          <button
            type="button"
            onClick={() => setKeypadOpen((o) => !o)}
            aria-expanded={keypadOpen}
            className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm ${keypadOpen ? "border-accent/60 bg-accent/10 text-accent" : "border-line bg-panel hover:bg-hover"}`}
          >
            <Keyboard size={16} aria-hidden />
            Symbols
          </button>
        </div>
      </div>

      <div className="min-h-10 overflow-x-auto px-1 text-lg">
        {previewTex !== null ? (
          <Tex tex={`${props.label} = ${previewTex}`} display />
        ) : lastGood !== null ? (
          <div className="opacity-35">
            <Tex tex={`${props.label} = ${lastGood}`} display />
          </div>
        ) : null}
      </div>

      {showError && (
        <p id={`${id}-err`} role="alert" className="-mt-2 flex items-center gap-1.5 text-sm text-sig-x">
          <TriangleAlert size={15} aria-hidden />
          {error.message}
        </p>
      )}
      {parsed.ok &&
        parsed.warnings.map((w) => (
          <p key={w.from} className="-mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert size={15} aria-hidden />
            {w.message}
          </p>
        ))}

      {keypadOpen && <Keypad variable={variable} onInsert={insert} />}

      {parsed.ok && parsed.params.length > 0 && (
        <ParamSliders names={parsed.params} values={value.params} onChange={(params) => onChange({ ...value, params })} />
      )}
    </div>
  );
}

function ParamSliders(props: { names: string[]; values: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {props.names.map((name) => {
        const v = props.values[name] ?? 1;
        const set = (x: number) => props.onChange({ ...props.values, [name]: x });
        return (
          <div key={name} className="flex items-center gap-3">
            <Tex tex={`${paramTex(name)} =`} className="w-12 shrink-0 text-right" />
            <input
              type="range"
              min={Math.min(-10, v)}
              max={Math.max(10, v)}
              step={0.01}
              value={v}
              onChange={(e) => set(Number(e.target.value))}
              aria-label={`Parameter ${name}`}
              className="min-w-0 flex-1 accent-accent"
            />
            <input
              type="number"
              step="any"
              value={v}
              onChange={(e) => {
                const x = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(x)) set(x);
              }}
              aria-label={`Value of ${name}`}
              className="w-20 rounded-md border border-line bg-panel px-2 py-1 text-sm tabular-nums"
            />
          </div>
        );
      })}
    </div>
  );
}

function ExamplesMenu(props: { examples: Example[]; variable: Variable; discrete?: boolean; onPick: (e: Example) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A menu is transient: close it when the page is hidden (Activity) or unmounted.
  useLayoutEffect(() => () => setOpen(false), []);
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-sm hover:bg-hover"
      >
        Examples
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 z-30 mt-1 max-h-96 w-80 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-xl">
          {props.examples.map((ex) => {
            const p = parse(ex.text, { variable: props.variable });
            return (
              <li key={ex.text} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    props.onPick(ex);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-hover"
                >
                  <span className="text-sm">{ex.label}</span>
                  {p.ok && <Tex tex={toTex(p.ast, { discrete: props.discrete })} className="text-muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
