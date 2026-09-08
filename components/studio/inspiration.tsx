/* eslint-disable @next/next/no-img-element -- Reference URLs and user-uploaded blob previews must render directly without an image proxy. */
"use client";
import { createId } from "@/lib/embroidery/id";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ExternalLink,
  ImagePlus,
  Link2,
  Loader2,
  Palette,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { traceImage } from "@/lib/embroidery/raster";
import { api, Choice, errorMessage } from "./controls";
type Reference = {
  id: string;
  title: string;
  url: string;
  notes: string;
  tags: string[];
  palette: string[];
  image: string | null;
  createdAt: number;
};
type Pin = {
  id: string;
  title: string;
  description: string;
  url: string;
  image: string | null;
};
const sources = [
  {
    name: "Pinterest",
    caption: "Ideas, textures & collections",
    href: (q: string) =>
      `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`,
    letter: "P",
    color: "#bb2333",
  },
  {
    name: "Behance",
    caption: "Designers & complete projects",
    href: (q: string) =>
      `https://www.behance.net/search/projects?search=${encodeURIComponent(q)}`,
    letter: "Bē",
    color: "#2456ed",
  },
  {
    name: "Dribbble",
    caption: "Illustration & visual identities",
    href: (q: string) => `https://dribbble.com/search/${encodeURIComponent(q)}`,
    letter: "d",
    color: "#ab4c80",
  },
  {
    name: "The Met",
    caption: "Textile history & pattern studies",
    href: (q: string) =>
      `https://www.metmuseum.org/art/collection/search?q=${encodeURIComponent(q)}`,
    letter: "M",
    color: "#795246",
  },
];
export default function Inspiration({
  onPalette,
}: {
  onPalette: (colors: string[]) => void;
}) {
  const [references, setReferences] = useState<Reference[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [next, setNext] = useState<number | null>(null),
    [query, setQuery] = useState("embroidery botanical textile"),
    [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(""),
    [url, setURL] = useState(""),
    [notes, setNotes] = useState(""),
    [tags, setTags] = useState(""),
    [image, setImage] = useState<string | null>(null),
    [palette, setPalette] = useState<string[]>([]),
    [saving, setSaving] = useState(false),
    [imageBusy, setImageBusy] = useState(false);
  const [connection, setConnection] = useState<{
      configured: boolean;
      connected: boolean;
    } | null>(null),
    [setup, setSetup] = useState(false),
    [connecting, setConnecting] = useState(false),
    [boards, setBoards] = useState<{ id: string; name: string }[]>([]),
    [board, setBoard] = useState(""),
    [pins, setPins] = useState<Pin[]>([]),
    [pinBookmark, setPinBookmark] = useState<string | null>(null),
    [boardBookmark, setBoardBookmark] = useState<string | null>(null),
    [pinBusy, setPinBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null),
    pinRequest = useRef(0);
  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{
        references: Reference[];
        nextOffset: number | null;
      }>(`/api/references?offset=${offset}`);
      setReferences((current) =>
        offset ? [...current, ...data.references] : data.references,
      );
      setNext(data.nextOffset);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the external reference request and its loading indicator.
    void load();
    api<{ configured: boolean; connected: boolean }>(
      "/api/integrations/pinterest",
    )
      .then(setConnection)
      .catch((e) => setError(errorMessage(e)));
  }, [load]);
  async function readBoards(bookmark?: string) {
    setPinBusy(true);
    try {
      const data = await api<{
        items: { id: string; name: string }[];
        bookmark: string | null;
      }>(
        "/api/integrations/pinterest?mode=boards" +
          (bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""),
      );
      setBoards((current) =>
        bookmark ? [...current, ...data.items] : data.items,
      );
      setBoardBookmark(data.bookmark);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPinBusy(false);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A newly connected external account needs a board request and loading indicator.
    if (connection?.connected) void readBoards();
  }, [connection?.connected]);
  async function readPins(id: string, bookmark?: string) {
    const request = ++pinRequest.current;
    setPinBusy(true);
    setBoard(id);
    if (!bookmark) {
      setPins([]);
      setPinBookmark(null);
    }
    try {
      const data = await api<{ items: Pin[]; bookmark: string | null }>(
        `/api/integrations/pinterest?mode=pins&board=${encodeURIComponent(id)}` +
          (bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""),
      );
      if (request !== pinRequest.current) return;
      setPins((current) =>
        bookmark ? [...current, ...data.items] : data.items,
      );
      setPinBookmark(data.bookmark);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (request === pinRequest.current) setPinBusy(false);
    }
  }
  function newReference(pin?: Pin) {
    setTitle(pin?.title ?? "");
    setURL(pin?.url ?? "");
    setNotes(pin?.description ?? "");
    setTags("");
    setImage(null);
    setPalette([]);
    setOpen(true);
  }
  async function connect() {
    if (!connection?.configured) {
      setSetup(true);
      return;
    }
    setConnecting(true);
    try {
      const result = await api<{ url: string }>("/api/integrations/pinterest", {
        method: "POST",
      });
      window.location.assign(result.url);
    } catch (e) {
      toast.error(errorMessage(e));
      setConnecting(false);
    }
  }
  async function imageUpload(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Choose an image under 8 MB.");
      return;
    }
    setImageBusy(true);
    try {
      const bitmap = await createImageBitmap(file),
        scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setImage(canvas.toDataURL("image/webp", 0.8));
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      try {
        const p = await traceImage(file, {
          colors: 5,
          resolution: 96,
          minArea: 8,
          removeWhite: false,
          widthMM: 160,
        });
        setPalette([...new Set(p.objects.map((o) => o.color))]);
      } catch {
        setPalette([]);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImageBusy(false);
    }
  }
  async function saveReference() {
    setSaving(true);
    try {
      await api("/api/references", {
        method: "POST",
        body: JSON.stringify({
          id: createId(),
          title,
          url,
          notes,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          palette,
          image,
        }),
      });
      setOpen(false);
      toast.success("Reference saved.");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function removeReference(id: string) {
    try {
      await api(`/api/references?id=${id}`, { method: "DELETE" });
      setReferences((list) => list.filter((r) => r.id !== id));
      toast.success("Reference removed.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const visible = references.filter((r) =>
    [r.title, r.notes, ...r.tags]
      .join(" ")
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <section className="feature-workspace inspiration-workspace">
      <div className="feature-heading">
        <div>
          <span className="eyebrow">Your creative field notes</span>
          <h1>Collect a spark. Make it your own.</h1>
          <p>
            Gather references, study palettes and bring a new direction into
            your embroidery.
          </p>
        </div>
        <button className="button primary" onClick={() => newReference()}>
          <Plus size={16} />
          Save a reference
        </button>
      </div>
      <div className="inspiration-search feature-card">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search inspiration sites"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={200}
          />
        </label>
        <div className="source-grid">
          {sources.map((source) => (
            <a
              className="source-card"
              key={source.name}
              href={source.href(query)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span
                className="source-mark"
                style={{ background: source.color }}
              >
                {source.letter}
              </span>
              <span>
                <strong>{source.name}</strong>
                <small>{source.caption}</small>
              </span>
              <ArrowUpRight size={17} />
            </a>
          ))}
        </div>
        <p className="help-text">
          Search opens the source website. Save a reference link here to keep
          its attribution and your design notes together.
        </p>
      </div>
      <div className="pinterest-bar">
        <div className="row">
          <span className="source-mark pinterest-mark">P</span>
          <div>
            <strong>Your Pinterest boards</strong>
            <p>
              {connection?.connected
                ? "Connected · browse your boards below"
                : "Connect an account to bring your boards into this workspace."}
            </p>
          </div>
        </div>
        <div className="row">
          {connection?.connected ? (
            <>
              <span className="good-note">
                <Check size={15} />
                Connected
              </span>
              <button
                className="button"
                onClick={async () => {
                  try {
                    await api("/api/integrations/pinterest", {
                      method: "DELETE",
                    });
                    setConnection({ configured: true, connected: false });
                    setBoards([]);
                    setPins([]);
                    toast.success("Pinterest disconnected from Threadform.");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="button"
              onClick={() => void connect()}
              disabled={connecting || !connection}
            >
              {connecting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Link2 size={15} />
              )}
              Connect Pinterest
            </button>
          )}
        </div>
      </div>
      {connection?.connected && (
        <div className="feature-card">
          <div className="row">
            <div style={{ minWidth: 240 }}>
              <Choice
                label="Pinterest board"
                value={board}
                onChange={(v) => void readPins(v)}
                options={boards.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
            {boardBookmark && (
              <button
                className="button"
                disabled={pinBusy}
                onClick={() => void readBoards(boardBookmark)}
              >
                More boards
              </button>
            )}
            {pinBusy && <Loader2 className="animate-spin" size={18} />}
          </div>
          <div className="reference-grid">
            {pins.map((pin) => (
              <article className="reference-card" key={pin.id}>
                {pin.image && (
                  <img
                    src={pin.image}
                    alt={pin.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="reference-body">
                  <h3>{pin.title}</h3>
                  <a href={pin.url} target="_blank" rel="noopener noreferrer">
                    View on Pinterest <ExternalLink size={12} />
                  </a>
                  <button
                    className="button full"
                    onClick={() => newReference(pin)}
                  >
                    <Bookmark size={14} />
                    Save link & notes
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!pinBusy && board && !pins.length && (
            <p className="help-text">This board has no readable pins.</p>
          )}
          {pinBookmark && (
            <button
              className="button"
              onClick={() => void readPins(board, pinBookmark)}
              disabled={pinBusy}
            >
              More pins
            </button>
          )}
        </div>
      )}
      <div className="collection-heading">
        <div>
          <h2>
            Your reference board{" "}
            <span className="badge">
              {references.length}
              {next ? "+" : ""}
            </span>
          </h2>
          <p>Patterns, colour stories and details worth returning to.</p>
        </div>
        <label className="search-field compact">
          <Search size={15} />
          <input
            aria-label="Filter saved references"
            placeholder="Filter saved references…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="issue error" role="alert">
          {error}
          <button className="text-button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {loading && !references.length ? (
        <div className="empty-collection">
          <Loader2 className="animate-spin" />
          Loading references…
        </div>
      ) : (
        <div className="reference-grid">
          {visible.map((reference) => (
            <article className="reference-card" key={reference.id}>
              {reference.image ? (
                <img
                  src={reference.image}
                  alt={reference.title}
                  loading="lazy"
                />
              ) : (
                <div
                  className="reference-colour-art"
                  style={{
                    background: reference.palette.length
                      ? `linear-gradient(135deg,${reference.palette[0]},${reference.palette[reference.palette.length - 1]})`
                      : "#e6ebe8",
                  }}
                >
                  <Bookmark size={34} strokeWidth={1} />
                </div>
              )}
              <div className="reference-body">
                <div className="row between">
                  <h3>{reference.title}</h3>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${reference.title}`}
                    onClick={() => void removeReference(reference.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {reference.url && (
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {new URL(reference.url).hostname.replace(/^www\./, "")}
                    <ExternalLink size={12} />
                  </a>
                )}
                {reference.notes && <p>{reference.notes}</p>}
                <div className="tag-list">
                  {reference.tags.map((tag, i) => (
                    <span key={i}>{tag}</span>
                  ))}
                </div>
                {reference.palette.length > 0 && (
                  <>
                    <div className="palette-strip">
                      {reference.palette.map((color, i) => (
                        <span
                          key={i}
                          style={{ background: color }}
                          title={color}
                        />
                      ))}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => onPalette(reference.palette)}
                    >
                      <Palette size={14} />
                      Bring palette into studio
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          {!filter && (
            <button className="reference-add" onClick={() => newReference()}>
              <Plus size={28} strokeWidth={1} />
              <strong>
                {references.length
                  ? "A little more inspiration"
                  : "Start your reference board"}
              </strong>
              <span>Save a link, an image or a colour story.</span>
            </button>
          )}
        </div>
      )}
      {filter && !visible.length && !loading && (
        <p className="help-text">No saved references match this filter.</p>
      )}
      {next !== null && (
        <button
          className="button"
          disabled={loading}
          onClick={() => void load(next)}
        >
          Load more references
        </button>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!saving && !imageBusy) setOpen(value);
        }}
      >
        <DialogContent className="reference-dialog">
          <DialogHeader>
            <DialogTitle>Save a reference</DialogTitle>
            <DialogDescription>
              Keep the source link, your ideas and a palette in one place.
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-body">
            <label className="form-field">
              Title
              <input
                value={title}
                maxLength={150}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A botanical border, a colour combination…"
              />
            </label>
            <label className="form-field">
              Source link
              <input
                value={url}
                maxLength={2000}
                onChange={(e) => setURL(e.target.value)}
                placeholder="https://www.pinterest.com/pin/…"
              />
            </label>
            <label className="form-field">
              Design notes
              <textarea
                value={notes}
                maxLength={3000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What catches your eye? What would you change?"
                rows={3}
              />
            </label>
            <label className="form-field">
              Tags · separated by commas
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="botanical, border, summer"
                maxLength={480}
              />
            </label>
            <input
              className="sr-only"
              ref={upload}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void imageUpload(file);
                e.target.value = "";
              }}
            />
            {image && (
              <img
                className="trace-preview"
                src={image}
                alt="Reference preview"
              />
            )}
            <button
              className="button"
              onClick={() => upload.current?.click()}
              disabled={imageBusy}
            >
              {imageBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ImagePlus size={16} />
              )}
              Add image & extract palette
            </button>
            {palette.length > 0 && (
              <div className="palette row">
                {palette.map((color, i) => (
                  <input
                    key={i}
                    className="color-input"
                    aria-label={`Reference colour ${i + 1}`}
                    type="color"
                    value={color}
                    onChange={(e) =>
                      setPalette((p) =>
                        p.map((c, j) => (j === i ? e.target.value : c)),
                      )
                    }
                  />
                ))}
              </div>
            )}
            <button
              className="button primary full"
              disabled={!title.trim() || saving || imageBusy}
              onClick={() => void saveReference()}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Bookmark size={16} />
              )}
              Save reference
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={setup} onOpenChange={setSetup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Pinterest board import</DialogTitle>
            <DialogDescription>
              This studio’s Pinterest application needs to be configured before
              you can connect your account.
            </DialogDescription>
          </DialogHeader>
          <p className="help-text">
            The connection uses Pinterest’s official API with permission to read
            public boards and pins. The app owner must register a Pinterest
            developer app and configure its credentials and callback. Your
            password is never entered into Threadform.
          </p>
          <a
            className="button"
            href="https://developers.pinterest.com/apps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Pinterest developer portal
            <ExternalLink size={15} />
          </a>
          <p className="help-text">
            Public searches, saved links, uploaded references and colour
            extraction work independently of account sync.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
