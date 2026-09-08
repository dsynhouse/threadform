import type { ArtworkLayer, Project } from "./types";

export function createArtworkLayer(
  assetId: string,
  name: string,
  width: number,
  height: number,
): ArtworkLayer {
  return {
    assetId,
    name,
    transform: [width, 0, 0, height, 0, 0],
    visible: true,
    dimmed: true,
    opacity: 0.35,
    locked: true,
  };
}
export function validateArtworkLayer(raw: unknown): ArtworkLayer {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid artwork layer.");
  const r = raw as Record<string, unknown>;
  if (
    typeof r.assetId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(r.assetId) ||
    typeof r.name !== "string" ||
    r.name.length > 255
  )
    throw new Error("Invalid artwork asset reference.");
  if (
    !Array.isArray(r.transform) ||
    r.transform.length !== 6 ||
    !r.transform.every((v) => typeof v === "number" && Number.isFinite(v))
  )
    throw new Error("Invalid artwork transform.");
  const [a, b, c, d] = r.transform;
  if (
    Math.hypot(a, b) <= 0 ||
    Math.hypot(c, d) <= 0 ||
    !Number.isFinite(a * d - b * c) ||
    Math.abs(a * d - b * c) < 1e-10
  )
    throw new Error("The artwork layer must have a positive, finite area.");
  if (
    !artworkCorners({
      transform: r.transform as ArtworkLayer["transform"],
    } as ArtworkLayer).every(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    )
  )
    throw new Error("Artwork coordinates exceed numeric precision.");
  if (
    typeof r.opacity !== "number" ||
    !Number.isFinite(r.opacity) ||
    r.opacity < 0 ||
    r.opacity > 1 ||
    ![r.visible, r.dimmed, r.locked].every((v) => typeof v === "boolean")
  )
    throw new Error("Invalid artwork display settings.");
  return {
    assetId: r.assetId,
    name: r.name,
    transform: r.transform as ArtworkLayer["transform"],
    opacity: r.opacity,
    visible: r.visible as boolean,
    dimmed: r.dimmed as boolean,
    locked: r.locked as boolean,
    ...(r.cloudReady === true ? { cloudReady: true } : {}),
  };
}
export function resizeArtworkLayer(
  layer: ArtworkLayer,
  sx: number,
  sy: number,
): ArtworkLayer {
  return validateArtworkLayer({
    ...layer,
    transform: layer.transform.map((n, i) => n * (i % 2 ? sy : sx)),
  });
}
export function artworkDimensions(layer: ArtworkLayer) {
  const [a, b, c, d, x, y] = layer.transform;
  return {
    x,
    y,
    width: Math.hypot(a, b),
    height: Math.hypot(c, d),
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
  };
}
export function artworkCorners(layer: ArtworkLayer) {
  const [a, b, c, d, e, f] = layer.transform;
  return [
    { x: e, y: f },
    { x: a + e, y: b + f },
    { x: a + c + e, y: b + d + f },
    { x: c + e, y: d + f },
  ];
}
export function positionArtwork(
  layer: ArtworkLayer,
  changes: Partial<ReturnType<typeof artworkDimensions>>,
): ArtworkLayer {
  const current = artworkDimensions(layer),
    values = { ...current, ...changes };
  const angle = ((values.rotation - current.rotation) * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const [a, b, c, d] = layer.transform,
    sx = values.width / current.width,
    sy = values.height / current.height;
  return validateArtworkLayer({
    ...layer,
    transform: [
      (a * cos - b * sin) * sx,
      (a * sin + b * cos) * sx,
      (c * cos - d * sin) * sy,
      (c * sin + d * cos) * sy,
      values.x,
      values.y,
    ],
  });
}
export function attachSourceLayer(
  project: Project,
  id: string,
  name: string,
  cloudReady = false,
): Project {
  return {
    ...project,
    artworkLayer: {
      ...createArtworkLayer(id, name, project.width, project.height),
      cloudReady,
    },
  };
}
