"use client";

import { useMemo, useState } from "react";
import { type Annulus, inverseZ, rocAnnuli, texAnnulus, texZ, termsFromSExpr, type ZTerm, zPolesZeros, zTransform } from "@/lib/sss/discrete/ztransform";
import { niceC } from "@/lib/sss/math/nice";
import type { Root } from "@/lib/sss/math/poly";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { sigEval } from "@/lib/sss/signal/signal";
import { parseSExpr } from "@/lib/sss/transforms/inverse";
import { useSss } from "@/lib/sss/store";
import { MathInput, useParsed } from "../MathInput";
import { fmtReadout, Plot } from "../plot/Plot";
import { drawPoleZero, pzWindow } from "../plot/poleZero";
import { Tex } from "../Tex";
import { Formula, Note, PageHeader, Panel, Segmented, StepsPanel } from "../ui";
import { drawStems, SeqError, SeqInputPanel, seqRange, seqValue, useSeq } from "./discrete";

const INVERSE_EXAMPLES = [
  { label: "Two real poles", text: "z/((z - 0.5)(z - 0.8))" },
  { label: "In powers of z⁻¹", text: "1/(1 - 0.5z^(-1))" },
  { label: "Repeated pole", text: "z/(z - 0.5)^2" },
  { label: "Complex poles", text: "z^2/(z^2 - z + 0.5)" },
  { label: "Finite (FIR)", text: "1 + 2z^(-1) + z^(-2)" },
  { label: "Poles on both sides of the ROC", text: "z/((z - 0.5)(z - 2))" },
];

export function ZView() {
  const [mode, setMode] = useState<"forward" | "inverse">("forward");
  return (
    <>
      <PageHeader title="Z-transform">
        <Tex tex="X(z)=\sum_{n=-\infty}^{\infty}x[n]\,z^{-n}" />: the discrete-time counterpart of the Laplace transform. It converges in a ring of the
        z-plane.
      </PageHeader>
      <div className="mb-4">
        <Segmented
          label="Direction"
          value={mode}
          onChange={setMode}
          options={[
            { value: "forward", label: <Tex tex="x[n] \to X(z)" /> },
            { value: "inverse", label: <Tex tex="X(z) \to x[n]" /> },
          ]}
        />
      </div>
      {mode === "forward" ? <Forward /> : <Inverse />}
    </>
  );
}

function Forward() {
  const dx = useSss((s) => s.inputs.dx);
  const set = useSss((s) => s.set);
  const state = useSeq(dx);
  return (
    <>
      <Panel className="mb-5">
        <SeqInputPanel label="x[n]" value={dx} onChange={(v) => set("dx", v)} />
        <SeqError state={state} />
      </Panel>
      {state.shown?.kind === "exact" && <ForwardBody an={state.shown} stale={state.stale} />}
      {state.shown?.kind === "numeric" && (
        <Panel title="Result" tone="result">
          <Note>No exact form: {state.shown.reason}</Note>
        </Panel>
      )}
    </>
  );
}

function ZPlane(props: { poles: Root[]; zeros: Root[] | null; roc: Annulus | null }) {
  const win = useMemo(() => pzWindow([...props.poles.map((p) => p.p), ...(props.zeros ?? []).map((z) => z.p)], [1, props.roc?.rmin ?? 0, props.roc && Number.isFinite(props.roc.rmax) ? props.roc.rmax : 0], 1.2), [props]);
  return (
    <Plot
      x={win}
      y={win}
      equal
      height={300}
      interactive={false}
      xLabel="Re z"
      ariaLabel="Poles, zeros, unit circle and region of convergence in the z-plane"
      legend={[
        { label: "× poles", color: "var(--plot-2)" },
        { label: "○ zeros", color: "var(--plot-1)" },
        { label: "ROC (shaded)", color: "var(--accent)" },
        { label: "unit circle", color: "var(--plot-axis)" },
      ]}
      draw={(api) => drawPoleZero(api, { poles: props.poles, zeros: props.zeros, zPlane: true, annulus: props.roc })}
    />
  );
}

function ForwardBody({ an, stale }: { an: Analysis & { kind: "exact" }; stale: boolean }) {
  const Z = useMemo(() => zTransform(an.signal), [an]);
  const r = useMemo(() => seqRange(an), [an]);
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="z-plane">
          <ZPlane poles={Z.poles} zeros={Z.zeros} roc={Z.roc} />
        </Panel>
        <Panel title="x[n]">
          <Plot
            x={r.n}
            y={r.y}
            height={220}
            xLabel="n"
            xName="n"
            ariaLabel="The sequence"
            readout={(x) => [{ label: `x[${Math.round(x)}]`, value: fmtReadout(seqValue(an, Math.round(x))) }]}
            draw={(api) => drawStems(api, (n) => seqValue(an, n), api.colors.series[0])}
          />
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Result" tone="result">
          {Z.roc ? (
            <>
              <Formula tex={`X(z) = ${Z.tex}`} />
              <Formula tex={`\\text{ROC: } ${texAnnulus(Z.roc)}`} />
              <PZList poles={Z.poles} zeros={Z.zeros} roc={Z.roc} />
            </>
          ) : (
            <Note tone="warn">No Z-transform. {Z.rocNote}</Note>
          )}
        </Panel>
        <StepsPanel steps={Z.steps} />
      </div>
    </div>
  );
}

