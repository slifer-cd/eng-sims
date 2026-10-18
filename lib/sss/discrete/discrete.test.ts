import { describe, expect, it } from "vitest";
import { parse } from "../expr/parse";
import { cexp, cx } from "../math/complex";
import { sigEval } from "../signal/signal";
import { close, sig } from "../test-utils";
import { parseSExpr } from "../transforms/inverse";
import { dconvolve } from "./dconv";
import { analyzeSeq } from "./sequence";
import { dtft, inverseZ, rocAnnuli, termsFromSExpr, zEval, zTransform } from "./ztransform";

const Z = (text: string) => zTransform(sig(text, {}, "dt").signal);
const seqDefaults = { text: "", params: {}, values: "", start: 0 };

describe("Z-transform", () => {
  it("geometric sequences", () => {
    const a = Z("0.5^n u(n)");
    close(a.at(cx(1)), 2);
    expect(a.roc).toEqual({ rmin: 0.5, rmax: Infinity });
    expect(a.tex).toBe("\\frac{1}{1-\\frac{1}{2}z^{-1}}");
    expect(a.zeros?.map((z) => z.p.re)).toEqual([0]);
  });

  it("finite sequences", () => {
    const a = Z("u(n) - u(n-3)");
    close(a.at(cx(2)), 1.75);
    expect(a.tex).toBe("1+z^{-1}+z^{-2}");
  });

  it("n·rⁿ and left-sided sequences", () => {
    close(Z("n 0.5^n u(n)").at(cx(1)), 2);
    const l = Z("-(0.5^n) u(-n-1)");
    close(l.at(cx(0.25)), -1);
    expect(l.roc).toEqual({ rmin: 0, rmax: 0.5 });
  });

  it("matches the defining sum", () => {
    const s = sig("(0.8^n)cos(pi n/3)u(n-2) + 2 delta(n+1) + (n^2)(0.6^n)u(n)", {}, "dt");
    const X = zTransform(s.signal);
    const z = cx(1.1, 0.4);
    let acc = cx(0);
    for (let n = -5; n < 400; n++) {
      const v = sigEval(s.signal, n);
      const zn = cexp({ re: -n * Math.log(Math.hypot(z.re, z.im)), im: -n * Math.atan2(z.im, z.re) });
      acc = { re: acc.re + v.re * zn.re - v.im * zn.im, im: acc.im + v.re * zn.im + v.im * zn.re };
    }
    close(X.at(z), acc, 1e-8);
  });
});

describe("DTFT", () => {
  it("evaluates on the unit circle", () => {
    const d = dtft(sig("0.5^n u(n)", {}, "dt").signal);
    if (d.kind !== "exact") throw new Error();
    close(d.at(0), 2);
    close(d.at(Math.PI), 2 / 3);
  });

  it("adds impulses for u[n]", () => {
    const d = dtft(sig("u(n)", {}, "dt").signal);
    if (d.kind !== "exact") throw new Error();
    expect(d.impulses).toHaveLength(1);
    close(d.impulses[0].area, Math.PI);
    expect(dtft(sig("2^n u(n)", {}, "dt").signal).kind).toBe("none");
  });
});

describe("inverse Z", () => {
  it("round-trips", () => {
    const s = sig("0.5^n u(n) + n (0.25^n) u(n-1)", {}, "dt");
    const X = zTransform(s.signal);
    const back = inverseZ(X.terms, X.roc!);
    for (const n of [0, 1, 2, 5]) close(sigEval(back.signal, n), sigEval(s.signal, n));
  });

  it("from an expression in z", () => {
    const p = parse("z/(z - 0.5)", { variable: "z" });
    if (!p.ok) throw new Error();
    const r = parseSExpr(p.ast, {});
    if (!r.ok) throw new Error(r.message);
    const terms = termsFromSExpr(r.X)!;
    close(zEval(terms, cx(2)), 2 / 1.5);
    const strips = rocAnnuli([{ p: cx(0.5), mult: 1 }]);
    const inv = inverseZ(terms, strips[strips.length - 1]);
    close(sigEval(inv.signal, 3), 0.125);
  });
});

describe("discrete convolution", () => {
  it("finite sequences", () => {
    const x = analyzeSeq({ ...seqDefaults, mode: "values", values: "1, 2, 3" });
    const h = analyzeSeq({ ...seqDefaults, mode: "values", values: "1, 1" });
    const r = dconvolve(x as never, h as never);
    expect([0, 1, 2, 3].map(r.at)).toEqual([1, 3, 5, 3]);
  });

  it("closed form through Z", () => {
    const r = dconvolve(sig("0.5^n u(n)", {}, "dt"), sig("u(n)", {}, "dt"));
    close(r.at(2), 1.75);
    expect(r.signal).not.toBeNull();
    close(r.at(10), 2 * (1 - Math.pow(0.5, 11)));
  });

  it("values mode with a start index", () => {
    const x = analyzeSeq({ ...seqDefaults, mode: "values", values: "1, 2, 3", start: -1 });
    if (x.kind !== "exact") throw new Error();
    close(sigEval(x.signal, -1), 1);
    close(sigEval(x.signal, 1), 3);
    expect(analyzeSeq({ ...seqDefaults, mode: "values", values: "1, x" }).kind).toBe("error");
  });
});
