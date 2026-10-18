import { Cpu, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/*
 * The site's frosted-glass look: glossy translucent panels over blurred blue (left) and red
 * (right) colour fields. Shared by the home page and the status pages (404, errors, loading).
 * The editor keeps its own theme tokens; blue and red are the site's only two hues. No
 * indigo or violet.
 */

/**
 * A frosted panel: a glossy fill that fades from bright to clear, heavy blur behind,
 * a light rim, and a highlight along the top edge like the edge of a glass sheet.
 */
export const GLASS =
  "rounded-2xl border border-white/60 bg-linear-to-br from-white/55 via-white/25 to-white/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_12px_40px_rgb(30_58_138/0.14)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/15 dark:from-white/[0.13] dark:via-white/[0.05] dark:to-white/[0.01] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_12px_40px_rgb(0_0_0/0.5)]";

/** Text and icon colour for small accents (section labels, links). */
export const ACCENT_TEXT = "text-blue-700 dark:text-sky-400";
/** Gradient text for headline highlights: blue, then red for the second highlight. */
export const GRADIENT_TEXT =
  "bg-linear-to-r from-sky-500 to-blue-700 bg-clip-text text-transparent dark:from-sky-300 dark:to-blue-500";
export const GRADIENT_TEXT_RED =
  "bg-linear-to-r from-red-500 to-red-700 bg-clip-text text-transparent dark:from-red-400 dark:to-red-600";

const BUTTON = "flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-medium";
/** Main action: sky into blue. */
export const BUTTON_PRIMARY = `${BUTTON} bg-linear-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:brightness-110`;
/** Second highlight, and errors. */
export const BUTTON_RED = `${BUTTON} bg-linear-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:brightness-110`;
/** Hover state for a glass panel that is a link or button: the fill brightens. */
export const GLASS_HOVER = "hover:from-white/80 dark:hover:from-white/[0.2]";
export const BUTTON_GLASS = `${BUTTON} ${GLASS} rounded-full ${GLASS_HOVER}`;

/**
 * Colour fields behind the glass, spread down the page so every panel has colour behind
 * it to frost; a panel over a plain background just looks white.
 */
/** Hand-drawn lumpy outlines (viewBox 0 0 200 200), so the blobs read as organic shapes rather than ovals. */
const BLOB_PATHS = [
  "M38 62C52 22 104 8 146 30c34 18 54 52 40 94-10 32-46 58-84 64-40 6-74-14-84-52C6 114 22 94 38 62Z",
  "M70 14c34-14 82-4 106 30 22 32 8 62 14 90 4 28-22 56-62 60-36 4-48-22-82-30C14 156 4 120 14 86 24 52 44 24 70 14Z",
  "M24 90C16 54 48 30 84 28c24-2 36 14 62 8 30-6 50 20 48 54-2 30-18 40-14 64 4 26-26 44-62 42-34-2-40-24-66-30C28 160 32 122 24 90Z",
  "M100 8c40 4 78 30 86 68 6 28-12 40-8 66 4 30-26 54-62 52-30-2-34-22-62-26C20 164 6 140 14 108 22 74 28 44 54 28 70 16 84 6 100 8Z",
];

export function Backdrop() {
  const blob = "absolute blur-2xl";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[#f4f7fd] dark:bg-[#05080f]" />
      {/* A soft blue-to-red wash from left to right under the blobs, so the colour
          shifts across the page whatever the blobs do. */}
      <div className="absolute inset-0 bg-linear-to-r from-blue-300/40 via-transparent to-red-300/40 dark:from-blue-600/20 dark:to-red-600/20" />
      {(
        [
          ["-top-24 -left-28 h-[30rem] w-[36rem] rotate-[-14deg] text-blue-300/80 dark:text-blue-600/40", 0],
          ["top-12 -right-32 h-[36rem] w-[26rem] rotate-[28deg] text-red-300/70 dark:text-red-600/30", 1],
          ["top-[36rem] left-[4%] h-[24rem] w-[34rem] rotate-[160deg] text-sky-300/70 dark:text-blue-700/35", 2],
          ["top-[52rem] right-[2%] h-[32rem] w-[24rem] rotate-[-40deg] text-red-200/80 dark:text-red-700/30", 3],
        ] as const
      ).map(([cls, path]) => (
        <svg key={cls} viewBox="0 0 200 200" preserveAspectRatio="none" className={`${blob} ${cls}`}>
          <path d={BLOB_PATHS[path]} fill="currentColor" />
        </svg>
      ))}
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
