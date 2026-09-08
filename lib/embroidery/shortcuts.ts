/** Single source of truth for keyboard dispatch, menus, tooltips and reference.
 * Mapping source: Wilcom's published Masterclass keyboard reference (2020),
 * cross-checked with the current digitizing/zoom help. Native-only operations
 * are explicitly catalogued below, never silently rebound to unrelated tools. */
export type Shortcut = {
  id: string;
  label: string;
  group: string;
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  display: string;
  browser?: boolean;
  note?: string;
};
const s = (
  id: string,
  label: string,
  group: string,
  key: string,
  display: string,
  flags: Partial<Shortcut> = {},
): Shortcut => ({ id, label, group, key, display, ...flags });
export const SHORTCUTS: Shortcut[] = [
  s("new", "New design", "File", "n", "Ctrl N", { mod: true, browser: true }),
  s("open", "Open artwork or design", "File", "o", "Ctrl O", { mod: true }),
  s("save", "Save design", "File", "s", "Ctrl S", { mod: true }),
  s("export", "Export machine file", "File", "e", "Shift E", { shift: true }),
  s("approval", "Print preview & approval sheets", "File", "p", "Ctrl P", {
    mod: true,
  }),
  s("undo", "Undo", "Edit", "z", "Ctrl Z", { mod: true }),
  s("redo", "Redo", "Edit", "y", "Ctrl Y", { mod: true }),
  s("redo", "Redo (additional alias)", "Edit", "z", "Ctrl Shift Z", {
    mod: true,
    shift: true,
  }),
  s("cut", "Cut objects", "Edit", "x", "Ctrl X", { mod: true }),
  s("copy", "Copy objects", "Edit", "c", "Ctrl C", { mod: true }),
  s("paste", "Paste objects", "Edit", "v", "Ctrl V", { mod: true }),
  s("copy", "Copy objects", "Edit", "insert", "Ctrl Insert", { mod: true }),
  s("paste", "Paste objects", "Edit", "insert", "Shift Insert", {
    shift: true,
  }),
  s("cut", "Cut objects", "Edit", "delete", "Shift Delete", { shift: true }),
  s("duplicate", "Duplicate objects", "Edit", "d", "Ctrl D", { mod: true }),
  s("duplicate-offset", "Duplicate with offset", "Edit", "g", "Ctrl Shift G", {
    mod: true,
    shift: true,
  }),
  s("delete", "Delete selected objects", "Edit", "delete", "Delete"),
  s("select-all", "Select all objects", "Selection", "a", "Ctrl A", {
    mod: true,
  }),
  s("deselect", "Clear selection", "Selection", "x", "X"),
  s("select-color", "Select matching colour", "Selection", "a", "Ctrl Alt A", {
    mod: true,
    alt: true,
  }),
  s("tool:select", "Select object", "Selection", "o", "O"),
  s("select-current", "Select object at needle", "Selection", "o", "Shift O", {
    shift: true,
  }),
  s(
    "next-object",
    "Select next object (canvas focus)",
    "Selection",
    "tab",
    "Tab",
  ),
  s(
    "previous-object",
    "Select previous object (canvas focus)",
    "Selection",
    "tab",
    "Shift Tab",
    { shift: true },
  ),
  s("group", "Group selection", "Selection", "g", "Ctrl G", { mod: true }),
  s("ungroup", "Ungroup selection", "Selection", "u", "Ctrl U", {
    mod: true,
    browser: true,
  }),
  s("lock", "Lock selection", "Selection", "k", "K"),
  s("unlock", "Unlock all objects", "Selection", "k", "Shift K", {
    shift: true,
  }),
  s("tool:pen", "Complex fill boundary", "Digitize", "f3", "F3", {
    browser: true,
  }),
  s("tool:satin-column", "Column A", "Digitize", "f4", "F4", { browser: true }),
  s("tool:satin-column", "Column A", "Digitize", "a", "Shift A", {
    shift: true,
  }),
  s("tool:column-b", "Column B", "Digitize", "f5", "F5", { browser: true }),
  s("tool:column-c", "Column C", "Digitize", "f6", "F6", { browser: true }),
  s("applique", "Appliqué workshop", "Digitize", "f7", "F7", { browser: true }),
  s("run:run", "Single run", "Digitize", "f8", "F8", { browser: true }),
  s("run:run", "Single run", "Digitize", "n", "Shift N", { shift: true }),
  s("run:triple", "Triple run", "Digitize", "f9", "F9", { browser: true }),
  s("run:motif-run", "Motif run", "Digitize", "f10", "F10", { browser: true }),
  s("run:back", "Backstitch", "Digitize", "f11", "F11", { browser: true }),
  s("run:stem", "Stemstitch", "Digitize", "f12", "F12", { browser: true }),
  s("apply:satin", "Apply satin", "Digitize", "i", "Shift I", { shift: true }),
  s("apply:tatami", "Apply tatami", "Digitize", "m", "Shift M", {
    shift: true,
  }),
  s("regenerate", "Generate stitches", "Digitize", "g", "G"),
  s("underlay", "Toggle auto underlay", "Digitize", "u", "U"),
  s("convert", "Trace bitmap to vectors", "Digitize", "m", "Ctrl M", {
    mod: true,
  }),
  s("combine", "Combine vector regions", "Digitize", "h", "Shift H", {
    shift: true,
  }),
  s("lettering", "Lettering dialog", "Digitize", "a", "A"),
  s("tool:measure", "Measure distance", "Digitize", "m", "M"),
  s("tool:nodes", "Reshape nodes", "Shape", "h", "H"),
  s("tool:nodes", "Show reshape nodes", "Shape", "n", "Alt N", { alt: true }),
  s("tool:angle", "Stitch angles", "Shape", "h", "Ctrl H", {
    mod: true,
    browser: true,
  }),
  s("tool:angle", "Show stitch angles", "Shape", "a", "Alt A", { alt: true }),
  s("mirror-x", "Mirror horizontally", "Shape", "1", "Ctrl 1", {
    mod: true,
    browser: true,
  }),
  s("mirror-y", "Mirror vertically", "Shape", "1", "Alt 1", { alt: true }),
  s("remove-overlaps", "Remove overlaps", "Shape", "e", "Ctrl Shift E", {
    mod: true,
    shift: true,
  }),
  s("integrity", "Review design integrity", "Shape", "!", "!", { shift: true }),
  s("grid", "Show/hide grid", "View", "g", "Shift G", { shift: true }),
  s("object-panel", "Show/hide colour-object panel", "View", "l", "Shift L", {
    shift: true,
  }),
  s("stitch-inspector", "Stitch list", "View", "j", "Shift J", { shift: true }),
  s("toggle-thread", "Thread-rendered view", "View", "t", "T", {
    note: "Threadform thread rendering; Wilcom's TrueView name is not used.",
  }),
  s("toggle-stitches", "Show/hide stitch paths", "View", "s", "S"),
  s("toggle-outlines", "Show/hide outlines", "View", "l", "L"),
  s("needle-points", "Show/hide needle points", "View", ".", "."),
  s("jumps", "Show/hide connectors", "View", "c", "Shift C", { shift: true }),
  s("function-symbols", "Show/hide function symbols", "View", "f", "Shift F", {
    shift: true,
  }),
  s("view-colour", "View by colour", "View", "c", "Alt C", { alt: true }),
  s("isolate", "Hide other objects in the view", "View", "s", "Shift S", {
    shift: true,
  }),
  s("toggle-vectors", "Show/hide vector artwork", "View", "d", "Shift D", {
    shift: true,
  }),
  s("tool:zoom", "Zoom rectangle", "View", "b", "B"),
  s("zoom:actual", "100% at 96 CSS pixels/inch", "View", "1", "1", {
    note: "Screen physical size depends on display scaling. Use PDF 1:1 templates for measurement.",
  }),
  s("zoom-factor", "Enter zoom factor", "View", "f", "F"),
  s("zoom:in", "Zoom in 2×", "View", "z", "Z"),
  s("zoom:out", "Zoom out 2×", "View", "z", "Shift Z", { shift: true }),
  s("fit", "Fit full design", "View", "0", "0"),
  s("zoom:selection", "Fit selection", "View", "0", "Shift 0", { shift: true }),
  s("zoom:artboard", "Fit design area", "View", "0", "Ctrl 0", { mod: true }),
  s("zoom:hoop", "Fit hoop", "View", "0", "Alt 0", { alt: true }),
  s("tool:hand", "Pan", "View", "p", "P"),
  s("zoom:needle", "Centre current needle", "View", "c", "C"),
  s("zoom:previous", "Previous view", "View", "v", "V"),
  s("redraw", "Redraw canvas", "View", "r", "R"),
  s("player", "Start/pause stitch player", "Sequence", "r", "Shift R", {
    shift: true,
  }),
  s("travel:start", "Beginning of design", "Sequence", "home", "Home"),
  s("travel:end", "End of design", "Sequence", "end", "End"),
  s("travel:color:1", "Next colour", "Sequence", "pagedown", "PgDn"),
  s("travel:color:-1", "Previous colour", "Sequence", "pageup", "PgUp"),
  s("travel:object:1", "Next sewing object", "Sequence", "t", "Ctrl T", {
    mod: true,
    browser: true,
  }),
  s("travel:object:-1", "Previous sewing object", "Sequence", "t", "Shift T", {
    shift: true,
  }),
  s(
    "travel:function:1",
    "Next machine function",
    "Sequence",
    "pagedown",
    "Ctrl PgDn",
    { mod: true, browser: true },
  ),
  s(
    "travel:function:-1",
    "Previous machine function",
    "Sequence",
    "pageup",
    "Ctrl PgUp",
    { mod: true, browser: true },
  ),
  s("travel:100", "100 stitches forward", "Sequence", "add", "Numpad +"),
  s("travel:-100", "100 stitches backward", "Sequence", "subtract", "Numpad −"),
  s(
    "travel:1000",
    "1,000 stitches forward",
    "Sequence",
    "add",
    "Shift Numpad +",
    { shift: true },
  ),
  s(
    "travel:-1000",
    "1,000 stitches backward",
    "Sequence",
    "subtract",
    "Shift Numpad −",
    { shift: true },
  ),
  s("guide", "Shortcut reference", "Help", "f1", "F1", { browser: true }),
  s(
    "commands",
    "Find a command (studio addition)",
    "Help",
    "k",
    "Ctrl Shift K",
    { mod: true, shift: true },
  ),
];
export const CONTEXT_KEYS = [
  ["` / Shift `", "Continue an open run or Column A/B/C from its end / start."],
  [
    "Tab / Shift Tab",
    "Select the next / previous reshape node while the canvas has keyboard focus.",
  ],
  [
    "Enter",
    "Finish a boundary. Column B: first edge, then second edge. Column C: centreline, then width references (Enter again accepts the default).",
  ],
  [
    "Backspace",
    "Remove the last digitizing point; Delete removes a selected reshape node.",
  ],
  [
    "Space",
    "Columns A/B: finish without the last stitch. Run / Column C: switch tools while retaining the path. Other drawing tools: change the last point's corner/curve type.",
  ],
  [
    "Esc",
    "Cancel the unfinished geometry; press again to return to selection.",
  ],
  [
    "Left / right click",
    "Place a corner / curve point. The Corner–Curve buttons provide a touch alternative.",
  ],
  [
    "Arrow keys",
    "Nudge selected objects 1 mm; Shift = 10 mm; Alt = 0.1 mm. Without a selection: right/left = 1 stitch; down/up = 10.",
  ],
];
export const NATIVE_ONLY_KEYS = [
  ["F2", "Complex Turning with multiple independent stitch-angle regions"],
  [
    "E / Q",
    "Direct stitch-edit selection (use the progression inspector and manual-point tool here)",
  ],
  [
    "I / Shift X / J",
    "Branching, Backtrack and Wilcom Closest Join (use Optimize here)",
  ],
  [
    "Ctrl L / Ctrl Tab / Ctrl Shift Tab",
    "Polygon selection and additive tab selection",
  ],
  [
    "Ctrl Shift V / Ctrl Alt V / Shift Alt V",
    "Paste-special at object/needle locations",
  ],
  ["D / Shift V / Shift B", "Bitmap backdrop and Overview window controls"],
  ["Ctrl Shift A", "Wilcom Auto Scroll"],
  [
    "Alt F O / Alt F A / Alt F C / Alt F P",
    "Windows menu mnemonics (use the File menu here)",
  ],
  ["Alt F4", "Operating-system window close"],
  ["[ ] / < > / / / \\ / ; / W", "Schiffli machine functions and repeats"],
  ["Ctrl K", "Chenille shortcut-angle checker"],
];
export function shortcutLabel(id: string) {
  return SHORTCUTS.find((s) => s.id === id)?.display ?? "";
}
export function matchShortcut(
  e: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  >,
) {
  const key =
    e.code === "NumpadAdd"
      ? "add"
      : e.code === "NumpadSubtract"
        ? "subtract"
        : e.code.startsWith("Digit") && e.key !== "!"
          ? e.code.slice(5)
          : e.key.toLowerCase();
  return SHORTCUTS.find(
    (s) =>
      s.key === key &&
      !!s.mod === (e.ctrlKey || e.metaKey) &&
      !!s.shift === e.shiftKey &&
      !!s.alt === e.altKey,
  );
}
