import type { EmbroideryObject, Project } from "./types";

export function isSewingObject(object: EmbroideryObject): boolean {
  // Migrate legacy visibility without silently enabling previously excluded work.
  return (
    (object.sewEnabled ?? object.visible) &&
    object.type !== "none" &&
    (!object.artworkRole || object.artworkRole === "embroidery")
  );
}

/** A physical shade change needs a needle/thread change even when display RGB matches. */
export function sewingThreadKey(object: EmbroideryObject) {
  return object.thread
    ? JSON.stringify([
        object.thread.brand,
        object.thread.line,
        object.thread.code,
      ])
    : object.color.toLowerCase();
}

/** Exact dependency key. Metadata never starts a geometry job. */
export function sewingInputKey(project: Project): string {
  return JSON.stringify({
    width: project.width,
    height: project.height,
    hoopWidth: project.hoopWidth,
    hoopHeight: project.hoopHeight,
    workspaceMode: project.workspaceMode,
    trimDistance: project.trimDistance,
    autoStart: project.autoStart,
    autoEnd: project.autoEnd,
    startPoint: project.startPoint,
    endPoint: project.endPoint,
    machine: project.machine,
    objects: project.objects.filter(isSewingObject).map((object) => {
      const input: Record<string, unknown> = { ...object, sewEnabled: true };
      for (const field of [
        "visible",
        "locked",
        "thread",
        "groupId",
        "colorLocked",
        "directionLocked",
      ])
        delete input[field];
      input.sewingThread = sewingThreadKey(object);
      return input;
    }),
  });
}
