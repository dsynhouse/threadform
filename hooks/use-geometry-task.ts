"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EditJob } from "@/lib/embroidery/edit-worker";

/** Geometry runs in a cancellable worker; stale results never replace a new edit. */
export function useGeometryTask<T>() {
  const active = useRef<{
    worker: Worker;
    timer: ReturnType<typeof setTimeout>;
    reject: (error: Error) => void;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useCallback(() => {
    const job = active.current;
    if (job) {
      job.worker.terminate();
      clearTimeout(job.timer);
      job.reject(new Error("Edit cancelled."));
      active.current = null;
    }
  }, []);
  useEffect(() => () => cancel(), [cancel]);
  const run = useCallback(
    (job: EditJob): Promise<T> => {
      cancel();
      setBusy(true);
      return new Promise<T>((resolve, reject) => {
        let worker: Worker;
        try {
          worker = new Worker(
            new URL("../lib/embroidery/edit-worker.ts", import.meta.url),
            { type: "module" },
          );
        } catch {
          setBusy(false);
          reject(
            new Error(
              "Your browser could not start the geometry worker. Reload and try again.",
            ),
          );
          return;
        }
        const finish = () => {
          worker.terminate();
          if (active.current?.worker === worker) {
            clearTimeout(active.current.timer);
            active.current = null;
            setBusy(false);
          }
        };
        const timer = setTimeout(() => {
          finish();
          reject(
            new Error(
              "This edit is too complex. Reduce the selection or increase spacing.",
            ),
          );
        }, 25000);
        active.current = { worker, timer, reject };
        worker.onmessage = (event) => {
          finish();
          if (event.data.ok) resolve(event.data.result as T);
          else reject(new Error(event.data.error));
        };
        worker.onerror = () => {
          finish();
          reject(new Error("The geometry worker could not finish this edit."));
        };
        try {
          worker.postMessage(job);
        } catch {
          finish();
          reject(new Error("The design could not be sent for editing."));
        }
      });
    },
    [cancel],
  );
  return { run, busy };
}
