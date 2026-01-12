const DB_NAME = "kiezzdump";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
        store.createIndex("content", "content", { unique: false });
        store.createIndex("tags", "tags", { unique: false, multiEntry: true });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function runTransaction(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, mode);
    const store = tx.objectStore(STORE_ENTRIES);

    let result;
    try {
      result = fn(store);
    } catch (e) {
      tx.abort();
      reject(e);
      return;
    }

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function createDb() {
  const db = await openDb();
  return {
    async getAllEntries() {
      return runTransaction(db, "readonly", (store) => reqToPromise(store.getAll()));
    },

    async putEntry(entry) {
      return runTransaction(db, "readwrite", (store) => reqToPromise(store.put(entry)));
    },

    async deleteEntry(id) {
      return runTransaction(db, "readwrite", (store) => reqToPromise(store.delete(id)));
    },
  };
}

