"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { fmtReadout } from "../plot/Plot";
import { type Clock, useClockValue } from "./clock";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/** Play/pause, restart, speed and a scrub slider for an animation clock. */
export function Transport(props: {
  clock: Clock;
  /** What the clock runs over, e.g. "t" or "ω". */
  label: string;
  /** Space toggles play (only one transport per page should take it). */
  hotkey?: boolean;
  format?: (v: number) => string;
  className?: string;
}) {
  const { clock } = props;
  const playing = useClockValue(clock, (_, p) => p);
  const value = useClockValue(clock, (v) => v);
  const speed = useClockValue(clock, () => clock.speed());
  const [from, to] = clock.range();
  const hotkey = props.hotkey ?? false;

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, button, [contenteditable]") || t.isContentEditable)) return;
      e.preventDefault();
      clock.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clock, hotkey]);

  const btn = "grid size-8 place-items-center rounded-md border border-line bg-panel hover:bg-hover";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${props.className ?? ""}`}>
      <button
        type="button"
        className={`${btn} ${playing ? "" : "border-accent/50 text-accent"}`}
        onClick={() => clock.toggle()}
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause" : `Play${hotkey ? " (Space)" : ""}`}
      >
        {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
      </button>
      <button type="button" className={btn} onClick={() => clock.restart()} aria-label="Play from the start" title="Play from the start">
        <RotateCcw size={15} aria-hidden />
      </button>
      <input
        type="range"
        min={from}
        max={to}
        step={(to - from) / 1000}
        value={value}
        onChange={(e) => {
          clock.pause();
          clock.set(Number(e.target.value));
        }}
        aria-label={`Scrub ${props.label}`}
        className="min-w-24 flex-1 accent-accent"
      />
      <span className="w-24 text-sm tabular-nums text-muted">
        {props.label} = {props.format ? props.format(value) : fmtReadout(value)}
      </span>
      <select
        value={speed}
        onChange={(e) => clock.setSpeed(Number(e.target.value))}
        aria-label="Animation speed"
        className="h-8 rounded-md border border-line bg-panel px-1.5 text-sm"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </div>
  );
}
