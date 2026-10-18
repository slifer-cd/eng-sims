# Project overview, commands and stack

## Product

A browser-based digital logic simulator. Users wire built-in parts together, save designs as custom chips, and nest those chips in other designs. Roadmap milestones: engine → canvas → live sim → custom chips → buses → polish. Storage is browser-only, with no backend yet. In the UI, saved custom chips are called "blocks". The simulator lives at the `/dls` route (digital logic simulator; the folder is `app/dls`).

## Commands

- `pnpm dev`: dev server at http://localhost:3000 (Turbopack)
- `pnpm build`: production build (also type-checks)
- `pnpm lint`: ESLint (flat config in `eslint.config.mjs`)
- `pnpm test`: Vitest, run once. Single file or test: `pnpm test lib/sim/engine.test.ts -t "half adder"`

## Stack

- Next.js 16 App Router (`app/`, no `src/`), React 19, TypeScript (strict)
- Tailwind CSS v4: configured in CSS via `@import "tailwindcss"` in `app/globals.css`. There is no `tailwind.config.js`. It is compiled by the `@tailwindcss/turbopack` loader registered in `next.config.ts`; there is no PostCSS config.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`. Check the bundled docs before writing data-fetching or caching code.
- Import alias `@/*` maps to the repo root
- Package manager is pnpm. Dependency build scripts are allow-listed via `allowBuilds` in `pnpm-workspace.yaml`.
