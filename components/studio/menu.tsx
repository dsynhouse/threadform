"use client";
import { shortcutLabel } from "@/lib/embroidery/shortcuts";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
export type MenuAction =
  | "cut"
  | "quick-guide"
  | "cross-chart"
  | "zoom-factor"
  | "player"
  | "object-panel"
  | "toggle-outlines"
  | "needle-points"
  | "function-symbols"
  | "deselect"
  | "lock"
  | "unlock"
  | "mirror-x"
  | "mirror-y"
  | "convert"
  | "approval"
  | "threads"
  | "stitch-library"
  | "stitch-inspector"
  | "view-all-colours"
  | "view-colour"
  | "freeform"
  | "align-right"
  | "align-bottom"
  | "align-middle-x"
  | "align-middle-y"
  | "shape-lab"
  | "applique"
  | "remove-overlaps"
  | "optimize"
  | "knife"
  | "cut-svg"
  | "new"
  | "open"
  | "projects"
  | "save"
  | "save-copy"
  | "download"
  | "export"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "duplicate"
  | "delete"
  | "select-all"
  | "group"
  | "ungroup"
  | "split"
  | "center"
  | "align-left"
  | "align-top"
  | "distribute-x"
  | "distribute-y"
  | "front"
  | "back"
  | "colour-order"
  | "fit"
  | "grid"
  | "snap"
  | "jumps"
  | "artwork"
  | "stitches"
  | "density"
  | "auto"
  | "lettering"
  | "guide"
  | "motifs"
  | "pattern"
  | "commands";
