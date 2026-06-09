import { apiFetch } from "@/lib/apiFetch";
import { useState } from "react";
import { Link } from "wouter";
import { useCollection } from "@/hooks/useCollection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Globe,
  RepeatIcon,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceMatch {
  citation: string;
  similarityScore: number;
  matchedPhrases: string[];
  verdict: "well-paraphrased" | "too-similar" | "direct-quote-detected";
}

interface WebMatch {
  title: string;
  authors: string[];
  year: number | null;
  url: string;
  matchedPhrase: string;
  abstract: string | null;
  doi: string | null;
}

interface PlagiarismResult {
  sourceMatches: SourceMatch[];
  overallRisk: "low" | "medium" | "high";
  webMatches: WebMatch[];
  repetitions: string[];
  limitedMode?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function HighlightedText({ text, phrases }: { text: string; phrases: string[] }) {
  if (!phrases.length) return <span className="text-sm leading-relaxed">{text}</span>;

  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const isMatch = sorted.some((p) => p.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-red-100 text-red-900 rounded-[3px] px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}

function RiskBadge({ risk }: { risk: "low" | "medium" | "high" }) {
  if (risk === "low")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 text-sm font-semibold">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Low risk
      </span>
    );
  if (risk === "medium")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1 text-sm font-semibold">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Medium risk
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 text-red-800 border border-red-200 px-3 py-1 text-sm font-semibold">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      High risk
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: SourceMatch["verdict"] }) {
  if (verdict === "well-paraphrased")
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-medium hover:bg-emerald-50">
        Well paraphrased
      </Badge>
    );
  if (verdict === "too-similar")
    return (
      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-medium hover:bg-amber-50">
        Too similar
      </Badge>
    );
  return (
    <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-medium hover:bg-red-50">
      Direct quote detected
    </Badge>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score < 40 ? "bg-emerald-500" : score < 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span
        className={cn(
          "text-xs font-semibold tabular-nums w-8 text-right",
          score < 40 ? "text-emerald-700" : score < 70 ? "text-amber-700" : "text-red-700"
        )}
      >
        {score}%
      </span>
    </div>
  );
}

// ─── Source match card ────────────────────────────────────────────────────────

