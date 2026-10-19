import { describe, expect, it } from "vitest";
import { boolTex, boolText, evaluate, parseBool, sortVars, subexpressions } from "./expr";
import { cellMinterm, implicantRects, kmapLayout } from "./kmap";
import { covers, cubePattern, type Implicant, literals, minimise, posTex, sopText, sopTex } from "./qm";
import { canonicalSop, cellsFrom, envFor, parseMinterms, rowsWhere, truthTable } from "./truth";

/** A tiny seeded generator so the random cases are the same every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

describe("Boolean expressions", () => {
  it("parses every notation to the same function", () => {
    const base = parseBool("A B' + C");
    if (!base.ok) throw new Error(base.error);
    const want = truthTable(base.expr, ["A", "B", "C"]);
    for (const text of ["A·!B + C", "A & ~B | C", "a and not b or c", "AB' + C", "A ∧ ¬B ∨ C", "(A)(B)' + C"]) {
      const p = parseBool(text.toLowerCase() === text ? text.toUpperCase() : text);
      expect(p.ok, text).toBe(true);
      if (p.ok) expect(truthTable(p.expr, ["A", "B", "C"]), text).toEqual(want);
    }
  });

  it("binds NOT, then AND, then XOR, then OR", () => {
    const p = parseBool("A + B ^ C D'");
    expect(p.ok && boolTex(p.expr)).toBe("A + B \\oplus C\\overline{D}");
    const q = parseBool("(A + B)'C");
    expect(q.ok && boolTex(q.expr)).toBe("\\overline{A + B}\\,C");
    expect(q.ok && boolText(q.expr)).toBe("(A + B)' C");
  });

  it("splits letters but keeps digits with them", () => {
    const p = parseBool("AB1 + X10 X2");
    expect(p.ok && p.vars).toEqual(["A", "B1", "X2", "X10"]);
    expect(sortVars(["b", "A", "C"])).toEqual(["A", "b", "C"]);
  });

  it("reports where it went wrong", () => {
    expect(parseBool("A + ")).toMatchObject({ ok: false, at: 4 });
    expect(parseBool("(A + B")).toMatchObject({ ok: false });
    expect(parseBool("A + B)")).toMatchObject({ ok: false, at: 5 });
    expect(parseBool("A $ B")).toMatchObject({ ok: false, at: 2 });
    expect(parseBool("")).toMatchObject({ ok: false });
  });

  it("evaluates XOR as odd parity", () => {
    const p = parseBool("A ^ B ^ C");
    if (!p.ok) throw new Error();
    expect(rowsWhere(truthTable(p.expr, p.vars), "1")).toEqual([1, 2, 4, 7]);
    expect(evaluate(p.expr, envFor(7, p.vars))).toBe(true);
  });

  it("lists sub-expressions inner first", () => {
    const p = parseBool("(A + B)'C + A");
    if (!p.ok) throw new Error();
    expect(subexpressions(p.expr).map((e) => boolTex(e))).toEqual(["A + B", "\\overline{A + B}", "\\overline{A + B}\\,C", "\\overline{A + B}\\,C + A"]);
  });
});

describe("minterm lists", () => {
  it("reads the usual forms", () => {
    expect(parseMinterms("Σm(1, 3, 7) + d(5)", 3)).toEqual({ ok: true, ones: [1, 3, 7], dcs: [5] });
    expect(parseMinterms("7 3 1", 3)).toEqual({ ok: true, ones: [1, 3, 7], dcs: [] });
    expect(parseMinterms("m(1,8)", 3).ok).toBe(false);
    expect(parseMinterms("1, 2 + d(2)", 3).ok).toBe(false);
  });

  it("writes the canonical form", () => {
    expect(canonicalSop(cellsFrom(2, [1, 2], []), ["A", "B"])).toBe("\\overline{A}B + A\\overline{B}");
  });
});

/** Cheapest cover by brute force over subsets of every cube: (terms, literals). */
function bruteCost(n: number, ones: number[], dcs: number[]): [number, number] {
  const cubes: Implicant[] = [];
  const fs = new Set([...ones, ...dcs]);
  for (let dash = 0; dash < 1 << n; dash++) {
    for (let bits = 0; bits < 1 << n; bits++) {
      if (bits & dash) continue;
      const c = { bits, dash };
      let ok = true;
      for (let m = 0; m < 1 << n && ok; m++) if (covers(c, m) && !fs.has(m)) ok = false;
      if (ok) cubes.push(c);
    }
  }
  // Only maximal cubes (the primes) can be in a cheapest cover.
  const primes = cubes.filter((c) => !cubes.some((d) => d !== c && (c.dash & d.dash) === c.dash && d.dash !== c.dash && covers(d, c.bits)));
  let best: [number, number] = [Infinity, Infinity];
  for (let s = 1; s < 1 << primes.length; s++) {
    const pick = primes.filter((_, i) => (s >> i) & 1);
    if (pick.length > best[0]) continue;
    if (!ones.every((m) => pick.some((p) => covers(p, m)))) continue;
    const lits = pick.reduce((t, p) => t + literals(p, n), 0);
    if (pick.length < best[0] || lits < best[1]) best = [pick.length, lits];
  }
  return best;
}

