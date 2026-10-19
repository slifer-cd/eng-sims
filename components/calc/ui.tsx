"use client";

/* Pieces shared by the calculator pages (layout pieces come from the simulator's ui.tsx). */

import { Check, Copy, TriangleAlert } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

/** A one-line monospace input with its error underneath. */
export function TextField(props: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  placeholder?: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  const showError = !!props.error && props.value.trim() !== "";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={id} className="shrink-0 text-sm font-medium">
          {props.label}
        </label>
        <input
          id={id}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder={props.placeholder}
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? `${id}-err` : undefined}
          className={`min-w-0 flex-1 basis-56 rounded-lg border bg-transparent px-3 py-2 font-mono text-base outline-none focus:ring-2 focus:ring-accent/40 ${
            showError ? "border-sig-x/60" : "border-line focus:border-accent"
          }`}
        />
        {props.children}
      </div>
      {showError ? (
        <p id={`${id}-err`} role="alert" className="flex items-center gap-1.5 text-sm text-sig-x">
          <TriangleAlert size={15} aria-hidden />
          {props.error}
        </p>
      ) : (
        props.hint && <p className="text-sm text-muted">{props.hint}</p>
      )}
    </div>
  );
}

/** A field of bits in the strip: positions `from` down to `to` (inclusive), most significant first. */
export interface BitField {
  from: number;
  to: number;
  label: string;
  color: string;
}

/**
 * A row of bits, most significant first, in nibbles. Clicking a bit flips it when
 * `onToggle` is given. `fields` tint ranges of bits (sign, exponent, fraction …).
 */
export function BitStrip(props: { bits: bigint; width: number; onToggle?: (bit: number) => void; fields?: BitField[]; label: string }) {
  const { width } = props;
  const fieldOf = (b: number) => props.fields?.find((f) => b <= f.from && b >= f.to);
  const nibbles: number[][] = [];
  for (let top = width - 1; top >= 0; top -= 4) nibbles.push(Array.from({ length: Math.min(4, top + 1) }, (_, i) => top - i));
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={props.label} className="flex flex-wrap gap-x-2 gap-y-3">
        {nibbles.map((nib) => (
          <div key={nib[0]} className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] leading-none text-muted tabular-nums">{nib[0]}</span>
            <div className="flex">
              {nib.map((b) => {
                const on = ((props.bits >> BigInt(b)) & BigInt(1)) === BigInt(1);
                const f = fieldOf(b);
                const style = f ? { backgroundColor: `color-mix(in oklab, ${f.color} ${on ? 38 : 14}%, transparent)` } : undefined;
                const cls = `grid h-8 w-6 place-items-center border-y border-r border-line font-mono text-sm first:rounded-l-md first:border-l last:rounded-r-md ${
                  f ? "" : on ? "bg-accent/15 font-semibold text-accent" : "text-muted"
                } ${on && f ? "font-semibold" : ""}`;
                return props.onToggle ? (
                  <button
                    key={b}
                    type="button"
                    onClick={() => props.onToggle!(b)}
                    title={`Bit ${b}${f ? ` (${f.label})` : ""}: click to flip`}
                    aria-label={`Bit ${b}${f ? `, ${f.label}` : ""}, ${on ? 1 : 0}`}
                    aria-pressed={on}
                    className={`${cls} hover:bg-hover`}
                    style={style}
                  >
                    {on ? 1 : 0}
                  </button>
                ) : (
                  <span key={b} className={cls} style={style}>
                    {on ? 1 : 0}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {props.fields && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {props.fields.map((f) => (
            <li key={f.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: f.color }} aria-hidden />
              {f.label} ({f.from === f.to ? `bit ${f.from}` : `bits ${f.from}–${f.to}`})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Copy a value to the clipboard, with a moment of feedback. */
export function CopyButton(props: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(props.text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          },
          () => {},
        );
      }}
      title={`Copy ${props.label}`}
      aria-label={`Copy ${props.label}`}
      className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-foreground"
    >
      {done ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
    </button>
  );
}

/** Plot colours with fallbacks, for the stale-CSS problem. */
export const PLOT_COLORS = ["var(--plot-1, #2a78d6)", "var(--plot-2, #eb6834)", "var(--plot-3, #1baf7a)", "var(--plot-4, #eda100)", "var(--plot-5, #e87ba4)"];
