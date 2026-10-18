---
paths:
  - "lib/storage/**"
  - "lib/editor/store.ts"
  - "lib/editor/palette.ts"
  - "lib/editor/draft.ts"
  - "components/editor/Editor.tsx"
  - "app/dls/error.tsx"
---

# Storage

- `lib/storage/`: the `ChipRepository` interface (`list`/`put`/`delete`). `indexedDb.ts` implements it in the browser; `memoryRepository` is for tests. `restoreSession` in `lib/editor/draft.ts` (called from `Editor.tsx` on mount) restores the draft and calls `attachStorage(indexedDbRepository())`; until then the store uses an in-memory repository. It runs once per page load: with `cacheComponents`, leaving `/dls` hides the editor (React `<Activity>`) and its effects run again on return, and restoring again would wipe undo history.
- The canvas draft is not a block: it is autosaved separately to `localStorage` (`eng-sims:scratch`, `{ circuit, chipId }`; keys are in `localKeys.ts`) because that write is synchronous on `pagehide`.
- The left bar's list layout (Ctrl+L menu) is also in `localStorage` (`eng-sims:palette`). It may name deleted blocks or miss new ones, so always pass it through `arrangePalette` in `lib/editor/palette.ts`.
