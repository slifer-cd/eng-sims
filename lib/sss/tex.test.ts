import katex from "katex";
import { describe, expect, it } from "vitest";
import { dconvolve } from "./discrete/dconv";
import { dtft, inverseZ, rocAnnuli, termsFromSExpr, zPolesZeros, zTransform } from "./discrete/ztransform";
import { parse } from "./expr/parse";
import { texCases, texStepForm } from "./signal/format";
import { an, sig } from "./test-utils";
import { convolve } from "./transforms/convolution";
import { fourier } from "./transforms/fourier";
import { inverseLaplace, parseSExpr, rocStrips } from "./transforms/inverse";
import { laplace } from "./transforms/laplace";
import { fourierSeries } from "./transforms/series";
import { analyzeSystem } from "./transforms/system";

/*
 * Every formula the engine writes must parse in KaTeX. With throwOnError: false the page shows a
 * bad command (like \pij from "\pi" + "j") as red source text, so the check runs in strict mode.
 */

/** Collects every TeX string in a result: `tex`-like fields and step lines (titles are plain text). */
function texStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) texStrings(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (["title", "note", "reason", "message", "rocNote", "kind"].includes(k)) continue;
      if (typeof v === "string" || typeof v === "object") texStrings(v, out);
    }
  }
  return out;
}

function expectValidTex(label: string, value: unknown) {
  for (const tex of texStrings(value)) {
    let error = "";
    try {
      katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    } catch (e) {
      error = (e as Error).message;
    }
    expect(error, `${label}: ${tex}`).toBe("");
  }
}

const SIGNALS = [
  "sin(t)",
  "sin(2t)",
  "sin(pi t)",
  "cos(t)",
  "cos(pi t)u(t)",
  "sin(t)u(t)",
  "sin(pi t)u(t)",
  "e^(j t)",
  "j e^(j t)",
  "e^(j pi t)",
  "t u(t)",
  "t sin(t)u(t)",
  "u(t)",
  "sgn(t)",
  "1",
  "e^(-2t)u(t)",
  "e^(-(1+j)t)u(t)",
  "e^(-t)sin(pi t)u(t)",
  "e^(-|t|)",
  "rect(t)",
  "tri(t)",
  "sin(pi t)rect(t)",
  "ramp(t) - ramp(t-1)",
  "delta(t-1) - 2delta(t+pi)",
  "sinc(t)",
  "sinc(t)cos(5t)",
  "e^(-t^2)",
  "2^t u(-t)",
  // π in every position: coefficient, rate, delay, impulse area (real and complex).
  "pi t u(t)",
  "pi t e^(j pi t)u(t)",
  "e^(-pi t)u(t)",
  "e^(j pi t/2)u(t)",
  "u(t-pi) - u(t-2pi)",
  "pi delta(t-pi)",
  "j delta(t) + (1+j)delta(t-1)",
  "sqrt(pi) e^(-t^2)",
  "pi sinc(pi t)",
  "pi sin(pi t)u(t-pi)",
];

describe("every formula parses in KaTeX", () => {
  it("signals, Fourier and Laplace transforms", () => {
    for (const s of SIGNALS) {
      const a = an(s);
      if (a.kind !== "exact") throw new Error(`${s}: ${a.kind}`);
      expectValidTex(`${s} cases`, texCases(a.signal));
      expectValidTex(`${s} steps`, texStepForm(a.signal));
      expectValidTex(`${s} fourier`, fourier(a));
      if (!a.special.length) expectValidTex(`${s} laplace`, laplace(a));
    }
  });

  it("Fourier series", () => {
    for (const [s, T, t0] of [
      ["sin(t)", 2 * Math.PI, 0],
      ["sin(pi t)", 1, 0],
      ["e^(j pi t)", 2, 0],
      ["t", 1, 0],
      ["e^(-t)", 1, 0],
      ["u(t)", 2, -1],
      ["delta(t)", 1, -0.5],
      ["sin(pi t)", 3, 0],
      ["pi t e^(j t)", 2, -1],
      ["e^(-pi t)", Math.PI, 0],
    ] as const) {
      expectValidTex(`${s} series`, fourierSeries(an(s), T, t0));
    }
  });

  it("convolutions", () => {
    for (const [x, h] of [
      ["rect(t)", "rect(t)"],
      ["sin(t)u(t)", "e^(-t)u(t)"],
      ["cos(pi t)u(t)", "u(t)"],
      ["e^(-t)u(t)", "j delta(t-1) + pi delta(t)"],
      ["e^(j t)u(t)", "e^(-2t)u(t)"],
      ["pi rect(t/pi)", "e^(-pi t)u(t)"],
      ["sin(pi t)u(t)", "(1+j)delta(t-pi) + pi delta(t)"],
    ]) {
      expectValidTex(`${x} * ${h}`, convolve(sig(x).signal, sig(h).signal));
    }
  });

  it("inverse Laplace and systems", () => {
    for (const text of ["1/(s^2+pi^2)", "pi/(s+pi)", "1/(s^2+2s+5)", "1/(s - j pi)", "1/(s^2+1)^2", "e^(-2s)/s", "s/(s+1)", "(s+pi)/(s^2+1)", "pi e^(-pi s)/(s+pi)^2", "j pi s e^(-s)/(s^2+pi^2)", "(1+j)/(s-j)"]) {
      const p = parse(text, { variable: "s" });
      if (!p.ok) throw new Error(p.error.message);
      const r = parseSExpr(p.ast, {});
      if (!r.ok) throw new Error(r.message);
      for (const strip of rocStrips(r.poles)) expectValidTex(`${text} inverse`, inverseLaplace(r.X, strip));
      expectValidTex(`${text} system`, analyzeSystem(r.X));
    }
  });

  it("discrete time", () => {
    for (const s of ["sin(pi n/2)u(n)", "cos(pi n/3)", "0.5^n u(n)", "(-1)^n u(n)", "n 0.5^n u(n)", "e^(j pi n/2)u(n)", "delta(n) - delta(n-1)"]) {
      const a = an(s, {}, "dt");
      if (a.kind !== "exact") throw new Error(`${s}: ${a.kind}`);
      const z = zTransform(a.signal);
      expectValidTex(`${s} z`, z);
      expectValidTex(`${s} dtft`, dtft(a.signal));
      expectValidTex(`${s} cases`, texCases(a.signal, { v: "n", discrete: true }));
      if (z.roc) expectValidTex(`${s} inverse z`, inverseZ(z.terms, z.roc));
      expectValidTex(`${s} * u`, dconvolve(a, an("u(n)", {}, "dt")));
    }
    for (const text of ["1/(z^2 + pi^2)", "z/(z - j)", "z/(z^2 + 1)"]) {
      const p = parse(text, { variable: "z" });
      if (!p.ok) throw new Error(p.error.message);
      const r = parseSExpr(p.ast, {});
      if (!r.ok) throw new Error(r.message);
      const terms = termsFromSExpr(r.X);
      if (!terms) throw new Error(text);
      for (const roc of rocAnnuli(zPolesZeros(terms).poles)) expectValidTex(`${text} inverse z`, inverseZ(terms, roc));
    }
  });
});
