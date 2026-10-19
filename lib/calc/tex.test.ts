import katex from "katex";
import { describe, expect, it } from "vitest";
import type { Step } from "../sss/steps";
import { big, conversionSteps } from "./bases";
import { bitsOf, decode, floatSteps } from "./ieee754";
import { boolTex, parseBool, subexpressions } from "./logic/expr";
import { minimise, posTex, qmSteps, sopTex } from "./logic/qm";
import { canonicalPos, canonicalSop, canonicalSteps, listTex, truthTable } from "./logic/truth";
import { readTwosSteps, twosSteps } from "./signed";

/* Every formula the calculators write must parse in strict KaTeX (titles are plain text). */

function expectValid(label: string, texs: string[]) {
  for (const tex of texs) {
    let error = "";
    try {
      katex.renderToString(tex, { throwOnError: true, strict: "ignore", displayMode: true });
    } catch (e) {
      error = (e as Error).message;
    }
    expect(error, `${label}: ${tex}`).toBe("");
  }
}

const lines = (steps: Step[]) => steps.flatMap((s) => s.lines);

describe("calculator LaTeX", () => {
  it("base conversion", () => {
    for (const [v, b] of [[0, 10], [42, 10], [-42, 16], [255, 2], [511, 8], ["18446744073709551615", 10], ["18446744073709551615", 2]] as const) {
      expectValid(`${v}/${b}`, lines(conversionSteps(big(v), b)));
    }
  });

  it("two's complement", () => {
    for (const v of [-128, -5, 0, 5, 127, 200, -300]) expectValid(`${v}`, lines(twosSteps(big(v), 8)));
    for (const b of [0x00, 0x7f, 0x80, 0xff]) expectValid(`${b}`, lines(readTwosSteps(big(b), 8)));
  });

  it("IEEE-754", () => {
    for (const x of [0, -0, 1, -2.5, 0.1, 1e-310, 1e-45, Infinity, NaN, 6.02e23]) {
      for (const fmt of ["32", "64"] as const) {
        const d = decode(bitsOf(x, fmt), fmt);
        expectValid(`${x}/${fmt}`, [...lines(floatSteps(d, fmt, "decimal")), ...lines(floatSteps(d, fmt, "bits"))]);
      }
    }
  });

  it("Boolean algebra and the minimiser", () => {
    for (const text of ["A B' + C", "(A + B)'C ^ D", "X1 X2 + X10'", "!(A & B) | 1", "A ^ B ^ C"]) {
      const p = parseBool(text);
      if (!p.ok) throw new Error(text);
      const cells = truthTable(p.expr, p.vars);
      expectValid(text, [boolTex(p.expr), ...subexpressions(p.expr).map((e) => boolTex(e)), canonicalSop(cells, p.vars) ?? "", canonicalPos(cells, p.vars) ?? "", ...lines(canonicalSteps(p.expr, p.vars, cells))]);
    }
    const vars = ["A", "B", "C", "D"];
    for (const [ones, dcs] of [
      [[4, 8, 10, 11, 12, 15], [9, 14]],
      [[0, 1, 2, 5, 6, 7], []],
      [[], []],
      [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], []],
    ] as const) {
      const r = minimise(4, [...ones], [...dcs]);
      const inv = minimise(4, [...Array(16).keys()].filter((m) => !(ones as readonly number[]).includes(m) && !(dcs as readonly number[]).includes(m)), [...dcs]);
      expectValid(`${ones}`, [...lines(qmSteps(r, vars)), ...lines(qmSteps(inv, vars, true)), sopTex(r, vars), posTex(inv, vars), listTex("sum", [...ones], [...dcs])]);
    }
    const big8 = minimise(8, [...Array(256).keys()].filter((m) => m % 3 === 0), []);
    expectValid("8 vars", lines(qmSteps(big8, ["A", "B", "C", "D", "E", "F", "G", "H"])));
  });
});
