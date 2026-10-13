import { memo } from "react";
import { BIT_CELL, BIT_GAP, MAX_BIT_CELLS } from "@/lib/editor/layout";
import type { SceneComp } from "@/lib/editor/scene";
import { type Value, bit, formatValue, signalKind } from "@/lib/sim/value";

interface Props {
  item: SceneComp;
  selected?: boolean;
  /** Translucent preview while placing; ignores the pointer. */
  ghost?: boolean;
  /** Simulated value shown by Input/Output Pins and the Clock. */
  value?: Value;
}

const BIT_FILL = { "1": "fill-sig-1", "0": "fill-chip", Z: "fill-sig-z", X: "fill-sig-x" } as const;
const SIGNAL_TEXT = { one: "fill-sig-1", zero: "fill-chip-text", z: "fill-sig-z", x: "fill-sig-x" } as const;

/**
 * A component drawn as a rectangular body with pins. Hit targets carry data-hit
 * attributes that the Canvas reads to decide what a click landed on.
 */
export const ChipView = memo(function ChipView({ item, selected, ghost, value }: Props) {
  const { comp, look, layout, bounds } = item;
  const { w, h } = layout;
  const isPin = comp.chipId === "input" || comp.chipId === "output";
  const width = isPin ? look.pins[0].width : 1;

  return (
    <g opacity={ghost ? 0.5 : 1} pointerEvents={ghost ? "none" : undefined}>
      <g
        transform={`translate(${comp.x} ${comp.y}) rotate(${comp.rotation})`}
        data-hit="comp"
        data-comp={comp.id}
        className="cursor-move"
      >
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={4}
          className={selected ? "fill-chip stroke-accent" : "fill-chip stroke-chip-stroke"}
          style={look.color ? { fill: look.color } : undefined}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        {isPin && width <= MAX_BIT_CELLS ? (
          <BitCells
            compId={comp.id}
            width={width}
            value={value}
            rotation={comp.rotation}
            clickable={comp.chipId === "input"}
          />
        ) : (
          <text
            transform={`rotate(${-comp.rotation})`}
            textAnchor="middle"
            dominantBaseline="central"
            className={`font-mono text-[11px] font-semibold select-none ${
              value && (isPin || comp.chipId === "clock") ? SIGNAL_TEXT[signalKind(value)] : "fill-chip-text"
            }`}
            pointerEvents="none"
          >
            {isPin ? (value ? formatValue(value) : "–") : look.short}
          </text>
        )}
        {layout.pins.map(({ pin, x, y }) => (
          <g key={pin.id}>
            {look.pinLabels && (
              <text
                x={x + (pin.side === "left" ? 5 : pin.side === "right" ? -5 : 0)}
                y={y + (pin.side === "top" ? 9 : pin.side === "bottom" ? -8 : 0)}
                textAnchor={pin.side === "left" ? "start" : pin.side === "right" ? "end" : "middle"}
                dominantBaseline="central"
                className="fill-muted font-mono text-[8px] select-none"
                pointerEvents="none"
              >
                {pin.name}
              </text>
            )}
            <circle
              cx={x}
              cy={y}
              r={pin.width > 1 ? 4 : 3}
              className="fill-chip stroke-chip-stroke"
              strokeWidth={1.5}
              pointerEvents="none"
            />
            {/* Larger invisible hit target. */}
            <circle
              cx={x}
              cy={y}
              r={7}
              fill="transparent"
              data-hit="pin"
              data-comp={comp.id}
              data-pin={pin.id}
              className="cursor-crosshair"
            >
              <title>{`${pin.name}${pin.width > 1 ? ` [${pin.width}]` : ""}`}</title>
            </circle>
          </g>
        ))}
      </g>
      {comp.label && (
        <text
          x={comp.x}
          y={bounds.y - 6}
          textAnchor="middle"
          className="fill-chip-text text-[10px] select-none"
          pointerEvents="none"
        >
          {comp.label}
        </text>
      )}
    </g>
  );
});

/** One cell per bit, most significant on the left. Input Pin cells toggle their bit on click. */
function BitCells(props: { compId: string; width: number; value?: Value; rotation: number; clickable: boolean }) {
  const { compId, width, value, rotation, clickable } = props;
  const step = BIT_CELL + BIT_GAP;
  const x0 = -(width * step - BIT_GAP) / 2;
  return (
    <>
      {Array.from({ length: width }, (_, i) => {
        const b = width - 1 - i;
        const state = value ? bit(value, b) : "0";
        const x = x0 + i * step;
        return (
          <g
            key={b}
            {...(clickable && { "data-hit": "comp", "data-comp": compId, "data-bit": b })}
            className={clickable ? "cursor-pointer" : undefined}
          >
            <rect
              x={x}
              y={-BIT_CELL / 2}
              width={BIT_CELL}
              height={BIT_CELL}
              rx={2}
              className={`${BIT_FILL[state]} stroke-chip-stroke`}
              strokeWidth={1}
            />
            <text
              x={x + BIT_CELL / 2}
              y={0}
              transform={`rotate(${-rotation} ${x + BIT_CELL / 2} 0)`}
              textAnchor="middle"
              dominantBaseline="central"
              className={`font-mono text-[9px] font-semibold select-none ${state === "0" ? "fill-chip-text" : "fill-chip"}`}
              pointerEvents="none"
            >
              {state}
            </text>
          </g>
        );
      })}
    </>
  );
}
