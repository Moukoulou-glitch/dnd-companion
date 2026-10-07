import type { Character, Operation } from "@dnd/schema";
import type { RollRecord } from "./rolls";

/** What is stored per character: the starting snapshot and every operation since. */
export interface StoredCharacter {
  id: string;
  snapshot: Character;
  ops: Operation[];
  /** Most recent rolls, newest first. */
  rolls?: RollRecord[];
  /** For the bundled reference characters: which version of the fixture the snapshot came from. */
  fixtureHash?: string;
}

const DB_NAME = "table-companion";
const STORE = "characters";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = body(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const db = {
  all: () => run<StoredCharacter[]>("readonly", (s) => s.getAll() as IDBRequest<StoredCharacter[]>),
  put: (record: StoredCharacter) => run("readwrite", (s) => s.put(record)),
  remove: (id: string) => run("readwrite", (s) => s.delete(id)),
};

/**
 * Asks the browser not to evict our data under storage pressure. iOS honours
 * this for apps installed to the home screen.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** A stable id for this device, used in operation timestamps. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("device-id");
    if (!id) {
      id = crypto.randomUUID().slice(0, 8);
      localStorage.setItem("device-id", id);
    }
    return id;
  } catch {
    return "device";
  }
}
