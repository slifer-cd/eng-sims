import { memo } from "react";
import { WIRE_IDLE } from "@/lib/acs/editor/colors";
import type { PartItem } from "@/lib/acs/editor/scene";
import type { SwitchValue } from "@/lib/acs/sim/element";
import { PartSymbol, type SymbolStyle } from "./symbols";

interface PartViewProps {
  item: PartItem;
  style: SymbolStyle;
  /** Lead colour per terminal id, from the node voltages. */
  leads?: Record<string, string>;
  switchValue?: SwitchValue;
  /** Live value shown by probes and net labels, e.g. "3.3 V". */
  reading?: string;
  /** Terminals with no wire, comma-separated; they get an open-circle marker. */
  openPins?: string;
  selected?: boolean;
  /** Part named by the current simulation problem. */
  error?: boolean;
  ghost?: boolean;
}

function labelText({ item, reading }: PartViewProps) {
  const { comp, spec, props } = item;
  if (spec?.id === "netlabel") return reading;
  if (spec?.id === "probe") return [comp.label || String(props.name), reading].filter(Boolean).join(" ");
  return [comp.label, spec?.valueLabel?.(props)].filter(Boolean).join(" ");
}

export const PartView = memo(function PartView(props: PartViewProps) {
  const { item, style, leads, switchValue, selected, error, ghost } = props;
  const { comp, spec, bounds } = item;
  const size = spec?.bounds ?? { w: 40, h: 40 };
  const f = comp.flip ? -1 : 1;
  const text = labelText(props);
  // Beside the body: above a wide part, to the right of a tall one.
  const wide = bounds.w >= bounds.h;
  const at = wide
    ? { x: comp.x, y: bounds.y - 9, anchor: "middle" as const }
    : { x: bounds.x + bounds.w + 9, y: comp.y + 3.5, anchor: "start" as const };
  const open = new Set(props.openPins?.split(","));

  return (
    <g
      data-hit="comp"
      data-comp={comp.id}
      className={ghost ? "pointer-events-none opacity-50" : spec?.interactive ? "cursor-pointer" : "cursor-move"}
    >
      {(selected || error) && (
        <rect
          x={bounds.x - 5}
          y={bounds.y - 5}
          width={bounds.w + 10}
          height={bounds.h + 10}
          rx={5}
          className={error ? "fill-sig-x/10 stroke-sig-x" : "fill-accent/10 stroke-accent"}
          strokeDasharray={error ? "4 3" : undefined}
        />
      )}
      <g transform={`translate(${comp.x} ${comp.y}) rotate(${comp.rotation}) scale(1 ${f})`}>
        <rect x={-size.w / 2} y={-size.h / 2} width={size.w} height={size.h} fill="transparent" />
        <PartSymbol
          partId={comp.chipId}
          props={item.props}
          style={style}
          lead={(id) => leads?.[id] ?? WIRE_IDLE}
          switchValue={switchValue}
          uid={`p-${comp.id}`}
          upright={`scale(1 ${f}) rotate(${-comp.rotation})`}
        />
        {spec?.terminals.map((t) => (
          <g key={t.id}>
            {open.has(t.id) && (
              <circle cx={t.x} cy={t.y} r={2.5} className="fill-canvas stroke-chip-stroke" strokeWidth={1} pointerEvents="none" />
            )}
            <circle
              cx={t.x}
              cy={t.y}
              r={7}
              fill="transparent"
              className="cursor-crosshair"
              data-hit="pin"
              data-comp={comp.id}
              data-pin={t.id}
            >
              <title>{t.name}</title>
            </circle>
          </g>
        ))}
      </g>
      {text && (
        <text
          x={at.x}
          y={at.y}
          textAnchor={at.anchor}
          className="fill-chip-text stroke-canvas font-mono text-[10px] select-none"
          strokeWidth={3}
          paintOrder="stroke"
          pointerEvents="none"
        >
          {text}
        </text>
      )}
    </g>
  );
}, samePart);

function samePart(a: PartViewProps, b: PartViewProps) {
  if (
    a.item !== b.item ||
    a.style !== b.style ||
    a.switchValue !== b.switchValue ||
    a.reading !== b.reading ||
    a.openPins !== b.openPins ||
    a.selected !== b.selected ||
    a.error !== b.error ||
    a.ghost !== b.ghost
  ) {
    return false;
  }
  const ka = Object.keys(a.leads ?? {}), kb = Object.keys(b.leads ?? {});
  return ka.length === kb.length && ka.every((k) => a.leads![k] === b.leads?.[k]);
}
