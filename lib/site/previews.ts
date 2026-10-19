/*
 * Maths behind the live previews on the home page: the half adder in the logic panel and
 * the Fourier series of a square wave in the signals panel.
 */

export function halfAdder(a: boolean, b: boolean): { sum: boolean; carry: boolean } {
  return { sum: a !== b, carry: a && b };
}

/**
 * Partial Fourier sum of a ±1 square wave with period 1 at time `t`, using the first
 * `terms` odd harmonics (1, 3, 5, …). A fractional count fades the next harmonic in, so an
 * animation can grow the sum smoothly.
 */
export function squareWaveSum(t: number, terms: number): number {
  let sum = 0;
  for (let n = 0; n < Math.ceil(terms); n++) {
    const k = 2 * n + 1;
    const weight = Math.min(1, terms - n);
    sum += (weight * Math.sin(2 * Math.PI * k * t)) / k;
  }
  return (4 / Math.PI) * sum;
}

/**
 * Leaves headroom for the largest partial sum, the fundamental alone at 4/π, so the Gibbs
 * overshoot never leaves the box.
 */
const PEAK = 1.3;

/** SVG path of `squareWaveSum` across a box, with the zero line through its middle. */
export function squareWavePath(
  terms: number,
  box: { width: number; height: number; periods: number; samples: number },
): string {
  const mid = box.height / 2;
  const points: string[] = [];
  for (let i = 0; i <= box.samples; i++) {
    const x = (i / box.samples) * box.width;
    const y = mid - (squareWaveSum((i / box.samples) * box.periods, terms) / PEAK) * mid;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${points.join("L")}`;
}

/** SVG path of the square wave itself, on the same scale as `squareWavePath`. */
export function squareWaveIdealPath(box: { width: number; height: number; periods: number }): string {
  const mid = box.height / 2;
  const levels = [mid - mid / PEAK, mid + mid / PEAK].map((y) => y.toFixed(2));
  const half = box.width / (2 * box.periods);
  let d = `M0.00,${levels[0]}`;
  for (let i = 1; i <= 2 * box.periods; i++) {
    d += `H${(i * half).toFixed(2)}`;
    if (i < 2 * box.periods) d += `V${levels[i % 2]}`;
  }
  return d;
}
