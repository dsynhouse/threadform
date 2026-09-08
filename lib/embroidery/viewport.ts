import type { Point } from "./types";

export type Viewport = {
  zoom: number;
  pan: Point;
  fit: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
};
export function zoomAt(view: Viewport, anchor: Point, factor: number) {
  if (
    ![view.zoom, view.fit, anchor.x, anchor.y, factor].every(Number.isFinite) ||
    view.fit <= 0 ||
    view.zoom <= 0 ||
    factor <= 0
  )
    return { zoom: view.zoom, pan: view.pan };
  const zoom = Math.max(
    0.00001,
    Math.min(Math.max(80, 80 / view.fit), view.zoom * factor),
  );
  const scale = view.fit * view.zoom,
    next = view.fit * zoom;
  const world = {
    x: (anchor.x - view.x) / scale,
    y: (anchor.y - view.y) / scale,
  };
  return {
    zoom,
    pan: {
      x: view.pan.x + (world.x - view.cx) * (scale - next),
      y: view.pan.y + (world.y - view.cy) * (scale - next),
    },
  };
}

/** Native, non-passive listeners are necessary to cancel trackpad page zoom. */
export function bindViewportNavigation(
  node: HTMLElement,
  getView: () => Viewport,
  apply: (next: { zoom: number; pan: Point }) => void,
) {
  let gestureScale = 0;
  const anchor = (event: { clientX: number; clientY: number }) => {
    const r = node.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  const wheel = (event: WheelEvent) => {
    if (!event.cancelable) return;
    event.preventDefault();
    event.stopPropagation();
    const view = getView();
    if (event.ctrlKey || event.metaKey) {
      if (gestureScale) return;
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node.clientHeight
            : 1);
      apply(
        zoomAt(
          view,
          anchor(event),
          Math.exp(-Math.max(-400, Math.min(400, pixels)) * 0.008),
        ),
      );
    } else {
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node.clientHeight
            : 1;
      apply({
        zoom: view.zoom,
        pan: {
          x: view.pan.x - event.deltaX * unit,
          y: view.pan.y - event.deltaY * unit,
        },
      });
    }
  };
  type Gesture = Event & { scale: number; clientX: number; clientY: number };
  const start = (raw: Event) => {
    raw.preventDefault();
    raw.stopPropagation();
    gestureScale = (raw as Gesture).scale || 1;
  };
  const change = (raw: Event) => {
    raw.preventDefault();
    raw.stopPropagation();
    const e = raw as Gesture;
    if (gestureScale > 0 && Number.isFinite(e.scale) && e.scale > 0)
      apply(zoomAt(getView(), anchor(e), e.scale / gestureScale));
    gestureScale = e.scale;
  };
  const end = (raw: Event) => {
    raw.preventDefault();
    raw.stopPropagation();
    gestureScale = 0;
  };
  node.addEventListener("wheel", wheel, { passive: false });
  node.addEventListener("gesturestart", start, { passive: false });
  node.addEventListener("gesturechange", change, { passive: false });
  node.addEventListener("gestureend", end, { passive: false });
  return () => {
    node.removeEventListener("wheel", wheel);
    node.removeEventListener("gesturestart", start);
    node.removeEventListener("gesturechange", change);
    node.removeEventListener("gestureend", end);
  };
}

/** Choose readable physical intervals from the current pixels-per-mm scale. */
export function axisStep(scale: number, pixels: number, minimum: number) {
  const desired = Math.max(minimum, pixels / scale);
  if (!Number.isFinite(desired) || desired <= 0) return minimum;
  const power = 10 ** Math.floor(Math.log10(desired));
  return [1, 2, 5, 10].find((n) => n * power >= desired)! * power;
}

/** Draw only marks in the visible interval, independent of artwork dimensions.
 * Indexed generation avoids a non-advancing floating-point loop at high offsets. */
export function axisValues(min: number, max: number, step: number) {
  if (![min, max, step].every(Number.isFinite) || step <= 0 || min > max)
    return [];
  const first = Math.ceil(min / step) * step;
  const count = Math.max(
    0,
    Math.min(4096, Math.floor((max - first) / step) + 1),
  );
  return Array.from({ length: count }, (_, i) => first + i * step);
}
