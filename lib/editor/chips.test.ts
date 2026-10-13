import { beforeEach, describe, expect, it } from "vitest";
import type { Circuit } from "../model/types";
import { compile } from "../sim/compile";
import { Engine } from "../sim/engine";
import { CircuitBuilder } from "../sim/test-utils";
import { fromInt, toBitString } from "../sim/value";
import { memoryRepository } from "../storage/repository";
import { designProblems, usedChipIds, wouldContainItself } from "./chips";
import { hasUnsavedWork, useEditor } from "./store";

const s = () => useEditor.getState();

/** NOT made from a NAND with both inputs tied together. Pins: in "A", out "Y". */
function notFromNand(): Circuit {
  const b = new CircuitBuilder();
  const a = b.add("input", {}, "A"), g = b.add("nand"), y = b.add("output", {}, "Y");
  const w = b.wire([a, "out"], [g, "in0"]);
  b.junction(w, [g, "in1"]);
  b.wire([g, "out"], [y, "in"]);
  return b.circuit;
}

/** Input → chip → Output, for a chip with one input and one output pin. */
function around(chipId: string, inPin: string, outPin: string) {
  const b = new CircuitBuilder();
  const i = b.add("input"), n = b.add(chipId), o = b.add("output");
  b.wire([i, "out"], [n, inPin]);
  b.wire([n, outPin], [o, "in"]);
  return { circuit: b.circuit, i, o };
}

beforeEach(async () => {
  await s().attachStorage(memoryRepository());
  s().newDesign();
});

describe("saving blocks", () => {
  it("saves a design as a block that works inside another design", async () => {
    s().load(notFromNand());
    const chip = await s().saveChip({ name: "My NOT", color: "blue" });
    expect(chip.pins.map((p) => [p.name, p.dir])).toEqual([["A", "in"], ["Y", "out"]]);
    expect(s().chips).toEqual([chip]);
    expect(s().openChipId).toBe(chip.id);
    expect(hasUnsavedWork(s())).toBe(false);

    s().newDesign();
    const { circuit, i, o } = around(chip.id, chip.pins[0].id, chip.pins[1].id);
    const netlist = compile(circuit, s().library);
    expect(netlist.errors).toEqual([]);
    const e = new Engine(netlist);
    e.setInput(i, fromInt(1, 0));
    expect(toBitString(e.outputValue(o)!)).toBe("1");
    e.setInput(i, fromInt(1, 1));
    expect(toBitString(e.outputValue(o)!)).toBe("0");
  });

  it("persists blocks to the repository", async () => {
    const repo = memoryRepository();
    await s().attachStorage(repo);
    s().load(notFromNand());
    const chip = await s().saveChip({ name: "My NOT", color: "blue" });
    expect(await repo.list()).toEqual([chip]);

    // A fresh session sees the saved block.
    await s().attachStorage(memoryRepository());
    expect(s().chips).toEqual([]);
    await s().attachStorage(repo);
    expect(s().chips.map((c) => c.name)).toEqual(["My NOT"]);
  });

  it("updating the open block keeps its id, so designs using it pick up new pins", async () => {
    s().load(notFromNand());
    const first = await s().saveChip({ name: "My NOT", color: "blue" });
    s().addComponent("input", { x: 0, y: 100 });
    s().updateComponent(s().selection.comps[0], { label: "B" });
    const second = await s().saveChip({ name: "Renamed", color: "green" });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.pins.map((p) => p.name)).toEqual(["A", "B", "Y"]);
    expect(s().chips).toEqual([second]);
    expect(s().library.get(first.id)?.name).toBe("Renamed");
  });

  it("save as new keeps the original block", async () => {
    s().load(notFromNand());
    const original = await s().saveChip({ name: "My NOT", color: "blue" });
    const copy = await s().saveChip({ name: "My NOT 2", color: "blue" }, { asNew: true });
    expect(copy.id).not.toBe(original.id);
    expect(s().chips.map((c) => c.name)).toEqual(["My NOT", "My NOT 2"]);
    expect(s().openChipId).toBe(copy.id);
  });

  it("rejects designs without pins, duplicate block names and duplicate pin names", async () => {
    s().addComponent("and", { x: 0, y: 0 });
    await expect(s().saveChip({ name: "Empty", color: "blue" })).rejects.toThrow(/Input or Output Pin/);

    s().load(notFromNand());
    await s().saveChip({ name: "My NOT", color: "blue" });
    s().newDesign();
    s().load(notFromNand());
    await expect(s().saveChip({ name: "my not", color: "red" })).rejects.toThrow(/already exists/);
    await expect(s().saveChip({ name: "  ", color: "red" })).rejects.toThrow(/name/);

    const b = new CircuitBuilder();
    b.add("input", {}, "A");
    b.add("input", {}, "A");
    expect(designProblems(b.circuit, s().library, null)).toEqual([expect.stringMatching(/Two pins are named "A"/)]);
  });

  it("tracks unsaved changes through undo", async () => {
    s().load(notFromNand());
    await s().saveChip({ name: "My NOT", color: "blue" });
    s().addComponent("and", { x: 0, y: 0 });
    expect(hasUnsavedWork(s())).toBe(true);
    s().undo();
    expect(hasUnsavedWork(s())).toBe(false);
  });
});

