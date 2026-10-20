"use client";

import { useEffect, useState } from "react";
import { voltColor } from "@/lib/acs/editor/colors";
import { useAutoplay } from "./useAutoplay";

const SOURCE = 5;
/** Time constant of the drawing, in seconds of real time. */
const TAU = 0.7;

/**
 * An RC circuit from the circuit simulator. The two-way switch charges the capacitor from the
 * source or discharges it to ground, flipping by itself until the visitor clicks it. Wires are
 * coloured by voltage, as in the simulator.
 */
export function CircuitPreview() {
  const [toSource, setToSource] = useState(true);
  // The exponential the capacitor voltage is following: from `from` towards `to`, since `at`.
  const [curve, setCurve] = useState({ from: 0, to: SOURCE, at: 0 });
  const [now, setNow] = useState(0);
  const vc = curve.at === 0 ? curve.from : curve.to + (curve.from - curve.to) * Math.exp(-(now - curve.at) / 1000 / TAU);

  const flip = () => {
    const t = performance.now();
    setCurve({ from: vc, to: toSource ? 0 : SOURCE, at: t });
    setToSource(!toSource);
    setNow(t);
  };
  const stop = useAutoplay(flip, 3200);

  // Animate until the capacitor has settled. The first frame starts the first charge.
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settled = (t: number) => Math.abs((curve.from - curve.to) * Math.exp(-(t - curve.at) / 1000 / TAU)) < 0.005;
    let frame = requestAnimationFrame(function tick(t) {
      if (curve.at === 0) return setCurve({ ...curve, at: t });
      if (still) return setNow(curve.at + 1e9);
      setNow(t);
      if (!settled(t)) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [curve]);

  const c = (v: number) => voltColor(v, SOURCE);
  const top = c(SOURCE), zero = c(0), out = c(vc), com = c(toSource ? SOURCE : 0);
  const line = { fill: "none", strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" } as const;

  return (
    <div>
      <svg viewBox="0 0 360 200" className="w-full" role="img" aria-label="Resistor-capacitor circuit with a two-way switch">
        {/* Source + up to the switch's A contact; ground wire along the bottom, with the B contact. */}
        <path d="M60 80 V40 H100" style={{ stroke: top }} {...line} />
        <path d="M60 120 V160 H290 V112 M100 72 V160" style={{ stroke: zero }} {...line} />
        {/* Switch common to the resistor, and the resistor on to the capacitor. */}
        <path d="M140 40 H160" style={{ stroke: com }} {...line} />
        <path d="M160 40 l5 -8 l10 16 l10 -16 l10 16 l10 -16 l10 16 l5 -8" style={{ stroke: com }} {...line} opacity={0.9} />
        <path d="M220 40 H290 V88" style={{ stroke: out }} {...line} />
        {/* Battery. */}
        <path d="M46 92 H74" className="stroke-chip-stroke" strokeWidth={2.5} />
        <path d="M53 104 H67" className="stroke-chip-stroke" strokeWidth={4} />
        <path d="M60 80 V92 M60 104 V120" className="stroke-chip-stroke" strokeWidth={2} />
        {/* Capacitor plates, and a bar showing its charge. */}
        <path d="M270 88 H310 M270 112 H310" className="stroke-chip-stroke" strokeWidth={3} />
        <rect x={322} y={60} width={10} height={80} rx={2} className="fill-none stroke-line" strokeWidth={1.5} />
        <rect x={322} y={140 - (80 * vc) / SOURCE} width={10} height={(80 * vc) / SOURCE} rx={2} style={{ fill: out }} />
        {/* Two-way switch. */}
        <g
          role="button"
          tabIndex={0}
          aria-label={`Switch: ${toSource ? "charging from the source" : "discharging to ground"}. Click to flip.`}
          className="cursor-pointer outline-none"
          onClick={() => {
            stop();
            flip();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              stop();
              flip();
            }
          }}
        >
          <rect x={88} y={24} width={64} height={60} fill="transparent" />
          <path d={`M140 40 L${toSource ? "102 40" : "102 70"}`} style={{ stroke: com }} {...line} />
          {[
            [100, 40],
            [100, 72],
            [140, 40],
          ].map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={3.5} className="fill-chip stroke-chip-stroke" strokeWidth={1.5} />
          ))}
        </g>
        <g className="fill-muted font-mono text-[13px]">
          <text x={190} y={22} textAnchor="middle">
            1 kΩ
          </text>
          <text x={28} y={104} textAnchor="end">
            5 V
          </text>
          <text x={258} y={104} textAnchor="end">
            C
          </text>
        </g>
      </svg>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>Click the switch to charge or discharge.</span>
        <output className="font-mono tabular-nums">v_C = {vc.toFixed(2)} V</output>
      </div>
    </div>
  );
}
