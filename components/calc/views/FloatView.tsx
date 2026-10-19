"use client";

import { useMemo } from "react";
import { B1, big, pad } from "@/lib/calc/bases";
import { type Decoded, decode, fieldBits, type FloatFormat, FORMATS, floatSteps, parseFloatInput, roundingError } from "@/lib/calc/ieee754";
import { useCalc } from "@/lib/calc/store";
import { Fact, Note, PageHeader, Panel, Segmented, StepsPanel } from "../../sss/ui";
import { Tex } from "../../sss/Tex";
import { BitStrip, CopyButton, PLOT_COLORS, TextField } from "../ui";

/* KaTeX's \\color takes fixed colours, not CSS vars: these sit between the light and dark plot tokens. */
const SIGN = "#e2622f";
const EXP = "#1aa676";
const FRAC = "#3380de";
const c = (color: string, tex: string) => `\\color{${color}}{${tex}}`;

/** value = (−1)^s × 1.f × 2^(e − bias), coloured like the bit strip, and the same with this number's bits filled in. */
function ValueFormula(props: { d: Decoded; fmt: FloatFormat }) {
  const { d, fmt } = props;
  const f = FORMATS[fmt];
  const generic = `\\boldsymbol{\\text{value} = (-1)^{${c(SIGN, "s")}} \\times ${c(FRAC, "1.f")} \\times 2^{${c(EXP, "e")} - ${f.bias}}}`;
  let filled: string | null = null;
  if (d.kind === "normal" || d.kind === "subnormal") {
    const frac = fieldBits(d.frac, f.frac).replace(/0+$/, "") || "0";
    const shown = frac.length > 24 ? `${frac.slice(0, 24)}\\ldots` : frac;
    const lead = d.kind === "normal" ? "1" : "0";
    const power = d.kind === "normal" ? `${c(EXP, String(d.expField))} - ${f.bias}` : `1 - ${f.bias}`;
    filled = `\\boldsymbol{= (-1)^{${c(SIGN, String(d.sign))}} \\times ${c(FRAC, `${lead}.${shown}_2`)} \\times 2^{${power}}}`;
  }
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/8 px-4 py-3">
      <div className="overflow-x-auto overflow-y-hidden text-xl text-foreground">
        <Tex tex={generic} display />
      </div>
      {filled && (
        <div className="overflow-x-auto overflow-y-hidden text-lg text-foreground">
          <Tex tex={filled} display />
        </div>
      )}
      {d.kind === "subnormal" && <p className="mt-1 text-center text-sm text-muted">Subnormal: no hidden 1, and the power is fixed at 1 − {f.bias}.</p>}
    </div>
  );
}

const KIND_NAMES = { zero: "Zero", subnormal: "Subnormal", normal: "Normal", infinity: "Infinity", nan: "NaN (not a number)" };

