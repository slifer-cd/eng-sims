import { type Value, isKnown } from "./value";

/*
 * The 16×16 screens are double-buffered: on a rising clock edge, `clear` wipes the
 * buffer, then `write` stores one pixel in it, then `show` copies the buffer to the
 * screen. Nothing reaches the screen until `show`.
 */

export const SCREEN_SIZE = 16;

export interface ScreenState {
  /** Clock level at the last evaluation: 0, 1, or -1 when unknown. */
  clk: number;
  /** Pixels written since the last clear, row by row from the top left. */
  buffer: number[];
  /** Pixels on screen. Replaced, never changed in place, so views can compare it by reference. */
  screen: readonly number[];
}

export function newScreen(): ScreenState {
  const blank = new Array<number>(SCREEN_SIZE * SCREEN_SIZE).fill(0);
  // Unknown until first seen, so a clock that starts high isn't taken as an edge.
  return { clk: -1, buffer: [...blank], screen: blank };
}

const level = (v: Value) => (isKnown(v) ? v.v : -1);

/**
 * Apply one evaluation. `inputs` are the screen's input pins in order: x, y, the data
 * pins, write, clear, show, clk. The pixel value is the data pins concatenated, the
 * first pin in the highest bits (r, g, b → 0xRGB).
 */
export function stepScreen(s: ScreenState, inputs: Value[]) {
  const [x, y, ...rest] = inputs;
  const [write, clear, show, clk] = rest.splice(-4);
  const now = level(clk);
  const rising = s.clk === 0 && now === 1;
  s.clk = now;
  if (!rising) return;

  if (level(clear) === 1) s.buffer.fill(0);
  if (level(write) === 1 && isKnown(x) && isKnown(y) && rest.every(isKnown)) {
    s.buffer[y.v * SCREEN_SIZE + x.v] = rest.reduce((acc, d) => (acc << d.width) | d.v, 0);
  }
  if (level(show) === 1) s.screen = s.buffer.slice();
}
