import { describe, expect, it } from "vitest";
import { UnionFind } from "./unionFind";

describe("UnionFind", () => {
  it("joins keys into one set", () => {
    const uf = new UnionFind();
    for (const k of ["a", "b", "c", "d"]) uf.add(k);
    uf.union("a", "b");
    uf.union("c", "b");
    expect(uf.find("a")).toBe(uf.find("c"));
    expect(uf.find("d")).not.toBe(uf.find("a"));
  });

  it("knows which keys it has", () => {
    const uf = new UnionFind();
    uf.add("x");
    uf.add("x");
    expect(uf.has("x")).toBe(true);
    expect(uf.has("y")).toBe(false);
    expect([...uf.keys()]).toEqual(["x"]);
  });
});
