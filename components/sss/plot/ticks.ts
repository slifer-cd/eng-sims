/* Axis ticks and value ranges for the canvas plots. */

export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
}

/** Round-numbered ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

export function formatTick(v: number, step: number): string {
  if (v === 0) return "0";
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  if (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && decimals > 6)) return v.toExponential(1);
  return v.toFixed(Math.min(decimals, 6)).replace("-", "−");
}

/** Ticks at multiples of π/k, labelled with π. */
export function piTicks(min: number, max: number, count = 5): { value: number; label: string }[] {
  const span = (max - min) / Math.PI;
  const options = [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
  const unit = options.find((u) => span / u <= count + 1) ?? 64;
  const out: { value: number; label: string }[] = [];
  const first = Math.ceil(min / (unit * Math.PI) - 1e-9);
  for (let k = first; k * unit * Math.PI <= max + 1e-9; k++) {
    const m = k * unit; // multiple of π
    out.push({ value: m * Math.PI, label: piLabel(m) });
  }
  return out;
}

function piLabel(m: number): string {
  if (Math.abs(m) < 1e-12) return "0";
  const sign = m < 0 ? "−" : "";
  const a = Math.abs(m);
  for (const d of [1, 2, 4]) {
    const n = a * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      const nn = Math.round(n);
      const num = nn === 1 ? "π" : `${nn}π`;
      return d === 1 ? `${sign}${num}` : `${sign}${num}/${d}`;
    }
  }
  return `${sign}${a.toFixed(2)}π`;
}

/**
 * A y-range for values: ignores non-finite values and isolated spikes (a 1/ω pole would
 * otherwise squash everything to a flat line), pads a little, optionally includes 0.
 */
export function autoRange(values: Iterable<number>, opts: { includeZero?: boolean; pad?: number } = {}): [number, number] {
  const vals: number[] = [];
  for (const v of values) if (Number.isFinite(v)) vals.push(v);
  if (vals.length === 0) return [-1, 1];
  vals.sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(p * (vals.length - 1))))];
  let lo = vals[0];
  let hi = vals[vals.length - 1];
  const p1 = q(0.01);
  const p99 = q(0.99);
  const core = Math.max(p99 - p1, 1e-12);
  if (hi - p99 > 4 * core) hi = p99 + 0.5 * core;
  if (p1 - lo > 4 * core) lo = p1 - 0.5 * core;
  if (opts.includeZero !== false) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi - lo < 1e-9) {
    const c = hi;
    lo = c - 1;
    hi = c + 1;
  }
  const pad = (hi - lo) * (opts.pad ?? 0.1);
  return [lo - (lo === 0 && opts.includeZero !== false && vals[0] >= 0 ? pad * 0.3 : pad), hi + pad];
}
