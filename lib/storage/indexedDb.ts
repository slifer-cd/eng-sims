import type { ChipDef } from "../model/types";
import type { ChipRepository } from "./repository";

const DB_NAME = "eng-sims";
const DB_VERSION = 1;
const CHIPS = "chips";

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is not available"));
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    // Version 1: ChipDefs keyed by id.
    req.result.createObjectStore(CHIPS, { keyPath: "id" });
  };
  return result(req).then((db) => {
    // Let another tab with a newer version upgrade instead of blocking it.
    db.onversionchange = () => db.close();
    return db;
  });
}

/** Run writes in one transaction, resolving once they are committed. */
function write(db: IDBDatabase, writes: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHIPS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Save was aborted"));
    writes(tx.objectStore(CHIPS));
  });
}

/** Chips stored in this browser's IndexedDB, so each browser profile has its own library. */
export function indexedDbRepository(): ChipRepository {
  let db: Promise<IDBDatabase> | undefined;
  const getDb = () =>
    (db ??= openDb().catch((e) => {
      // Try again next time rather than caching the failure.
      db = undefined;
      throw e;
    }));

  return {
    async list() {
      const store = (await getDb()).transaction(CHIPS).objectStore(CHIPS);
      return (await result(store.getAll())) as ChipDef[];
    },
    async put(chip) {
      await write(await getDb(), (s) => s.put(chip));
    },
    async delete(id) {
      await write(await getDb(), (s) => s.delete(id));
    },
  };
}
