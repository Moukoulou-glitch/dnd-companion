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
  /** Set when the player deleted the character: it is kept so it can be restored. */
  deletedAt?: number;
}

/** A book file the player loaded; it stays on this device only. */
export interface StoredBook {
  name: string;
  text: string;
}

const DB_NAME = "table-companion";
const STORE = "characters";
const BOOKS = "books";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      if (!d.objectStoreNames.contains(BOOKS)) d.createObjectStore(BOOKS, { keyPath: "name" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = body(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const db = {
  all: () => run<StoredCharacter[]>("readonly", (s) => s.getAll() as IDBRequest<StoredCharacter[]>),
  put: (record: StoredCharacter) => run("readwrite", (s) => s.put(record)),
  remove: (id: string) => run("readwrite", (s) => s.delete(id)),
  books: () => run<StoredBook[]>("readonly", (s) => s.getAll() as IDBRequest<StoredBook[]>, BOOKS),
  putBook: (b: StoredBook) => run("readwrite", (s) => s.put(b), BOOKS),
  clearBooks: () => run("readwrite", (s) => s.clear(), BOOKS),
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
