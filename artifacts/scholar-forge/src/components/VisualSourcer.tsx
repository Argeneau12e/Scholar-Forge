import { useState, useEffect, useCallback, useRef } from "react";
import {
  Image,
  Search,
  X,
  Copy,
  Check,
  Plus,
  Lightbulb,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSupervisor } from "@/hooks/useSupervisor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FigureResult {
  url: string;
  caption: string;
  attribution: string;
  source: "pmc" | "wikimedia";
}

interface AISuggestionTool {
  name: string;
  url: string;
  note: string;
}

interface AISuggestion {
  suggestion: string;
  tools: AISuggestionTool[];
}

interface VisualsResponse {
  figures: FigureResult[];
  aiSuggestion: AISuggestion | null;
}

interface SavedFigure extends FigureResult {
  topic: string;
  savedAt: number;
}

type FigureType = "any" | "diagram" | "graph" | "table" | "microscopy";

const FIGURE_TYPES: { value: FigureType; label: string }[] = [
  { value: "any",        label: "Any type" },
  { value: "diagram",   label: "Diagram" },
  { value: "graph",     label: "Graph / Chart" },
  { value: "table",     label: "Table" },
  { value: "microscopy", label: "Microscopy" },
];

const SOURCE_META = {
  pmc:       { label: "PubMed Central", classes: "bg-blue-50 text-blue-700 border-blue-200" },
  wikimedia: { label: "Wikimedia",      classes: "bg-violet-50 text-violet-700 border-violet-200" },
};

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handle}>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

// ─── Image card ───────────────────────────────────────────────────────────────

