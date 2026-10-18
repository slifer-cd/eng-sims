import { describe, expect, it } from "vitest";
import { DEFAULT_INPUTS, loadInputs, saveInputs } from "./store";

describe("loadInputs", () => {
  it("falls back to the defaults for unreadable data", () => {
    expect(loadInputs(null)).toEqual(DEFAULT_INPUTS);
    expect(loadInputs("garbage")).toEqual(DEFAULT_INPUTS);
    expect(loadInputs('{"v":0}')).toEqual(DEFAULT_INPUTS);
    expect(loadInputs('{"v":1,"inputs":[]}')).toEqual(DEFAULT_INPUTS);
  });

  it("repairs bad fields one by one", () => {
    const raw = JSON.stringify({
      v: 1,
      inputs: { x: { text: "u(t)", params: { a: 2, "bad key": 3, b: "x" } }, series: { T: -1, N: 1e9 }, system: { input: "nope" } },
    });
    const i = loadInputs(raw);
    expect(i.x).toEqual({ text: "u(t)", params: { a: 2 } });
    expect(i.series.T).toBe(DEFAULT_INPUTS.series.T);
    expect(i.series.N).toBe(200);
    expect(i.system.input).toBe(DEFAULT_INPUTS.system.input);
  });

  it("round-trips", () => {
    const changed = { ...DEFAULT_INPUTS, h: { text: "tri(t)", params: { k: 3 } } };
    expect(loadInputs(saveInputs(changed))).toEqual(changed);
  });
});
