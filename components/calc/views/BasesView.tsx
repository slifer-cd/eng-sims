"use client";

import Link from "next/link";
import { useMemo } from "react";
import { abs, B0, B1, BASE_NAMES, BASES, type Base, big, bitLength, conversionSteps, group, pad, parseNumber, toBase } from "@/lib/calc/bases";
import { useCalc } from "@/lib/calc/store";
import { Note, PageHeader, Panel, Segmented, StepsPanel } from "../../sss/ui";
import { BitStrip, CopyButton, TextField } from "../ui";

const WIDTH_OPTIONS = [0, 8, 16, 32, 64] as const;
const GROUP: Record<Base, number> = { 2: 4, 8: 3, 10: 3, 16: 4 };
const PREFIX: Record<Base, string> = { 2: "0b", 8: "0o", 10: "", 16: "0x" };

export function BasesView() {
  const input = useCalc((s) => s.inputs.bases);
  const set = useCalc((s) => s.set);
  // Decimal is the default, so a typed prefix may pick another base; elsewhere the picker rules.
  const parsed = useMemo(() => parseNumber(input.text, input.base === 10 ? undefined : input.base), [input.text, input.base]);
  const steps = useMemo(() => (parsed.ok ? conversionSteps(parsed.value, parsed.base) : []), [parsed]);

  const value = parsed.ok ? parsed.value : null;
  const needed = value === null ? 0 : bitLength(value);
  const stripWidth = input.width || Math.max(8, Math.ceil(needed / 4) * 4);
  const fits = value === null || needed <= stripWidth;

  const toggle = (bit: number) => {
    if (value === null || value < B0) return;
    const next = value ^ (B1 << big(bit));
    const base = parsed.ok ? parsed.base : input.base;
    set("bases", { ...input, text: PREFIX[base] + toBase(next, base), base: input.base });
  };

  return (
    <>
      <PageHeader title="Number bases">
        Convert a whole number between binary, octal, decimal and hexadecimal, with the working. Values of any size stay exact.
      </PageHeader>
      <Panel className="mb-5">
        <div className="flex flex-col gap-4">
          <TextField
            label="Number"
            value={input.text}
            onChange={(text) => set("bases", { ...input, text })}
            error={parsed.ok ? null : parsed.error}
            placeholder="42, 0b101010, 0x2A …"
            hint={input.base === 10 ? "A 0b, 0o or 0x prefix reads the number as binary, octal or hex." : undefined}
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Typed in</span>
              <Segmented
                label="Base of the typed number"
                value={String(input.base) as `${Base}`}
                options={BASES.map((b) => ({ value: String(b) as `${Base}`, label: BASE_NAMES[b] }))}
                onChange={(b) => set("bases", { ...input, base: Number(b) as Base })}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Bits</span>
              <Segmented
                label="Bit width"
                value={String(input.width)}
                options={WIDTH_OPTIONS.map((w) => ({ value: String(w), label: w === 0 ? "Auto" : w }))}
                onChange={(w) => set("bases", { ...input, width: Number(w) })}
              />
            </div>
          </div>
        </div>
      </Panel>

      {value !== null && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="In every base" tone="result">
              <dl className="flex flex-col">
                {BASES.map((b) => {
                  const digits = abs(value).toString(b).toUpperCase();
                  const padded = b === 2 && input.width && fits ? pad(digits, input.width) : digits;
                  const shown = (value < B0 ? "−" : "") + group(padded, GROUP[b], b === 10 ? "," : " ");
                  const copy = (value < B0 ? "-" : "") + PREFIX[b] + padded;
                  return (
                    <div key={b} className="flex items-baseline gap-4 border-b border-line/70 py-2 last:border-0">
                      <dt className="w-28 shrink-0 text-sm text-muted">
                        {BASE_NAMES[b]} <span className="font-mono text-xs">({b})</span>
                      </dt>
                      <dd className={`min-w-0 flex-1 font-mono text-lg break-all ${parsed.ok && parsed.base === b ? "text-accent" : ""}`}>{shown}</dd>
                      <CopyButton text={copy} label={BASE_NAMES[b].toLowerCase()} />
                    </div>
                  );
                })}
              </dl>
            </Panel>
            <StepsPanel steps={steps} open />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Bits">
              <div className="flex flex-col gap-3">
                {value < B0 ? (
                  <Note>
                    This is the magnitude with a minus sign. To see how a negative number is stored in a fixed number of bits, open{" "}
                    <Link href="/calc/signed" className="font-medium text-accent hover:underline">
                      Signed integers
                    </Link>
                    .
                  </Note>
                ) : fits ? (
                  <BitStrip bits={value} width={stripWidth} onToggle={toggle} label="Bits of the number" />
                ) : (
                  <Note tone="warn">
                    {needed} bits are needed, more than {input.width}. Choose a wider width or Auto.
                  </Note>
                )}
                <p className="text-sm text-muted">
                  {needed} bit{needed === 1 ? "" : "s"} needed
                  {value >= B0 && fits ? ". Click a bit to flip it." : "."}
                </p>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
