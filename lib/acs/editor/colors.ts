/*
 * Wire and lead colours by voltage: grey at 0 V, mixing towards green for positive and red
 * for negative voltages. The CSS vars have fallbacks in case the dev server serves stale CSS.
 */

export const VOLT_POS = "var(--volt-pos, #16a34a)";
export const VOLT_NEG = "var(--volt-neg, #dc2626)";
export const VOLT_ZERO = "var(--volt-zero, #7c8aa3)";
export const WIRE_IDLE = "var(--wire, #475569)";

/** Colour for voltage `v` on a scale where ±`range` is full colour. Rounded to 5% steps so views can skip redraws. */
export function voltColor(v: number | undefined, range: number): string {
  if (v === undefined || !Number.isFinite(v)) return WIRE_IDLE;
  const t = Math.max(-1, Math.min(1, v / range));
  const pct = Math.round((Math.abs(t) * 100) / 5) * 5;
  if (pct === 0) return VOLT_ZERO;
  return `color-mix(in oklab, ${t > 0 ? VOLT_POS : VOLT_NEG} ${pct}%, ${VOLT_ZERO})`;
}
