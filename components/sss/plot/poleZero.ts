/* Pole-zero diagrams on a Plot: × poles, ○ zeros, ROC shading, the jω axis or unit circle. */

import type { C } from "@/lib/sss/math/complex";
import type { Root } from "@/lib/sss/math/poly";
import type { Strip } from "@/lib/sss/transforms/sdomain";
import type { PlotApi } from "./Plot";

/** A square window around the poles and zeros (and the origin). */
export function pzWindow(points: C[], extra: number[] = [], min = 2): [number, number] {
  const r = Math.max(min, ...points.flatMap((p) => [Math.abs(p.re), Math.abs(p.im)]), ...extra.filter(Number.isFinite).map(Math.abs)) * 1.35;
  return [-r, r];
}

export interface PoleZeroOptions {
  poles: Root[];
  zeros: Root[] | null;
  roc?: Strip | null;
  /** z-plane: draw the unit circle; the ROC is an annulus rmin < |z| < rmax. */
  annulus?: { rmin: number; rmax: number } | null;
  zPlane?: boolean;
}

export function drawPoleZero(api: PlotApi, o: PoleZeroOptions) {
  const { ctx, colors } = api;
  ctx.save();
  // ROC shading.
  if (!o.zPlane && o.roc) {
    const lo = Math.max(api.x0, o.roc.lo);
    const hi = Math.min(api.x1, o.roc.hi);
    if (hi > lo) {
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(api.px(lo), api.top, api.px(hi) - api.px(lo), api.height);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = colors.accent;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.25;
      for (const b of [o.roc.lo, o.roc.hi]) {
        if (!Number.isFinite(b)) continue;
        ctx.beginPath();
        ctx.moveTo(api.px(b), api.top);
        ctx.lineTo(api.px(b), api.top + api.height);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }
  if (o.zPlane) {
    const cx = api.px(0);
    const cy = api.py(0);
    const r = (v: number) => Math.abs(api.px(v) - api.px(0));
    if (o.annulus) {
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      const outer = Number.isFinite(o.annulus.rmax) ? r(o.annulus.rmax) : 4000;
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      if (o.annulus.rmin > 0) ctx.arc(cx, cy, r(o.annulus.rmin), 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, r(1), 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // The jω axis: where the Fourier transform lives.
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(api.px(0), api.top);
    ctx.lineTo(api.px(0), api.top + api.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const zeroColor = colors.series[0];
  const poleColor = colors.series[1];
  for (const z of o.zeros ?? []) {
    const X = api.px(z.p.re);
    const Y = api.py(z.p.im);
    ctx.strokeStyle = zeroColor;
    ctx.lineWidth = 2.25;
    ctx.beginPath();
    ctx.arc(X, Y, 6, 0, Math.PI * 2);
    ctx.stroke();
    if (z.mult > 1) mult(api, X, Y, z.mult, zeroColor);
  }
  for (const p of o.poles) {
    const X = api.px(p.p.re);
    const Y = api.py(p.p.im);
    ctx.strokeStyle = poleColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(X - 6, Y - 6);
    ctx.lineTo(X + 6, Y + 6);
    ctx.moveTo(X + 6, Y - 6);
    ctx.lineTo(X - 6, Y + 6);
    ctx.stroke();
    if (p.mult > 1) mult(api, X, Y, p.mult, poleColor);
  }
  ctx.restore();
}

function mult(api: PlotApi, X: number, Y: number, m: number, color: string) {
  api.ctx.fillStyle = color;
  api.ctx.font = "600 11px system-ui, sans-serif";
  api.ctx.textAlign = "left";
  api.ctx.textBaseline = "bottom";
  api.ctx.fillText(`(${m})`, X + 8, Y - 4);
}
