# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

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

## Logic simulator architecture

The product is a browser-based digital logic simulator. Users wire built-in parts together, save designs as custom chips, and nest those chips in other designs. Roadmap milestones: engine → canvas → live sim → custom chips → buses → polish. Storage is browser-only, with no backend yet. In the UI, saved custom chips are called "blocks".

- `lib/model/`: plain serialisable data (`ChipDef`, `Circuit`, `ComponentInst`, `Wire`). A custom chip's external pins *are* the Input/Output Pin components inside its circuit: `PinDef.id` equals the inner component's id, and `derivePins` builds the pin list.
- `lib/sim/` is pure TS with no React or DOM imports, so it can move into a Web Worker later. Keep it that way.
  - `value.ts`: 4-state (0/1/Z/X) values up to 32 bits wide, packed as bitplanes `{v, z, x}`. Always build values with `make()` so that comparing with `equals` works.
  - `builtins.ts`: the registry of uneditable primitives. Pins depend on props such as `width`, `inputs` and `parts`.
  - `compile.ts`: flattens nested custom chips into primitives plus nets, using union-find over string keys (`pinKey(path, compId, pinId)`; instance paths look like `"adder1/"`). Input/Output Pins inside a nested chip are not primitives; their nets merge with the parent's nets.
  - `engine.ts`: event-driven, with a FIFO queue that evaluates one primitive at a time (not delta cycles). This deliberately breaks the symmetry of cross-coupled gates, so latches built from gates settle. An evaluation budget flags oscillation. Several drivers on one net are combined with `resolveAll`: lone Z drivers lose, and disagreeing drivers produce X.
- `lib/editor/`: editor logic with no React. `layout.ts` handles geometry (sizes are multiples of 2·GRID, so every pin lands on a grid point at any rotation). `ops.ts` holds pure circuit edits written for immer drafts. `scene.ts` resolves world positions of pins and wires (junctions are projected onto the wire they attach to). `store.ts` is the zustand + immer store.
  - Undo is a stack of immutable circuit snapshots: call `edit(recipe)` once per user action. A drag is previewed with `MovePreview` and committed once on drop. Never `structuredClone` the immer draft (`s.circuit` inside `set`); use `get()`.
  - `openChipId` is the block open for editing, and saving updates it in place. Keeping the same id lets parents pick up the change. `savedCircuit` is the circuit as last saved or opened, and "unsaved" means `circuit !== savedCircuit` compared by reference, so undoing back to the save point counts as clean. Build any new `library` from plain arrays outside `set`. Calling `chipLibrary(s.chips)` on a draft captures revoked proxies.
  - `chips.ts` holds the block rules: validation (`nameProblem`, `designProblems`), `wouldContainItself` (greys out palette entries while a block is open) and `chipUsers` (blocks a delete). `saveChip`/`deleteChip` re-check these, so the UI checks are only for nicer messages.
- `lib/storage/`: the `ChipRepository` interface (`list`/`put`/`delete`). `indexedDb.ts` implements it in the browser; `memoryRepository` is for tests. `Editor.tsx` calls `attachStorage(indexedDbRepository())` on mount, and until then the store uses an in-memory repository. The canvas draft is not a block: it is autosaved separately to `localStorage` (`eng-sims:scratch`, `{ circuit, chipId }`) because that write is synchronous on `pagehide`. Tests run IndexedDB code through `fake-indexeddb/auto`.
- `lib/editor/simStore.ts`: owns the `Engine`. `Editor.tsx` recompiles it on every circuit change, passing `previous` so inputs, latch state and time survive edits, and drives `advance()` from requestAnimationFrame while running. Views subscribe to `version` and read values straight from the engine; unchanged nets keep the same `Value` object, so memoised views skip re-rendering. Input values are simulation state, not part of the circuit or undo history.
- `components/editor/`: the SVG canvas UI, at the `/editor` route. Clicks are routed by `data-hit` / `data-comp` / `data-pin` / `data-wire` attributes in `Canvas.tsx`. `actions.ts` holds user actions that may need `confirm`/`alert` (discarding unsaved work, deleting a block); keep browser prompts out of the store. Global shortcuts are off while `saveDialogOpen` is true. Colours are theme tokens in `app/globals.css` (`fill-chip`, `stroke-wire`, `bg-panel`, …). To add a new token, define the CSS var in `:root`, define it again in the dark-mode block, and map it under `@theme inline` as `--color-*`. Block colours (`--block-<name>`) are the exception: they are used only through `chipFill()` in `var()` and are not mapped. The dev server sometimes misses `globals.css` edits and keeps serving the old CSS (even plain `:root` vars go missing). Re-save the file with a real content change, or restart `pnpm dev`.
- Tests build circuits with `CircuitBuilder` / `makeChip` / `library` from `lib/sim/test-utils.ts`.
