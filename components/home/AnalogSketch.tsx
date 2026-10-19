/**
 * An RC circuit pencilled in with dashed lines: a source driving a resistor into a capacitor.
 * It stands in for the preview of the analog simulator, which is planned but not built.
 */
export function AnalogSketch() {
  return (
    <svg viewBox="0 0 360 200" className="w-full" role="img" aria-label="Sketch of a resistor-capacitor circuit">
      <g fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 5" className="stroke-muted">
        {/* Wires: source up to the resistor, on to the capacitor, and back along the bottom. */}
        <path d="M70 78 V40 H130 M210 40 H290 V90 M290 110 V160 H70 V122" />
        {/* Source. */}
        <circle cx={70} cy={100} r={22} />
      </g>
      <g fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-muted" opacity={0.8}>
        <path d="M58 100 q6 -12 12 0 t12 0" />
        {/* Resistor. */}
        <path d="M130 40 l7 -10 l13 20 l13 -20 l13 20 l13 -20 l13 20 l8 -10" />
        {/* Capacitor plates. */}
        <path d="M270 90 H310 M270 110 H310" />
      </g>
      <g className="fill-muted font-mono text-[13px]">
        <text x={170} y={70} textAnchor="middle">
          R
        </text>
        <text x={322} y={105}>
          C
        </text>
        <text x={30} y={105} textAnchor="end">
          v
        </text>
      </g>
    </svg>
  );
}
