import { apiFetch } from "@/lib/apiFetch";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SimilarityResult {
  score: number;
  verdict: "high" | "moderate" | "low";
  sharedPhrases: string[];
  assessment: string;
}

interface OriginalityPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: string;
  paraphrase: string;
  onRevise: () => void;
}

// ─── Word-level diff ────────────────────────────────────────────────────────

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

function computeDiff(original: string, paraphrase: string) {
  const origWords = tokenize(original);
  const paraWords = tokenize(paraphrase);

  // Build sets of meaningful normalized words (3+ chars)
  const origNorm = new Set(
    origWords.map(normalizeWord).filter((w) => w.length >= 3)
  );
  const paraNorm = new Set(
    paraWords.map(normalizeWord).filter((w) => w.length >= 3)
  );

  const left = origWords.map((word) => {
    const norm = normalizeWord(word);
    const isSpace = /^\s+$/.test(word);
    // "retained" = word was kept in the paraphrase (bad — should have changed it)
    const retained = !isSpace && norm.length >= 3 && paraNorm.has(norm);
    return { word, retained, isSpace };
  });

  const right = paraWords.map((word) => {
    const norm = normalizeWord(word);
    const isSpace = /^\s+$/.test(word);
    // "unchanged" = same as original (red), "new" = different (green)
    const unchanged = !isSpace && norm.length >= 3 && origNorm.has(norm);
    return { word, unchanged, isSpace };
  });

  return { left, right };
}

function DiffText({
  tokens,
  side,
}: {
  tokens: { word: string; retained?: boolean; unchanged?: boolean; isSpace: boolean }[];
  side: "left" | "right";
}) {
  return (
    <p className="text-sm leading-loose whitespace-pre-wrap break-words">
      {tokens.map((t, i) => {
        if (t.isSpace) return <span key={i}>{t.word}</span>;

        if (side === "left") {
          return t.retained ? (
            <mark
              key={i}
              className="bg-red-100 text-red-900 rounded-[3px] px-0.5 not-italic"
            >
              {t.word}
            </mark>
          ) : (
            <span key={i} className="text-foreground/60">
              {t.word}
            </span>
          );
        }

        // right side
        return t.unchanged ? (
          <mark
            key={i}
            className="bg-red-100 text-red-900 rounded-[3px] px-0.5 not-italic"
          >
            {t.word}
          </mark>
        ) : (
          <mark
            key={i}
            className="bg-emerald-100 text-emerald-900 rounded-[3px] px-0.5 not-italic"
          >
            {t.word}
          </mark>
        );
      })}
    </p>
  );
}

// ─── Score ring ──────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  const color =
    score > 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const label =
    score > 80
      ? "Well paraphrased"
      : score >= 50
      ? "Some overlap — consider revising"
      : "Too close to source";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-28 h-28">
        <svg
          className="w-full h-full"
          style={{ transform: "rotate(-90deg)" }}
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-foreground">{score}</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function OriginalityPanel({
  open,
  onOpenChange,
  original,
  paraphrase,
  onRevise,
}: OriginalityPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SimilarityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const diff = computeDiff(original, paraphrase);

  const runCheck = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await apiFetch("/api/similarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original, paraphrase }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Similarity check failed.");
        return;
      }
      setResult(data as SimilarityResult);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-run when the panel opens
  useEffect(() => {
    if (open && !result && !isLoading) {
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRevise = () => {
    onOpenChange(false);
    onRevise();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Originality Check
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Red highlights = words kept from the original · Green highlights =
            words successfully changed
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* ── Two-column diff ── */}
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
            <div className="p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Original
              </p>
              <DiffText tokens={diff.left} side="left" />
            </div>
            <div className="p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Your paraphrase
              </p>
              <DiffText tokens={diff.right} side="right" />
            </div>
          </div>

          {/* ── Score / results ── */}
          <div className="px-6 py-5 space-y-5">
            {isLoading && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-28 h-28 rounded-full border-4 border-muted flex items-center justify-center">
                  <svg
                    className="animate-spin h-8 w-8 text-emerald-700"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">
                  Analysing similarity…
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <>
                {/* Score ring centred */}
                <div className="flex justify-center py-2">
                  <ScoreRing score={result.score} />
                </div>

                {/* Shared phrases */}
                {result.sharedPhrases.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Shared phrases
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {result.sharedPhrases.map((phrase, i) => (
                        <Badge
                          key={i}
                          className="bg-red-50 text-red-700 border-red-200 text-xs font-normal hover:bg-red-50"
                        >
                          "{phrase}"
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assessment */}
                {result.assessment && (
                  <p className="text-sm text-muted-foreground italic leading-relaxed">
                    {result.assessment}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={runCheck}
            disabled={isLoading}
            className="gap-1.5"
            data-testid="btn-recheck"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
            Re-check
          </Button>

          <div className="flex-1" />

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            size="sm"
          >
            Close
          </Button>

          <Button
            className={cn(
              "gap-1.5",
              result?.verdict === "low"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-amber-600 hover:bg-amber-700 text-white"
            )}
            size="sm"
            onClick={handleRevise}
            disabled={isLoading}
            data-testid="btn-revise"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Revise further
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
