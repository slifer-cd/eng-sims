import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/*
 * The site's lab-bench look: flat panels with thin rules over engineering graph paper, built
 * from the editor's theme tokens so the home page matches the canvas. Shared by the home page
 * and the status pages (404, errors, loading). Blue is the only accent; red is for errors.
 */

/** A flat sheet on the graph paper. */
export const PANEL = "rounded-lg border border-line bg-background dark:bg-panel";

const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
/** Main action. */
export const BUTTON_PRIMARY = `${BUTTON} bg-accent text-white hover:bg-blue-700 dark:text-slate-950 dark:hover:bg-blue-300`;
/** Retrying after an error. */
export const BUTTON_RED = `${BUTTON} bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400`;
/** Everything else. */
export const BUTTON_OUTLINE = `${BUTTON} border border-line bg-background text-foreground hover:bg-hover dark:bg-panel dark:hover:bg-hover`;

/**
 * Graph paper: fine lines every 12px and heavier ones every 60px, fading out towards the
 * bottom so it frames the top of the page without crowding the text further down.
 */
export function GraphPaper() {
  const minor = "color-mix(in oklab, var(--grid) 40%, transparent)";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 bg-canvas"
      style={{
        backgroundImage: [
          "linear-gradient(var(--grid) 1px, transparent 1px)",
          "linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
          `linear-gradient(${minor} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${minor} 1px, transparent 1px)`,
        ].join(","),
        backgroundSize: "60px 60px, 60px 60px, 12px 12px, 12px 12px",
        backgroundPosition: "-1px -1px",
        maskImage: "linear-gradient(to bottom, black, black 40rem, rgb(0 0 0 / 0.25))",
      }}
    />
  );
}

/** The mark is one period of a square wave: a clock pulse, common to both tools. */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d="M1.5 11.5h3v-7h4v7h4v-7h2" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" />
        </svg>
      </span>
      Eng Sims
    </Link>
  );
}

/** A full-page message on the graph paper: 404s, errors and the like. */
export function StatusPage(props: {
  icon: LucideIcon;
  /** Small label above the title, e.g. "404". */
  code: string;
  title: string;
  children: ReactNode;
  /** Buttons under the message. */
  actions: ReactNode;
  /** Red for errors, blue otherwise. */
  tone?: "blue" | "red";
}) {
  const Icon = props.icon;
  const red = props.tone === "red";
  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col overflow-hidden">
      <GraphPaper />
      <header className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
        <Logo />
      </header>
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className={`${PANEL} w-full max-w-lg p-8 sm:p-10`}>
          <div className="flex items-center gap-3">
            <span
              className={`grid size-10 place-items-center rounded-md border ${
                red
                  ? "border-red-600/30 bg-red-600/10 text-red-600 dark:text-red-400"
                  : "border-accent/30 bg-accent/10 text-accent"
              }`}
            >
              <Icon size={20} aria-hidden />
            </span>
            <p className={`font-mono text-sm font-medium ${red ? "text-red-600 dark:text-red-400" : "text-accent"}`}>
              {props.code}
            </p>
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-balance">{props.title}</h1>
          <div className="mt-3 text-pretty text-muted">{props.children}</div>
          <div className="mt-8 flex flex-wrap gap-3">{props.actions}</div>
        </div>
      </main>
    </div>
  );
}
