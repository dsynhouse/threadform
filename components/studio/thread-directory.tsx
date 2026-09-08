"use client";
import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Search, Upload, Download, Palette } from "lucide-react";
import { toast } from "sonner";
import type { Project, ThreadShade } from "@/lib/embroidery/types";
import { validateThread } from "@/lib/embroidery/project";
import {
  THREAD_DIRECTORIES,
  importThreadLibrary,
  exportThreadLibrary,
  mergeThreadLibraries,
} from "@/lib/embroidery/threads";
import { colorLab } from "@/lib/embroidery/optimization";
import { deltaE2000 } from "@/lib/embroidery/color-difference";
import {
  previewThreadMatches,
  applyThreadMatches,
  threadKey,
} from "@/lib/embroidery/thread-matching";
import { PEC_PALETTE, JEF_PALETTE } from "@/lib/embroidery/format-palettes";
import { download, errorMessage, fileName, Choice } from "./controls";
export default function ThreadDirectory({
  open,
  onOpenChange,
  project,
  selected,
  onProject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  selected: string[];
  onProject: (p: Project) => void;
}) {
  const [tab, setTab] = useState(
      project.threadLibrary?.length ? "library" : "manufacturers",
    ),
    [query, setQuery] = useState(""),
    [brand, setBrand] = useState("all"),
    [closest, setClosest] = useState(false),
    [replaceColor, setReplaceColor] = useState(false),
    [page, setPage] = useState(0);
  const [draft, setDraft] = useState<ThreadShade>({
    brand: "Custom",
    line: "",
    code: "",
    name: "",
    color: "#21776a",
  });
  const [matching, setMatching] = useState(false),
    [replaceAssigned, setReplaceAssigned] = useState(false);
  const [matchChoices, setMatchChoices] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null),
    target = project.objects.find((o) => selected.includes(o.id)),
    shades = useMemo(
      () => project.threadLibrary ?? [],
      [project.threadLibrary],
    );
  const results = useMemo(() => {
    const list = shades.filter(
      (t) =>
        (brand === "all" || t.brand === brand) &&
        [t.brand, t.line, t.code, t.name, t.color]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    return closest && target
      ? list
          .map((t) => ({
            t,
            d: deltaE2000(colorLab(t.color), colorLab(target.color)),
          }))
          .sort((a, b) => a.d - b.d)
          .map((v) => v.t)
      : list;
  }, [shades, brand, query, closest, target]);
  const chart = useMemo(
    () => shades.filter((t) => brand === "all" || t.brand === brand),
    [shades, brand],
  );
  const matchReview = useMemo(
    () =>
      matching
        ? previewThreadMatches(project, chart, selected, replaceAssigned)
        : [],
    [matching, project, chart, selected, replaceAssigned],
  );
  const apply = (thread: ThreadShade) => {
    if (!selected.length) {
      toast.info("Select design objects before assigning a physical thread.");
      return;
    }
    onProject({
      ...project,
      objects: project.objects.map((o) =>
        selected.includes(o.id) && !o.locked
          ? {
              ...o,
              thread,
              colorLocked: true,
              ...(replaceColor ? { color: thread.color } : {}),
            }
          : o,
      ),
    });
    toast.success(
      `${thread.brand} ${thread.code} assigned. ${replaceColor ? "Screen colour updated." : "Design hex colours retained."}`,
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="thread-directory-dialog">
        <DialogHeader>
          <DialogTitle>Thread directory</DialogTitle>
          <DialogDescription>
            Keep your physical thread references and exact design colours
            together. Import full CSV or GIMP palette charts, or add your own
            shades.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="library">
              Your shade library · {shades.length}
            </TabsTrigger>
            <TabsTrigger value="manufacturers">Manufacturer charts</TabsTrigger>
            <TabsTrigger value="format">Machine palettes</TabsTrigger>
            <TabsTrigger value="custom">Create shade</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "format" && (
          <div className="feature-card">
            <h2>Built-in machine palettes</h2>
            <p>
              Complete palette indices used by the PES/PEC and JEF writers.
              These screen colours are approximate and carry no physical
              calibration.
            </p>
            <div className="two-fields">
              {[
                ["Brother PEC", PEC_PALETTE],
                ["Janome JEF", JEF_PALETTE],
              ].map(([name, palette]) => (
                <button
                  key={String(name)}
                  className="button"
                  onClick={() => {
                    const added = (palette as typeof PEC_PALETTE).flatMap(
                      (t, i) =>
                        t
                          ? [
                              {
                                brand: String(name),
                                line: "Machine-format palette",
                                code: String(i),
                                name: t.name,
                                color: t.color,
                                source:
                                  "pyembroidery 1.5.1 · MIT · https://github.com/EmbroidePy/pyembroidery",
                              },
                            ]
                          : [],
                    );
                    onProject({
                      ...project,
                      threadLibrary: mergeThreadLibraries(shades, added),
                    });
                    setTab("library");
                  }}
                >
                  {String(name)} ·{" "}
                  {(palette as typeof PEC_PALETTE).filter(Boolean).length}{" "}
                  shades
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="thread-provenance">
          <span className="badge">
            {shades.filter((t) => t.measuredLab).length} shades with
            user-supplied measurements
          </span>
          <button
            className="text-button"
            onClick={() =>
              download(
                "brand,line,code,name,color,source,lab_l,lab_a,lab_b,illuminant,observer,measuredAt,instrument,lot\r\n",
                "thread-calibration-template.csv",
                "text/csv",
              )
            }
          >
            Download measurement template
          </button>
          <p className="help-text">
            CIELAB imports require source, illuminant, observer, measurement
            date and instrument. Measurement records preserve provenance;
            manufacturer completeness and physical colour approval still need
            review.
          </p>
        </div>
        {tab === "manufacturers" && (
          <div className="directory-cards">
            {THREAD_DIRECTORIES.map((t) => (
              <a
                className="feature-card"
                key={t.brand}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="row between">
                  <h3>{t.brand}</h3>
                  <ExternalLink size={16} />
                </div>
                <p>{t.ranges}</p>
                <span className="text-button">
                  Open complete published shade cards
                </span>
              </a>
            ))}
            <p className="help-text">
              Manufacturer charts open on their own websites. Import a chart
              with digital RGB values to search and match it here. Screen RGB is
              an approximation; use a physical thread card for colour approval.
            </p>
          </div>
        )}
        {tab === "custom" && (
          <div className="feature-card">
            <div className="two-fields">
              {(["brand", "line", "code", "name"] as const).map((key) => (
                <label key={key} className="small-label">
                  {key[0].toUpperCase() + key.slice(1)}
                  <input
                    className="text-input"
                    value={draft[key]}
                    maxLength={100}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label className="small-label">
                Display hex
                <input
                  className="text-input"
                  value={draft.color}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value })
                  }
                />
              </label>
              <input
                aria-label="Custom thread colour"
                type="color"
                value={
                  /^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : "#21776a"
                }
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </div>
            <button
              className="button primary"
              onClick={() => {
                try {
                  const t = validateThread(draft);
                  onProject({
                    ...project,
                    threadLibrary: mergeThreadLibraries(shades, [t]),
                  });
                  setTab("library");
                  toast.success("Thread shade saved with the project.");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Save shade
            </button>
          </div>
        )}
        {tab === "library" && (
          <>
            <div className="directory-toolbar">
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="Search threads"
                  placeholder="Brand, code, name or hex"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <Choice
                label="Thread brand"
                value={brand}
                onChange={(v) => {
                  setBrand(v);
                  setPage(0);
                }}
                options={[
                  { value: "all", label: "All brands" },
                  ...[...new Set(shades.map((t) => t.brand))].map((value) => ({
                    value,
                    label: value,
                  })),
                ]}
              />
              <button className="button" onClick={() => input.current?.click()}>
                <Upload size={15} />
                Import chart
              </button>
              <button
                className="button"
                disabled={!shades.length}
                onClick={() =>
                  download(
                    exportThreadLibrary(shades),
                    fileName(project.name) + "-threads.csv",
                    "text/csv",
                  )
                }
              >
                <Download size={15} />
                CSV
              </button>
            </div>
            <div className="row between">
              <label className="toggle-row">
                Closest to selected colour
                <Switch
                  checked={closest}
                  disabled={!target}
                  onCheckedChange={(v) => {
                    setClosest(v);
                    setPage(0);
                  }}
                />
              </label>
              <label className="toggle-row">
                Update design hex when assigning
                <Switch
                  checked={replaceColor}
                  onCheckedChange={setReplaceColor}
                />
              </label>
            </div>
            <button
              className="button"
              disabled={!chart.length}
              onClick={() => {
                setMatching((v) => !v);
                setMatchChoices({});
              }}
            >
              Match {selected.length ? "selected objects" : "design colours"} to
              chart
            </button>
            {matching && (
              <div className="thread-match-review feature-card">
                <h3>Review thread matches</h3>
                <p className="help-text">
                  Exact design hex colours stay unchanged. Choose a shade for
                  each colour; existing assignments are protected by default.
                </p>
                <label className="toggle-row">
                  Replace existing thread assignments
                  <Switch
                    checked={replaceAssigned}
                    onCheckedChange={(value) => {
                      setReplaceAssigned(value);
                      setMatchChoices({});
                    }}
                  />
                </label>
                {matchReview.map((row) => (
                  <div className="thread-match-row" key={row.color}>
                    <span
                      className="small-swatch"
                      style={{ background: row.color }}
                    />
                    <span>
                      {row.color.toUpperCase()}
                      <small>{row.ids.length} objects</small>
                    </span>
                    <Choice
                      label={`Thread for ${row.color}`}
                      value={matchChoices[row.color] ?? "skip"}
                      onChange={(value) =>
                        setMatchChoices((v) => ({ ...v, [row.color]: value }))
                      }
                      options={[
                        { value: "skip", label: "Keep current assignment" },
                        ...row.matches.map((m) => ({
                          value: threadKey(m.shade),
                          label: `${m.shade.brand} ${m.shade.line} ${m.shade.code} · ΔE00 ${m.delta.toFixed(1)}`,
                        })),
                      ]}
                    />
                  </div>
                ))}
                {!matchReview.length && (
                  <p className="help-text">
                    No eligible objects. Existing assignments and locked objects
                    are protected.
                  </p>
                )}
                <div className="row">
                  <button
                    className="button"
                    onClick={() =>
                      setMatchChoices(
                        Object.fromEntries(
                          matchReview
                            .filter((row) => row.matches.length)
                            .map((row) => [
                              row.color,
                              threadKey(row.matches[0].shade),
                            ]),
                        ),
                      )
                    }
                  >
                    Choose closest matches
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !matchReview.some((row) =>
                        row.matches.some(
                          (m) => threadKey(m.shade) === matchChoices[row.color],
                        ),
                      )
                    }
                    onClick={() => {
                      onProject(
                        applyThreadMatches(
                          project,
                          matchReview,
                          matchChoices,
                          replaceAssigned,
                        ),
                      );
                      setMatching(false);
                      toast.success(
                        "Reviewed thread assignments applied. Original hex colours retained.",
                      );
                    }}
                  >
                    Apply reviewed matches
                  </button>
                </div>
              </div>
            )}
            <div className="thread-shade-grid">
              {results.slice(page * 60, page * 60 + 60).map((t, i) => (
                <button
                  className="thread-shade"
                  key={`${page}-${i}`}
                  onClick={() => apply(t)}
                  title={`Assign ${t.brand} ${t.line} ${t.code}`}
                >
                  <span
                    className="large-swatch"
                    style={{ background: t.color }}
                  />
                  <span>
                    <strong>{t.code || t.name || t.color}</strong>
                    <small>
                      {t.brand} · {t.line}
                    </small>
                    <small>
                      {t.name} · {t.color.toUpperCase()}
                    </small>
                    {closest && target && (
                      <small>
                        ΔE00{" "}
                        {deltaE2000(
                          colorLab(t.color),
                          colorLab(target.color),
                        ).toFixed(1)}
                      </small>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {!shades.length && (
              <div className="empty-art">
                <Palette size={34} />
                <strong>Build your working thread collection</strong>
                <span>
                  Import an entire CSV / GPL chart or create a custom shade.
                </span>
                <button
                  className="text-button"
                  onClick={() =>
                    download(
                      "brand,line,code,name,color\r\nCustom,Studio,JADE,Studio jade,#21776a",
                      "thread-chart-template.csv",
                      "text/csv",
                    )
                  }
                >
                  Download CSV template
                </button>
              </div>
            )}
            <div className="row between">
              <span className="help-text">
                {results.length} shades · {selected.length} design objects
                selected
              </span>
              <div className="row">
                <button
                  className="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="button"
                  disabled={(page + 1) * 60 >= results.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
            <p className="help-text">
              Matching uses CIELAB ΔE00 as a screen-colour guide. Assigning a
              shade protects the colour in optimization. The chart and
              assignments are saved inside your editable project.
            </p>
          </>
        )}
        <input
          className="sr-only"
          ref={input}
          type="file"
          accept=".csv,.gpl"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > 2 * 1024 * 1024)
                throw new Error("Choose a chart under 2 MB.");
              const next = importThreadLibrary(await file.text(), file.name);
              onProject({
                ...project,
                threadLibrary: mergeThreadLibraries(shades, next),
              });
              setPage(0);
              toast.success(`${next.length} shades imported.`);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
