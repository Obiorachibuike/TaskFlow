"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, FileText, FolderKanban, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface SearchResults {
  issues: Array<{
    id: string;
    key: string;
    title: string;
    status: string;
    type: string;
    project: { key: string; name: string; workspace: { slug: string } };
  }>;
  projects: Array<{ id: string; key: string; name: string; icon: string | null; color: string }>;
  comments: Array<{
    id: string;
    body: string;
    issue: { key: string; title: string; project: { key: string; workspace: { slug: string } } };
    author: { name: string };
  }>;
}

export function SearchDialog({ workspaceSlug }: { workspaceSlug: string }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<SearchResults | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setError(null);
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch<SearchResults>(
          `/api/workspaces/${workspaceSlug}/search?q=${encodeURIComponent(term)}`,
        );
        setResults(data);
      } catch (err) {
        setError(errorMessage(err, "Search failed"));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, workspaceSlug]);

  function go(path: string) {
    setOpen(false);
    setQuery("");
    router.push(path);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-surface-2/60 px-2.5 text-xs text-faint transition-colors hover:border-border-strong hover:text-muted"
          aria-label="Global search"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="ml-1 hidden rounded border border-border-subtle bg-surface px-1 py-0.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>
      </DialogTrigger>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 p-0" hideClose>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border-subtle px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues, projects, and comments…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
            autoFocus
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        </div>
        <div className="max-h-[380px] overflow-y-auto p-2">
          {error && <p className="px-3 py-4 text-sm text-danger">{error}</p>}
          {!error && query.trim().length < 2 && (
            <p className="px-3 py-6 text-center text-sm text-faint">
              Type at least 2 characters to search.
            </p>
          )}
          {results && (
            <div className="space-y-3">
              {results.issues.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-[11px] font-medium text-faint">Issues</p>
                  {results.issues.map((i) => (
                    <button
                      key={i.id}
                      onClick={() =>
                        go(`/app/${i.project.workspace.slug}/projects/${i.project.key}/issues/${i.key}`)
                      }
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted" />
                      <span className="font-mono text-xs text-primary">{i.key}</span>
                      <span className="flex-1 truncate text-foreground">{i.title}</span>
                      <span className="text-[10px] uppercase tracking-wide text-faint">{i.type}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.projects.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-[11px] font-medium text-faint">Projects</p>
                  {results.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => go(`/app/${workspaceSlug}/projects/${p.key}`)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                    >
                      <FolderKanban className="h-4 w-4 shrink-0" style={{ color: p.color }} />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-mono text-xs text-faint">{p.key}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.comments.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-[11px] font-medium text-faint">Comments</p>
                  {results.comments.map((c) => (
                    <button
                      key={c.id}
                      onClick={() =>
                        go(
                          `/app/${c.issue.project.workspace.slug}/projects/${c.issue.project.key}/issues/${c.issue.key}`,
                        )
                      }
                      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground">{c.body}</p>
                        <p className="text-xs text-faint">
                          {c.author.name} on {c.issue.key}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {results.issues.length === 0 &&
                results.projects.length === 0 &&
                results.comments.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-faint">No results for “{query}”.</p>
                )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
