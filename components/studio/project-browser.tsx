"use client";
import { useEffect, useState } from "react";
import { Clock3, FolderOpen, Loader2, Plus, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project } from "@/lib/embroidery/types";
import { validateProject } from "@/lib/embroidery/project";
import { api, errorMessage } from "./controls";
type Summary = {
  id: string;
  name: string;
  revision: number;
  object_count: number;
  updated_at: number;
};
export default function ProjectBrowser({
  open,
  onOpenChange,
  onLoad,
  onNew,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onLoad: (
    project: Project,
    cloud: { id: string; revision: number; restoredRevision?: number | null },
  ) => void;
  onNew: () => void;
}) {
  const [projects, setProjects] = useState<Summary[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [next, setNext] = useState<number | null>(null),
    [history, setHistory] = useState<{
      project: Summary;
      revisions: { revision: number; created_at: number }[];
    } | null>(null);
  async function load(offset = 0) {
    setLoading(true);
    setError("");
    try {
      const data = await api<{
        projects: Summary[];
        nextOffset: number | null;
      }>(`/api/projects?offset=${offset}`);
      setProjects((current) =>
        offset ? [...current, ...data.projects] : data.projects,
      );
      setNext(data.nextOffset);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Opening the browser resets revision navigation and starts an external request.
      setHistory(null);
      void load();
    }
  }, [open]);
  async function openProject(project: Summary, revision?: number) {
    setLoading(true);
    setError("");
    try {
      const data = await api<{
        project: unknown;
        id: string;
        revision: number;
        restoredRevision?: number | null;
      }>(
        `/api/projects?id=${project.id}${revision ? `&revision=${revision}` : ""}`,
      );
      onLoad(validateProject(data.project), {
        id: data.id,
        revision: data.revision,
        restoredRevision: data.restoredRevision,
      });
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="project-dialog">
        <DialogHeader>
          <DialogTitle>Your projects</DialogTitle>
          <DialogDescription>
            Private projects and their saved revisions. Guest designing needs no
            sign-in.
          </DialogDescription>
        </DialogHeader>
        <p className="help-text">
          Sign in to access account projects across devices. Guest projects stay
          with this browser. Recent edits also have a local recovery draft.
        </p>
        <button
          className="button"
          onClick={() => {
            onOpenChange(false);
            onNew();
          }}
          disabled={loading}
        >
          <Plus size={16} />
          New blank design
        </button>
        {error && (
          <div className="issue error" role="alert">
            {error}
            <button className="text-button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        {loading && (
          <div className="row muted">
            <Loader2 size={18} className="animate-spin" />
            Loading…
          </div>
        )}
        {history ? (
          <div className="project-list">
            <button className="text-button" onClick={() => setHistory(null)}>
              ← All projects
            </button>
            <h3>{history.project.name}</h3>
            {history.revisions.map((r) => (
              <button
                className="project-card"
                key={r.revision}
                disabled={loading}
                onClick={() => void openProject(history.project, r.revision)}
              >
                <RotateCcw size={18} />
                <span>
                  <strong>Revision {r.revision}</strong>
                  <small>{new Date(r.created_at).toLocaleString()}</small>
                </span>
                <span className="badge">Open revision</span>
              </button>
            ))}
            <p className="help-text">
              Opening an earlier revision preserves later saved versions. Save
              it to create a new revision.
            </p>
          </div>
        ) : (
          <div className="project-list">
            {projects.map((p) => (
              <div className="project-card" key={p.id}>
                <button
                  className="project-open"
                  onClick={() => void openProject(p)}
                  disabled={loading}
                >
                  <FolderOpen size={21} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.object_count} objects · Revision {p.revision} ·{" "}
                      {new Date(p.updated_at).toLocaleDateString()}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Version history for ${p.name}`}
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const result = await api<{
                        history: { revision: number; created_at: number }[];
                      }>(`/api/projects?id=${p.id}&history=1`);
                      setHistory({ project: p, revisions: result.history });
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  <Clock3 size={17} />
                </button>
              </div>
            ))}
            {!loading && !projects.length && !error && (
              <p className="help-text">
                Save your first design from the studio to find it here.
              </p>
            )}
            {next !== null && (
              <button
                className="button"
                disabled={loading}
                onClick={() => void load(next)}
              >
                More projects
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
