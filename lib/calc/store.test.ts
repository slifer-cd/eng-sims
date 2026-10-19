import { describe, expect, it } from "vitest";
import { DEFAULT_INPUTS, loadInputs, saveInputs } from "./store";

describe("loadInputs", () => {
  it("falls back to the defaults for unreadable data", () => {
    expect(loadInputs(null)).toEqual(DEFAULT_INPUTS);
    expect(loadInputs("garbage")).toEqual(DEFAULT_INPUTS);
    expect(loadInputs('{"v":2,"inputs":{}}')).toEqual(DEFAULT_INPUTS);
  });

  it("repairs bad fields one by one", () => {
    const raw = JSON.stringify({
      v: 1,
      inputs: {
        bases: { text: "0xFF", base: 3, width: 12 },
        float: { format: "16" },
        kmap: { names: ["A", "B", "C"], cells: "01x" },
      },
    });
    const i = loadInputs(raw);
    expect(i.bases).toEqual({ text: "0xFF", base: 10, width: 0 });
    expect(i.float).toEqual(DEFAULT_INPUTS.float);
    // Wrong length for 3 variables: keep the names, clear the cells.
    expect(i.kmap).toEqual({ names: ["A", "B", "C"], cells: "00000000" });
    expect(loadInputs(JSON.stringify({ v: 1, inputs: { kmap: { names: ["A", "A"], cells: "0000" } } })).kmap).toEqual(DEFAULT_INPUTS.kmap);
  });

  it("round-trips", () => {
    const changed = { ...DEFAULT_INPUTS, signed: { text: "0x80", width: 16 }, kmap: { names: ["X", "Y"], cells: "1x01" } };
    expect(loadInputs(saveInputs(changed))).toEqual(changed);
  });
});
