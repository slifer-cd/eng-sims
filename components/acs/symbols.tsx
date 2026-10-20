import type { ReactNode } from "react";
import type { Props } from "@/lib/model/types";
import type { SwitchValue } from "@/lib/acs/sim/element";

/*
 * Schematic symbols, drawn in each part's own coordinates (terminals as in lib/acs/parts).
 * Leads take the colour of their terminal's voltage; bodies use the chip stroke colour.
 */

export type SymbolStyle = "ansi" | "iec";

export interface SymbolProps {
  partId: string;
  props: Props;
  style: SymbolStyle;
  /** Colour of each terminal's lead, by terminal id. */
  lead: (terminalId: string) => string;
  /** Live switch position, if the part is a switch. */
  switchValue?: SwitchValue;
  /** Unique per part, for gradient ids. */
  uid: string;
  /** Undoes the part's rotation and flip, so text drawn with it reads upright. */
  upright: string;
}

const BODY = "stroke-chip-stroke";

function Lead({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: color }} strokeWidth={2} strokeLinecap="round" />;
}

function Dot({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={2.2} className="fill-chip stroke-chip-stroke" strokeWidth={1.2} />;
}

/** A gradient along the part's x-axis from one lead colour to the other, for resistor and coil bodies. */
function AlongX({ id, from, to, x1, x2 }: { id: string; from: string; to: string; x1: number; x2: number }) {
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={0} x2={x2} y2={0}>
        <stop offset="0" style={{ stopColor: from }} />
        <stop offset="1" style={{ stopColor: to }} />
      </linearGradient>
    </defs>
  );
}

function zigzag(x0: number, x1: number, amp: number, peaks: number) {
  const step = (x1 - x0) / peaks;
  const pts = [`${x0},0`];
  for (let i = 0; i < peaks; i++) pts.push(`${x0 + step * (i + 0.5)},${i % 2 ? amp : -amp}`);
  pts.push(`${x1},0`);
  return pts.join(" ");
}

function Resistor({ style, lead, uid }: SymbolProps) {
  const a = lead("a"), b = lead("b");
  const grad = `${uid}-r`;
  return (
    <>
      <AlongX id={grad} from={a} to={b} x1={-20} x2={20} />
      <Lead x1={-30} y1={0} x2={-20} y2={0} color={a} />
      <Lead x1={20} y1={0} x2={30} y2={0} color={b} />
      {style === "iec" ? (
        <rect x={-18} y={-6} width={36} height={12} rx={1} fill="none" stroke={`url(#${grad})`} strokeWidth={2} />
      ) : (
        <polyline points={zigzag(-20, 20, 6, 6)} fill="none" stroke={`url(#${grad})`} strokeWidth={2} strokeLinejoin="round" />
      )}
    </>
  );
}

/** Text at (x, y) in part coordinates, kept upright however the part is turned. */
function Label(props: { x: number; y: number; upright: string; className: string; children: ReactNode }) {
  return (
    <g transform={`translate(${props.x} ${props.y}) ${props.upright}`}>
      <text y={3.5} textAnchor="middle" className={props.className}>
        {props.children}
      </text>
    </g>
  );
}

function Battery({ lead, upright }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={-30} x2={0} y2={-4} color={lead("p")} />
      <Lead x1={0} y1={4} x2={0} y2={30} color={lead("n")} />
      <line x1={-12} y1={-4} x2={12} y2={-4} className={BODY} strokeWidth={2} />
      <line x1={-6} y1={4} x2={6} y2={4} className={BODY} strokeWidth={3} />
      <Label x={-12} y={-12} upright={upright} className="fill-chip-text text-[10px]">
        +
      </Label>
    </>
  );
}

function CurrentArrow({ y0, y1 }: { y0: number; y1: number }) {
  // Points from y0 to y1.
  const dir = Math.sign(y1 - y0);
  return (
    <>
      <line x1={0} y1={y0} x2={0} y2={y1 - dir * 3} className={BODY} strokeWidth={1.5} />
      <polyline points={`-4,${y1 - dir * 5} 0,${y1} 4,${y1 - dir * 5}`} fill="none" className={BODY} strokeWidth={1.5} />
    </>
  );
}

