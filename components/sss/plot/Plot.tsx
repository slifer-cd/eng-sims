"use client";

/*
 * Canvas plot. Pages draw in data coordinates through `draw(api)`; the plot owns sizing,
 * HiDPI, the graph-paper grid, axes, ticks, theme colours, hover readout and zoom/pan.
 * Animated pages pass a clock: every tick redraws without re-rendering React.
 */

import { useEffect, useRef } from "react";
import type { Clock } from "../anim/clock";
import { formatTick, niceStep, niceTicks, piTicks } from "./ticks";

export interface PlotColors {
  surface: string;
  grid: string;
  gridMajor: string;
  axis: string;
  text: string;
  muted: string;
  accent: string;
  series: string[];
}

const FALLBACK = {
  light: {
    surface: "#fbfcff",
    grid: "#e6ecf5",
    gridMajor: "#d3dceb",
    axis: "#8a9ab5",
    text: "#171717",
    muted: "#5a6a86",
    accent: "#2563eb",
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
  },
  dark: {
    surface: "#0e1626",
    grid: "#18233a",
    gridMajor: "#22304c",
    axis: "#5d6f92",
    text: "#ededed",
    muted: "#93a3c0",
    accent: "#60a5fa",
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"],
  },
};

/** Theme colours from the CSS tokens, with fallbacks in case a stale stylesheet lacks them. */
export function readColors(el: Element): PlotColors {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const fb = dark ? FALLBACK.dark : FALLBACK.light;
  const cs = getComputedStyle(el);
  const v = (name: string, d: string) => cs.getPropertyValue(name).trim() || d;
  return {
    surface: v("--plot-surface", fb.surface),
    grid: v("--plot-grid", fb.grid),
    gridMajor: v("--plot-grid-major", fb.gridMajor),
    axis: v("--plot-axis", fb.axis),
    text: v("--foreground", fb.text),
    muted: v("--muted", fb.muted),
    accent: v("--accent", fb.accent),
    series: [1, 2, 3, 4, 5].map((i) => v(`--plot-${i}`, fb.series[i - 1])),
  };
}

export interface LineStyle {
  color: string;
  width?: number;
  dash?: number[];
  alpha?: number;
}

export interface PlotApi {
  ctx: CanvasRenderingContext2D;
  colors: PlotColors;
  /** Visible data window. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Plot area in CSS pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  px(x: number): number;
  py(y: number): number;
  /** Data units per CSS pixel along x (for choosing a sample count). */
  samples: number;
  curve(xs: ArrayLike<number>, ys: ArrayLike<number>, style: LineStyle): void;
  /** Shade between the curve and y = 0 (or `base`). */
  area(xs: ArrayLike<number>, ys: ArrayLike<number>, color: string, alpha?: number, base?: number): void;
  /** Dirac impulses as arrows with their area as label. */
  impulses(items: { at: number; height: number; label?: string; order?: number }[], color: string): void;
  /** Lollipop stems for sequences. */
  stems(xs: ArrayLike<number>, ys: ArrayLike<number>, color: string, opts?: { radius?: number; alpha?: number; hollow?: boolean }): void;
  vline(x: number, style: LineStyle): void;
  hline(y: number, style: LineStyle): void;
  dot(x: number, y: number, color: string, r?: number): void;
  label(text: string, x: number, y: number, opts?: { color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; dx?: number; dy?: number; bold?: boolean }): void;
}

export interface Readout {
  label: string;
  value: string;
  color?: string;
}

export interface PlotProps {
  /** Initial x window; changing it resets zoom. */
  x: [number, number];
  y: [number, number];
  height?: number;
  draw: (api: PlotApi) => void;
  clock?: Clock;
  xLabel?: string;
  /** Label the x axis in multiples of π. */
  xPi?: boolean;
  /** Values under the cursor, for the hover box. */
  readout?: (x: number) => Readout[] | null;
  xName?: string;
  legend?: { label: string; color: string; dashed?: boolean }[];
  ariaLabel: string;
  /** Allow ctrl/⌘ + wheel zoom and drag panning. */
  interactive?: boolean;
  className?: string;
}

const M = { left: 46, right: 12, top: 10, bottom: 24 };

