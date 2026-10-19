---
paths:
  - "app/**"
  - "components/**"
---

# Styling and theme tokens

- Editor colours are theme tokens in `app/globals.css` (`fill-chip`, `stroke-wire`, `bg-panel`, …). To add a new token, define the CSS var in `:root`, define it again in the dark-mode block, and map it under `@theme inline` as `--color-*`.
- Block colours are the exception: they live in `BLOCK_PALETTE` in `lib/editor/chips.ts` and are applied inline with `light-dark()`, so they don't depend on the stale-CSS problem below.
- Site pages (home, 404, loading, errors) take their lab-bench look (graph paper, flat panels, buttons) from `components/site/Bench.tsx`. It is built on the shared tokens (`canvas`, `grid`, `line`, `panel`, `accent`), as are the home page previews in `components/home/` (`fill-chip`, `stroke-sig-1`, `stroke-plot-axis`, …), so the stale-CSS problem below affects site pages too. Blue (`accent`) is the only site accent; red is for errors.
- Stale CSS: the dev server sometimes misses `globals.css` edits and keeps serving the old CSS (even plain `:root` vars go missing). Re-save the file with a real content change; restarting `pnpm dev` alone may not help, because the stale CSS can survive a restart. A new token that's missing breaks anything built on it with no visible error (e.g. a gradient that uses `var(--canvas-glow)` silently disappears). To check what is actually served, curl the `.css` chunk linked from `/dls` and grep it for the var.
