"use client";

import { type ReactNode, useMemo } from "react";
import { B0, B1, big, pad, parseNumber } from "@/lib/calc/bases";
import { bitsText, decode, encode, mask, range, readTwosSteps, SCHEMES, twosSteps, WIDTHS } from "@/lib/calc/signed";
import { useCalc } from "@/lib/calc/store";
import { Tex } from "../../sss/Tex";
import { Fact, Note, PageHeader, Panel, Segmented, StepsPanel } from "../../sss/ui";
import { BitStrip, PLOT_COLORS, TextField } from "../ui";

type Read = { ok: true; kind: "value"; value: bigint } | { ok: true; kind: "bits"; bits: bigint } | { ok: false; error: string };

/** A decimal is a value to store; a 0b/0o/0x pattern is bits to read. */
function read(text: string, width: number): Read {
  const p = parseNumber(text);
  if (!p.ok) return p;
  if (p.base === 10) return { ok: true, kind: "value", value: p.value };
  if (p.value < B0) return { ok: false, error: "A bit pattern can't be negative. Type a decimal value instead." };
  if (p.value > mask(width)) return { ok: false, error: `That pattern has more than ${width} bits.` };
  return { ok: true, kind: "bits", bits: p.value };
}

export function SignedView() {
  const input = useCalc((s) => s.inputs.signed);
  const set = useCalc((s) => s.set);
  const { width } = input;
  const r = useMemo(() => read(input.text, width), [input.text, width]);

  const bits = !r.ok ? null : r.kind === "bits" ? r.bits : encode(r.value, width, "twos");
  const value = bits === null ? null : decode(bits, width, "twos").value;
  const steps = useMemo(() => {
    if (!r.ok) return [];
    return r.kind === "value" ? twosSteps(r.value, width) : readTwosSteps(r.bits, width);
  }, [r, width]);
  const twos = range(width, "twos");

  const toggle = (bit: number) => {
    if (bits === null) return;
    const next = bits ^ (B1 << big(bit));
    // Keep the form the user typed in: a value stays a value, a pattern a pattern.
    const text = r.ok && r.kind === "bits" ? `0b${pad(next.toString(2), width)}` : decode(next, width, "twos").value.toString();
    set("signed", { ...input, text });
  };

  return (
    <>
      <PageHeader title="Signed integers">
        Store a negative number in a fixed number of bits, or read a bit pattern back. Two&apos;s complement is what every modern
        processor uses; one&apos;s complement and sign-magnitude are shown for comparison.
      </PageHeader>
      <Panel className="mb-5">
        <div className="flex flex-col gap-4">
          <TextField
            label="Value or bits"
            value={input.text}
            onChange={(text) => set("signed", { ...input, text })}
            error={r.ok ? null : r.error}
            placeholder="-42, or 0xD6, 0b1101_0110"
            hint="Type a decimal value to encode it, or a pattern with 0b, 0o or 0x to decode it."
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Bits</span>
            <Segmented
              label="Bit width"
              value={String(width)}
              options={WIDTHS.map((w) => ({ value: String(w), label: w }))}
              onChange={(w) => set("signed", { ...input, width: Number(w) })}
            />
          </div>
        </div>
      </Panel>

      {r.ok && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title={`Two's complement, ${width} bits`} tone="result">
              {bits === null ? (
                <Note tone="warn">
                  {r.kind === "value" ? r.value.toString() : ""} doesn&apos;t fit: {width} bits hold {twos.min.toString()} to {twos.max.toString()}. Choose a wider width.
                </Note>
              ) : (
                <div className="flex flex-col gap-4">
                  <BitStrip
                    bits={bits}
                    width={width}
                    onToggle={toggle}
                    label="Two's complement bits"
                    fields={[
                      { from: width - 1, to: width - 1, label: "sign", color: PLOT_COLORS[1] },
                      { from: width - 2, to: 0, label: "value", color: PLOT_COLORS[0] },
                    ]}
                  />
                  <dl>
                    <Fact label="Value">
                      <span className="font-mono text-base">{value?.toString()}</span>
                    </Fact>
                    <Fact label="Hex">
                      <span className="font-mono">0x{pad(bits.toString(16).toUpperCase(), width / 4)}</span>
                    </Fact>
                    <Fact label="Same bits read as unsigned">
                      <span className="font-mono">{bits.toString()}</span>
                    </Fact>
                  </dl>
                </div>
              )}
            </Panel>
            <StepsPanel steps={steps} open />
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="All three schemes">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-1.5 pr-3 font-medium">Scheme</th>
                      <th className="py-1.5 pr-3 font-medium">{r.kind === "value" ? "Bits" : "Value"}</th>
                      <th className="py-1.5 font-medium">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEMES.map((s) => {
                      const rg = range(width, s.id);
                      let cell: ReactNode;
                      if (r.kind === "value") {
                        const b = encode(r.value, width, s.id);
                        cell = b === null ? <span className="text-muted">doesn&apos;t fit</span> : <Tex tex={bitsText(b, width)} />;
                      } else {
                        const d = decode(r.bits, width, s.id);
                        cell = <span className="font-mono">{d.negZero ? "−0" : d.value.toString()}</span>;
                      }
                      return (
                        <tr key={s.id} className="border-b border-line/70 last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{s.name}</td>
                          <td className="py-2 pr-3">{cell}</td>
                          <td className="py-2 font-mono text-xs whitespace-nowrap text-muted">
                            {rg.min.toString()} … {rg.max.toString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-muted">
                One&apos;s complement and sign-magnitude both have two zeros (+0 and −0), so they hold one value fewer.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