function FigureCard({
  figure,
  topic,
  onOpen,
  onSave,
  saved,
}: {
  figure: FigureResult;
  topic: string;
  onOpen: (f: FigureResult) => void;
  onSave: (f: FigureResult) => void;
  saved: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const meta = SOURCE_META[figure.source];

  return (
    <div className="group rounded-xl border bg-card overflow-hidden flex flex-col hover:border-primary/40 hover:shadow-md transition-all">
      {/* Thumbnail */}
      <button
        onClick={() => onOpen(figure)}
        className="relative block w-full bg-muted/40 overflow-hidden"
        style={{ aspectRatio: "4/3" }}
      >
        {imgError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Image className="h-8 w-8 opacity-30" />
            <span className="text-xs">Image unavailable</span>
          </div>
        ) : (
          <img
            src={figure.url}
            alt={figure.caption}
            className="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-[1.02] transition-transform"
            onError={() => setImgError(true)}
          />
        )}
        {/* Source badge overlay */}
        <span className={cn(
          "absolute top-2 left-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
          meta.classes
        )}>
          {meta.label}
        </span>
      </button>

      {/* Caption + actions */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-xs text-foreground leading-snug line-clamp-2 flex-1">{figure.caption}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <CopyButton text={figure.attribution} label="Copy attribution" />
          <Button
            size="sm"
            variant={saved ? "secondary" : "outline"}
            className={cn("h-7 gap-1.5 text-xs", saved && "text-emerald-700")}
            onClick={() => onSave(figure)}
            disabled={saved}
          >
            {saved ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  figure,
  onClose,
}: {
  figure: FigureResult;
  onClose: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const meta = SOURCE_META[figure.source];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl border shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", meta.classes)}>
            {meta.label}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Image */}
        <div className="bg-muted/30 flex items-center justify-center p-6 max-h-[50vh]">
          {imgError ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground py-8">
              <Image className="h-12 w-12 opacity-30" />
              <span className="text-sm">Image could not be loaded</span>
              <a href={figure.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">
                Open original URL
              </a>
            </div>
          ) : (
            <img
              src={figure.url}
              alt={figure.caption}
              className="max-w-full max-h-[45vh] object-contain rounded-lg"
              onError={() => setImgError(true)}
            />
          )}
        </div>

        {/* Caption + attribution */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Caption</p>
            <p className="text-sm text-foreground leading-relaxed">{figure.caption}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Attribution</p>
            <p className="text-sm text-foreground/80 font-mono leading-relaxed">{figure.attribution}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <CopyButton text={figure.attribution} label="Copy attribution" />
            <a
              href={figure.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open original
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SAVED_KEY = "sf_figures";

function loadSaved(): SavedFigure[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as SavedFigure[];
  } catch { return []; }
}

function saveFigure(figure: FigureResult, topic: string): SavedFigure[] {
  const existing = loadSaved();
  if (existing.some((f) => f.url === figure.url)) return existing;
  const next: SavedFigure[] = [{ ...figure, topic, savedAt: Date.now() }, ...existing];
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  return next;
}

export function VisualSourcer() {
  const { config } = useSupervisor();
  const discipline = config?.discipline ?? "general";

  // Pre-fill topic from saved thesis
  const savedThesis = (() => {
    try { return localStorage.getItem("sf_thesis") ?? ""; } catch { return ""; }
  })();

  const [topic, setTopic] = useState(savedThesis.slice(0, 120));
  const [figureType, setFigureType] = useState<FigureType>("any");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisualsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<FigureResult | null>(null);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(() => new Set(loadSaved().map((f) => f.url)));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = useCallback(async () => {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch("/api/visuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), discipline, figureType }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError((data as { error: string }).error ?? "Search failed."); return; }
      setResult(data as VisualsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [topic, discipline, figureType, loading]);

  const handleSave = useCallback((figure: FigureResult) => {
    const next = saveFigure(figure, topic);
    setSavedUrls(new Set(next.map((f) => f.url)));
  }, [topic]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const figures = result?.figures ?? [];
  const aiSuggestion = result?.aiSuggestion ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl text-foreground flex items-center gap-2">
          <Image className="h-6 w-6 text-teal-600" />
          Visual Sourcer
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Find open-access figures from PubMed Central and Wikimedia Commons
        </p>
      </div>

      {/* Search controls */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        {/* Topic input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Topic / search query</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. CRISPR gene editing mechanism…"
              className="flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            <Button
              onClick={handleSearch}
              disabled={loading || !topic.trim()}
              className="bg-teal-700 hover:bg-teal-800 text-white gap-2 h-10 px-5 shrink-0"
            >
              {loading ? <><Spinner /> Searching…</> : <><Search className="h-4 w-4" /> Find Figures</>}
            </Button>
          </div>
        </div>

        {/* Figure type selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Figure type</label>
          <div className="flex flex-wrap gap-2">
            {FIGURE_TYPES.map((ft) => (
              <button
                key={ft.value}
                onClick={() => setFigureType(ft.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  figureType === ft.value
                    ? "border-teal-500 bg-teal-50 text-teal-800"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-teal-300"
                )}
              >
                {ft.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Searching PubMed Central and Wikimedia Commons…
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card overflow-hidden animate-pulse">
                <div className="bg-muted" style={{ aspectRatio: "4/3" }} />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-5">
          {/* Count summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {figures.length === 0
                ? "No figures found"
                : `${figures.length} figure${figures.length !== 1 ? "s" : ""} found`}
            </p>
            {figures.length > 0 && (
              <>
                {figures.filter((f) => f.source === "pmc").length > 0 && (
                  <Badge variant="outline" className={cn("text-[11px]", SOURCE_META.pmc.classes)}>
                    {figures.filter((f) => f.source === "pmc").length} from PubMed Central
                  </Badge>
                )}
                {figures.filter((f) => f.source === "wikimedia").length > 0 && (
                  <Badge variant="outline" className={cn("text-[11px]", SOURCE_META.wikimedia.classes)}>
                    {figures.filter((f) => f.source === "wikimedia").length} from Wikimedia
                  </Badge>
                )}
              </>
            )}
          </div>

          {/* Image grid */}
          {figures.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {figures.map((fig, i) => (
                <FigureCard
                  key={`${fig.url}-${i}`}
                  figure={fig}
                  topic={topic}
                  onOpen={setLightbox}
                  onSave={handleSave}
                  saved={savedUrls.has(fig.url)}
                />
              ))}
            </div>
          )}

          {/* AI suggestion card */}
          {aiSuggestion && (
            <div className="rounded-2xl border-2 border-teal-300 bg-teal-50/60 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-teal-700 shrink-0" />
                <p className="text-sm font-semibold text-teal-800">
                  AI Figure Suggestion{figures.length === 0 ? " (no open-access figures found)" : ""}
                </p>
              </div>
              <p className="text-sm text-teal-900 leading-relaxed">{aiSuggestion.suggestion}</p>
              {aiSuggestion.tools.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Free tools to create this figure</p>
                  <div className="flex flex-wrap gap-2">
                    {aiSuggestion.tools.map((tool, i) => (
                      <a
                        key={i}
                        href={tool.url}
                        target="_blank"
                        rel="noreferrer"
                        title={tool.note}
                        className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-white px-3 py-1 text-xs font-medium text-teal-800 hover:bg-teal-100 transition-colors"
                      >
                        {tool.name}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    ))}
                  </div>
                  {/* Tool notes */}
                  <div className="space-y-1 pt-1">
                    {aiSuggestion.tools.map((tool, i) => (
                      <p key={i} className="text-[11px] text-teal-700">
                        <span className="font-medium">{tool.name}:</span> {tool.note}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {figures.length === 0 && !aiSuggestion && (
            <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground space-y-2">
              <Image className="h-10 w-10 mx-auto opacity-20" />
              <p className="text-sm">No figures found for this topic.</p>
              <p className="text-xs">Try a broader search term or different figure type.</p>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && <Lightbox figure={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
