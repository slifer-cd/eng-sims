"use client";

/*
 * |X(s)| over a patch of the s-plane as a shaded 3-D surface (log scale, clipped at the
 * poles). Drawn with the painter's algorithm on a 2-D canvas; drag to orbit. The ROC is
 * tinted, the jω-axis slice (the Fourier magnitude) and an optional σ slice are traced.
 */

import { useEffect, useMemo, useRef } from "react";
import { type C, cabs } from "@/lib/sss/math/complex";
import type { Strip } from "@/lib/sss/transforms/sdomain";
import type { Clock } from "../anim/clock";
import { readColors } from "./Plot";

interface Props {
  at: (s: C) => C;
  sigma: [number, number];
  omega: [number, number];
  roc: Strip | null;
  /** σ of the highlighted slice (from the σ-sweep clock). */
  clock?: Clock;
  height?: number;
  ariaLabel: string;
}

const NS = 40;
const NW = 56;

// Sequential blue ramp (light → dark), and a muted one for outside the ROC.
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

function rampColor(h: number, inRoc: boolean): string {
  const x = Math.max(0, Math.min(1, h)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const c = mix(RAMP[i], RAMP[i + 1], x - i);
  if (inRoc) return c;
  // Outside the ROC: wash towards grey.
  const g = c.match(/\d+/g)!.map(Number);
  const m = (g[0] + g[1] + g[2]) / 3;
  return `rgb(${g.map((v) => Math.round(v * 0.35 + m * 0.65)).join(",")})`;
}

export function Surface3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({ az: -0.75, el: 0.75, width: 0 });
  const renderRef = useRef<(() => void) | null>(null);
  const height = props.height ?? 320;
  const { at, sigma, omega, roc, clock } = props;

  // Heights: log10|X| on the grid, clipped to a robust range.
  const grid = useMemo(() => {
    const z = new Float64Array((NS + 1) * (NW + 1));
    const vals: number[] = [];
    for (let i = 0; i <= NS; i++) {
      for (let k = 0; k <= NW; k++) {
        const s = { re: sigma[0] + ((sigma[1] - sigma[0]) * i) / NS, im: omega[0] + ((omega[1] - omega[0]) * k) / NW };
        const m = cabs(at(s));
        const v = Number.isFinite(m) && m > 0 ? Math.log10(m) : NaN;
        z[i * (NW + 1) + k] = v;
        if (Number.isFinite(v)) vals.push(v);
      }
    }
    vals.sort((a, b) => a - b);
    const lo = vals.length ? vals[Math.floor(vals.length * 0.02)] : -1;
    let hi = vals.length ? vals[Math.floor(vals.length * 0.9)] : 1;
    if (hi - lo < 0.5) hi = lo + 0.5;
    const top = hi + (hi - lo) * 0.25;
    for (let i = 0; i < z.length; i++) {
      const v = z[i];
      z[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - lo) / (top - lo))) : 1;
    }
    return z;
  }, [at, sigma, omega]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const v = view.current;
    const render = () => {
      const W = v.width;
      if (W <= 0) return;
      const H = height;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(W * dpr)) canvas.width = Math.round(W * dpr);
      if (canvas.height !== Math.round(H * dpr)) canvas.height = Math.round(H * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = readColors(wrap);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = colors.surface;
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 8);
      ctx.fill();

      const { az, el } = v;
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      const ce = Math.cos(el);
      const se = Math.sin(el);
      // Fit the box (base plus the tallest surface) to the canvas at the current angle.
      const raw = (x: number, y: number, z: number) => {
        const xr = x * ca - y * sa;
        const yr = x * sa + y * ca;
        return { u: xr, v: -(yr * se + z * ce), depth: yr * ce - z * se };
      };
      const box = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [0, 0.75].map((z) => raw(x, y, z))));
      const uMin = Math.min(...box.map((b) => b.u));
      const uMax = Math.max(...box.map((b) => b.u));
      const vMin = Math.min(...box.map((b) => b.v));
      const vMax = Math.max(...box.map((b) => b.v));
      const pad = 24;
      const scale = Math.min((W - 2 * pad) / (uMax - uMin), (H - 2 * pad) / (vMax - vMin));
      const ox = W / 2 - (scale * (uMin + uMax)) / 2;
      const oy = H / 2 - (scale * (vMin + vMax)) / 2;
      // Grid point (i, k) → world (x, y, z) in [−1, 1]² × [0, 0.75].
      const proj = (x: number, y: number, z: number) => {
        const r = raw(x, y, z);
        return { X: ox + scale * r.u, Y: oy + scale * r.v, depth: r.depth };
      };
      const P = (i: number, k: number) => proj((2 * i) / NS - 1, (2 * k) / NW - 1, grid[i * (NW + 1) + k] * 0.75);

      // Base frame.
      ctx.strokeStyle = colors.gridMajor;
      ctx.lineWidth = 1;
      const corners = [proj(-1, -1, 0), proj(1, -1, 0), proj(1, 1, 0), proj(-1, 1, 0)];
      ctx.beginPath();
      corners.forEach((c, i) => (i ? ctx.lineTo(c.X, c.Y) : ctx.moveTo(c.X, c.Y)));
      ctx.closePath();
      ctx.stroke();

      const quads: { d: number; pts: { X: number; Y: number }[]; h: number; inRoc: boolean }[] = [];
      for (let i = 0; i < NS; i++) {
        const sc = sigma[0] + ((sigma[1] - sigma[0]) * (i + 0.5)) / NS;
        const inRoc = !!roc && sc > roc.lo && sc < roc.hi;
        for (let k = 0; k < NW; k++) {
          const a = P(i, k);
          const b = P(i + 1, k);
          const c = P(i + 1, k + 1);
          const d = P(i, k + 1);
          const h = (grid[i * (NW + 1) + k] + grid[(i + 1) * (NW + 1) + k] + grid[(i + 1) * (NW + 1) + k + 1] + grid[i * (NW + 1) + k + 1]) / 4;
          quads.push({ d: (a.depth + b.depth + c.depth + d.depth) / 4, pts: [a, b, c, d], h, inRoc });
        }
      }
      quads.sort((p, q) => q.d - p.d);
      ctx.lineWidth = 0.5;
      for (const q of quads) {
        const col = rampColor(q.h, q.inRoc);
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.beginPath();
        q.pts.forEach((p, i) => (i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Slices: the jω axis (σ = 0) and the swept σ.
      const slice = (s: number, color: string, width: number) => {
        if (s < sigma[0] || s > sigma[1]) return;
        const x = (2 * (s - sigma[0])) / (sigma[1] - sigma[0]) - 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        const iF = ((s - sigma[0]) / (sigma[1] - sigma[0])) * NS;
        const i0 = Math.max(0, Math.min(NS - 1, Math.floor(iF)));
        const fi = iF - i0;
        for (let k = 0; k <= NW; k++) {
          // Height from the grid (bilinear along σ), so the slice sits on the surface.
          const g = grid[i0 * (NW + 1) + k] * (1 - fi) + grid[(i0 + 1) * (NW + 1) + k] * fi;
          const p = proj(x, (2 * k) / NW - 1, g * 0.75 + 0.01);
          if (k) ctx.lineTo(p.X, p.Y);
          else ctx.moveTo(p.X, p.Y);
        }
        ctx.stroke();
      };
      slice(0, colors.series[2], 2.5);
      if (clock) slice(clock.get(), colors.series[1], 2.5);

      // Axis labels.
      ctx.fillStyle = colors.muted;
      ctx.font = "italic 12px system-ui, sans-serif";
      const lx = proj(1.12, -1, 0);
      const ly = proj(-1, 1.12, 0);
      ctx.fillText("σ", lx.X, lx.Y);
      ctx.fillText("jω", ly.X, ly.Y);
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("drag to turn", 10, H - 10);
    };

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w <= 0) return;
      v.width = w;
      render();
    });
    ro.observe(wrap);
    let drag: { x: number; y: number; az: number; el: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, az: v.az, el: v.el };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      v.az = drag.az + (e.clientX - drag.x) * 0.01;
      v.el = Math.max(0.15, Math.min(1.45, drag.el + (e.clientY - drag.y) * 0.01));
      render();
    };
    const up = () => {
      drag = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    const unsub = clock?.subscribe(render);
    renderRef.current = render;
    render();
    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      unsub?.();
      renderRef.current = null;
    };
  }, [grid, at, sigma, omega, roc, clock, height]);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={props.ariaLabel} className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing" />
    </div>
  );
}
