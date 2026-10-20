"use client";

import { useState } from "react";
import { useAutoplay } from "./useAutoplay";

/** One byte from the calculators. It flips a random bit now and then until the visitor flips one. */
export function BitsPreview() {
  const [byte, setByte] = useState(0b1101_0110);
  const stop = useAutoplay(() => {
    setByte((b) => b ^ (1 << Math.floor(Math.random() * 8)));
  }, 1400);
  const signed = byte & 0x80 ? byte - 256 : byte;
  return (
    <div>
      <div role="group" aria-label="Bits of the byte" className="flex justify-center gap-1.5">
        {Array.from({ length: 8 }, (_, i) => {
          const bit = 7 - i;
          const on = (byte >> bit) & 1;
          return (
            <button
              key={bit}
              type="button"
              onClick={() => {
                stop();
                setByte((b) => b ^ (1 << bit));
              }}
              aria-label={`Bit ${bit}, ${on}`}
              aria-pressed={!!on}
              className={`grid h-12 w-9 place-items-center rounded-md border font-mono text-lg transition-colors ${
                on ? "border-accent bg-accent/15 font-semibold text-accent" : "border-line bg-background text-muted dark:bg-panel"
              } ${bit === 3 ? "mr-2" : ""}`}
            >
              {on}
            </button>
          );
        })}
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        {[
          ["Unsigned", String(byte)],
          ["Signed", String(signed)],
          ["Hex", `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-mono text-lg" aria-live="polite">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">Click a bit to flip it.</p>
    </div>
  );
}
