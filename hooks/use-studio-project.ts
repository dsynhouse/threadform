"use client";
import { createId } from "@/lib/embroidery/id";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSample } from "@/lib/embroidery/samples";
import { validateProject } from "@/lib/embroidery/project";
import type { EditorState, Project } from "@/lib/embroidery/types";
import {
  latestConversion,
  writeConversion,
  latestRecovery,
  writeRecovery,
  type SavedProject,
  type PendingSave,
  cachedArtwork,
  rememberArtwork,
} from "@/lib/client/recovery";
import {
  api,
  errorMessage,
  resetStudioSession,
  ApiError,
} from "@/components/studio/controls";
import { uploadArtwork } from "@/lib/client/artwork-storage";

type Account = {
  configured: boolean;
  namespace: string;
  user: { id: string } | null;
};
export function useStudioProject() {
  const [project, setProject] = useState<Project>(() => createSample());
  const [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedProject | null>(null);
  const [ready, setReady] = useState(false),
    [syncError, setSyncError] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryTime, setRecoveryTime] = useState(0),
    [restoration, setRestoration] = useState(0);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const [editorVersion, setEditorVersion] = useState(0);
  const [namespaceValue, setNamespaceValue] = useState("");
  const current = useRef(project),
    savedRef = useRef<SavedProject | null>(null);
  const history = useRef<Project[]>([]),
    future = useRef<Project[]>([]);
  const savingRef = useRef(false),
    documentGeneration = useRef(0);
  const namespace = useRef<string | null>(null),
    draftId = useRef<string>("");
  const dirtyRef = useRef(false),
    editorDirty = useRef(false);
  const editor = useRef<EditorState | undefined>(undefined);
  const pendingSave = useRef<PendingSave | undefined>(undefined);
  const syncBlocked = useRef(false);
  const alive = useRef(true),
    initialized = useRef(false);
  const saveRef = useRef<(copy?: boolean) => Promise<SavedProject | undefined>>(
    async () => undefined,
  );
  const checkpoint = useCallback(async () => {
    if (!namespace.current || !draftId.current) return;
    const updatedAt = Date.now();
    const draft = {
      id: draftId.current,
      namespace: namespace.current,
      updatedAt,
      project: { ...current.current, editorState: editor.current },
      saved: savedRef.current,
      dirty: dirtyRef.current,
      pendingSave: pendingSave.current,
    };
    try {
      await writeRecovery(draft);
      if (
        alive.current &&
        namespace.current === draft.namespace &&
        draftId.current === draft.id
      ) {
        setRecoveryTime(updatedAt);
        setRecoveryError("");
      }
    } catch {
      if (
        alive.current &&
        namespace.current === draft.namespace &&
        draftId.current === draft.id
      )
        setRecoveryError(
          "Local recovery is unavailable. Save online or download a project copy before closing.",
        );
    }
  }, []);
  const markDirty = () => {
    // A corrected validation failure can be saved again. Conflicts and
    // interrupted writes retain their pending identity until explicitly resolved.
    if (!pendingSave.current) syncBlocked.current = false;
    dirtyRef.current = true;
    setDirty(true);
  };
  const commit = useCallback((next: Project) => {
    history.current = [...history.current.slice(-49), current.current];
    future.current = [];
    current.current = next;
    setProject(next);
    markDirty();
    setHistoryCounts({ undo: history.current.length, redo: 0 });
  }, []);
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    current.current = previous;
    setProject(previous);
    markDirty();
    setHistoryCounts({
      undo: history.current.length,
      redo: future.current.length,
    });
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(current.current);
    current.current = next;
    setProject(next);
    markDirty();
    setHistoryCounts({
      undo: history.current.length,
      redo: future.current.length,
    });
  }, []);
  const open = useCallback(
    (next: Project, cloud?: SavedProject) => {
      void checkpoint();
      documentGeneration.current++;
      history.current = [];
      future.current = [];
      pendingSave.current = undefined;
      draftId.current = createId();
      current.current = next;
      editor.current = next.editorState;
      savedRef.current = cloud ?? null;
      dirtyRef.current =
        !cloud ||
        !!(cloud.restoredRevision && cloud.restoredRevision !== cloud.revision);
      setProject(next);
      setSaved(cloud ?? null);
      setDirty(dirtyRef.current);
      setHistoryCounts({ undo: 0, redo: 0 });
      setSyncError("");
      syncBlocked.current = false;
      setRestoration((v) => v + 1);
    },
    [checkpoint],
  );
  const updateEditor = useCallback((next: EditorState) => {
    if (JSON.stringify(next) === JSON.stringify(editor.current)) return;
    editor.current = next;
    editorDirty.current = true;
    setEditorVersion((v) => v + 1);
  }, []);
  const save = useCallback(
    async (copy = false) => {
      if (savingRef.current || !namespace.current) return;
      savingRef.current = true;
      setSaving(true);
      setSyncError("");
      const generation = documentGeneration.current,
        scope = namespace.current;
      const source = current.current,
        stateAtSave = editor.current;
      const request =
        !copy && pendingSave.current
          ? pendingSave.current
          : {
              id: !copy && savedRef.current ? savedRef.current.id : createId(),
              saveId: createId(),
              expectedRevision:
                !copy && savedRef.current ? savedRef.current.revision : 0,
              project: { ...source, editorState: stateAtSave },
            };
      pendingSave.current = request;
      await checkpoint();
      try {
        const snapshot = JSON.stringify(request.project);
        const snapshotBytes = new TextEncoder().encode(snapshot).byteLength;
        if (snapshotBytes > 8388608)
          throw new ApiError(
            413,
            "This project exceeds online snapshot storage. Download the editable project to keep a full copy.",
          );
        const payload =
          scope.startsWith("account:") && snapshotBytes > 2 * 1024 * 1024
            ? {
                id: request.id,
                saveId: request.saveId,
                expectedRevision: request.expectedRevision,
                snapshotId: await uploadArtwork(
                  new File([snapshot], "project-snapshot.json", {
                    type: "application/json",
                  }),
                  request.saveId,
                  scope,
                ),
              }
            : request;
        const result = await api<SavedProject>("/api/projects", {
          method: "POST",
          headers: { "X-Threadform-Namespace": scope },
          body: JSON.stringify(payload),
        });
        if (
          documentGeneration.current === generation &&
          namespace.current === scope
        ) {
          savedRef.current = result;
          setSaved(result);
          pendingSave.current = undefined;
          syncBlocked.current = false;
          // Retries may acknowledge an earlier snapshot. Never mark newer edits saved.
          const currentText = JSON.stringify({
            ...current.current,
            editorState: editor.current,
          });
          const upToDate = currentText === JSON.stringify(request.project);
          dirtyRef.current = !upToDate;
          setDirty(!upToDate);
          if (upToDate) editorDirty.current = false;
          await checkpoint();
        }
        return result;
      } catch (error) {
        if (
          documentGeneration.current === generation &&
          namespace.current === scope
        ) {
          const status = error instanceof ApiError ? error.status : 0;
          const invalid = [400, 413, 415, 422].includes(status);
          if (invalid) pendingSave.current = undefined;
          syncBlocked.current = invalid || [401, 409].includes(status);
          setSyncError(errorMessage(error));
          if (invalid) await checkpoint();
        }
        throw error;
      } finally {
        savingRef.current = false;
        if (alive.current) setSaving(false);
      }
    },
    [checkpoint],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    alive.current = true;
    let scopeRequest = 0;
    const initialize = async (resetAccount = false) => {
      const request = ++scopeRequest;
      if (resetAccount) {
        setReady(false);
        const flushed = checkpoint();
        documentGeneration.current++;
        initialized.current = false;
        namespace.current = null;
        setNamespaceValue("");
        pendingSave.current = undefined;
        const blank = createSample();
        current.current = blank;
        editor.current = undefined;
        savedRef.current = null;
        dirtyRef.current = false;
        history.current = [];
        future.current = [];
        setProject(blank);
        setSaved(null);
        setDirty(false);
        setHistoryCounts({ undo: 0, redo: 0 });
        try {
          localStorage.removeItem("threadform-last-namespace");
        } catch {
          /* Preference only. */
        }
        await flushed;
        if (!alive.current || request !== scopeRequest) return;
      }
      try {
        const account = await api<Account>("/api/account");
        if (!alive.current || request !== scopeRequest || !account.namespace)
          return;
        if (initialized.current && namespace.current === account.namespace) {
          if (!syncBlocked.current) setSyncError("");
          return;
        }
        const localScope = namespace.current?.startsWith("local:")
          ? namespace.current
          : null;
        setReady(false);
        const offlineProject =
          localScope && dirtyRef.current
            ? { ...current.current, editorState: editor.current }
            : null;
        await checkpoint();
        if (!alive.current || request !== scopeRequest) return;
        // An unclaimed offline session may acquire its first server identity.
        // Preserve that work; never carry another verified account's drafts.
        if (localScope) {
          try {
            if (offlineProject) {
              const ids = new Set(
                [
                  offlineProject.artwork?.id,
                  offlineProject.artworkLayer?.assetId,
                ].filter((id): id is string => !!id),
              );
              for (const id of ids) {
                const file = await cachedArtwork(localScope, id);
                if (!alive.current || request !== scopeRequest) return;
                if (file) await rememberArtwork(account.namespace, id, file);
              }
              if (offlineProject.artworkLayer)
                offlineProject.artworkLayer = {
                  ...offlineProject.artworkLayer,
                  cloudReady: false,
                };
            }
            const conversion = await latestConversion(localScope);
            if (!alive.current || request !== scopeRequest) return;
            if (conversion)
              await writeConversion({
                ...conversion,
                id: createId(),
                namespace: account.namespace,
                updatedAt: Date.now(),
                assetId: createId(),
              });
          } catch {
            setRecoveryError(
              "The offline conversion remains on this device, but could not be attached to this session.",
            );
          }
          if (!alive.current || request !== scopeRequest) return;
        }
        initialized.current = true;
        setReady(false);
        documentGeneration.current++;
        namespace.current = account.namespace;
        setNamespaceValue(account.namespace);
        try {
          localStorage.setItem("threadform-last-namespace", account.namespace);
        } catch {
          /* Preference storage is optional. */
        }
        draftId.current = createId();
        pendingSave.current = undefined;
        let draft = null;
        try {
          draft = await latestRecovery(account.namespace);
        } catch {
          setRecoveryError(
            "Local recovery is unavailable in this browser. Online saves remain available.",
          );
        }
        if (!alive.current || request !== scopeRequest) return;
        let next = createSample(),
          cloud: SavedProject | null = null,
          unsaved = false;
        if (offlineProject) {
          next = offlineProject;
          unsaved = true;
          pendingSave.current = undefined;
        } else if (draft) {
          next = draft.project;
          cloud = draft.saved;
          unsaved = draft.dirty;
          pendingSave.current = draft.pendingSave;
          setRecoveryTime(draft.updatedAt);
          if (cloud && !unsaved && !draft.pendingSave) {
            try {
              const loaded = await api<SavedProject & { project: Project }>(
                "/api/projects?id=" + cloud.id,
              );
              if (loaded.revision > cloud.revision) {
                next = validateProject(loaded.project);
                cloud = { id: loaded.id, revision: loaded.revision };
              }
            } catch {
              /* Keep the available local snapshot while offline. */
            }
          }
        } else {
          try {
            const list = await api<{ projects: { id: string }[] }>(
              "/api/projects",
            );
            if (list.projects[0]) {
              const loaded = await api<SavedProject & { project: Project }>(
                "/api/projects?id=" + list.projects[0].id,
              );
              next = validateProject(loaded.project);
              cloud = { id: loaded.id, revision: loaded.revision };
            }
          } catch {
            /* An empty/offline studio must still allow designing. */
          }
        }
        if (!alive.current || request !== scopeRequest) return;
        history.current = [];
        future.current = [];
        current.current = next;
        editor.current = next.editorState;
        editorDirty.current = false;
        savedRef.current = cloud;
        dirtyRef.current = unsaved;
        setProject(next);
        setSaved(cloud);
        setDirty(unsaved);
        setHistoryCounts({ undo: 0, redo: 0 });
        setSyncError("");
        syncBlocked.current = false;
        setRestoration((v) => v + 1);
        setReady(true);
      } catch {
        if (!alive.current || request !== scopeRequest) return;
        if (alive.current && !namespace.current) {
          let scope = "local:" + createId();
          try {
            scope = localStorage.getItem("threadform-last-namespace") ?? scope;
            localStorage.setItem("threadform-last-namespace", scope);
          } catch {
            /* Recovery can still use IndexedDB. */
          }
          namespace.current = scope;
          draftId.current = createId();
          setNamespaceValue(scope);
          try {
            const draft = await latestRecovery(scope);
            if (!alive.current || request !== scopeRequest) return;
            if (draft) {
              current.current = draft.project;
              savedRef.current = draft.saved;
              editor.current = draft.project.editorState;
              pendingSave.current = draft.pendingSave;
              dirtyRef.current = draft.dirty;
              setProject(draft.project);
              setSaved(draft.saved);
              setDirty(draft.dirty);
              setRecoveryTime(draft.updatedAt);
              setRestoration((v) => v + 1);
            }
          } catch {
            if (alive.current && request === scopeRequest)
              setRecoveryError(
                "Recovery storage is unavailable. Download your project before closing.",
              );
          }
        }
        if (alive.current && request === scopeRequest) {
          setReady(true);
          setSyncError(
            "Online storage could not be reached. Your open work is preserved; reconnect to enable saving.",
          );
        }
      }
    };
    void initialize();
    const refresh = () => {
      void initialize();
    };
    const changed = () => {
      resetStudioSession();
      void initialize(true);
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === "threadform-account-change") changed();
    };
    window.addEventListener("threadform:account-changed", changed);
    window.addEventListener("storage", storageChanged);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    const periodic = setInterval(refresh, 60000);
    return () => {
      alive.current = false;
      scopeRequest++;
      clearInterval(periodic);
      window.removeEventListener("threadform:account-changed", changed);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [checkpoint]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void checkpoint(), 450);
    return () => clearTimeout(timer);
  }, [project, saved, dirty, editorVersion, ready, checkpoint]);
  useEffect(() => {
    if (
      !ready ||
      saving ||
      syncError ||
      (!dirty && !editorDirty.current) ||
      (!dirty && !saved)
    )
      return;
    const timer = setTimeout(
      () => {
        void saveRef.current().catch(() => {});
      },
      dirty ? 6000 : 30000,
    );
    return () => clearTimeout(timer);
  }, [project, dirty, editorVersion, saved, ready, saving, syncError]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const flush = () => {
      void checkpoint();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [checkpoint]);
  return {
    project,
    current,
    commit,
    open,
    undo,
    redo,
    dirty,
    saving,
    saved,
    save,
    ready,
    namespace: namespaceValue,
    syncError,
    recoveryError,
    recoveryTime,
    restoration,
    updateEditor,
    canUndo: historyCounts.undo > 0,
    canRedo: historyCounts.redo > 0,
  };
}
