import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Backdrop } from "@/components/home/Backdrop";
import { BitsPreview } from "@/components/home/BitsPreview";
import { CircuitPreview } from "@/components/home/CircuitPreview";
import { FourierPreview } from "@/components/home/FourierPreview";
import { LogicPreview } from "@/components/home/LogicPreview";
import { BUTTON_PRIMARY, GraphPaper, Logo, PANEL } from "@/components/site/Bench";

export const metadata: Metadata = {
  title: "Eng Sims · Simulators for engineers",
  description:
    "A digital logic simulator, an analog circuit simulator, a signals & systems calculator and bits & logic tools that show their work. Free, in your browser, no account.",
};

export default function Home() {
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col overflow-hidden">
      <GraphPaper />
      <Backdrop />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex gap-1 text-sm">
          <NavLink href="/dls">Logic</NavLink>
          <NavLink href="/acs">Circuits</NavLink>
          <NavLink href="/sss">Signals</NavLink>
          <NavLink href="/calc">Bits &amp; Logic</NavLink>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="max-w-3xl pt-16 pb-12 sm:pt-24 sm:pb-16">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Engineering simulators that show their work.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-pretty text-muted">
            Wire up digital logic or analog circuits and watch every signal, or type a signal and get the exact transform, step
            by step. Free, in your browser, no account.
          </p>
        </section>

        <section aria-label="Tools" className="mb-16 grid gap-4 lg:grid-cols-2">
          <ToolPanel
            name="Digital logic simulator"
            route="/dls"
            blurb="Build circuits from gates, run them live, and save designs as blocks to use inside bigger ones."
            facts={["0, 1, Z and X signals", "Buses up to 32 bits", "LEDs, digits and screens"]}
            action="Open the logic simulator"
            preview={<LogicPreview />}
          />
          <ToolPanel
            name="Circuit simulator"
            route="/acs"
            blurb="Draw an analog circuit and watch its voltages and currents live, with every part's value yours to set."
            facts={["DC and AC sources", "R, L, C and switches", "Probes and net labels"]}
            action="Open the circuit simulator"
            preview={<CircuitPreview />}
          />
          <ToolPanel
            name="Signals & systems"
            route="/sss"
            blurb="Type a signal and get exact formulas with worked steps, from Fourier series to convolution."
            facts={["Fourier, Laplace and z-transforms", "LTI systems", "Discrete time"]}
            action="Open signals & systems"
            preview={<FourierPreview />}
          />
          <ToolPanel
            name="Bits & Logic"
            route="/calc"
            blurb="Number bases, two's complement and floating point bits, truth tables and K-maps, each with the working."
            facts={["Bases and IEEE-754", "Truth tables", "K-maps and Quine–McCluskey"]}
            action="Open bits & logic"
            preview={<BitsPreview />}
          />
        </section>

      </main>

      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted sm:px-6">
          Runs in your browser. Your designs and inputs stay on this device.
        </p>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-3 py-1.5 font-medium text-muted transition-colors hover:bg-hover hover:text-foreground">
      {children}
    </Link>
  );
}

function ToolPanel(props: {
  name: string;
  route: string;
  blurb: string;
  facts: string[];
  action: string;
  preview: ReactNode;
}) {
  return (
    <article className={`${PANEL} flex flex-col`}>
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="font-semibold">
          <Link href={props.route} className="hover:underline">
            {props.name}
          </Link>
        </h2>
        <code className="font-mono text-xs text-muted">{props.route}</code>
      </header>
      <div className="border-b border-line bg-plot-surface px-5 py-6">{props.preview}</div>
      <div className="flex flex-1 flex-col px-5 py-5">
        <p className="text-pretty">{props.blurb}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {props.facts.map((fact) => (
            <li key={fact} className="rounded border border-line px-2 py-0.5 text-xs text-muted">
              {fact}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6">
          <Link href={props.route} className={BUTTON_PRIMARY}>
            {props.action}
          </Link>
        </div>
      </div>
    </article>
  );
}
