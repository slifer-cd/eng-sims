"use client";

/* Small layout pieces shared by the simulator pages. */

import { ChevronDown, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Step } from "@/lib/sss/steps";
import { Tex } from "./Tex";

/** A titled section. `tone="result"` marks the computed answer with an accent edge. */
export function Panel(props: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "plain" | "result";
  className?: string;
}) {
  const result = props.tone === "result";
  return (
    <section
      className={`min-w-0 rounded-xl border bg-panel p-4 ${result ? "border-line border-l-[3px] border-l-accent" : "border-line"} ${props.className ?? ""}`}
    >
      {(props.title || props.actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {props.title && <h2 className="text-sm font-semibold">{props.title}</h2>}
          {props.actions}
        </header>
      )}
      {props.children}
    </section>
  );
}

/** The page heading: what the tool is for, in one line. */
export function PageHeader(props: { title: string; children: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
      <p className="mt-1 max-w-3xl text-pretty text-muted">{props.children}</p>
    </header>
  );
}

/** A displayed formula that scrolls sideways instead of overflowing on small screens. */
export function Formula(props: { tex: string; className?: string }) {
  return (
    <div className={`overflow-x-auto overflow-y-hidden py-1 text-[1.05rem] ${props.className ?? ""}`}>
      <Tex tex={props.tex} display />
    </div>
  );
}

/** Numbered working, collapsed by default: each step a title and display lines. */
export function StepsPanel(props: { steps: Step[]; open?: boolean }) {
  if (props.steps.length === 0) return null;
  return (
    <details open={props.open} className="group rounded-xl border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        Working
        <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="flex flex-col gap-4 border-t border-line px-4 py-4">
        {props.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/12 text-xs font-semibold text-accent">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.title}</p>
              {s.lines.map((l, k) => (
                <Formula key={k} tex={l} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function Note(props: { tone?: "info" | "warn"; children: ReactNode }) {
  const warn = props.tone === "warn";
  const Icon = warn ? TriangleAlert : Info;
  return (
    <p
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        warn ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-accent/8 text-foreground/80"
      }`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{props.children}</span>
    </p>
  );
}

/** Two-way toggle used for display options (Re/Im, linear/dB …). */
export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-sm">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          onClick={() => props.onChange(o.value)}
          className={`rounded-md px-2.5 py-1 ${props.value === o.value ? "bg-panel font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A label: value row in the properties list. */
export function Fact(props: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-1.5 last:border-0">
      <dt className="text-sm text-muted">{props.label}</dt>
      <dd className="text-right text-sm">{props.children}</dd>
    </div>
  );
}

/** "Numerical" badge for results computed without a closed form. */
export function NumericBadge(props: { reason: string }) {
  return (
    <span title={props.reason} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
      Numerical
    </span>
  );
}
