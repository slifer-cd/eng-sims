"use client";

import { Activity, AudioWaveform, BookOpen, Combine, Cpu, type LucideIcon, Sigma, Waves, Workflow, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useRef } from "react";
import { FUNCTIONS } from "@/lib/sss/expr/names";
import { useSssPersistence } from "@/lib/sss/store";
import { Tex } from "./Tex";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Pages listed in the left bar. */
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Continuous time",
    items: [
      { href: "/sss", label: "Signal", icon: Activity },
      { href: "/sss/fourier", label: "Fourier transform", icon: AudioWaveform },
      { href: "/sss/laplace", label: "Laplace transform", icon: Sigma },
      { href: "/sss/series", label: "Fourier series", icon: Waves },
      { href: "/sss/convolution", label: "Convolution", icon: Combine },
      { href: "/sss/system", label: "LTI system", icon: Workflow },
    ],
  },
];

function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Tools" className="flex gap-1 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
      {NAV.map((g) => (
        <div key={g.group} className="flex shrink-0 gap-1 md:flex-col">
          <h2 className="hidden px-2 pb-1 text-xs font-medium text-muted md:block">{g.group}</h2>
          {g.items.map((item) => {
            const active = path === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap ${
                  active ? "bg-accent/12 font-medium text-accent" : "hover:bg-hover"
                }`}
              >
                <Icon size={16} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SyntaxHelp() {
  const ref = useRef<HTMLDialogElement>(null);
  const groups: { name: string; group: string }[] = [
    { name: "Signals", group: "signal" },
    { name: "Functions", group: "function" },
    { name: "Numeric only", group: "numeric" },
  ];
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-hover"
      >
        <BookOpen size={15} aria-hidden />
        Syntax
      </button>
      <dialog
        ref={ref}
        aria-labelledby="sss-syntax-title"
        className="m-auto max-h-[85dvh] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-panel p-0 text-foreground shadow-2xl backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-5 py-3">
          <h2 id="sss-syntax-title" className="font-semibold">
            Typing expressions
          </h2>
          <button type="button" onClick={() => ref.current?.close()} className="rounded-md p-1 hover:bg-hover" aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-5 py-4 text-sm">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-foreground/85">
            <li>
              Multiplication can be implicit: <code className="font-mono">2t</code>, <code className="font-mono">e^(-t)u(t)</code>,{" "}
              <code className="font-mono">t u(t-1)</code>.
            </li>
            <li>
              Put the whole exponent in parentheses: <code className="font-mono">e^(-2t)</code>. Without them,{" "}
              <code className="font-mono">e^-2t</code> means <Tex tex="e^{-2}\,t" />.
            </li>
            <li>
              Any other single letter, or a letter with digits like <code className="font-mono">w0</code>, is a parameter and gets a
              slider: <code className="font-mono">e^(-a t)u(t)</code>.
            </li>
            <li>
              <code className="font-mono">j</code> (or <code className="font-mono">i</code>) is the imaginary unit,{" "}
              <code className="font-mono">pi</code> is π. Unicode symbols and simple LaTeX such as{" "}
              <code className="font-mono">\frac{"{1}{s+2}"}</code> also work.
            </li>
            <li>
              Formulas are exact for steps, ramps, pulses, impulses, exponentials, sinusoids and polynomials, and for sinc and
              Gaussian pulses. Anything else is plotted numerically.
            </li>
          </ul>
          {groups.map((g) => (
            <section key={g.group}>
              <h3 className="mb-2 font-medium">{g.name}</h3>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
                {FUNCTIONS.filter((f) => f.group === g.group).map((f) => (
                  <div key={f.name} className="contents">
                    <dt className="font-mono">
                      {f.name === "ramp" ? "ramp(t), r(t)" : `${f.name}(${f.arity === 2 ? "a, b" : "x"})`}
                    </dt>
                    <dd className="text-foreground/85">
                      {f.help}
                      {f.definition && <Tex tex={f.definition} className="ml-2 inline-block" />}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}

/** The simulator frame: top bar, tool list and the scrolling page. */
export function SssShell({ children }: { children: ReactNode }) {
  useSssPersistence();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-40 flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel bg-linear-to-r from-accent/15 via-panel to-panel px-3">
        <Link href="/" title="Back to the home page" className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-hover">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-white shadow-sm">
            <Cpu size={14} aria-hidden />
          </span>
          Eng Sims
        </Link>
        <span className="mx-1 text-muted" aria-hidden>
          /
        </span>
        <span className="text-sm font-semibold">Signals &amp; Systems</span>
        <SyntaxHelp />
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-line bg-panel px-2 py-2 md:sticky md:top-11 md:h-[calc(100dvh-2.75rem)] md:w-52 md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-4">
          <Nav />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[88rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
