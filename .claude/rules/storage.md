---
paths:
  - "lib/storage/**"
  - "lib/editor/store.ts"
  - "lib/editor/palette.ts"
  - "components/editor/Editor.tsx"
  - "app/dls/error.tsx"
---

# Storage

- `lib/storage/`: the `ChipRepository` interface (`list`/`put`/`delete`). `indexedDb.ts` implements it in the browser; `memoryRepository` is for tests. `Editor.tsx` calls `attachStorage(indexedDbRepository())` on mount, and until then the store uses an in-memory repository.
- The canvas draft is not a block: it is autosaved separately to `localStorage` (`eng-sims:scratch`, `{ circuit, chipId }`; keys are in `localKeys.ts`) because that write is synchronous on `pagehide`.
- The left bar's list layout (Ctrl+L menu) is also in `localStorage` (`eng-sims:palette`). It may name deleted blocks or miss new ones, so always pass it through `arrangePalette` in `lib/editor/palette.ts`.
- Tests run IndexedDB code through `fake-indexeddb/auto`.
