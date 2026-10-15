import { describe, expect, it } from "vitest";
import { arrangePalette, DEFAULT_GROUPS, groupTitleProblem, parsePaletteGroups, type PaletteGroup } from "./palette";

const ids = (groups: PaletteGroup[]) => Object.fromEntries(groups.map((g) => [g.id, g.items]));

describe("arrangePalette", () => {
  it("adds blocks to My blocks", () => {
    expect(ids(arrangePalette(DEFAULT_GROUPS, ["b1", "b2"])).blocks).toEqual(["b1", "b2"]);
  });

  it("keeps parts where the user moved them", () => {
    const groups = [
      { id: "fav", title: "Favourites", items: ["nand", "b1"] },
      ...DEFAULT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i !== "nand") })),
    ];
    const out = ids(arrangePalette(groups, ["b1"]));
    expect(out.fav).toEqual(["nand", "b1"]);
    expect(out.gates).not.toContain("nand");
    expect(out.blocks).toEqual([]);
  });

  it("drops deleted blocks, unknown ids and duplicates", () => {
    const groups = [{ id: "a", title: "A", items: ["gone", "and", "and", "nope"] }];
    expect(arrangePalette(groups, [])[0].items.filter((i) => i === "and")).toEqual(["and"]);
    expect(arrangePalette(groups, [])[0].items).not.toContain("gone");
  });

  it("puts every part somewhere when lists were removed", () => {
    const builtins = DEFAULT_GROUPS.flatMap((g) => g.items);
    const out = arrangePalette([{ id: "only", title: "Everything", items: builtins }], ["b1"]);
    expect(out).toHaveLength(1);
    expect(out[0].items).toEqual([...builtins, "b1"]);
  });

  it("adds the list of parts that are new since the layout was saved", () => {
    const saved = DEFAULT_GROUPS.filter((g) => g.id !== "displays");
    const out = arrangePalette(saved, []);
    expect(out.map((g) => g.id)).toEqual(["io", "gates", "wiring", "displays", "blocks"]);
    expect(ids(out).displays).toEqual(["led", "seg7", "dotmatrix", "rgbmatrix"]);
  });

  it("falls back to the defaults for an empty layout", () => {
    expect(arrangePalette([], []).map((g) => g.id)).toEqual(DEFAULT_GROUPS.map((g) => g.id));
  });
});

describe("parsePaletteGroups", () => {
  it("rejects anything that isn't a layout", () => {
    expect(parsePaletteGroups(null)).toBeNull();
    expect(parsePaletteGroups([])).toBeNull();
    expect(parsePaletteGroups([{ id: "a", title: "A", items: [1] }])).toBeNull();
    expect(parsePaletteGroups([{ id: "a", title: "A", items: ["and"] }])).toEqual([
      { id: "a", title: "A", items: ["and"] },
    ]);
  });
});

describe("groupTitleProblem", () => {
  it("needs a unique, non-empty name", () => {
    const groups = [...DEFAULT_GROUPS];
    expect(groupTitleProblem("  ", groups, "io")).not.toBeNull();
    expect(groupTitleProblem("gates", groups, "io")).not.toBeNull();
    expect(groupTitleProblem("Gates", groups, "gates")).toBeNull();
  });
});
