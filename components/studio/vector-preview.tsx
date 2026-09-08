import { outlinePaths } from "@/lib/embroidery/operations";
import { LINE_TYPES, type Project } from "@/lib/embroidery/types";
export function VectorPreview({
  project,
  selected,
  onSelect,
}: {
  project: Project;
  selected?: string[];
  onSelect?: (id: string) => void;
}) {
  return (
    <svg
      viewBox={`0 0 ${project.width} ${project.height}`}
      className="vector-preview"
      aria-label="Editable vector preview"
      role="img"
    >
      {project.objects
        .filter((o) => o.visible)
        .map((o) => {
          const line = LINE_TYPES.includes(o.type) && o.type !== "column-c";
          return (
            <path
              key={o.id}
              d={outlinePaths(o)
                .map(
                  (path, i) =>
                    path
                      .map((p, j) => `${j ? "L" : "M"}${p.x} ${p.y}`)
                      .join(" ") +
                    (o.closed[i] ||
                    ["satin-column", "column-c"].includes(o.type)
                      ? "Z"
                      : ""),
                )
                .join(" ")}
              fill={line ? "none" : o.color}
              fillRule={o.fillRule}
              stroke={
                selected?.includes(o.id) ? "#2554ec" : line ? o.color : "none"
              }
              strokeWidth={selected?.includes(o.id) ? project.width / 250 : 0.4}
              opacity={selected?.length && !selected.includes(o.id) ? 0.24 : 1}
              onClick={() => onSelect?.(o.id)}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            />
          );
        })}
    </svg>
  );
}
