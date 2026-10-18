import {
  ArrowRight,
  Blocks,
  Calculator,
  Cpu,
  HardDrive,
  Monitor,
  Radio,
  ToggleRight,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HalfAdderArt } from "@/components/home/HalfAdderArt";
import {
  ACCENT_TEXT,
  Backdrop,
  BUTTON_GLASS,
  BUTTON_SKY,
  BUTTON_PRIMARY,
  GLASS as glass,
  GLASS_HOVER,
  GRADIENT_TEXT,
  Logo,
} from "@/components/site/Glass";

export const metadata: Metadata = {
  title: "Eng Sims · Simulators and tools for engineers",
  description:
    "Engineering simulators and tools in one place, running in your browser. Start with the digital logic simulator.",
};

interface Tool {
  name: string;
  blurb: string;
  icon: LucideIcon;
  /** Route of a tool that's ready; tools without one are shown as coming soon. */
  href?: string;
}

// Only the logic simulator exists so far; the rest are placeholders for planned tools.
const TOOLS: Tool[] = [
  {
    name: "Digital logic simulator",
    blurb: "Wire gates into circuits, watch signals live, and package designs as reusable blocks.",
    icon: Cpu,
    href: "/dls",
  },
  { name: "Analog circuits", blurb: "Resistors, capacitors and sources, with voltages and currents over time.", icon: Zap },
  { name: "Signals & systems", blurb: "Generate, filter and inspect waveforms in time and frequency.", icon: Waves },
  { name: "Engineering calculators", blurb: "Quick conversions and the formulas you look up every week.", icon: Calculator },
];

const LOGIC_FEATURES: { title: string; text: string; icon: LucideIcon }[] = [
  {
    title: "Build from gates",
    text: "AND, OR, XOR and friends, tri-state buffers, splitters and buses up to 32 bits wide, with 0, 1, Z and X signals.",
    icon: ToggleRight,
  },
  {
    title: "Blocks inside blocks",
    text: "Save a design as a block and use it in the next one. Edit a block and every design using it updates.",
    icon: Blocks,
  },
  {
    title: "Live displays",
    text: "LEDs, 7-segment digits and double-buffered 16×16 dot and RGB screens, shown right on your blocks.",
    icon: Monitor,
  },
  {
    title: "Yours, in your browser",
    text: "No account and no install. Designs and blocks are saved in this browser as you work.",
    icon: HardDrive,
  },
];

export default function Home() {
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col overflow-hidden">
      <Backdrop />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-5 sm:px-6">
        <Logo />
        <Link
          href="/dls"
          className={`${glass} flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium ${GLASS_HOVER}`}
        >
          Open simulator
          <ArrowRight size={15} aria-hidden />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p
              className={`${glass} inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted`}
            >
              <span className="size-1.5 rounded-full bg-sky-500 shadow-[0_0_6px] shadow-sky-500" aria-hidden />
              Free, and runs entirely in your browser
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Simulators and tools for engineers,{" "}
              <span className={GRADIENT_TEXT}>
                in one place.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-muted">
              Eng Sims gathers the simulators and everyday tools engineers reach for into one workspace, so you can
              build, test and understand a design without juggling apps. It starts with a full digital logic
              simulator.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dls"
                className={BUTTON_PRIMARY}
              >
                Launch the logic simulator
                <ArrowRight size={17} aria-hidden />
              </Link>
              <a
                href="#tools"
                className={BUTTON_GLASS}
              >
                See the tools
              </a>
            </div>
          </div>

          <figure className={`${glass} p-4 sm:p-6`}>
            <HalfAdderArt />
            <figcaption className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>A half adder, built in the logic simulator</span>
              <span className="font-mono">A=1 · B=1 → carry</span>
            </figcaption>
          </figure>
        </section>

        <section id="tools" className="scroll-mt-8 py-12">
          <SectionTitle eyebrow="The toolbox" title="One workspace, growing tool by tool" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </section>

        <section className="py-12">
          <SectionTitle eyebrow="Available now" title="The digital logic simulator" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {LOGIC_FEATURES.map((f) => (
              <div key={f.title} className={`${glass} flex gap-4 p-5`}>
                <IconBadge icon={f.icon} />
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-12">
          <div className={`${glass} flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Start building{" "}
                <span className={GRADIENT_TEXT}>
                  in seconds
                </span>
              </h2>
              <p className="mt-1 text-muted">Open the simulator, drop in a few gates, and press play.</p>
            </div>
            <Link
              href="/dls"
              className={`${BUTTON_SKY} shrink-0`}
            >
              Open the editor
              <ArrowRight size={17} aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-8 text-sm text-muted sm:px-6">
        <Radio size={14} aria-hidden />
        Eng Sims: simulators and tools for engineers.
      </footer>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: ReactNode }) {
  return (
    <div>
      <p className={`text-xs font-semibold tracking-wide uppercase ${ACCENT_TEXT}`}>{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className={`grid size-10 shrink-0 place-items-center rounded-xl border border-white/70 bg-linear-to-br from-sky-100/90 to-blue-100/60 shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] dark:border-white/15 dark:from-blue-400/20 dark:to-sky-400/5 dark:shadow-none ${ACCENT_TEXT}`}
    >
      <Icon size={19} aria-hidden />
    </span>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <IconBadge icon={tool.icon} />
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            tool.href ? "bg-sky-500/15 text-blue-700 dark:text-sky-300" : "bg-muted/15 text-muted"
          }`}
        >
          {tool.href ? "Available" : "Coming soon"}
        </span>
      </div>
      <h3 className="mt-4 font-semibold">{tool.name}</h3>
      <p className="mt-1 text-sm text-muted">{tool.blurb}</p>
      {tool.href && (
        <span className={`mt-4 flex items-center gap-1 text-sm font-medium ${ACCENT_TEXT}`}>
          Open
          <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );
  return tool.href ? (
    <Link
      href={tool.href}
      className={`${glass} group block p-5 transition hover:-translate-y-0.5 ${GLASS_HOVER}`}
    >
      {body}
    </Link>
  ) : (
    <div className={`${glass} p-5 opacity-80`}>{body}</div>
  );
}
