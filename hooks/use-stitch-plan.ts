"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Project, StitchPlan } from "@/lib/embroidery/types";
import { sewingInputKey } from "@/lib/embroidery/sewing-input";

export function useStitchPlan(project: Project) {
  const key = useMemo(() => sewingInputKey(project), [project]);
  const latest = useRef(project);
  useLayoutEffect(() => {
    latest.current = project;
  }, [project]);
  const [result, setResult] = useState<{
    key: string;
    plan: StitchPlan | null;
    previewPlan: StitchPlan | null;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true,
      worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (data: { plan?: StitchPlan; error?: string }) => {
      if (!active) return;
      clearTimeout(timeout);
      setResult((previous) => ({
        key,
        plan: data.plan ?? null,
        previewPlan: data.plan ?? previous?.previewPlan ?? null,
        error: data.error ?? null,
      }));
      worker?.terminate();
    };
    const debounce = setTimeout(() => {
      try {
        worker = new Worker(
          new URL("../lib/embroidery/worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (event) => finish(event.data);
        worker.onerror = () =>
          finish({
            error:
              "Stitch generation could not start. Your open design is preserved; reload to retry.",
          });
        timeout = setTimeout(
          () =>
            finish({
              error:
                "This stitch job exceeded the processing time. Increase spacing or process a smaller selection.",
            }),
          25000,
        );
        worker.postMessage({ id: 1, project: latest.current });
      } catch {
        finish({
          error:
            "This browser could not start the stitch worker. Your open design is preserved.",
        });
      }
    }, 160);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [key]);
  const busy = result?.key !== key;
  return {
    generationKey: key,
    // Only a current successful result can reach production/export actions.
    plan: busy ? null : result.plan,
    previewPlan: result?.previewPlan ?? null,
    busy,
    error: busy ? null : result.error,
  };
}
