import { Cpu, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/*
 * The site's frosted-glass look: glossy translucent panels over blurred blue, sky and navy
 * colour fields. Shared by the home page and the status pages (404, errors, loading).
 * The editor keeps its own theme tokens; these blues are the site's. No indigo or violet:
 * the palette stays on true blues.
 */

/**
 * A frosted panel: a glossy fill that fades from bright to clear, heavy blur behind,
 * a light rim, and a highlight along the top edge like the edge of a glass sheet.
 */
export const GLASS =
  "rounded-2xl border border-white/60 bg-linear-to-br from-white/55 via-white/25 to-white/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_12px_40px_rgb(30_58_138/0.14)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/15 dark:from-white/[0.13] dark:via-white/[0.05] dark:to-white/[0.01] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_12px_40px_rgb(0_0_0/0.5)]";

/** Text and icon colour for small accents (section labels, links). */
export const ACCENT_TEXT = "text-blue-700 dark:text-sky-400";
/** Gradient text for headline highlights. */
export const GRADIENT_TEXT =
  "bg-linear-to-r from-blue-700 via-blue-600 to-sky-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-sky-400 dark:to-sky-300";

const BUTTON = "flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-medium";
/** Main action: deep blue into blue. */
export const BUTTON_PRIMARY = `${BUTTON} bg-linear-to-r from-blue-700 to-blue-500 text-white shadow-lg shadow-blue-600/30 hover:brightness-110`;
/** Second highlight: light sky into blue, with dark text for contrast on the light sky. */
export const BUTTON_SKY = `${BUTTON} bg-linear-to-r from-sky-300 to-blue-400 text-blue-950 shadow-lg shadow-sky-500/30 hover:brightness-105`;
/** Errors only. */
export const BUTTON_RED = `${BUTTON} bg-linear-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:brightness-110`;
/** Hover state for a glass panel that is a link or button: the fill brightens. */
export const GLASS_HOVER = "hover:from-white/80 dark:hover:from-white/[0.2]";
export const BUTTON_GLASS = `${BUTTON} ${GLASS} rounded-full ${GLASS_HOVER}`;

/**
 * Colour fields behind the glass, spread down the page so every panel has colour behind
 * it to frost; a panel over a plain background just looks white.
 */
export function Backdrop() {
  const blob = "absolute rounded-full blur-2xl";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[#f2f7fd] dark:bg-[#040912]" />
      <div className={`${blob} -top-32 -left-24 size-[30rem] bg-blue-300/80 dark:bg-blue-600/40`} />
      <div className={`${blob} top-10 right-[-6rem] size-[26rem] bg-sky-300/80 dark:bg-sky-500/25`} />
      <div className={`${blob} top-[22rem] left-[38%] size-[20rem] bg-sky-200/90 dark:bg-blue-500/25`} />
      <div className={`${blob} top-[46rem] left-[-4rem] size-[26rem] bg-blue-300/70 dark:bg-blue-800/40`} />
      <div className={`${blob} top-[54rem] right-[8%] size-[24rem] bg-sky-200/90 dark:bg-sky-400/20`} />
      <div className={`${blob} top-[78rem] left-[30%] size-[28rem] bg-blue-200/90 dark:bg-blue-500/25`} />
      <div className={`${blob} -bottom-32 right-[-4rem] size-[26rem] bg-sky-300/70 dark:bg-blue-700/30`} />
    </div>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="grid size-8 place-items-center rounded-lg bg-linear-to-br from-sky-400 to-blue-600 text-white shadow-md shadow-blue-600/30">
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
              red ? "bg-linear-to-br from-red-400 to-red-600 shadow-red-500/25" : "bg-linear-to-br from-sky-400 to-blue-600 shadow-blue-600/30"
            }`}
          >
            <Icon size={26} aria-hidden />
          </span>
          <p
            className={`mt-6 bg-linear-to-r bg-clip-text font-mono text-sm font-semibold tracking-widest text-transparent uppercase ${
              red ? "from-red-500 to-red-700 dark:from-red-400 dark:to-red-600" : "from-blue-600 to-sky-500 dark:from-blue-400 dark:to-sky-300"
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
