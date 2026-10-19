import { squareWaveSum } from "./previews";

/*
 * Content of the moving backdrop behind the home page: formulas from the tools that drift up
 * and fade, and scope traces that scroll along the graph paper, scattered over the page.
 */

/**
 * Where a backdrop item sits. Zones: "column" is the page's content column, which on most
 * screens has free space only around the hero and in the band above the footer; "left" and
 * "right" are the margins beside it, which run the full height of the page but are only wide
 * enough on large screens. Each item gives either `top` or `bottom`.
 */
export type Spot = {
  zone: "column" | "left" | "right";
  /** From the left of the zone, in % of its width. */
  left: number;
  /** From the right of the zone, in %. Only traces use it, to set their width. */
  right?: number;
  /** From the top of the page, in rem. */
  top?: number;
  /** From the bottom of the page, in rem. */
  bottom?: number;
  /** Also shown on small screens. Only for the column; the margins need a wide screen. */
  always?: boolean;
};

/** A formula that rises and fades. */
export type FloatingFormula = Spot & {
  tex: string;
  size: "xs" | "sm" | "base";
  /** One rise-and-fade cycle, in seconds. */
  duration: number;
  /** How far into its cycle the formula starts, in seconds, so they don't all fade in at once. */
  offset: number;
};

/*
 * Scattered wherever the page leaves room. In the column that means the band under the
 * header, beside the headline (right of 80%, where it ends on narrower screens), beside and
 * under the intro paragraph, and the footer; the tool panels are opaque, so nothing goes
 * behind them. The margins take short formulas only: at 1400px they are about 120px wide.
 */
export const FORMULAS: FloatingFormula[] = [
  // Hero.
  { tex: String.raw`e^{j\omega t} = \cos\omega t + j\sin\omega t`, zone: "column", left: 3, top: 4.6, size: "sm", duration: 19, offset: 3, always: true },
  { tex: String.raw`\overline{A\cdot B} = \overline{A} + \overline{B}`, zone: "column", left: 30, top: 6.9, size: "xs", duration: 23, offset: 11 },
  { tex: String.raw`42_{10} = 101010_2 = \texttt{0x2A}`, zone: "column", left: 54, top: 4.1, size: "sm", duration: 17, offset: 7 },
  { tex: String.raw`S = A \oplus B,\; C = AB`, zone: "column", left: 79, top: 6.4, size: "xs", duration: 16, offset: 2 },
  { tex: String.raw`y[n] = \sum_k h[k]\,x[n-k]`, zone: "column", left: 82, top: 10.8, size: "sm", duration: 18, offset: 9 },
  { tex: String.raw`\delta(t) \xrightarrow{\;h\;} h(t)`, zone: "column", left: 88, top: 14.6, size: "xs", duration: 21, offset: 15 },
  { tex: String.raw`X(\omega) = \int x(t)\,e^{-j\omega t}\,dt`, zone: "column", left: 63, top: 22.6, size: "xs", duration: 20, offset: 0 },
  { tex: String.raw`\mathcal{Z}\{a^n u[n]\} = \frac{z}{z - a}`, zone: "column", left: 86, top: 21.8, size: "xs", duration: 24, offset: 5 },
  { tex: String.raw`\operatorname{sinc} x = \frac{\sin \pi x}{\pi x}`, zone: "column", left: 2, top: 23.5, size: "sm", duration: 18, offset: 12 },
  { tex: String.raw`(-1)^s \times 1.f \times 2^{\,e-127}`, zone: "column", left: 31, top: 23.3, size: "xs", duration: 22, offset: 16 },
  // Footer.
  { tex: String.raw`e^{i\pi} + 1 = 0`, zone: "column", left: 80, bottom: 1.5, size: "sm", duration: 20, offset: 8 },
  // Left margin.
  { tex: String.raw`\tau = RC`, zone: "left", left: 30, top: 9, size: "sm", duration: 17, offset: 4 },
  { tex: String.raw`H(s) = \frac{1}{s + a}`, zone: "left", left: 12, top: 27, size: "xs", duration: 21, offset: 13 },
  { tex: String.raw`\overline{A}\,\overline{B}`, zone: "left", left: 50, top: 45, size: "base", duration: 19, offset: 1 },
  { tex: String.raw`z = e^{sT}`, zone: "left", left: 20, top: 61, size: "sm", duration: 23, offset: 10 },
  { tex: String.raw`\texttt{0xFF}`, zone: "left", left: 45, top: 78, size: "xs", duration: 16, offset: 6 },
  // Right margin.
  { tex: String.raw`s = \sigma + j\omega`, zone: "right", left: 18, top: 16, size: "xs", duration: 20, offset: 7 },
  { tex: String.raw`A \oplus B`, zone: "right", left: 48, top: 35, size: "base", duration: 18, offset: 14 },
  { tex: String.raw`V = IR`, zone: "right", left: 25, top: 52, size: "sm", duration: 22, offset: 3 },
  { tex: String.raw`\omega_0 = 2\pi f_0`, zone: "right", left: 10, top: 70, size: "xs", duration: 17, offset: 11 },
  { tex: String.raw`\delta[n]`, zone: "right", left: 55, top: 86, size: "sm", duration: 21, offset: 0 },
];

/** A scope trace scrolling right to left. */
export type Trace = Spot & {
  kind: "sine" | "clock" | "fourier";
  /** Width of one period, in px. A multiple of the 60px graph-paper grid. */
  period: number;
  /** Peak height above the centre line, in px. */
  amplitude: number;
  /** Seconds to scroll one period. */
  duration: number;
  /** Tailwind stroke class. */
  stroke: string;
};

export const TRACES: Trace[] = [
  // Beside the intro paragraph.
  { kind: "sine", zone: "column", left: 63, right: 0, top: 18.2, period: 240, amplitude: 18, duration: 7, stroke: "stroke-accent" },
  // In the band between the panels and the footer.
  { kind: "sine", zone: "column", left: 0, right: 0, bottom: 5.6, period: 360, amplitude: 9, duration: 12, stroke: "stroke-sig-z", always: true },
  { kind: "fourier", zone: "left", left: 0, right: 0, top: 36, period: 180, amplitude: 14, duration: 9, stroke: "stroke-sig-z" },
  { kind: "clock", zone: "right", left: 0, right: 0, top: 61, period: 120, amplitude: 10, duration: 5, stroke: "stroke-muted" },
];

/** Odd harmonics in the "fourier" trace: few enough that the ripple still shows. */
const FOURIER_TERMS = 3;

/**
 * SVG path of a trace `width` px wide, centred on y = 0. Every trace starts a period at
 * x = 0, so shifting the path left by one period draws the same picture: that is what lets
 * the backdrop loop the scroll without a seam.
 */
export function tracePath(trace: Pick<Trace, "kind" | "period" | "amplitude">, width: number): string {
  const { kind, period, amplitude: a } = trace;
  if (kind === "clock") {
    // High for the first half period, low for the second.
    const half = period / 2;
    let d = `M0,${-a}`;
    for (let x = half, high = true; x < width + half; x += half, high = !high) {
      d += `H${x}V${high ? a : -a}`;
    }
    return d;
  }
  const level = (t: number) =>
    kind === "sine" ? Math.sin(2 * Math.PI * t) : squareWaveSum(t, FOURIER_TERMS) / (4 / Math.PI);
  const points: string[] = [];
  for (let x = 0; x <= width; x += 3) {
    points.push(`${x},${(-a * level(x / period)).toFixed(2)}`);
  }
  return `M${points.join("L")}`;
}
