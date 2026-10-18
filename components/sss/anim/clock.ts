/*
 * Animation clock: a value that runs from `from` to `to` in `seconds` (at 1× speed).
 * Canvases subscribe and redraw imperatively; React readouts use useClockValue with a
 * coarse selector so they don't re-render every frame.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

export interface ClockOptions {
  from: number;
  to: number;
  /** Seconds for a full run at 1× speed. */
  seconds: number;
  loop?: boolean;
  /** Start value; defaults to `from`. */
  initial?: number;
}

export interface Clock {
  get(): number;
  set(v: number): void;
  isPlaying(): boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  restart(): void;
  speed(): number;
  setSpeed(s: number): void;
  range(): [number, number];
  setRange(from: number, to: number): void;
  subscribe(cb: () => void): () => void;
}

export function createClock(opts: ClockOptions): Clock {
  let from = opts.from;
  let to = opts.to;
  let value = opts.initial ?? opts.from;
  let playing = false;
  let speed = 1;
  let raf = 0;
  let last = 0;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((cb) => cb());

  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const span = to - from;
    value += (span / opts.seconds) * dt * speed;
    if (value >= to) {
      if (opts.loop) value = from + ((value - from) % span);
      else {
        value = to;
        playing = false;
      }
    }
    emit();
    if (playing) raf = requestAnimationFrame(tick);
  };

  const clock: Clock = {
    get: () => value,
    set(v) {
      value = Math.min(to, Math.max(from, v));
      emit();
    },
    isPlaying: () => playing,
    play() {
      if (playing) return;
      if (value >= to) value = from;
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
      emit();
    },
    pause() {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(raf);
      emit();
    },
    toggle() {
      if (playing) clock.pause();
      else clock.play();
    },
    restart() {
      value = from;
      emit();
      clock.play();
    },
    speed: () => speed,
    setSpeed(s) {
      speed = s;
      emit();
    },
    range: () => [from, to],
    setRange(f, t) {
      if (f === from && t === to) return;
      from = f;
      to = t;
      value = Math.min(to, Math.max(from, value));
      emit();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
  return clock;
}

/** One clock per component; paused when the component is hidden or unmounted. */
export function useClock(opts: ClockOptions): Clock {
  const [clock] = useState(() => createClock(opts));
  useEffect(() => clock.setRange(opts.from, opts.to), [clock, opts.from, opts.to]);
  useEffect(() => () => clock.pause(), [clock]);
  return clock;
}

/** Re-render when select(value) changes. */
export function useClockValue<T>(clock: Clock, select: (v: number, playing: boolean) => T): T {
  return useSyncExternalStore(
    clock.subscribe,
    () => select(clock.get(), clock.isPlaying()),
    () => select(clock.get(), false),
  );
}
