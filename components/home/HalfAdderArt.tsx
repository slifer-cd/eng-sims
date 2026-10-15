/**
 * A static picture of a half adder as the logic simulator draws it: Input Pins, XOR and
 * AND gates, and LEDs, with A = B = 1 so the carry is lit. Uses the editor's theme tokens.
 */
export function HalfAdderArt() {
  const on = "stroke-sig-1", off = "stroke-sig-0";
  return (
    <svg viewBox="0 0 360 200" className="w-full" role="img" aria-label="Half adder circuit: inputs A and B feed an XOR gate for the sum and an AND gate for the carry">
      {/* Wires: both inputs are 1, so everything is high except the sum. */}
      <g fill="none" strokeWidth={2.5} strokeLinejoin="round">
        <path d="M80 60 H120 V55 H170" className={on} />
        <path d="M120 60 V135 H170" className={on} />
        <path d="M80 140 H140 V75 H170" className={on} />
        <path d="M140 140 V155 H170" className={on} />
        <path d="M230 65 H290" className={off} />
        <path d="M230 145 H290" className={on} />
      </g>
      <g className="fill-sig-1">
        <circle cx={120} cy={60} r={4} />
        <circle cx={140} cy={140} r={4} />
      </g>

      <Input x={20} y={45} label="A" />
      <Input x={20} y={125} label="B" />
      <Gate x={170} y={40} label="XOR" />
      <Gate x={170} y={120} label="AND" />
      <Led cx={310} cy={65} lit={false} label="SUM" />
      <Led cx={310} cy={145} lit label="CARRY" />
    </svg>
  );
}

function Input({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={60} height={30} rx={5} className="fill-chip stroke-chip-stroke" strokeWidth={1.5} />
      <rect x={x + 22} y={y + 8} width={16} height={14} rx={2} className="fill-sig-1" />
      <text x={x + 30} y={y + 15} textAnchor="middle" dominantBaseline="central" className="fill-chip font-mono text-[10px] font-semibold">
        1
      </text>
      <text x={x + 30} y={y - 7} textAnchor="middle" className="fill-chip-text text-[11px]">
        {label}
      </text>
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
        style={lit ? { filter: "drop-shadow(0 0 6px #ef4444)" } : undefined}
      />
      <text x={cx} y={cy + 36} textAnchor="middle" className="fill-muted font-mono text-[10px]">
        {label}
      </text>
    </g>
  );
}
