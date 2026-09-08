/// <reference lib="webworker" />
import { autoDigitizeProject, type AutoOptions } from "./auto-digitize";
import { generatePlan } from "./engine";
import { sequenceProject, type OptimizeOptions } from "./optimization";
import { editShapes, type ShapeOptions } from "./shape-edit";
import { validateProject } from "./project";
import type { Project } from "./types";

export type EditJob =
  | { kind: "auto"; project: Project; options: AutoOptions }
  | { kind: "shape"; project: Project; options: ShapeOptions }
  | {
      kind: "optimize";
      project: Project;
      options: OptimizeOptions;
      seed: string;
    };
self.onmessage = (event: MessageEvent<EditJob>) => {
  try {
    const job = event.data;
    if (job.kind === "auto") {
      const result = autoDigitizeProject(
        validateProject(job.project),
        job.options,
      );
      self.postMessage({
        ok: true,
        result: { ...result, project: validateProject(result.project) },
      });
    } else if (job.kind === "shape") {
      const result = editShapes(job.project, job.options);
      self.postMessage({
        ok: true,
        result: { ...result, project: validateProject(result.project) },
      });
    } else {
      const baseline = generatePlan(job.project);
      const prepared = job.options.removeOverlaps
        ? editShapes(job.project, {
            action: "remove-overlaps",
            ids: job.project.objects.map((o) => o.id),
            amount: job.options.allowance,
            seed: job.seed,
          })
        : { project: job.project, changed: 0, notes: [] };
      const result = sequenceProject(
        prepared.project,
        job.options,
        prepared.changed ? generatePlan(prepared.project) : baseline,
      );
      self.postMessage({
        ok: true,
        result: {
          ...result,
          project: validateProject(result.project),
          notes: prepared.notes,
          overlaps: prepared.changed,
        },
      });
    }
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "This edit could not be completed.",
    });
  }
};
