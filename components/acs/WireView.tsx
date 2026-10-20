import { memo } from "react";
import type { WireItem } from "@/lib/acs/editor/scene";
import type { Point } from "@/lib/model/types";

const toAttr = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

export const WireView = memo(function WireView(props: { item: WireItem; color: string; selected?: boolean }) {
  const { item, color, selected } = props;
  const { wire, points } = item;
  const ends = [
    wire.a.kind === "wire" ? points[0] : null,
    wire.b.kind === "wire" ? points[points.length - 1] : null,
  ].filter((p): p is Point => p !== null);

  return (
    <g data-hit="wire" data-wire={wire.id} className="cursor-pointer">
      <polyline points={toAttr(points)} fill="none" stroke="transparent" strokeWidth={10} pointerEvents="stroke" />
      {selected && (
        <polyline
          points={toAttr(points)}
          fill="none"
          className="stroke-accent"
          strokeOpacity={0.35}
          strokeWidth={8}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}
      <polyline
        points={toAttr(points)}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
      {ends.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} style={{ fill: color }} />
      ))}
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