function PZList({ poles, zeros, roc }: { poles: Root[]; zeros: Root[] | null; roc: Annulus }) {
  const list = (rs: Root[]) => rs.map((r) => `${niceC(r.p).tex}${r.mult > 1 ? `\\ (\\times${r.mult})` : ""}`).join(",\\ ");
  const onCircle = roc.rmin < 1 && roc.rmax > 1;
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
      <p>
        <span className="text-muted">Poles: </span>
        {poles.length ? <Tex tex={list(poles)} /> : "none"}
      </p>
      <p>
        <span className="text-muted">Zeros: </span>
        {zeros?.length ? <Tex tex={list(zeros)} /> : "none"}
      </p>
      <p className="text-muted">
        {onCircle ? "The ROC contains the unit circle: the DTFT exists and equals X(e^{jΩ})." : "The ROC misses the unit circle: no ordinary DTFT."}
      </p>
    </div>
  );
}

function Inverse() {
  const input = useSss((s) => s.inputs.zinv);
  const set = useSss((s) => s.set);
  const parsed = useParsed(input.text, "z");
  const res = useMemo(() => {
    if (!parsed.ok) return null;
    const r = parseSExpr(parsed.ast, input.params);
    if (!r.ok) return { ok: false as const, message: r.message.replace(/\bs\b/g, "z").replace(/X\(s\)/g, "X(z)") };
    const terms = termsFromSExpr(r.X);
    if (!terms) return { ok: false as const, message: "X(z) must be a ratio of polynomials in z (or z⁻¹)." };
    return { ok: true as const, terms };
  }, [parsed, input.params]);
  const [last, setLast] = useState<ZTerm[] | null>(res?.ok ? res.terms : null);
  if (res?.ok && res.terms !== last) setLast(res.terms);
  const shown = res?.ok ? res.terms : last;
  return (
    <>
      <Panel className="mb-5">
        <MathInput label="X(z)" variable="z" value={input} onChange={(v) => set("zinv", v)} examples={INVERSE_EXAMPLES} />
        {res && !res.ok && (
          <div className="mt-3">
            <Note tone="warn">{res.message}</Note>
          </div>
        )}
      </Panel>
      {shown && <InverseBody terms={shown} stale={!res?.ok} />}
    </>
  );
}

function InverseBody({ terms, stale }: { terms: ZTerm[]; stale: boolean }) {
  const pz = useMemo(() => zPolesZeros(terms), [terms]);
  const annuli = useMemo(() => rocAnnuli(pz.poles), [pz]);
  const [pick, setPick] = useState(-1);
  const index = pick >= 0 && pick < annuli.length ? pick : annuli.length - 1;
  const roc = annuli[index];
  const inv = useMemo(() => inverseZ(terms, roc), [terms, roc]);
  const an = useMemo((): Analysis => ({ kind: "exact", signal: inv.signal, special: [], f: (n) => sigEval(inv.signal, n) }), [inv]);
  const r = useMemo(() => seqRange(an), [an]);
  const describe = (i: number) => (annuli.length === 1 ? "everywhere" : i === annuli.length - 1 ? "right-sided (causal)" : i === 0 ? "left-sided" : "two-sided");
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Choose the region of convergence">
          <div role="radiogroup" aria-label="Region of convergence" className="mb-4 flex flex-wrap gap-2">
            {annuli.map((a, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={i === index}
                onClick={() => setPick(i)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm ${i === index ? "border-accent bg-accent/10" : "border-line bg-panel hover:bg-hover"}`}
              >
                <Tex tex={texAnnulus(a)} />
                <span className="text-xs text-muted">{describe(i)}</span>
              </button>
            ))}
          </div>
          <ZPlane poles={pz.poles} zeros={pz.zeros} roc={roc} />
        </Panel>
        <Panel title="x[n]">
          <Plot
            x={r.n}
            y={r.y}
            height={220}
            xLabel="n"
            xName="n"
            ariaLabel="The inverse Z-transform"
            readout={(x) => [{ label: `x[${Math.round(x)}]`, value: fmtReadout(seqValue(an, Math.round(x))) }]}
            draw={(api) => drawStems(api, (n) => seqValue(an, n), api.colors.series[0])}
          />
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Result" tone="result">
          <Formula tex={`X(z) = ${texZ(terms)}`} />
          <Formula tex={`x[n] = ${inv.tex}`} />
          <p className="mt-2 text-sm text-muted">
            ROC <Tex tex={texAnnulus(roc)} />: {describe(index)}
            {roc.rmin < 1 && roc.rmax > 1 ? ", stable (contains the unit circle)." : "."}
          </p>
        </Panel>
        <StepsPanel steps={inv.steps} open />
      </div>
    </div>
  );
}

