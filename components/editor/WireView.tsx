import { memo } from "react";
import type { SceneWire } from "@/lib/editor/scene";
import type { Point } from "@/lib/model/types";
import { type Value, formatValue, signalKind } from "@/lib/sim/value";

const toAttr = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

const STROKE = { one: "stroke-sig-1", zero: "stroke-sig-0", z: "stroke-sig-z", x: "stroke-sig-x" } as const;
const FILL = { one: "fill-sig-1", zero: "fill-sig-0", z: "fill-sig-z", x: "fill-sig-x" } as const;

/** Midpoint of the longest segment, where a bus value label fits best. */
function labelSpot(points: Point[]): Point {
  let best = { p: points[0], len: -1 };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best.len) best = { p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, len };
  }
  return best.p;
}

export const WireView = memo(function WireView(props: { item: SceneWire; selected?: boolean; value?: Value }) {
  const { item, selected, value } = props;
  const { wire, points, width } = item;
  const kind = value ? signalKind(value) : undefined;
  const isBus = width > 1;
  const ends = [
    wire.a.kind === "wire" ? points[0] : null,
    wire.b.kind === "wire" ? points[points.length - 1] : null,
  ].filter((p): p is Point => p !== null);
  const label = isBus && value ? { at: labelSpot(points), text: formatValue(value) } : null;

  return (
    <g data-hit="wire" data-wire={wire.id} className="cursor-pointer">
      <polyline points={toAttr(points)} fill="none" stroke="transparent" strokeWidth={10} pointerEvents="stroke" />
      {selected && (
        <polyline
          points={toAttr(points)}
          fill="none"
          className="stroke-accent"
          strokeOpacity={0.35}
          strokeWidth={isBus ? 10 : 8}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}
      <polyline
        points={toAttr(points)}
        fill="none"
        className={kind ? STROKE[kind] : "stroke-wire"}
        strokeWidth={isBus ? 4 : 2}
        strokeDasharray={kind === "z" ? "4 3" : undefined}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
      {ends.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={isBus ? 5 : 4} className={kind ? FILL[kind] : "fill-wire"} />
      ))}
      {label && (
        <text
          x={label.at.x}
          y={label.at.y - 6}
          textAnchor="middle"
          className="fill-chip-text stroke-canvas font-mono text-[9px] select-none"
          strokeWidth={3}
          paintOrder="stroke"
          pointerEvents="none"
        >
          {label.text}
        </text>
      )}
    </g>
  );
});

export function WirePreview({ points }: { points: Point[] }) {
  return (
    <polyline
      points={toAttr(points)}
      fill="none"
      className="stroke-accent"
      strokeWidth={2}
      strokeDasharray="6 4"
      pointerEvents="none"
    />
  );
}
