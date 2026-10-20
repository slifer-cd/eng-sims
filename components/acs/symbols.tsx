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

function Capacitor({ lead }: SymbolProps) {
  return (
    <>
      <Lead x1={-30} y1={0} x2={-4} y2={0} color={lead("a")} />
      <Lead x1={4} y1={0} x2={30} y2={0} color={lead("b")} />
      <line x1={-4} y1={-12} x2={-4} y2={12} style={{ stroke: lead("a") }} strokeWidth={3} />
      <line x1={4} y1={-12} x2={4} y2={12} style={{ stroke: lead("b") }} strokeWidth={3} />
    </>
  );
}

/** Coil humps from x0 to x1 along y = 0, bulging up (towards −y). */
function humps(x0: number, x1: number, n: number) {
  const w = (x1 - x0) / n;
  let d = `M${x0} 0`;
  for (let i = 0; i < n; i++) d += ` a${w / 2} ${w / 2} 0 0 1 ${w} 0`;
  return d;
}

function Inductor({ style, lead, uid }: SymbolProps) {
  const a = lead("a"), b = lead("b");
  const grad = `${uid}-l`;
  return (
    <>
      <AlongX id={grad} from={a} to={b} x1={-20} x2={20} />
      <Lead x1={-30} y1={0} x2={-20} y2={0} color={a} />
      <Lead x1={20} y1={0} x2={30} y2={0} color={b} />
      {style === "iec" ? (
        <rect x={-18} y={-6} width={36} height={12} rx={1} style={{ fill: `url(#${grad})` }} stroke={`url(#${grad})`} strokeWidth={2} />
      ) : (
        <path d={humps(-20, 20, 4)} fill="none" stroke={`url(#${grad})`} strokeWidth={2} strokeLinecap="round" />
      )}
    </>
  );
}

/** A vertical coil from y = −20 to 20 at x, its humps facing away from the core. */
function VerticalCoil({ x, side, color }: { x: number; side: 1 | -1; color: string }) {
  let d = `M${x} -20`;
  for (let i = 0; i < 4; i++) d += ` a5 5 0 0 ${side > 0 ? 1 : 0} 0 10`;
  return <path d={d} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinecap="round" />;
}

function Transformer({ lead }: SymbolProps) {
  return (
    <>
      <Lead x1={-30} y1={-20} x2={-10} y2={-20} color={lead("p1")} />
      <Lead x1={-30} y1={20} x2={-10} y2={20} color={lead("p2")} />
      <Lead x1={30} y1={-20} x2={10} y2={-20} color={lead("s1")} />
      <Lead x1={30} y1={20} x2={10} y2={20} color={lead("s2")} />
      <VerticalCoil x={-10} side={-1} color={lead("p1")} />
      <VerticalCoil x={10} side={1} color={lead("s1")} />
      <line x1={-2} y1={-22} x2={-2} y2={22} className={BODY} strokeWidth={1.5} />
      <line x1={2} y1={-22} x2={2} y2={22} className={BODY} strokeWidth={1.5} />
      <circle cx={-20} cy={-27} r={2.2} className="fill-chip-stroke" />
      <circle cx={20} cy={-27} r={2.2} className="fill-chip-stroke" />
    </>
  );
}

/** One cycle of a waveform, `w` wide and `h` tall, centred on the origin. */
function wavePath(shape: string, w: number, h: number) {
  const x0 = -w / 2, q = w / 4;
  switch (shape) {
    case "square":
      return `M${x0} 0 V${-h / 2} H0 V${h / 2} H${w / 2} V0`;
    case "triangle":
      return `M${x0} 0 L${x0 + q} ${-h / 2} L${x0 + 3 * q} ${h / 2} L${w / 2} 0`;
    case "sawtooth":
      return `M${x0} 0 L0 ${-h / 2} V${h / 2} L${w / 2} 0`;
    default:
      return `M${x0} 0 C${x0 + q * 0.6} ${-h * 0.66} ${-q * 0.6} ${-h * 0.66} 0 0 S${w / 2 - q * 0.6} ${h * 0.66} ${w / 2} 0`;
  }
}

function Wave({ shape, w, h, y = 0 }: { shape: unknown; w: number; h: number; y?: number }) {
  return (
    <path
      d={wavePath(String(shape), w, h)}
      transform={`translate(0 ${y})`}
      fill="none"
      className={BODY}
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
  );
}

function AcSource({ lead, props, upright }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={-30} x2={0} y2={-14} color={lead("p")} />
      <Lead x1={0} y1={14} x2={0} y2={30} color={lead("n")} />
      <circle r={14} className={`fill-chip ${BODY}`} strokeWidth={1.5} />
      <Wave shape={props.waveform} w={16} h={10} />
      <Label x={-12} y={-19} upright={upright} className="fill-chip-text text-[10px]">
        +
      </Label>
    </>
  );
}

