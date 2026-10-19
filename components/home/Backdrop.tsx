import katex from "katex";
import type { CSSProperties } from "react";
import { FORMULAS, type Spot, TRACES, tracePath } from "@/lib/site/backdrop";

/*
 * The moving layer over the home page's graph paper: formulas that rise and fade, scope
 * traces scrolling across free stretches of the page, and pulses running along the heavy grid
 * lines like signals down a wire. It is CSS animation only (the `backdrop-*` classes in
 * globals.css), so it costs no JavaScript, and it holds still for visitors who prefer reduced
 * motion.
 */

/** Lighter further down, like the graph paper, so the motion frames the top of the page. */
const FADE = "linear-gradient(to bottom, black, black 30rem, rgb(0 0 0 / 0.6))";

/*
 * Heavy grid lines sit at 60n − 1 px (see `GraphPaper`); pulses run along these ones. Row 17
 * and columns 12 and 16 fall in the gaps between the tool panels on common screen widths,
 * column 1 and 23 in the margins.
 */
const ROWS = [2, 5, 9, 17, 25].map((n) => 60 * n - 1);
const COLUMNS = [1, 12, 16, 23].map((n) => 60 * n - 1);

/** Wide enough to fill any trace box plus the period it scrolls by. */
const TRACE_WIDTH = 1600;

/** Bigger formulas are drawn fainter, so none of them shouts. */
const SIZES = {
  xs: { className: "text-xs", peak: 0.8 },
  sm: { className: "text-sm", peak: 0.7 },
  base: { className: "text-base", peak: 0.55 },
};

/** Typed so custom properties can sit in a style object. */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" style={{ maskImage: FADE }}>
      {ROWS.map((top, i) => (
        <div
          key={top}
          className="backdrop-run-x absolute inset-x-0 h-px"
          style={{ top, "--duration": `${9 + 2 * (i % 3)}s`, "--delay": `${-3.5 * i - 1}s` } as Vars}
        >
          <Pulse direction="right" />
        </div>
      ))}
      {COLUMNS.map((left, i) => (
        <div
          key={left}
          className="backdrop-run-y absolute inset-y-0 w-px"
          style={{ left, "--duration": `${13 + 3 * (i % 2)}s`, "--delay": `${-5 * i - 2}s` } as Vars}
        >
          <Pulse direction="down" />
        </div>
      ))}

      <div className="absolute inset-0 mx-auto max-w-6xl px-4 sm:px-6">
        <Zone zone="column" />
      </div>
      {/* The margins beside the 72rem column, once they are wide enough to hold a formula. */}
      <div className="absolute inset-y-0 left-0 hidden w-[calc(50%-36rem)] min-[1400px]:block">
        <Zone zone="left" />
      </div>
      <div className="absolute inset-y-0 right-0 hidden w-[calc(50%-36rem)] min-[1400px]:block">
        <Zone zone="right" />
      </div>
    </div>
  );
}

/** The formulas and traces placed in one zone. */
function Zone({ zone }: { zone: Spot["zone"] }) {
  return (
    <div className="relative h-full">
      {TRACES.filter((t) => t.zone === zone).map((trace, i) => {
        const h = trace.amplitude + 2;
        return (
          <div
            key={i}
            className={`absolute overflow-hidden ${visibility(trace)}`}
            style={{ ...place(trace), maskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)" }}
          >
            <svg width={TRACE_WIDTH} height={2 * h} viewBox={`0 ${-h} ${TRACE_WIDTH} ${2 * h}`} className="block">
              <path
                d={tracePath(trace, TRACE_WIDTH)}
                fill="none"
                strokeWidth={1.75}
                strokeLinejoin="round"
                className={`backdrop-scroll ${trace.stroke}`}
                opacity={0.55}
                style={{ "--period": `${trace.period}px`, "--duration": `${trace.duration}s` } as Vars}
              />
            </svg>
          </div>
        );
      })}
      {FORMULAS.filter((f) => f.zone === zone).map((f) => (
        <span
          key={f.tex}
          className={`backdrop-rise absolute whitespace-nowrap text-muted ${SIZES[f.size].className} ${visibility(f)}`}
          style={
            {
              ...place(f),
              "--peak": SIZES[f.size].peak,
              "--duration": `${f.duration}s`,
              "--delay": `${-f.offset}s`,
            } as Vars
          }
          dangerouslySetInnerHTML={{ __html: katex.renderToString(f.tex, { throwOnError: false, output: "html" }) }}
        />
      ))}
    </div>
  );
}

function place(spot: Spot): CSSProperties {
  return {
    left: `${spot.left}%`,
    right: spot.right === undefined ? undefined : `${spot.right}%`,
    top: spot.top === undefined ? undefined : `${spot.top}rem`,
    bottom: spot.bottom === undefined ? undefined : `${spot.bottom}rem`,
  };
}

/** Column items crowd the text on small screens unless marked `always`; the margins hide themselves. */
function visibility(spot: Spot): string {
  return spot.zone === "column" && !spot.always ? "hidden lg:block" : "";
}

/** A short bright stretch of wire with a glowing head, travelling right or down. */
function Pulse({ direction }: { direction: "right" | "down" }) {
  const right = direction === "right";
  return (
    <div
      className={`absolute ${right ? "right-0 h-px w-28" : "bottom-0 h-28 w-px"}`}
      style={{ background: `linear-gradient(to ${right ? "right" : "bottom"}, transparent, var(--accent))` }}
    >
      <span
        className={`absolute size-[3px] rounded-full bg-accent ${right ? "-top-px -right-px" : "-bottom-px -left-px"}`}
        style={{ boxShadow: "0 0 6px 2px color-mix(in oklab, var(--accent) 60%, transparent)" }}
      />
    </div>
  );
}
