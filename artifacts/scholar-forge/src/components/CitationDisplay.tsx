import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clipboard,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupervisor } from "@/hooks/useSupervisor";
import type { Paper } from "@workspace/api-client-react/src/generated/api.schemas";

// ─── Types ───────────────────────────────────────────────────────────────────

type StyleKey = "apa" | "vancouver" | "harvard" | "mla" | "chicago";

interface AllFormats {
  apa: string;
  vancouver: string;
  harvard: string;
  mla: string;
  chicago: string;
}

interface CiteApiResponse {
  formatted: AllFormats;
  bibtex: string;
  metadata: Record<string, unknown>;
}

interface CitationDisplayProps {
  paper: Paper;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Style config ─────────────────────────────────────────────────────────────

const STYLE_TABS: { key: StyleKey; label: string }[] = [
  { key: "apa", label: "APA" },
  { key: "vancouver", label: "Vancouver" },
  { key: "harvard", label: "Harvard" },
  { key: "mla", label: "MLA" },
];

/** Map the supervisor config's citationStyle string → our API style key */
function supervisorStyleToKey(raw?: string): StyleKey | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("apa")) return "apa";
  if (lower.includes("vancouver")) return "vancouver";
  if (lower.includes("harvard")) return "harvard";
  if (lower.includes("mla")) return "mla";
  if (lower.includes("chicago")) return "chicago";
  return null;
}

/** Build CitationMetadata from a Paper object */
function paperToMetadata(p: Paper) {
  return {
    title: p.title,
    authors: p.authors,
    year: p.year ?? undefined,
    journal: p.venue ?? undefined,
    doi: p.doi ?? undefined,
    url: p.url ?? undefined,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CitationDisplay({ paper, open, onOpenChange }: CitationDisplayProps) {
  const { config } = useSupervisor();

  const supervisorKey = supervisorStyleToKey(config?.citationStyle);

  const [activeStyle, setActiveStyle] = useState<StyleKey>(supervisorKey ?? "apa");
  const [data, setData] = useState<CiteApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [bibtexOpen, setBibtexOpen] = useState(false);
  const [bibtexCopied, setBibtexCopied] = useState(false);

  const fetchCitation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const body = paper.doi
        ? { doi: paper.doi }
        : { metadata: paperToMetadata(paper) };

      const resp = await fetch("/api/cite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error ?? "Citation lookup failed.");
        return;
      }
      setData(json as CiteApiResponse);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [paper]);

  useEffect(() => {
    if (open && !data && !isLoading) {
      fetchCitation();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when dialog closes
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setData(null);
      setError(null);
      setCopied(false);
      setBibtexOpen(false);
      setBibtexCopied(false);
      setActiveStyle(supervisorKey ?? "apa");
    }
    onOpenChange(o);
  };

  const currentText = data?.formatted[activeStyle] ?? "";

  const handleCopy = () => {
    if (!currentText) return;
    navigator.clipboard.writeText(currentText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleBibtexCopy = () => {
    if (!data?.bibtex) return;
    navigator.clipboard.writeText(data.bibtex).then(() => {
      setBibtexCopied(true);
      setTimeout(() => setBibtexCopied(false), 2000);
    });
  };

  // Style mismatch warning: when supervisorKey is set and differs from activeStyle
  const showMismatch =
    supervisorKey !== null &&
    supervisorKey !== activeStyle &&
    STYLE_TABS.some((t) => t.key === supervisorKey);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            <Quote className="h-4 w-4 text-emerald-700" />
            Citation
          </DialogTitle>
          <p
            className="text-sm text-muted-foreground leading-snug truncate mt-0.5"
            title={paper.title}
          >
            {paper.title}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* ── Style tabs ── */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
            {STYLE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveStyle(tab.key)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  activeStyle === tab.key
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.key === supervisorKey && (
                  <span className="ml-1 text-[9px] text-emerald-600 font-bold">★</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Style mismatch warning ── */}
          {showMismatch && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span>
                Your supervisor prefers{" "}
                <strong>{STYLE_TABS.find((t) => t.key === supervisorKey)?.label}</strong>.
                Switch to that tab to match their requirements.
              </span>
            </div>
          )}

          {/* ── Loading ── */}
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <svg className="animate-spin h-6 w-6 text-emerald-700" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── Formatted citation ── */}
          {data && (
            <div className="space-y-3">
              <div className="relative group rounded-lg border border-border bg-muted/30 px-4 py-4">
                <p className="text-sm leading-relaxed text-foreground pr-8">
                  {currentText || <span className="text-muted-foreground italic">No citation generated.</span>}
                </p>
                <button
                  onClick={handleCopy}
                  title="Copy citation"
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {copied ? (
                    <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Clipboard className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Metadata pills */}
              <div className="flex flex-wrap gap-2">
                {paper.year && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {paper.year}
                  </Badge>
                )}
                {paper.doi && (
                  <Badge variant="outline" className="text-[10px] font-normal font-mono max-w-[200px] truncate">
                    DOI: {paper.doi}
                  </Badge>
                )}
                {paper.venue && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {paper.venue}
                  </Badge>
                )}
              </div>

              {/* ── BibTeX toggle ── */}
              <div>
                <button
                  onClick={() => setBibtexOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  {bibtexOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {bibtexOpen ? "Hide BibTeX" : "Show BibTeX"}
                </button>

                {bibtexOpen && data.bibtex && (
                  <div className="mt-2 relative">
                    <pre className="text-[11px] leading-relaxed font-mono bg-zinc-950 text-zinc-100 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap pr-10">
                      {data.bibtex}
                    </pre>
                    <button
                      onClick={handleBibtexCopy}
                      title="Copy BibTeX"
                      className="absolute top-2 right-2 p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    >
                      {bibtexCopied ? (
                        <ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Clipboard className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3.5 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCitation}
            disabled={isLoading}
            className="text-xs"
          >
            Refresh from CrossRef
          </Button>
          <Button
            size="sm"
            className={cn(
              "gap-1.5 text-xs",
              copied
                ? "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
                : "bg-emerald-700 hover:bg-emerald-800 text-white"
            )}
            onClick={handleCopy}
            disabled={!currentText || isLoading}
          >
            {copied ? (
              <><ClipboardCheck className="h-3.5 w-3.5" /> Copied!</>
            ) : (
              <><Clipboard className="h-3.5 w-3.5" /> Copy citation</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