function AcRail({ lead, props }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={20} x2={0} y2={2} color={lead("p")} />
      <circle cy={-8} r={10} className={`fill-chip ${BODY}`} strokeWidth={1.5} />
      <Wave shape={props.waveform} w={12} h={8} y={-8} />
    </>
  );
}

function AcCurrentSource({ lead, props }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={-30} x2={0} y2={-14} color={lead("p")} />
      <Lead x1={0} y1={14} x2={0} y2={30} color={lead("n")} />
      <circle r={14} className={`fill-chip ${BODY}`} strokeWidth={1.5} />
      <CurrentArrow y0={8} y1={-8} />
      <g transform="translate(8 0) scale(0.5)">
        <Wave shape={props.waveform} w={14} h={10} />
      </g>
    </>
  );
}

function AcCurrentRail({ lead, props }: SymbolProps) {
  return (
    <>
      <Lead x1={0} y1={20} x2={0} y2={2} color={lead("p")} />
      <circle cy={-8} r={10} className={`fill-chip ${BODY}`} strokeWidth={1.5} />
      <CurrentArrow y0={-14} y1={-1} />
      <g transform="translate(6 -8) scale(0.45)">
        <Wave shape={props.waveform} w={14} h={10} />
      </g>
    </>
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

function PushButton({ lead, props, switchValue }: SymbolProps) {
  const closed = (switchValue === true) !== (props.normally === "closed");
  const y = closed ? -1 : -9;
  return (
    <>
      <Lead x1={-30} y1={0} x2={-14} y2={0} color={lead("a")} />
      <Lead x1={14} y1={0} x2={30} y2={0} color={lead("b")} />
      <line x1={-16} y1={y} x2={16} y2={y} className={BODY} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={0} y1={y} x2={0} y2={y - 8} className={BODY} strokeWidth={1.5} />
      <line x1={-6} y1={y - 8} x2={6} y2={y - 8} className={BODY} strokeWidth={2.5} strokeLinecap="round" />
      <Dot x={-14} y={0} />
      <Dot x={14} y={0} />
    </>
  );
}

function Relay({ lead, switchValue }: SymbolProps) {
  const on = switchValue === true;
  return (
    <>
      <polyline points="-30,-20 -15,-20 -15,-12" fill="none" style={{ stroke: lead("c1") }} strokeWidth={2} />
      <polyline points="-30,20 -15,20 -15,12" fill="none" style={{ stroke: lead("c2") }} strokeWidth={2} />
      <rect x={-23} y={-12} width={16} height={24} className={`fill-chip ${BODY}`} strokeWidth={1.5} />
      <line x1={-23} y1={12} x2={-7} y2={-12} className={BODY} strokeWidth={1} />
      <line x1={-7} y1={0} x2={10} y2={0} className={BODY} strokeWidth={1} strokeDasharray="2 2" />
      <Lead x1={30} y1={0} x2={10} y2={0} color={lead("com")} />
      <Lead x1={22} y1={-20} x2={30} y2={-20} color={lead("nc")} />
      <Lead x1={22} y1={20} x2={30} y2={20} color={lead("no")} />
      <line x1={10} y1={0} x2={21} y2={on ? 18 : -18} style={{ stroke: lead("com") }} strokeWidth={2} strokeLinecap="round" />
      <Dot x={10} y={0} />
      <Dot x={22} y={-20} />
      <Dot x={22} y={20} />
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

/** A filled arrowhead at (x, y) pointing along angle `deg` (0 = +x). */
function Arrowhead({ x, y, deg, color }: { x: number; y: number; deg: number; color?: string }) {
  return (
    <polygon
      points="0,0 -6,-3.2 -6,3.2"
      transform={`translate(${x} ${y}) rotate(${deg})`}
      className={color ? undefined : "fill-chip-stroke"}
      style={color ? { fill: color } : undefined}
    />
  );
}

function Diode({ partId, lead }: SymbolProps) {
  const a = lead("a"), k = lead("k");
  return (
    <>
      <Lead x1={-30} y1={0} x2={-8} y2={0} color={a} />
      <Lead x1={8} y1={0} x2={30} y2={0} color={k} />
      <polygon points="-8,-9 -8,9 8,0" className={`fill-chip ${BODY}`} strokeWidth={1.5} strokeLinejoin="round" />
      {partId === "zener" ? (
        <polyline points="4,-12 8,-9 8,9 12,12" fill="none" className={BODY} strokeWidth={2} />
      ) : (
        <line x1={8} y1={-9} x2={8} y2={9} className={BODY} strokeWidth={2} />
      )}
    </>
  );
}

function Bjt({ partId, lead }: SymbolProps) {
  const npn = partId === "npn";
  const c = lead("c"), e = lead("e");
  return (
    <>
      <circle cx={2} r={18} className="fill-chip/60 stroke-chip-stroke" strokeWidth={1} />
      <Lead x1={-30} y1={0} x2={-6} y2={0} color={lead("b")} />
      <line x1={-6} y1={-12} x2={-6} y2={12} className={BODY} strokeWidth={2.5} />
      <polyline points="-6,-5 10,-16 10,-30" fill="none" style={{ stroke: c }} strokeWidth={2} strokeLinejoin="round" />
      <polyline points="-6,5 10,16 10,30" fill="none" style={{ stroke: e }} strokeWidth={2} strokeLinejoin="round" />
      {npn ? <Arrowhead x={8} y={14.6} deg={34.5} /> : <Arrowhead x={-3} y={7} deg={214.5} />}
    </>
  );
}

function Jfet({ partId, lead }: SymbolProps) {
  const n = partId === "njfet";
  return (
    <>
      <Lead x1={-30} y1={0} x2={0} y2={0} color={lead("g")} />
      <line x1={0} y1={-14} x2={0} y2={14} className={BODY} strokeWidth={2.5} />
      <polyline points="0,-10 10,-10 10,-30" fill="none" style={{ stroke: lead("d") }} strokeWidth={2} strokeLinejoin="round" />
      <polyline points="0,10 10,10 10,30" fill="none" style={{ stroke: lead("s") }} strokeWidth={2} strokeLinejoin="round" />
      {n ? <Arrowhead x={-1} y={0} deg={0} /> : <Arrowhead x={-12} y={0} deg={180} />}
    </>
  );
}

/** The simplified MOSFET symbol: gate plate beside a solid channel, no body arrow; P-channel has a bubble on the gate. */
function Mosfet({ partId, lead }: SymbolProps) {
  const p = partId === "pmos";
  return (
    <>
      <Lead x1={-30} y1={0} x2={p ? -14 : -6} y2={0} color={lead("g")} />
      {p && <circle cx={-10} cy={0} r={3.5} className={`fill-chip ${BODY}`} strokeWidth={1.5} />}
      <line x1={-6} y1={-12} x2={-6} y2={12} className={BODY} strokeWidth={2} />
      <line x1={0} y1={-14} x2={0} y2={14} className={BODY} strokeWidth={2.5} />
      <polyline points="0,-10 10,-10 10,-30" fill="none" style={{ stroke: lead("d") }} strokeWidth={2} strokeLinejoin="round" />
      <polyline points="0,10 10,10 10,30" fill="none" style={{ stroke: lead("s") }} strokeWidth={2} strokeLinejoin="round" />
    </>
  );
}

function Amplifier({ partId, lead, upright }: SymbolProps) {
  return (
    <>
      <Lead x1={-30} y1={-10} x2={-20} y2={-10} color={lead("minus")} />
      <Lead x1={-30} y1={10} x2={-20} y2={10} color={lead("plus")} />
      <Lead x1={22} y1={0} x2={30} y2={0} color={lead("out")} />
      <polygon points="-20,-24 -20,24 22,0" className={`fill-chip ${BODY}`} strokeWidth={1.5} strokeLinejoin="round" />
      <Label x={-14} y={-10} upright={upright} className="fill-chip-text text-[11px]">
        −
      </Label>
      <Label x={-14} y={10} upright={upright} className="fill-chip-text text-[11px]">
        +
      </Label>
      {partId === "comparator" && (
        <polyline points="-4,4 1,4 1,-4 6,-4" fill="none" className={BODY} strokeWidth={1.2} />
      )}
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
  capacitor: Capacitor,
  inductor: Inductor,
  transformer: Transformer,
  vac: AcSource,
  "vrail-ac": AcRail,
  iac: AcCurrentSource,
  "irail-ac": AcCurrentRail,
  diode: Diode,
  zener: Diode,
  npn: Bjt,
  pnp: Bjt,
  njfet: Jfet,
  pjfet: Jfet,
  nmos: Mosfet,
  pmos: Mosfet,
  opamp: Amplifier,
  comparator: Amplifier,
  vdc: Battery,
  idc: CurrentSource,
  "vrail-dc": VoltageRail,
  "irail-dc": CurrentRail,
  ground: Ground,
  switch: Switch,
  switch2: Switch2,
  button: PushButton,
  relay: Relay,
  probe: Probe,
  netlabel: NetLabel,
};

export function PartSymbol(props: SymbolProps) {
  const Draw = SYMBOLS[props.partId] ?? Unknown;
  return <Draw {...props} />;
}
