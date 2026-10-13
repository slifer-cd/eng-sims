import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { makeChip } from "../sim/test-utils";
import { indexedDbRepository } from "./indexedDb";

describe("indexedDbRepository", () => {
  it("stores, replaces and deletes chips across connections", async () => {
    const a = makeChip("a", "A", { components: [], wires: [] });
    const b = makeChip("b", "B", { components: [], wires: [] });
    const repo = indexedDbRepository();
    await repo.put(a);
    await repo.put(b);
    await repo.put({ ...a, name: "A2" });

    // A second connection, as after a page reload.
    const reloaded = indexedDbRepository();
    const names = (await reloaded.list()).map((c) => c.name).sort();
    expect(names).toEqual(["A2", "B"]);

    await reloaded.delete("a");
    expect((await repo.list()).map((c) => c.id)).toEqual(["b"]);
  });
});
