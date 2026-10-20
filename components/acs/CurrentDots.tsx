"use client";

import { memo, useEffect, useRef } from "react";
import { type WireFlow, dotSpeed } from "@/lib/acs/editor/currents";

const toAttr = (flow: WireFlow) => flow.points.map((p) => `${p.x},${p.y}`).join(" ");
const SPACING = 14;

/**
 * Dots moving along the wires at a speed set by the current. The positions are animated in a
 * frame loop straight on the DOM, so React only renders when the currents change.
 */
export const CurrentDots = memo(function CurrentDots({ flows, running }: { flows: WireFlow[]; running: boolean }) {
  const group = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!running || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const phase = new WeakMap<Element, number>();
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (const el of group.current?.children ?? []) {
        const p = ((phase.get(el) ?? 0) + Number((el as SVGElement).dataset.speed) * dt) % SPACING;
        phase.set(el, p);
        el.setAttribute("stroke-dashoffset", String(-p));
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);

  return (
    <g ref={group} pointerEvents="none">
      {flows.map((f, i) => {
        const speed = dotSpeed(f.current);
        return speed === 0 ? null : (
          <polyline
            key={`${f.wireId}:${i}`}
            points={toAttr(f)}
            data-speed={speed}
            fill="none"
            className="stroke-accent"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray={`0 ${SPACING}`}
          />
        );
      })}
    </g>
  );
});
