import type { Project } from "../embroidery/types";
import { validateProject } from "../embroidery/project";
import type { TraceOptions } from "../embroidery/raster";

export type SavedProject = {
  id: string;
  revision: number;
  restoredRevision?: number | null;
};
export type PendingSave = {
  id: string;
  saveId: string;
  expectedRevision: number;
  project: Project;
};
export type RecoveryDraft = {
  id: string;
  namespace: string;
  updatedAt: number;
  project: Project;
  saved: SavedProject | null;
  dirty: boolean;
  pendingSave?: PendingSave;
};
export type ConversionDraft = {
  id: string;
  namespace: string;
  updatedAt: number;
  file: File;
  vector: Project | null;
  options: TraceOptions;
  selected: string[];
  split: boolean;
  stale: boolean;
  detail: string;
  assetId: string;
};
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!connection) {
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("threadform-recovery", 3);
      let abandoned = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("artwork"))
          db.createObjectStore("artwork", { keyPath: "key" });
        for (const name of ["drafts", "conversions"])
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: "id" });
            store.createIndex("recent", ["namespace", "updatedAt"]);
          }
      };
      request.onsuccess = () => {
        if (abandoned) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error);
      };
      request.onblocked = () => {
        abandoned = true;
        reject(
          new Error("Close older studio tabs to enable recovery storage."),
        );
      };
    });
    connection = pending;
    // A synchronous SecurityError from indexedDB.open must also be retryable
    // after browser storage is enabled. Do not cache a rejected connection.
    void pending.catch(() => {
      if (connection === pending) connection = undefined;
    });
  }
  return connection;
}
export async function rememberArtwork(
  namespace: string,
  id: string,
  file: File,
): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("artwork", "readwrite");
    tx.objectStore("artwork").put({
      key: JSON.stringify([namespace, id]),
      namespace,
      id,
      file,
      name: file.name,
    });
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        tx.error ?? new Error("Artwork could not be saved on this device."),
      );
  });
}
export async function cachedArtwork(
  namespace: string,
  id: string,
): Promise<File | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("artwork")
      .objectStore("artwork")
      .get(JSON.stringify([namespace, id]));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const entry = request.result;
      resolve(
        entry?.namespace === namespace &&
          entry.id === id &&
          entry.file instanceof Blob
          ? new File([entry.file], entry.name, { type: entry.file.type })
          : null,
      );
    };
  });
}
export async function writeConversion(draft: ConversionDraft): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("conversions", "readwrite");
    tx.objectStore("conversions").put(draft);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        tx.error ?? new Error("Conversion recovery could not be written."),
      );
  });
}
export async function latestConversion(
  namespace: string,
): Promise<ConversionDraft | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("conversions")
      .objectStore("conversions")
      .index("recent")
      .openCursor(
        IDBKeyRange.bound([namespace, 0], [namespace, Number.MAX_SAFE_INTEGER]),
        "prev",
      );
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const draft = request.result?.value as ConversionDraft | undefined;
      if (!draft) return resolve(null);
      try {
        if (draft.namespace !== namespace || !(draft.file instanceof Blob))
          throw new Error("Invalid conversion draft.");
        resolve({
          ...draft,
          file: new File([draft.file], draft.file.name, {
            type: draft.file.type,
          }),
          vector: draft.vector ? validateProject(draft.vector) : null,
        });
      } catch {
        request.result!.continue();
      }
    };
  });
}
export async function writeRecovery(draft: RecoveryDraft): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(draft);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error("Local recovery could not be written."));
  });
}
export async function latestRecovery(
  namespace: string,
): Promise<RecoveryDraft | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("drafts")
      .objectStore("drafts")
      .index("recent")
      .openCursor(
        IDBKeyRange.bound([namespace, 0], [namespace, Number.MAX_SAFE_INTEGER]),
        "prev",
      );
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const draft = request.result?.value as RecoveryDraft | undefined;
      if (!draft) return resolve(null);
      try {
        if (draft.namespace !== namespace)
          throw new Error("Recovery owner mismatch.");
        const project = validateProject(draft.project);
        const pendingSave = draft.pendingSave
          ? {
              ...draft.pendingSave,
              project: validateProject(draft.pendingSave.project),
            }
          : undefined;
        resolve({ ...draft, project, pendingSave });
      } catch {
        // A damaged draft must not prevent an older valid one from opening.
        request.result!.continue();
      }
    };
  });
}