describe("nesting rules", () => {
  /** Saves NOT, then a block "Wrapper" that uses it. */
  async function nested() {
    s().load(notFromNand());
    const inner = await s().saveChip({ name: "My NOT", color: "blue" });
    s().newDesign();
    const { circuit } = around(inner.id, inner.pins[0].id, inner.pins[1].id);
    s().load(circuit);
    const outer = await s().saveChip({ name: "Wrapper", color: "green" });
    return { inner, outer };
  }

  it("finds nested dependencies", async () => {
    const { inner, outer } = await nested();
    expect(usedChipIds(outer.circuit, s().library)).toEqual(new Set([inner.id]));
  });

  it("won't let the open block contain itself", async () => {
    const { inner, outer } = await nested();
    s().openChip(inner.id);
    expect(wouldContainItself(inner.id, inner.id, s().library)).toBe(true);
    expect(wouldContainItself(outer.id, inner.id, s().library)).toBe(true);

    s().addComponent(outer.id, { x: 200, y: 0 });
    await expect(s().saveChip({ name: "My NOT", color: "blue" })).rejects.toThrow(/contain itself/);
  });

  it("won't delete a block that another block uses", async () => {
    const { inner, outer } = await nested();
    await expect(s().deleteChip(inner.id)).rejects.toThrow(/Wrapper/);

    // Wrapper is still open on the canvas: deleting it leaves the design unsaved.
    expect(s().openChipId).toBe(outer.id);
    await s().deleteChip(outer.id);
    expect(s().openChipId).toBeNull();
    expect(hasUnsavedWork(s())).toBe(true);

    await s().deleteChip(inner.id);
    expect(s().chips).toEqual([]);
  });
});

describe("restoring a draft", () => {
  it("treats a draft identical to its block as saved", async () => {
    const repo = memoryRepository();
    await s().attachStorage(repo);
    s().load(notFromNand());
    const chip = await s().saveChip({ name: "My NOT", color: "blue" });

    s().load(structuredClone(chip.circuit), { chipId: chip.id, saved: false });
    expect(hasUnsavedWork(s())).toBe(true);
    await s().attachStorage(repo);
    expect(hasUnsavedWork(s())).toBe(false);
    expect(s().openChipId).toBe(chip.id);
  });

  it("forgets a block that no longer exists", async () => {
    s().load(notFromNand(), { chipId: "gone", saved: false });
    await s().attachStorage(memoryRepository());
    expect(s().openChipId).toBeNull();
    expect(hasUnsavedWork(s())).toBe(true);
  });

  it("reports storage that can't be read", async () => {
    const broken = memoryRepository();
    broken.list = () => Promise.reject(new Error("blocked"));
    await s().attachStorage(broken);
    expect(s().storageError).toBe("blocked");
  });
});
