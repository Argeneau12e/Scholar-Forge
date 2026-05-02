import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileText,
  FileCode,
  FileType2,
  Download,
  Clipboard,
  ClipboardCheck,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CollectionItem } from "@/hooks/useCollection";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportFormat = "docx" | "bib" | "txt";

interface ExportModalProps {
  items: CollectionItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStyle?: string;
  universityName?: string;
}

const STYLE_OPTIONS = [
  { value: "apa", label: "APA 7th" },
  { value: "vancouver", label: "Vancouver" },
  { value: "harvard", label: "Harvard" },
  { value: "mla", label: "MLA 9th" },
  { value: "chicago", label: "Chicago 17th" },
];

function supervisorStyleKey(style?: string): string {
  if (!style) return "apa";
  const l = style.toLowerCase();
  if (l.includes("vancouver")) return "vancouver";
  if (l.includes("harvard")) return "harvard";
  if (l.includes("mla")) return "mla";
  if (l.includes("chicago")) return "chicago";
  return "apa";
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Format option button ─────────────────────────────────────────────────────

function FormatButton({
  format,
  selected,
  onClick,
}: {
  format: ExportFormat;
  selected: boolean;
  onClick: () => void;
}) {
  const config = {
    docx: {
      icon: <FileType2 className="h-5 w-5" />,
      label: "Word",
      ext: ".docx",
      desc: "Formatted Word document",
    },
    bib: {
      icon: <FileCode className="h-5 w-5" />,
      label: "BibTeX",
      ext: ".bib",
      desc: "For LaTeX & reference managers",
    },
    txt: {
      icon: <FileText className="h-5 w-5" />,
      label: "Plain text",
      ext: ".txt",
      desc: "One citation per paragraph",
    },
  }[format];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
        selected
          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
          : "border-border bg-card text-muted-foreground hover:border-emerald-300 hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "rounded-lg p-2",
          selected ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
        )}
      >
        {config.icon}
      </span>
      <div>
        <p className="font-semibold text-sm text-foreground">{config.label}</p>
        <p className="text-[10px] text-muted-foreground">{config.ext}</p>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{config.desc}</p>
    </button>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ExportModal({
  items,
  open,
  onOpenChange,
  defaultStyle,
  universityName = "",
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>("docx");
  const [style, setStyle] = useState(supervisorStyleKey(defaultStyle));
  const [preview, setPreview] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update style when supervisor config changes
  useEffect(() => {
    if (defaultStyle) setStyle(supervisorStyleKey(defaultStyle));
  }, [defaultStyle]);

  // Fetch preview (always as txt for display)
  const fetchPreview = useCallback(async () => {
    if (items.length === 0) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/export/bibliography", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.slice(0, 5), // preview up to 5 items
          style,
          format: "txt",
          universityName,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Preview failed" }));
        throw new Error(err.error ?? "Preview failed");
      }
      const text = await resp.text();
      const lines = text
        .split(/\n\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3);
      setPreview(lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreview([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [items, style, universityName]);

  // Auto-fetch preview when modal opens or style changes
  useEffect(() => {
    if (open) fetchPreview();
  }, [open, style, fetchPreview]);

  // ── Download ────────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const resp = await fetch("/api/export/bibliography", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, style, format, universityName }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error ?? "Export failed");
      }

      const filename = `ScholarForge-Bibliography-${dateStamp()}.${format}`;

      if (format === "docx") {
        const data = (await resp.json()) as { base64: string };
        const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        triggerDownload(blob, filename);
      } else {
        const text = await resp.text();
        const mime = format === "bib" ? "application/x-bibtex" : "text/plain";
        const blob = new Blob([text], { type: mime });
        triggerDownload(blob, filename);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  // ── Copy all (always txt) ────────────────────────────────────────────────────
  const handleCopyAll = async () => {
    setError(null);
    try {
      const resp = await fetch("/api/export/bibliography", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, style, format: "txt", universityName }),
      });
      if (!resp.ok) throw new Error("Copy failed");
      const text = await resp.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    }
  };

  const formatLabel = { docx: "Word (.docx)", bib: ".bib", txt: ".txt" }[format];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            <Download className="h-4 w-4 text-emerald-700" />
            Export Bibliography
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""}
            {universityName && <> · {universityName}</>}
          </p>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Format selector */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              Format
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {(["docx", "bib", "txt"] as ExportFormat[]).map((f) => (
                <FormatButton
                  key={f}
                  format={f}
                  selected={format === f}
                  onClick={() => setFormat(f)}
                />
              ))}
            </div>
          </div>

          {/* Style selector */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Citation style
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStyle(opt.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                    style === opt.value
                      ? "bg-emerald-700 text-white border-emerald-700"
                      : "bg-white border-border text-muted-foreground hover:border-emerald-400 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview panel */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preview (first {Math.min(items.length, 3)} citations)
              </p>
              <button
                onClick={fetchPreview}
                disabled={previewLoading}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={cn("h-3 w-3", previewLoading && "animate-spin")} />
                Refresh
              </button>
            </div>

            <div className="rounded-lg border bg-muted/20 min-h-[80px] p-4">
              {previewLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <svg className="animate-spin h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating preview…
                </div>
              )}

              {!previewLoading && preview.length === 0 && !error && (
                <p className="text-xs text-muted-foreground italic">No preview available.</p>
              )}

              {!previewLoading && preview.length > 0 && (
                <div className="space-y-3">
                  {preview.map((line, i) => (
                    <p
                      key={i}
                      className="text-xs text-foreground leading-relaxed border-b border-border/40 pb-2.5 last:border-0 last:pb-0"
                    >
                      <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                      {line}
                    </p>
                  ))}
                  {items.length > 3 && (
                    <p className="text-[10px] text-muted-foreground italic">
                      …and {items.length - 3} more
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t bg-muted/20 shrink-0 flex items-center gap-2">
          <Button
            className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 text-xs"
            size="sm"
            onClick={handleDownload}
            disabled={downloading || items.length === 0}
          >
            {downloading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Download {formatLabel}
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleCopyAll}
            disabled={items.length === 0}
          >
            {copied ? (
              <>
                <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                Copied!
              </>
            ) : (
              <>
                <Clipboard className="h-3.5 w-3.5" />
                Copy all
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
