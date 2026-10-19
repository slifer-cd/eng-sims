---
paths:
  - "lib/calc/**"
  - "components/calc/**"
  - "app/calc/**"
---

# Bits & Logic (`/calc`)

- `lib/calc/` is pure TS with no React or DOM imports (tests use relative imports). Steps reuse `Step` from `lib/sss/steps.ts`; step titles are plain text, lines are LaTeX.
  - `bases.ts`, `signed.ts`, `ieee754.ts`: whole numbers are `bigint`s so 64-bit values stay exact. The tsconfig target (ES2017) has no bigint literals: write `BigInt(1)` / `big(1)` or the `B0`/`B1` constants, never `1n`.
  - `ieee754.ts` gets the bits from a `DataView`, the exact stored value from the integer mantissa × 2^e, and the rounding error by comparing exact decimals. float32 input goes through a float64 first (`Number(text)`), so a rare double-rounding case is possible.
  - `logic/expr.ts`: Boolean parser. Precedence is NOT > AND (juxtaposition too) > XOR > OR. Each letter is its own variable (`AB` is A·B), with optional digits (`X1`). The words and/or/xor/not are operators.
  - `logic/truth.ts`: row r is minterm m_r, first variable = most significant bit. `logic/qm.ts`: Quine–McCluskey with Petrick's method, falling back to greedy past `PETRICK_LIMIT` products (`method: "greedy"`, which the page flags). POS = minimise the 0s and apply De Morgan (`qmSteps(r, vars, true)`). `logic/kmap.ts`: Gray-code layout for 2–4 variables, with a group that wraps split into rectangles with `open` edges.
- `lib/calc/tex.test.ts` renders every step in strict KaTeX. `logic.test.ts` checks the minimiser against a brute-force cheapest cover for ≤4 variables, so keep both passing when changing a formatter or the cover choice.
- Inputs live in the zustand store `lib/calc/store.ts`, saved to `localStorage` (`eng-sims:calc`, `{ v: 1, inputs }`) and repaired field by field in `loadInputs`. The truth-table page hands its function to the K-map page through the store (`kmap: { names, cells }`, cells a string of 0/1/x).
- `components/calc/`: `CalcShell` (nav list in `NAV`), `ui.tsx` (`TextField`, `BitStrip`, `CopyButton`), `KmapGrid`, and one view per page in `views/`. Layout pieces (`Panel`, `StepsPanel`, `Segmented` …) and `Tex` come from `components/sss/`.
- Fields that edit store values as you type (K-map names and minterm list) keep a local draft and sync from the store only when the value changed elsewhere. Don't key them by the store value: they would remount and lose focus on every keystroke.
