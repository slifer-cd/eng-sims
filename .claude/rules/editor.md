---
paths:
  - "lib/editor/**"
  - "components/editor/**"
  - "app/dls/**"
---

# Editor

- `lib/editor/`: editor logic with no React. `layout.ts` handles geometry (sizes are multiples of 2·GRID, so every pin lands on a grid point at any rotation). `ops.ts` holds pure circuit edits written for immer drafts. `scene.ts` resolves world positions of pins and wires (junctions are projected onto the wire they attach to). `store.ts` is the zustand + immer store.
  - Undo is a stack of immutable circuit snapshots: call `edit(recipe)` once per user action. A drag is previewed with `MovePreview` and committed once on drop. Never `structuredClone` the immer draft (`s.circuit` inside `set`); use `get()`.
  - `openChipId` is the block open for editing, and saving updates it in place. Keeping the same id lets parents pick up the change. `savedCircuit` is the circuit as last saved or opened, and "unsaved" means `circuit !== savedCircuit` compared by reference, so undoing back to the save point counts as clean. Build any new `library` from plain arrays outside `set`. Calling `chipLibrary(s.chips)` on a draft captures revoked proxies.
  - `chips.ts` holds the block rules: validation (`nameProblem`, `designProblems`), `wouldContainItself` (greys out palette entries while a block is open) and `chipUsers` (blocks a delete). `saveChip`/`deleteChip` re-check these, so the UI checks are only for nicer messages.
- Displays on blocks: `lib/editor/displays.ts` decides what a component draws on its body (`FaceItem`). A block shows every display inside it, at any depth, unless that display or a block between has `showOnBlock: false`. Each `FaceItem.route` is the chain of component ids down to the display; `faceLocation` turns it into an engine instance path. `layoutChip` sizes the body to fit the face. `components/editor/DisplayView.tsx` subscribes to `useSim` itself, so the Canvas doesn't pass display values down.
- `lib/editor/simStore.ts`: owns the `Engine`. `Editor.tsx` recompiles it on every circuit change, passing `previous` so inputs, latch state and time survive edits, and drives `advance()` from requestAnimationFrame while running. Views subscribe to `version` and read values straight from the engine; unchanged nets keep the same `Value` object, so memoised views skip re-rendering. Input values are simulation state, not part of the circuit or undo history.
- `components/editor/`: the SVG canvas UI. Clicks are routed by `data-hit` / `data-comp` / `data-pin` / `data-wire` attributes in `Canvas.tsx`. `actions.ts` holds user actions that may need `confirm`/`alert` (discarding unsaved work, deleting a block); keep browser prompts out of the store. Global shortcuts are off while `saveDialogOpen` is true.
