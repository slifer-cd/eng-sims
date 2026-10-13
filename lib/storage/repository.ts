import type { ChipDef } from "../model/types";

/**
 * Where saved chips live. The editor only talks to this interface, so a server
 * backend can replace the browser's IndexedDB later.
 */
export interface ChipRepository {
  list(): Promise<ChipDef[]>;
  /** Insert or replace by id. */
  put(chip: ChipDef): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Keeps chips in memory; used by tests and before browser storage is attached. */
export function memoryRepository(initial: ChipDef[] = []): ChipRepository {
  const chips = new Map(initial.map((c) => [c.id, structuredClone(c)]));
  return {
    list: async () => [...chips.values()].map((c) => structuredClone(c)),
    put: async (chip) => {
      chips.set(chip.id, structuredClone(chip));
    },
    delete: async (id) => {
      chips.delete(id);
    },
  };
}
