import { describe, expect, it } from "vitest";
import { sig } from "../test-utils";
import { texCases, texStepForm } from "./format";

const cases = (text: string) => texCases(sig(text).signal);
const steps = (text: string) => texStepForm(sig(text).signal);
const dsteps = (text: string) => texStepForm(sig(text, {}, "dt").signal, { v: "n", discrete: true });

describe("format", () => {
  it("writes sinusoids and damped sinusoids in real form", () => {
    expect(cases("cos(2t)")).toBe("\\cos(2t)");
    expect(steps("e^(-t)sin(2t)u(t)")).toBe("e^{-t}\\sin(2t)u(t)");
    expect(cases("sin(2 pi t)")).toBe("\\sin(2\\pi t)");
  });

  it("keeps shifts", () => {
    expect(steps("e^(-(t-1))u(t-1)")).toBe("e^{-(t-1)}u(t-1)");
    expect(steps("sin(t-1)u(t-1)")).toBe("\\sin(t-1)u(t-1)");
  });

  it("writes pieces as cases and as steps", () => {
    expect(cases("rect(t-1/2)")).toBe("\\begin{cases} 1, & 0\\le t<1 \\\\ 0, & \\text{otherwise} \\end{cases}");
    expect(steps("rect(t-1/2)")).toBe("u(t)-u(t-1)");
    expect(steps("r(t) - 2r(t-1) + r(t-2)")).toBe("t\\,u(t)-2(t-1)u(t-1)+(t-2)u(t-2)");
    expect(steps("e^(-|t|)")).toBe("e^{t}u(-t)+e^{-t}u(t)");
    expect(steps("delta(t-1) + 2u(t)")).toBe("2u(t)+\\delta(t-1)");
  });

  it("writes sequences", () => {
    expect(dsteps("0.5^n u(n)")).toBe("\\left(\\frac{1}{2}\\right)^{n}u[n]");
    expect(dsteps("(-0.5)^n u(n)")).toBe("\\left(-\\frac{1}{2}\\right)^{n}u[n]");
    expect(dsteps("u(n)-u(n-4)")).toBe("u[n]-u[n-4]");
    expect(texCases(sig("u(n)-u(n-4)", {}, "dt").signal, { v: "n", discrete: true })).toContain("0\\le n\\le 3");
  });
});