export function Plot(props: PlotProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    view: props.x as [number, number],
    hover: null as number | null,
    drag: null as { startX: number; view: [number, number] } | null,
    width: 0,
    colors: null as PlotColors | null,
    font: "system-ui, sans-serif",
  });
  // The latest props, for the imperative draw (refs are written in effects, never in render).
  const propsRef = useRef(props);
  const renderRef = useRef<(() => void) | null>(null);
  const clock = props.clock;
  const height = props.height ?? 240;

  useEffect(() => {
    propsRef.current = props;
  });

  const [xa, xb] = props.x;
  useEffect(() => {
    state.current.view = [xa, xb];
  }, [xa, xb]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const s = state.current;
    s.font = getComputedStyle(wrap).fontFamily || s.font;
    s.colors = readColors(wrap);

    const render = () => {
      const p = propsRef.current;
      const w = s.width;
      if (w <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const H = p.height ?? 240;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlot(ctx, w, H, p, s.view, s.hover, s.colors ?? readColors(wrap), s.font);
    };

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // Hidden routes (Activity) measure 0×0: keep the last size and skip drawing.
      if (w <= 0) return;
      s.width = w;
      render();
    });
    ro.observe(wrap);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      s.colors = readColors(wrap);
      render();
    };
    media.addEventListener("change", onTheme);

    const toX = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const plotW = s.width - M.left - M.right;
      const [x0, x1] = s.view;
      return x0 + ((clientX - rect.left - M.left) / plotW) * (x1 - x0);
    };
    const onMove = (e: PointerEvent) => {
      if (s.drag && propsRef.current.interactive !== false) {
        const plotW = s.width - M.left - M.right;
        const [a, b] = s.drag.view;
        const dx = ((e.clientX - s.drag.startX) / plotW) * (b - a);
        s.view = [a - dx, b - dx];
      }
      s.hover = toX(e.clientX);
      render();
    };
    const onLeave = () => {
      s.hover = null;
      s.drag = null;
      render();
    };
    const onDown = (e: PointerEvent) => {
      if (propsRef.current.interactive === false) return;
      s.drag = { startX: e.clientX, view: s.view };
      canvas.setPointerCapture(e.pointerId);
    };
    const onUp = () => {
      s.drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      // Plain wheel scrolls the page; ctrl/⌘ + wheel (or a pinch) zooms.
      if (!(e.ctrlKey || e.metaKey) || propsRef.current.interactive === false) return;
      e.preventDefault();
      const at = toX(e.clientX);
      const k = Math.exp(e.deltaY * 0.0015);
      const [a, b] = s.view;
      s.view = [at - (at - a) * k, at + (b - at) * k];
      render();
    };
    const onDouble = () => {
      s.view = propsRef.current.x;
      render();
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDouble);

    const unsub = clock?.subscribe(render);
    renderRef.current = render;
    render();
    return () => {
      ro.disconnect();
      media.removeEventListener("change", onTheme);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDouble);
      unsub?.();
      renderRef.current = null;
    };
  }, [clock]);

  // Redraw whenever the page passes new drawing props.
  useEffect(() => {
    renderRef.current?.();
  });

  return (
    <div className={props.className}>
      {props.legend && props.legend.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          {props.legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden>
                <line
                  x1="1"
                  y1="4"
                  x2="17"
                  y2="4"
                  style={{ stroke: l.color }}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={l.dashed ? "4 3" : undefined}
                />
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={props.ariaLabel}
          className="absolute inset-0 h-full w-full touch-pan-y rounded-lg"
          style={{ cursor: props.interactive === false ? "default" : "crosshair" }}
        />
      </div>
    </div>
  );
}

function drawPlot(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: PlotProps,
  view: [number, number],
  hover: number | null,
  colors: PlotColors,
  font: string,
) {
  const [x0, x1] = view;
  const [y0, y1] = p.y;
  const left = M.left;
  const top = M.top;
  const width = Math.max(10, W - M.left - M.right);
  const height = Math.max(10, H - M.top - M.bottom);
  const px = (x: number) => left + ((x - x0) / (x1 - x0)) * width;
  const py = (y: number) => top + (1 - (y - y0) / (y1 - y0)) * height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(left, top, width, height);

  // Graph paper: minor lines at a fifth of the major step, major lines at the ticks.
  const xTicks = p.xPi ? piTicks(x0, x1, Math.max(3, Math.floor(width / 90))) : null;
  const xs = xTicks ? xTicks.map((t) => t.value) : niceTicks(x0, x1, Math.max(3, Math.floor(width / 80)));
  const ys = niceTicks(y0, y1, Math.max(3, Math.floor(height / 45)));
  const xStep = xs.length > 1 ? xs[1] - xs[0] : niceStep(x1 - x0, 5);
  const yStep = ys.length > 1 ? ys[1] - ys[0] : niceStep(y1 - y0, 4);
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  for (let v = Math.ceil(x0 / (xStep / 5)) * (xStep / 5); v <= x1; v += xStep / 5) {
    const X = Math.round(px(v)) + 0.5;
    ctx.moveTo(X, top);
    ctx.lineTo(X, top + height);
  }
  for (let v = Math.ceil(y0 / (yStep / 5)) * (yStep / 5); v <= y1; v += yStep / 5) {
    const Y = Math.round(py(v)) + 0.5;
    ctx.moveTo(left, Y);
    ctx.lineTo(left + width, Y);
  }
  ctx.stroke();
  ctx.strokeStyle = colors.gridMajor;
  ctx.beginPath();
  for (const v of xs) {
    const X = Math.round(px(v)) + 0.5;
    ctx.moveTo(X, top);
    ctx.lineTo(X, top + height);
  }
  for (const v of ys) {
    const Y = Math.round(py(v)) + 0.5;
    ctx.moveTo(left, Y);
    ctx.lineTo(left + width, Y);
  }
  ctx.stroke();

  // Axes through the origin when visible.
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  if (y0 <= 0 && y1 >= 0) {
    const Y = Math.round(py(0)) + 0.5;
    ctx.moveTo(left, Y);
    ctx.lineTo(left + width, Y);
  }
  if (x0 <= 0 && x1 >= 0) {
    const X = Math.round(px(0)) + 0.5;
    ctx.moveTo(X, top);
    ctx.lineTo(X, top + height);
  }
  ctx.stroke();

  // Tick labels.
  ctx.fillStyle = colors.muted;
  ctx.font = `11px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  xs.forEach((v, i) => {
    const label = xTicks ? xTicks[i].label : formatTick(v, xStep);
    ctx.fillText(label, px(v), top + height + 6);
  });
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const v of ys) ctx.fillText(formatTick(v, yStep), left - 6, py(v));
  if (p.xLabel) {
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = `italic 12px ${font}`;
    ctx.fillStyle = colors.muted;
    ctx.fillText(p.xLabel, left + width - 4, top + height - 4);
  }

  // Page layers, clipped to the plot area.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  const api: PlotApi = {
    ctx,
    colors,
    x0,
    x1,
    y0,
    y1,
    left,
    top,
    width,
    height,
    px,
    py,
    samples: Math.max(200, Math.min(4000, Math.round(width * 2))),
    curve(xsA, ysA, style) {
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width ?? 2;
      ctx.globalAlpha = style.alpha ?? 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (style.dash) ctx.setLineDash(style.dash);
      ctx.beginPath();
      let pen = false;
      const clampY = (v: number) => Math.max(top - 1000, Math.min(top + height + 1000, v));
      for (let i = 0; i < xsA.length; i++) {
        const yv = ysA[i];
        if (!Number.isFinite(yv)) {
          pen = false;
          continue;
        }
        const X = px(xsA[i]);
        const Y = clampY(py(yv));
        if (pen) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
        pen = true;
      }
      ctx.stroke();
      ctx.restore();
    },
    area(xsA, ysA, color, alpha = 0.18, base = 0) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let started = false;
      let firstX = 0;
      let lastX = 0;
      const B = py(base);
      for (let i = 0; i < xsA.length; i++) {
        const yv = ysA[i];
        if (!Number.isFinite(yv)) continue;
        const X = px(xsA[i]);
        const Y = Math.max(top - 1000, Math.min(top + height + 1000, py(yv)));
        if (!started) {
          ctx.moveTo(X, B);
          firstX = X;
          started = true;
        }
        ctx.lineTo(X, Y);
        lastX = X;
      }
      if (started) {
        ctx.lineTo(lastX, B);
        ctx.lineTo(firstX, B);
        ctx.fill();
      }
      ctx.restore();
    },
    impulses(items, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      for (const it of items) {
        const X = px(it.at);
        const Y0 = py(0);
        const clipped = Math.max(top + 4, Math.min(top + height - 4, py(it.height)));
        ctx.beginPath();
        ctx.moveTo(X, Y0);
        ctx.lineTo(X, clipped);
        ctx.stroke();
        const dir = it.height >= 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(X, clipped);
        ctx.lineTo(X - 5, clipped + 8 * dir);
        ctx.lineTo(X + 5, clipped + 8 * dir);
        ctx.closePath();
        ctx.fill();
        if (it.order) {
          ctx.beginPath();
          ctx.arc(X, clipped + 12 * dir, 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (it.label) {
          ctx.font = `600 11px ${font}`;
          ctx.textAlign = "left";
          ctx.textBaseline = dir > 0 ? "top" : "bottom";
          ctx.fillStyle = colors.text;
          ctx.fillText(it.label, X + 6, clipped + (dir > 0 ? 0 : 0));
          ctx.fillStyle = color;
        }
      }
      ctx.restore();
    },
    stems(xsA, ysA, color, opts = {}) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.75;
      ctx.globalAlpha = opts.alpha ?? 1;
      const r = opts.radius ?? 3.5;
      const Y0 = py(0);
      for (let i = 0; i < xsA.length; i++) {
        const yv = ysA[i];
        if (!Number.isFinite(yv)) continue;
        const X = px(xsA[i]);
        const Y = Math.max(top - 50, Math.min(top + height + 50, py(yv)));
        ctx.beginPath();
        ctx.moveTo(X, Y0);
        ctx.lineTo(X, Y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X, Y, r, 0, Math.PI * 2);
        if (opts.hollow) {
          ctx.fillStyle = colors.surface;
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = color;
        } else ctx.fill();
      }
      ctx.restore();
    },
    vline(x, style) {
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width ?? 1.5;
      ctx.globalAlpha = style.alpha ?? 1;
      if (style.dash) ctx.setLineDash(style.dash);
      const X = px(x);
      ctx.beginPath();
      ctx.moveTo(X, top);
      ctx.lineTo(X, top + height);
      ctx.stroke();
      ctx.restore();
    },
    hline(y, style) {
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width ?? 1.5;
      ctx.globalAlpha = style.alpha ?? 1;
      if (style.dash) ctx.setLineDash(style.dash);
      const Y = py(y);
      ctx.beginPath();
      ctx.moveTo(left, Y);
      ctx.lineTo(left + width, Y);
      ctx.stroke();
      ctx.restore();
    },
    dot(x, y, color, r = 4.5) {
      if (!Number.isFinite(y)) return;
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = colors.surface;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(x), py(y), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
    label(text, x, y, opts = {}) {
      ctx.save();
      ctx.fillStyle = opts.color ?? colors.text;
      ctx.font = `${opts.bold ? "600 " : ""}12px ${font}`;
      ctx.textAlign = opts.align ?? "left";
      ctx.textBaseline = opts.baseline ?? "middle";
      ctx.fillText(text, px(x) + (opts.dx ?? 0), py(y) + (opts.dy ?? 0));
      ctx.restore();
    },
  };
  p.draw(api);

  // Hover crosshair and readout.
  if (hover !== null && hover >= x0 && hover <= x1) {
    const X = px(hover);
    ctx.strokeStyle = colors.axis;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(X) + 0.5, top);
    ctx.lineTo(Math.round(X) + 0.5, top + height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const rows = p.readout?.(hover);
    if (rows && rows.length) {
      const lines = [{ label: p.xName ?? "t", value: fmtReadout(hover) }, ...rows];
      ctx.font = `12px ${font}`;
      const textW = Math.max(...lines.map((l) => ctx.measureText(`${l.label} = ${l.value}`).width));
      const boxW = textW + 22;
      const boxH = lines.length * 17 + 8;
      const bx = X + 12 + boxW > left + width ? X - 12 - boxW : X + 12;
      const by = top + 6;
      ctx.fillStyle = colors.surface;
      ctx.globalAlpha = 0.94;
      ctx.strokeStyle = colors.gridMajor;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      lines.forEach((l, i) => {
        const ly = by + 12 + i * 17;
        if ("color" in l && l.color) {
          ctx.fillStyle = l.color;
          ctx.fillRect(bx + 7, ly - 4, 7, 7);
        }
        ctx.fillStyle = colors.text;
        ctx.fillText(`${l.label} = ${l.value}`, bx + 18, ly);
      });
    }
  }
  ctx.restore();

  // Frame.
  ctx.strokeStyle = colors.gridMajor;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
}

export function fmtReadout(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(3).replace("-", "−");
  return Number(v.toPrecision(4)).toString().replace("-", "−");
}