export function FloatView() {
  const input = useCalc((s) => s.inputs.float);
  const set = useCalc((s) => s.set);
  const fmt = input.format;
  const f = FORMATS[fmt];
  const parsed = useMemo(() => parseFloatInput(input.text, fmt), [input.text, fmt]);
  const d = useMemo(() => (parsed.ok ? decode(parsed.bits, fmt) : null), [parsed, fmt]);
  const steps = useMemo(() => (parsed.ok && d ? floatSteps(d, fmt, parsed.from) : []), [parsed, d, fmt]);
  const error = parsed.ok && parsed.from === "decimal" && d ? roundingError(parsed.typed, d) : null;
  const hex = d ? `0x${pad(d.bits.toString(16).toUpperCase(), f.bits / 4)}` : "";

  const toggle = (bit: number) => {
    if (!d) return;
    const next = d.bits ^ (B1 << big(bit));
    set("float", { ...input, text: `0x${pad(next.toString(16).toUpperCase(), f.bits / 4)}` });
  };

  return (
    <>
      <PageHeader title="Floating point">
        See how a number is stored in IEEE-754 single or double precision: the sign, exponent and fraction bits, the exact value that
        ends up stored, and how far it is from what you typed.
      </PageHeader>
      <Panel className="mb-5">
        <div className="flex flex-col gap-4">
          <TextField
            label="Number or bits"
            value={input.text}
            onChange={(text) => set("float", { ...input, text })}
            error={parsed.ok ? null : parsed.error}
            placeholder="0.1, -2.5e-3, inf, or 0x3DCCCCCD"
            hint="Type a decimal number, inf or nan, or a bit pattern with 0x or 0b to decode it."
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Format</span>
            <Segmented
              label="Format"
              value={fmt}
              options={[
                { value: "32" as FloatFormat, label: "float32" },
                { value: "64" as FloatFormat, label: "float64" },
              ]}
              onChange={(format) => {
                // A pattern typed for one width means nothing in the other; carry the value over instead.
                const text = parsed.ok && parsed.from === "bits" && d && Number.isFinite(d.value) ? String(d.value) : input.text;
                set("float", { text, format });
              }}
            />
          </div>
        </div>
      </Panel>

      {d && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title={f.name} tone="result">
              <div className="flex flex-col gap-4">
                <BitStrip
                  bits={d.bits}
                  width={f.bits}
                  onToggle={toggle}
                  label="Stored bits"
                  fields={[
                    { from: f.bits - 1, to: f.bits - 1, label: "sign", color: PLOT_COLORS[1] },
                    { from: f.bits - 2, to: f.frac, label: "exponent", color: PLOT_COLORS[2] },
                    { from: f.frac - 1, to: 0, label: "fraction", color: PLOT_COLORS[0] },
                  ]}
                />
                <ValueFormula d={d} fmt={fmt} />
                <dl>
                  <Fact label="Hex">
                    <span className="inline-flex items-center gap-1 font-mono">
                      {hex}
                      <CopyButton text={hex} label="hex pattern" />
                    </span>
                  </Fact>
                  <Fact label="Kind">{KIND_NAMES[d.kind]}</Fact>
                  <Fact label="Sign">
                    {d.sign} ({d.sign ? "negative" : "positive"})
                  </Fact>
                  <Fact label="Exponent field">
                    <span className="font-mono">
                      {fieldBits(d.expField, f.exp)} = {d.expField}
                    </span>
                    {Number.isFinite(d.e) && <span className="text-muted">
                        {" "}
                        → 2<sup>{d.e}</sup>
                      </span>}
                  </Fact>
                  <Fact label="Value">
                    <span className="font-mono">{Object.is(d.value, -0) ? "-0" : String(d.value)}</span>
                  </Fact>
                  {error !== null && (
                    <Fact label="Stored − typed">
                      <span className="font-mono">{error}</span>
                    </Fact>
                  )}
                </dl>
                {d.exact && (
                  <div className="rounded-lg bg-canvas px-3 py-2">
                    <p className="text-xs text-muted">Exact stored value</p>
                    <p className="font-mono text-sm break-all">{d.exact}</p>
                  </div>
                )}
                {error === "0" && <Note>This number is stored exactly.</Note>}
                {error !== null && error !== "0" && (
                  <Note>
                    {parsed.ok && parsed.from === "decimal" ? parsed.typed : ""} has no exact binary form, so the nearest {f.bits}-bit
                    value is stored instead.
                  </Note>
                )}
              </div>
            </Panel>
            <StepsPanel steps={steps} open />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="The format">
              <dl>
                <Fact label="Sign / exponent / fraction bits">
                  1 / {f.exp} / {f.frac}
                </Fact>
                <Fact label="Exponent bias">{f.bias}</Fact>
                <Fact label="Normal exponents">
                  {1 - f.bias} to {f.bias}
                </Fact>
                <Fact label="Significant decimal digits">≈ {fmt === "32" ? "7" : "15–16"}</Fact>
                <Fact label="Largest finite">{fmt === "32" ? "3.4028235e38" : "1.7976931348623157e308"}</Fact>
                <Fact label="Smallest normal">{fmt === "32" ? "1.1754944e-38" : "2.2250738585072014e-308"}</Fact>
                <Fact label="Smallest subnormal">{fmt === "32" ? "1.4e-45" : "4.9e-324"}</Fact>
              </dl>
              <p className="mt-3 text-sm text-muted">
                An exponent field of 0 means zero or a subnormal (no hidden 1); all ones means infinity or NaN.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
