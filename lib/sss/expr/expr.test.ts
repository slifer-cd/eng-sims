import { describe, expect, it } from "vitest";
import type { Node } from "./ast";
import { compile } from "./compile";
import { toTex } from "./latex";
import { parse } from "./parse";

function ok(text: string, variable: "t" | "s" | "n" = "t") {
  const r = parse(text, { variable });
  if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
  return r;
}
const tex = (text: string, variable: "t" | "s" | "n" = "t") => toTex(ok(text, variable).ast, { discrete: variable === "n" });
const val = (text: string, x: number, params: Record<string, number> = {}) => compile(ok(text).ast, params).f(x);

/** Compact structural dump: (* 2 t). */
function dump(n: Node): string {
  switch (n.k) {
    case "num":
      return n.raw;
    case "var":
    case "param":
    case "const":
      return n.name;
    case "neg":
      return `(- ${dump(n.a)})`;
    case "bin":
      return `(${n.op} ${dump(n.a)} ${dump(n.b)})`;
    case "call":
      return `(${n.fn} ${n.args.map(dump).join(" ")})`;
  }
}

describe("parse", () => {
  it("reads implicit multiplication", () => {
    expect(dump(ok("2t").ast)).toBe("(* 2 t)");
    expect(dump(ok("tu(t-1)").ast)).toBe("(* t (u (- t 1)))");
    expect(dump(ok("2(t+1)").ast)).toBe("(* 2 (+ t 1))");
    expect(dump(ok("sin(2pi t)").ast)).toBe("(sin (* (* 2 pi) t))");
    expect(dump(ok("e^(-2t)u(t)").ast)).toBe("(* (^ e (* (- 2) t)) (u t))");
    expect(dump(ok("-t^2").ast)).toBe("(- (^ t 2))");
    expect(dump(ok("2^-t").ast)).toBe("(^ 2 (- t))");
  });

  it("finds parameters", () => {
    expect(ok("e^(-at)u(t)").params).toEqual(["a"]);
    expect(dump(ok("a(t+1)").ast)).toBe("(* a (+ t 1))");
    expect(ok("cos(w0 t)").params).toEqual(["w0"]);
    expect(ok("e^(-alpha t)").params).toEqual(["alpha"]);
  });

  it("treats r(…) as the ramp and a bare r as a parameter", () => {
    expect(dump(ok("r(t)").ast)).toBe("(ramp t)");
    expect(dump(ok("r^n u(n)", "n").ast)).toBe("(* (^ r n) (u n))");
  });

  it("reads bars, unicode and LaTeX", () => {
    expect(dump(ok("|t|").ast)).toBe("(abs t)");
    expect(dump(ok("2|t-1|").ast)).toBe("(* 2 (abs (- t 1)))");
    expect(dump(ok("δ(t)·π").ast)).toBe("(* (delta t) pi)");
    expect(dump(ok("\\frac{1}{s+2}", "s").ast)).toBe("(/ 1 (+ s 2))");
    expect(dump(ok("\\operatorname{rect}\\left(t\\right)").ast)).toBe("(rect t)");
    expect(dump(ok("sin^2(t)").ast)).toBe("(^ (sin t) 2)");
    expect(dump(ok("t²").ast)).toBe("(^ t 2)");
  });

  it("warns about e^-2t", () => {
    const r = ok("e^-2t");
    expect(dump(r.ast)).toBe("(* (^ e (- 2)) t)");
    expect(r.warnings).toHaveLength(1);
    expect(ok("e^-t u(t)").warnings).toHaveLength(0);
    expect(ok("t^2 u(t)").warnings).toHaveLength(0);
  });

  it("reports errors with positions", () => {
    const a = parse("sin t", { variable: "t" });
    expect(a).toMatchObject({ ok: false, error: { message: "sin needs parentheses: sin(t)", from: 0, to: 3 } });
    const b = parse("u(t", { variable: "t" });
    expect(b).toMatchObject({ ok: false, error: { message: 'Missing ")"' } });
    expect(parse("t +", { variable: "t" })).toMatchObject({ ok: false });
    expect(parse("", { variable: "t" })).toMatchObject({ ok: false });
    expect(parse("2 $ t", { variable: "t" })).toMatchObject({ ok: false, error: { from: 2, to: 3 } });
  });

  it("never throws on half-typed input", () => {
    const samples = [
      "e^(-2t)u(t)",
      "rect(t/2) - tri(t)",
      "sin(2pi t)u(t)",
      "|t-1| + 2",
      "\\frac{1}{(s+1)(s+2)}",
      "e^(-a|t|)",
      "δ(t-1) + 2δ(t+1)",
      "cos(w0 t + pi/4)",
      "t^2 e^(-t) u(t)",
      "sinc(2t)cos(10t)",
      "r(t) - 2r(t-1) + r(t-2)",
      "u(t)-u(t-1)",
      "sgn(t)",
      "exp(-t^2)",
      "1/(1+t^2)",
      "mod(t, 2)",
      "max(0, sin(t))",
      "e^(j*2*pi*t)",
      "(s+3)/(s^2+2s+5)",
      "e^(-2s)/s",
      "0.5^n u[n]",
      "u[n] - u[n-4]",
      "n (0.8)^n u(n)",
      "sinh(t)u(-t)",
      "sqrt(2)cos(t)",
      "3e^(-|t|/2)",
      "|sin(t)|",
      "u(t)*e^-t",
      "tri((t-1)/2)",
      "\\left|t\\right|",
    ];
    for (const s of samples) {
      for (let i = 0; i <= s.length; i++) {
        const prefix = s.slice(0, i);
        expect(() => parse(prefix, { variable: "t" })).not.toThrow();
        expect(() => parse(prefix, { variable: "n" })).not.toThrow();
      }
    }
  });
});