describe("Quine–McCluskey", () => {
  it("solves the textbook example", () => {
    // F = Σm(4, 8, 10, 11, 12, 15) + d(9, 14) → AB' + AC + BC'D'
    const r = minimise(4, [4, 8, 10, 11, 12, 15], [9, 14]);
    expect(r.cover.map((i) => cubePattern(r.primes[i], 4)).sort()).toEqual(["-100", "1-1-", "10--"].sort());
    expect(sopTex(r, ["A", "B", "C", "D"])).toContain("A\\overline{B}");
  });

  it("uses Petrick's method on a cyclic map", () => {
    // Σm(0,1,2,5,6,7): every minterm has two primes, no essentials.
    const r = minimise(3, [0, 1, 2, 5, 6, 7], []);
    expect(r.essential).toEqual([]);
    expect(r.method).toBe("petrick");
    expect(r.cover).toHaveLength(3);
  });

  it("handles constants", () => {
    expect(sopTex(minimise(3, [], []), ["A", "B", "C"])).toBe("0");
    const all = minimise(2, [0, 1, 2, 3], []);
    expect(sopText(all, ["A", "B"])).toBe("1");
    expect(posTex(minimise(2, [], [0, 1, 2, 3]), ["A", "B"])).toBe("1");
  });

  it("finds a cheapest correct cover for random functions", () => {
    const rand = rng(7);
    for (let t = 0; t < 120; t++) {
      const n = 2 + (t % 3) + (t > 60 ? 1 : 0); // 2–5 variables
      const ones: number[] = [];
      const dcs: number[] = [];
      for (let m = 0; m < 1 << n; m++) {
        const x = rand();
        if (x < 0.4) ones.push(m);
        else if (x < 0.5) dcs.push(m);
      }
      const r = minimise(n, ones, dcs);
      const chosen = r.cover.map((i) => r.primes[i]);
      for (let m = 0; m < 1 << n; m++) {
        const out = chosen.some((p) => covers(p, m));
        if (ones.includes(m)) expect(out).toBe(true);
        else if (!dcs.includes(m)) expect(out).toBe(false);
      }
      if (n <= 4 && ones.length) {
        const lits = chosen.reduce((s, p) => s + literals(p, n), 0);
        expect([chosen.length, lits], `n=${n} ${ones} d${dcs}`).toEqual(bruteCost(n, ones, dcs));
      }
    }
  });

  it("covers bigger functions correctly", () => {
    const rand = rng(3);
    for (const n of [6, 8]) {
      const ones = Array.from({ length: 1 << n }, (_, m) => m).filter(() => rand() < 0.3);
      const r = minimise(n, ones, []);
      for (let m = 0; m < 1 << n; m++) expect(r.cover.some((i) => covers(r.primes[i], m))).toBe(ones.includes(m));
    }
  });
});

describe("K-map layout", () => {
  it("puts minterms in Gray-code order", () => {
    const l = kmapLayout(4);
    const grid = l.rowCodes.map((_, r) => l.colCodes.map((_, c) => cellMinterm(l, r, c)));
    expect(grid).toEqual([
      [0, 1, 3, 2],
      [4, 5, 7, 6],
      [12, 13, 15, 14],
      [8, 9, 11, 10],
    ]);
  });

  it("splits groups that wrap round the edges", () => {
    const l = kmapLayout(4);
    // The four corners: B'D'.
    const corners = implicantRects(l, { bits: 0, dash: 0b1010 });
    expect(corners).toHaveLength(4);
    expect(corners[0]).toMatchObject({ r0: 0, c0: 0, open: { top: true, left: true } });
    // A middle block: BD.
    expect(implicantRects(l, { bits: 0b0101, dash: 0b1010 })).toEqual([
      { r0: 1, r1: 2, c0: 1, c1: 2, open: { top: false, bottom: false, left: false, right: false } },
    ]);
    expect(implicantRects(kmapLayout(3), { bits: 0, dash: 0b100 })[0]).toMatchObject({ r0: 0, r1: 1, c0: 0, c1: 0 });
  });
});