function CurrentSource({ lead }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={-30} x2={0} y2={-14} color={lead("p")} />
      <Lead x1={0} y1={14} x2={0} y2={30} color={lead("n")} />
      <circle r={14} className={`fill-chip ${BODY}`} strokeWidth={1.5} />
      <CurrentArrow y0={8} y1={-8} />
    </>
  );
}

function VoltageRail({ lead }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={20} x2={0} y2={-6} color={lead("p")} />
      <line x1={-10} y1={-6} x2={10} y2={-6} style={{ stroke: lead("p") }} strokeWidth={2.5} strokeLinecap="round" />
    </>
  );
}

function CurrentRail({ lead }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={20} x2={0} y2={2} color={lead("p")} />
      <circle cy={-8} r={10} className={`fill-chip ${BODY}`} strokeWidth={1.5} />
      <CurrentArrow y0={-14} y1={-1} />
    </>
  );
}

function Ground({ lead }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={-10} x2={0} y2={0} color={lead("g")} />
      <line x1={-10} y1={0} x2={10} y2={0} className={BODY} strokeWidth={2} />
      <line x1={-6} y1={4} x2={6} y2={4} className={BODY} strokeWidth={2} />
      <line x1={-2} y1={8} x2={2} y2={8} className={BODY} strokeWidth={2} />
    </>
  );
}

function Switch({ lead, switchValue }: SymbolProps) {
  const closed = switchValue === true;
  return (
    <>
      <Lead x1={-30} y1={0} x2={-16} y2={0} color={lead("a")} />
      <Lead x1={16} y1={0} x2={30} y2={0} color={lead("b")} />
      <line x1={-16} y1={0} x2={closed ? 16 : 13} y2={closed ? 0 : -11} style={{ stroke: lead("a") }} strokeWidth={2} strokeLinecap="round" />
      <Dot x={-16} y={0} />
      <Dot x={16} y={0} />
    </>
  );
}

function Switch2({ lead, switchValue }: SymbolProps) {
  const toB = switchValue === "b";
  return (
    <>
      <Lead x1={-30} y1={0} x2={-14} y2={0} color={lead("com")} />
      <Lead x1={14} y1={-10} x2={30} y2={-10} color={lead("a")} />
      <Lead x1={14} y1={10} x2={30} y2={10} color={lead("b")} />
      <line x1={-14} y1={0} x2={14} y2={toB ? 10 : -10} style={{ stroke: lead("com") }} strokeWidth={2} strokeLinecap="round" />
      <Dot x={-14} y={0} />
      <Dot x={14} y={-10} />
      <Dot x={14} y={10} />
    </>
  );
}

function Probe({ lead }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={20} x2={0} y2={6} color={lead("in")} />
      <circle r={6} className="fill-chip stroke-accent" strokeWidth={2} />
      <circle r={2} className="fill-accent" />
    </>
  );
}

function NetLabel({ lead, props, upright }: SymbolProps) {
  const name = String(props.name);
  const w = Math.max(24, name.length * 6.5 + 12);
  return (
    <>
      <Lead x1={-20} y1={0} x2={-12} y2={0} color={lead("in")} />
      <polygon
        points={`-12,0 -5,-8 ${w - 12},-8 ${w - 12},8 -5,8`}
        className={`fill-chip ${BODY}`}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Label x={(w - 17) / 2} y={0} upright={upright} className="fill-chip-text font-mono text-[10px]">
        {name}
      </Label>
    </>
  );
}

function Unknown() {
  return (
    <>
      <rect x={-20} y={-20} width={40} height={40} rx={4} className="fill-chip stroke-sig-x" strokeDasharray="4 3" />
      <text y={4} textAnchor="middle" className="fill-sig-x text-[12px]">
        ?
      </text>
    </>
  );
}

const SYMBOLS: Record<string, (p: SymbolProps) => ReactNode> = {
  resistor: Resistor,
  vdc: Battery,
  idc: CurrentSource,
  "vrail-dc": VoltageRail,
  "irail-dc": CurrentRail,
  ground: Ground,
  switch: Switch,
  switch2: Switch2,
  probe: Probe,
  netlabel: NetLabel,
};

export function PartSymbol(props: SymbolProps) {
  const Draw = SYMBOLS[props.partId] ?? Unknown;
  return <Draw {...props} />;
}
