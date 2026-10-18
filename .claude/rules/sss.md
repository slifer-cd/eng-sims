---
paths:
  - "lib/sss/**"
  - "components/sss/**"
  - "app/sss/**"
---

# Signals & systems simulator (`/sss`)

- `lib/sss/` is pure TS with no React or DOM imports (tests import it directly, with relative imports, since Vitest has no `@/` alias).
  - `expr/`: tokenizer, parser, AST → LaTeX preview, numeric evaluator. Unknown single letters (or a letter plus digits, `w0`) are parameters with sliders; `r(` is the ramp but a bare `r` is a parameter. `names.ts` is the one table of functions, keypad keys and help text.
  - `signal/`: the exact class. `ExpPoly` is Σ P(t)·e^{λt} (complex rates, polynomials lowest power first); `Signal` is sorted half-open pieces `[from, to)` (bounds may be ±∞) plus impulses. `analyze.ts` maps the AST onto it, keeps sinc/Gaussian as `SpecialTerm`s with table transforms, and returns `numeric` (with a reason) for anything else. Discrete sequences use the same `Signal`, read at integers (`domain: "dt"`; inequalities become integer bounds there, so `u[-n]` includes n = 0).
  - `transforms/`: every transform works piece by piece in closed form. `sdomain.ts` holds `SExpr` (delay groups of partial fractions) and its LaTeX; Laplace's ROC comes from the tails, Fourier is Laplace on the jω axis plus generalized impulses for undamped tails; `convolution.ts` integrates each pair of pieces between limits that are constants or t − c; `series.ts` builds cₖ as one formula in k.
  - `discrete/`: Z-transform terms `coef·z^{−shift}/(1 − p z⁻¹)^order` (tails summed in the binomial basis), DTFT, inverse Z and discrete convolution.
- Plots and readouts must evaluate with the stable direct evaluators (`at`, `epIntegral`, `directTransform`), never the displayed formula: a formula like (1 − e^{−s})/s is 0/0 at s = 0.
- Formatting (`signal/format.ts`, `nice()` in `math/nice.ts`) picks the nicest exact form: rationals, π and √ multiples, e^{r}, e^{λ(t−T)} with T from the breakpoints, conjugate pairs as real sinusoids. Tests pin many LaTeX strings, so check them when changing a formatter.
- `components/sss/`: `plot/Plot.tsx` is a canvas plot drawn through a `draw(api)` callback; it reads the `--plot-*` tokens from `app/globals.css` (with hard-coded fallbacks for the stale-CSS problem). Animations use `anim/clock.ts`: canvases redraw from the clock's subscription, React only re-renders through `useClockValue` with a coarse selector. With `cacheComponents`, hidden pages keep their state but their effects are cleaned up, so clocks pause and canvases skip 0×0 sizes.
- Inputs are shared across pages through the zustand store in `lib/sss/store.ts` (x(t) is the same on Signal, Fourier, Laplace, Convolution and System) and saved to `localStorage` (`eng-sims:sss`, `{ v: 1, inputs }`); `loadInputs` repairs bad fields one by one. `app/sss/error.tsx` offers "Reset inputs".
- Conventions: imaginary unit `j`, ω in rad/s, normalized `sinc(x) = sin(πx)/(πx)`, `log` is log₁₀, `u(0) = 1`, and f·δ(t − a) uses the average of f's one-sided limits at a.
