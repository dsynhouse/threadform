import type { StitchPlan } from "./types";

/** A source object stays editable as one object even when islands require
 * separate sewing sections. Count actual transitions, not rendered line pieces. */
export function analyzeContinuity(plan: StitchPlan) {
  const result = new Map<
    string,
    { sections: number; jumps: number; trims: number; stitches: number }
  >();
  let sewingObject: string | undefined;
  for (const stitch of plan.stitches) {
    let item = result.get(stitch.objectId);
    if (!item) {
      item = { sections: 0, jumps: 0, trims: 0, stitches: 0 };
      result.set(stitch.objectId, item);
    }
    if (stitch.command === "stitch") {
      if (sewingObject !== stitch.objectId) item.sections++;
      item.stitches++;
      sewingObject = stitch.objectId;
    } else {
      if (stitch.command === "jump") item.jumps++;
      if (stitch.command === "trim") item.trims++;
      sewingObject = undefined;
    }
  }
  return result;
}
