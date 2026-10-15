import { Cpu, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/*
 * The site's frosted-glass look: translucent panels over blurred blue and red colour
 * fields. Shared by the home page and the status pages (404, errors, loading).
 */

/** A frosted panel: translucent fill, blur behind, and a light edge. */
export const GLASS =
  "rounded-2xl border border-white/70 bg-white/35 shadow-[0_8px_32px_rgb(30_41_80/0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_8px_32px_rgb(0_0_0/0.35)]";

const BUTTON = "flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-medium";
export const BUTTON_BLUE = `${BUTTON} bg-linear-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:brightness-110`;
export const BUTTON_RED = `${BUTTON} bg-linear-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:brightness-110`;
export const BUTTON_GLASS = `${BUTTON} ${GLASS} rounded-full hover:bg-white/70 dark:hover:bg-white/10`;

/** Soft colour fields behind the glass; the blur on each panel is what makes them read as frosted. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-canvas" />
      <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-sky-300/70 blur-3xl dark:bg-blue-600/30" />
      <div className="absolute top-24 -right-40 size-[30rem] rounded-full bg-red-300/50 blur-3xl dark:bg-red-600/20" />
      <div className="absolute top-[42rem] left-1/4 size-[36rem] rounded-full bg-blue-300/60 blur-3xl dark:bg-blue-700/25" />
      <div className="absolute -bottom-40 right-0 size-[28rem] rounded-full bg-red-200/70 blur-3xl dark:bg-red-700/20" />
    </div>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-white shadow-sm">
        <Cpu size={17} aria-hidden />
      </span>
      Eng Sims
    </Link>
  );
}

/** A full-page message on the glass backdrop: 404s, errors and the like. */
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
      <Backdrop />
      <header className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
        <Logo />
      </header>
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className={`${GLASS} w-full max-w-lg p-8 text-center sm:p-10`}>
          <span
            className={`mx-auto grid size-14 place-items-center rounded-2xl text-white shadow-lg ${
              red ? "bg-linear-to-br from-red-400 to-red-600 shadow-red-500/25" : "bg-linear-to-br from-sky-400 to-blue-600 shadow-blue-500/25"
            }`}
          >
            <Icon size={26} aria-hidden />
          </span>
          <p
            className={`mt-6 bg-linear-to-r bg-clip-text font-mono text-sm font-semibold tracking-widest text-transparent uppercase ${
              red ? "from-red-500 to-red-700 dark:from-red-400 dark:to-red-600" : "from-sky-500 to-blue-700 dark:from-sky-300 dark:to-blue-500"
            }`}
          >
            {props.code}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{props.title}</h1>
          <div className="mt-3 text-pretty text-muted">{props.children}</div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">{props.actions}</div>
        </div>
      </main>
    </div>
  );
}