function SourceMatchCard({
  match,
  studentText,
}: {
  match: SourceMatch;
  studentText: string;
}) {
  const [expanded, setExpanded] = useState(match.verdict !== "well-paraphrased");

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden",
        match.verdict === "direct-quote-detected"
          ? "border-red-200 bg-red-50/40"
          : match.verdict === "too-similar"
          ? "border-amber-200 bg-amber-50/30"
          : "border-border bg-card"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{match.citation}</span>
            <VerdictBadge verdict={match.verdict} />
          </div>
          <div className="mt-1.5">
            <ScoreBar score={match.similarityScore} />
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-inherit space-y-4 pt-3">
          {/* Matched phrases */}
          {match.matchedPhrases.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Matched phrases
              </p>
              <div className="flex flex-wrap gap-1.5">
                {match.matchedPhrases.map((phrase, i) => (
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

          {/* Highlighted student text */}
          {match.matchedPhrases.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Your text (phrases highlighted)
              </p>
              <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5">
                <HighlightedText text={studentText} phrases={match.matchedPhrases} />
              </div>
            </div>
          )}

          {/* Improve paraphrase link */}
          {match.verdict !== "well-paraphrased" && (
            <Link href="/coach">
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                <ChevronRight className="h-3 w-3" />
                Improve paraphrase in Writing Coach
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const GUIDANCE: Record<"low" | "medium" | "high", string> = {
  low: "Your paraphrasing looks good. Verify that all citations are correctly formatted and attributed before submitting.",
  medium:
    "Some phrases are close to the source material. Review the highlighted sections and consider revising them in your own words.",
  high: "Significant similarity detected. Rewrite the highlighted sections before submitting. Use the Writing Coach to help rephrase.",
};

export function PlagiarismChecker() {
  const { items } = useCollection();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlagiarismResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState("");

  const itemsWithContent = items.filter(
    (i) => (i.originalSnippet && i.originalSnippet.trim()) || (i.paraphrase && i.paraphrase.trim())
  );

  const handleCheck = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLoadingStage("Analysing your text…");

    try {
      setLoadingStage("Comparing against your saved sources…");
      const resp = await apiFetch("/api/plagiarism", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          collectionItems: itemsWithContent.map((item) => ({
            title: item.title,
            authors: item.authors,
            year: item.year,
            doi: item.doi,
            originalSnippet: item.originalSnippet,
            paraphrase: item.paraphrase,
          })),
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Check failed. Please try again.");
        return;
      }
      setResult(data as PlagiarismResult);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
      setLoadingStage("");
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-24 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          <h1 className="font-serif text-2xl text-foreground">Originality Check</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Compare your writing against your saved sources and open academic databases.
        </p>
      </div>

      {/* Disclaimer — permanent */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <p className="leading-snug">
          <strong>What this checks:</strong> ScholarForge compares your text against your saved sources and searches open academic databases for similar phrases.{" "}
          <strong>What this does not check:</strong> Turnitin's student paper database, your institution's submission history, or paywalled journals.
          Always use your institution's official plagiarism checker before final submission.
        </p>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Paste a paragraph or section to check
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">{wordCount} words</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your written text here — a paragraph, a section, or multiple paragraphs…"
          rows={8}
          maxLength={10_000}
          className={cn(
            "w-full rounded-xl border bg-background px-4 py-3 text-sm leading-relaxed text-foreground",
            "placeholder:text-muted-foreground/50 resize-y",
            "focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400",
            "transition-colors"
          )}
        />

        {/* Collection info */}
        <div className="flex items-center gap-2 flex-wrap">
          {itemsWithContent.length > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              <BookOpen className="h-3 w-3" />
              Comparing against {itemsWithContent.length} saved source{itemsWithContent.length !== 1 ? "s" : ""}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded-full px-2.5 py-1">
              <BookOpen className="h-3 w-3" />
              No saved sources —{" "}
              <Link href="/" className="underline underline-offset-2 hover:text-foreground">
                add some from Workspace
              </Link>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded-full px-2.5 py-1">
            <Globe className="h-3 w-3" />
            Open web database search
          </div>
        </div>

        <Button
          onClick={handleCheck}
          disabled={loading || !text.trim() || wordCount < 10}
          className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="animate-pulse">{loadingStage || "Checking…"}</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              Check Originality
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6 pt-2">
          {/* Overall risk + guidance */}
          <div
            className={cn(
              "rounded-xl border-2 px-5 py-4 space-y-3",
              result.overallRisk === "low"
                ? "border-emerald-200 bg-emerald-50/60"
                : result.overallRisk === "medium"
                ? "border-amber-200 bg-amber-50/50"
                : "border-red-200 bg-red-50/50"
            )}
          >
            <div className="flex items-center gap-3">
              <RiskBadge risk={result.overallRisk} />
              <p className="text-sm text-foreground/80 leading-snug">
                {GUIDANCE[result.overallRisk]}
              </p>
            </div>
            {result.limitedMode && (
              <p className="text-xs text-muted-foreground italic">
                AI analysis is unavailable (ANTHROPIC_API_KEY not set). Showing Layer 3 results only.
              </p>
            )}
          </div>

          {/* Layer 1: Source matches */}
          {result.sourceMatches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Source Comparison ({result.sourceMatches.length})
                </h2>
              </div>
              <div className="space-y-2">
                {result.sourceMatches.map((match, i) => (
                  <SourceMatchCard key={i} match={match} studentText={text} />
                ))}
              </div>
            </div>
          )}

          {/* Layer 2: Web matches */}
          {result.webMatches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Open Web Matches ({result.webMatches.length})
                </h2>
                <span className="text-xs text-muted-foreground">
                  — papers with similar phrases in their abstracts
                </span>
              </div>
              <div className="space-y-2">
                {result.webMatches.map((match, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground leading-snug">{match.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {match.authors.slice(0, 3).join(", ")}
                          {match.authors.length > 3 ? " et al." : ""}
                          {match.year ? ` · ${match.year}` : ""}
                        </p>
                      </div>
                      <a
                        href={match.doi ? `https://doi.org/${match.doi}` : match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-muted-foreground hover:text-emerald-700 underline underline-offset-2 flex items-center gap-1"
                      >
                        View ↗
                      </a>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Matched phrase:
                      </span>
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-normal hover:bg-amber-50">
                        "{match.matchedPhrase}"
                      </Badge>
                    </div>
                    {match.abstract && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {match.abstract}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Layer 3: Repetitions */}
          {result.repetitions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <RepeatIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Internal Repetition ({result.repetitions.length})
                </h2>
                <span className="text-xs text-muted-foreground">
                  — sentences appearing in multiple paragraphs
                </span>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3 space-y-2">
                {result.repetitions.map((sent, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="shrink-0 text-amber-500 mt-0.5">•</span>
                    <span className="leading-relaxed italic">"{sent}"</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All clear for web + repetitions */}
          {result.webMatches.length === 0 && result.repetitions.length === 0 && result.sourceMatches.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              No matches found in open web databases and no internal repetition detected.
            </div>
          )}

          {/* Reminder */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs text-blue-800 leading-relaxed">
            <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Remember: this tool cannot access Turnitin's student paper database or your institution's submission history.
            Always run your institution's official checker before submitting.
          </div>
        </div>
      )}
    </div>
  );
}