const groups: {
  name: string;
  items: ({ id: MenuAction; label: string; key?: string } | null)[];
}[] = [
  {
    name: "File",
    items: [
      { id: "new", label: "New design" },
      { id: "projects", label: "Saved projects…" },
      { id: "open", label: "Import artwork or project…" },
      null,
      { id: "save", label: "Save project", key: "⌘/Ctrl S" },
      { id: "save-copy", label: "Save as a new project" },
      { id: "download", label: "Download editable project" },
      null,
      { id: "approval", label: "Print preview & approval sheets…" },
      { id: "export", label: "Export embroidery…" },
    ],
  },
  {
    name: "Edit",
    items: [
      { id: "undo", label: "Undo", key: "⌘/Ctrl Z" },
      { id: "redo", label: "Redo", key: "⇧ ⌘/Ctrl Z" },
      null,
      { id: "cut", label: "Cut selected objects" },
      { id: "copy", label: "Copy objects", key: "⌘/Ctrl C" },
      { id: "paste", label: "Paste objects", key: "⌘/Ctrl V" },
      { id: "duplicate", label: "Duplicate", key: "⌘/Ctrl D" },
      { id: "delete", label: "Delete selected", key: "Delete" },
      null,
      { id: "select-all", label: "Select all", key: "⌘/Ctrl A" },
    ],
  },
  {
    name: "Object",
    items: [
      { id: "group", label: "Group selection", key: "⌘/Ctrl G" },
      { id: "ungroup", label: "Ungroup" },
      { id: "lock", label: "Lock selection" },
      { id: "unlock", label: "Unlock all" },
      { id: "split", label: "Separate disconnected elements" },
      null,
      { id: "shape-lab", label: "Shape & cutting workshop…" },
      { id: "knife", label: "Knife tool", key: "K" },
      { id: "remove-overlaps", label: "Remove hidden overlaps…" },
      { id: "applique", label: "Build appliqué passes…" },
      { id: "cut-svg", label: "Export cutting outlines · SVG" },
      null,
      { id: "lettering", label: "Add single-line lettering…" },
      { id: "motifs", label: "Shapes, motifs & palettes…" },
      { id: "pattern", label: "Pattern lab…" },
    ],
  },
  {
    name: "Arrange",
    items: [
      { id: "center", label: "Centre selection in design" },
      { id: "align-left", label: "Align left edges" },
      { id: "align-top", label: "Align top edges" },
      { id: "align-right", label: "Align right edges" },
      { id: "align-bottom", label: "Align bottom edges" },
      { id: "align-middle-x", label: "Align horizontal centres" },
      { id: "align-middle-y", label: "Align vertical centres" },
      { id: "distribute-x", label: "Distribute horizontal centres" },
      { id: "distribute-y", label: "Distribute vertical centres" },
      null,
      { id: "front", label: "Sew selected last" },
      { id: "back", label: "Sew selected first" },
      { id: "colour-order", label: "Optimize sewing order & colours…" },
    ],
  },
  {
    name: "View",
    items: [
      { id: "artwork", label: "Vector artwork" },
      { id: "stitches", label: "Stitch preview" },
      { id: "density", label: "Needle density" },
      null,
      { id: "view-colour", label: "View selected colour" },
      { id: "view-all-colours", label: "View all colours" },
      { id: "stitch-inspector", label: "Stitch progression inspector" },
      { id: "freeform", label: "Toggle freeform / hoop workspace" },
      { id: "fit", label: "Fit full design" },
      { id: "zoom-factor", label: "Set zoom factor…" },
      { id: "object-panel", label: "Toggle colour-object panel" },
      { id: "toggle-outlines", label: "Toggle vector outlines" },
      { id: "needle-points", label: "Toggle needle points" },
      { id: "function-symbols", label: "Toggle function symbols" },
      { id: "player", label: "Play / pause stitch progression" },
      { id: "grid", label: "Toggle 10 mm grid" },
      { id: "snap", label: "Toggle 1 mm snapping" },
      { id: "jumps", label: "Toggle jump paths" },
    ],
  },
  {
    name: "Stitch",
    items: [
      { id: "cross-chart", label: "Cross-stitch chart…" },
      { id: "stitch-library", label: "Stitch methods & effects…" },
      { id: "threads", label: "Thread directory & custom shades…" },
      { id: "optimize", label: "Optimize stitch structure…" },
      { id: "auto", label: "Preview auto-digitizing…" },
    ],
  },
  {
    name: "Help",
    items: [
      { id: "quick-guide", label: "Quick start tour…" },
      { id: "guide", label: "Tools, shortcuts & stitch guide" },
      { id: "commands", label: "Find a command…", key: "⌘/Ctrl K" },
    ],
  },
];
export default function StudioMenu({
  onAction,
  canUndo,
  canRedo,
  hasSelection,
  hasClipboard,
  saving,
}: {
  onAction: (action: MenuAction) => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  hasClipboard: boolean;
  saving: boolean;
}) {
  const needsSelection = [
    "shape-lab",
    "applique",
    "remove-overlaps",
    "knife",
    "cut-svg",
    "copy",
    "duplicate",
    "delete",
    "group",
    "ungroup",
    "split",
    "center",
    "align-left",
    "align-right",
    "align-bottom",
    "align-middle-x",
    "align-middle-y",
    "align-top",
    "distribute-x",
    "distribute-y",
    "front",
    "back",
    "pattern",
  ];
  return (
    <Menubar className="studio-menu">
      {groups.map((group) => (
        <MenubarMenu key={group.name}>
          <MenubarTrigger>{group.name}</MenubarTrigger>
          <MenubarContent>
            {group.items.map((item, index) =>
              item ? (
                <MenubarItem
                  key={item.id}
                  disabled={
                    (item.id === "undo" && !canUndo) ||
                    (item.id === "redo" && !canRedo) ||
                    (item.id === "paste" && !hasClipboard) ||
                    (needsSelection.includes(item.id) && !hasSelection) ||
                    (["save", "save-copy"].includes(item.id) && saving)
                  }
                  onSelect={() => onAction(item.id)}
                >
                  {item.label}
                  {shortcutLabel(item.id) && (
                    <MenubarShortcut>{shortcutLabel(item.id)}</MenubarShortcut>
                  )}
                </MenubarItem>
              ) : (
                <MenubarSeparator key={index} />
              ),
            )}
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  );
}
