import { halfAdder } from "@/lib/site/previews";

/**
 * A picture of a half adder as the logic simulator draws it: Input Pins, XOR and AND gates,
 * and LEDs. Wires and LEDs follow the inputs. With `onToggle`, the inputs are buttons.
 * Uses the editor's theme tokens.
 */
export function HalfAdderArt({
  a = true,
  b = true,
  onToggle,
}: {
  a?: boolean;
  b?: boolean;
  onToggle?: (input: "a" | "b") => void;
}) {
  const { sum, carry } = halfAdder(a, b);
  const wire = (high: boolean) => `transition-colors ${high ? "stroke-sig-1" : "stroke-sig-0"}`;
  return (
    <svg
      viewBox="0 0 360 200"
      className="w-full"
      role="group"
      aria-label={`Half adder circuit: A is ${+a}, B is ${+b}, so the sum is ${+sum} and the carry is ${+carry}`}
    >
      <g fill="none" strokeWidth={2.5} strokeLinejoin="round">
        <path d="M80 60 H120 V55 H170" className={wire(a)} />
        <path d="M120 60 V135 H170" className={wire(a)} />
        <path d="M80 140 H140 V75 H170" className={wire(b)} />
        <path d="M140 140 V155 H170" className={wire(b)} />
        <path d="M230 65 H290" className={wire(sum)} />
        <path d="M230 145 H290" className={wire(carry)} />
      </g>
      <circle cx={120} cy={60} r={4} className={`transition-colors ${a ? "fill-sig-1" : "fill-sig-0"}`} />
      <circle cx={140} cy={140} r={4} className={`transition-colors ${b ? "fill-sig-1" : "fill-sig-0"}`} />

      <Input x={20} y={45} label="A" high={a} onToggle={onToggle && (() => onToggle("a"))} />
      <Input x={20} y={125} label="B" high={b} onToggle={onToggle && (() => onToggle("b"))} />
      <Gate x={170} y={40} label="XOR" />
      <Gate x={170} y={120} label="AND" />
      <Led cx={310} cy={65} lit={sum} label="SUM" />
      <Led cx={310} cy={145} lit={carry} label="CARRY" />
    </svg>
  );
}

function Input(props: { x: number; y: number; label: string; high: boolean; onToggle?: () => void }) {
  const { x, y, label, high, onToggle } = props;
  const pin = (
    <>
      <rect x={x} y={y} width={60} height={30} rx={5} className="fill-chip stroke-chip-stroke" strokeWidth={1.5} />
      <rect x={x + 22} y={y + 8} width={16} height={14} rx={2} className={`transition-colors ${high ? "fill-sig-1" : "fill-sig-0"}`} />
      <text x={x + 30} y={y + 15} textAnchor="middle" dominantBaseline="central" className="fill-chip font-mono text-[10px] font-semibold">
        {+high}
      </text>
      <text x={x + 30} y={y - 7} textAnchor="middle" className="fill-chip-text text-[11px]">
        {label}
      </text>
    </>
  );
  if (!onToggle) return <g>{pin}</g>;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={high}
      aria-label={`Input ${label}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onToggle();
      }}
      className="group cursor-pointer outline-none"
    >
      {/* Focus ring, drawn in the SVG because an outline on a <g> isn't reliable. */}
      <rect
        x={x - 4}
        y={y - 4}
        width={68}
        height={38}
        rx={8}
        fill="none"
        strokeWidth={2}
        className="stroke-accent opacity-0 group-focus-visible:opacity-100"
      />
      {pin}
    </g>
  );
}

function Gate({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={60} height={50} rx={5} className="fill-chip stroke-chip-stroke" strokeWidth={1.5} />
      <text x={x + 30} y={y + 25} textAnchor="middle" dominantBaseline="central" className="fill-chip-text font-mono text-[12px] font-semibold">
        {label}
      </text>
    </g>
  );
}

function Led({ cx, cy, lit, label }: { cx: number; cy: number; lit: boolean; label: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={20} fill="#0a0d12" />
      <circle
        cx={cx}
        cy={cy}
        r={14}
        fill="#ef4444"
        opacity={lit ? 1 : 0.18}
        className="transition-opacity"
        style={lit ? { filter: "drop-shadow(0 0 6px #ef4444)" } : undefined}
      />
      <text x={cx} y={cy + 36} textAnchor="middle" className="fill-muted font-mono text-[10px]">
        {label}
      </text>
    </g>
  );
}