describe("toTex", () => {
  it("renders the preview", () => {
    expect(tex("e^(-2t)u(t)")).toBe("e^{-2t}u(t)");
    expect(tex("tu(t)")).toBe("t\\,u(t)");
    expect(tex("1/(s+2)", "s")).toBe("\\frac{1}{s+2}");
    expect(tex("(t+1)^2")).toBe("(t+1)^{2}");
    expect(tex("2*3")).toBe("2\\cdot 3");
    expect(tex("rect(t/2)")).toBe("\\operatorname{rect}\\left(\\frac{t}{2}\\right)");
    expect(tex("t - (1 - t)")).toBe("t-(1-t)");
    expect(tex("cos(w0 t)")).toBe("\\cos(\\omega_{0}t)");
    expect(tex("u(n-1)", "n")).toBe("u[n-1]");
  });
});

describe("compile", () => {
  it("evaluates signal functions with the half-open convention", () => {
    expect(val("rect(t)", 0.25).re).toBe(1);
    expect(val("rect(t)", 0.75).re).toBe(0);
    expect(val("tri(t)", 0.5).re).toBe(0.5);
    expect(val("sinc(t)", 0.5).re).toBeCloseTo(2 / Math.PI, 12);
    expect(val("u(t)", 0).re).toBe(1);
    expect(val("sgn(t)", 0).re).toBe(0);
    expect(val("r(t)", 2).re).toBe(2);
  });

  it("handles complex values and parameters", () => {
    const v = val("e^(jt)", Math.PI / 2);
    expect(v.re).toBeCloseTo(0, 12);
    expect(v.im).toBeCloseTo(1, 12);
    expect(val("e^(-at)", 1, { a: 2 }).re).toBeCloseTo(Math.exp(-2), 12);
    expect(val("(-8)^(1/3)", 0).re).toBeCloseTo(1, 12); // principal branch
  });

  it("marks impulses", () => {
    expect(compile(ok("delta(t) + 1").ast).impulsive).toBe(true);
    expect(compile(ok("u(t)").ast).impulsive).toBe(false);
  });
});
