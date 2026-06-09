import { apiFetch } from "@/lib/apiFetch";
import { useState, useEffect, useRef } from "react";
import { Sparkles, Save, Check, BookOpen, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection } from "@/hooks/useCollection";
import { useSupervisor } from "@/hooks/useSupervisor";

// ─── Types ────────────────────────────────────────────────────────────────────

type GapType = "population" | "timeframe" | "methodology" | "contradiction" | "mechanism";
type Confidence = "high" | "medium" | "speculative";

interface Gap {
  title: string;
  description: string;
  confidence: Confidence;
  supportingPapers: string[];
  thesisAngle: string;
  type: GapType;
}

interface Contradiction {
  paperA: string;
  paperB: string;
  issue: string;
}

interface GapsResult {
  gaps: Gap[];
  contradictions: Contradiction[];
  strongestAngle: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_ITEMS = 8;

const LOADING_MESSAGES = [
  "Reading your collection…",
  "Identifying patterns…",
  "Finding gaps…",
  "Cross-referencing papers…",
  "Evaluating thesis angles…",
];

const TYPE_META: Record<GapType, { label: string; color: string; border: string; bg: string }> = {
  population:    { label: "Population Gap",    color: "text-purple-700", border: "border-l-purple-500", bg: "bg-purple-50" },
  timeframe:     { label: "Timeframe Gap",     color: "text-blue-700",   border: "border-l-blue-500",   bg: "bg-blue-50"   },
  methodology:   { label: "Methodology Gap",   color: "text-amber-700",  border: "border-l-amber-500",  bg: "bg-amber-50"  },
  contradiction: { label: "Contradiction",     color: "text-red-700",    border: "border-l-red-500",    bg: "bg-red-50"    },
  mechanism:     { label: "Mechanism Gap",     color: "text-teal-700",   border: "border-l-teal-500",   bg: "bg-teal-50"   },
};

const CONFIDENCE_META: Record<Confidence, { label: string; classes: string }> = {
  high:        { label: "High confidence",  classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium:      { label: "Medium",           classes: "bg-amber-50 text-amber-700 border-amber-200" },
  speculative: { label: "Speculative",      classes: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

const THESIS_KEY = "sf_thesis";

// ─── Saved thesis helper ──────────────────────────────────────────────────────

function getSavedThesis(): string {
  try { return localStorage.getItem(THESIS_KEY) ?? ""; } catch { return ""; }
}
function saveThesis(angle: string): void {
  try { localStorage.setItem(THESIS_KEY, angle); } catch { /* ignore */ }
}

// ─── Gap card ─────────────────────────────────────────────────────────────────

function GapCard({ gap, onSaveAngle, savedAngle }: { gap: Gap; onSaveAngle: (a: string) => void; savedAngle: string }) {
  const meta = TYPE_META[gap.type] ?? TYPE_META.methodology;
  const conf = CONFIDENCE_META[gap.confidence] ?? CONFIDENCE_META.speculative;
  const isSaved = savedAngle === gap.thesisAngle;

  return (
    <div className={cn("rounded-xl border border-l-4 bg-card p-5 space-y-3 shadow-sm", meta.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", meta.color)}>
              {meta.label}
            </span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", conf.classes)}>
              {conf.label}
            </span>
          </div>
          <h3 className="font-serif text-[15px] font-semibold text-foreground leading-snug">
            {gap.title}
          </h3>
        </div>
      </div>

      <p className="text-sm text-foreground/80 leading-relaxed">{gap.description}</p>

      {gap.supportingPapers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {gap.supportingPapers.map((p, i) => (
            <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground border">
              {p}
            </span>
          ))}
        </div>
      )}

      <div className={cn("rounded-lg px-3.5 py-2.5 border", meta.bg)}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Thesis angle</p>
        <p className={cn("text-sm italic leading-relaxed", meta.color)}>{gap.thesisAngle}</p>
      </div>

      <Button
        size="sm"
        variant={isSaved ? "default" : "outline"}
        className={cn(
          "h-7 text-[11px] gap-1.5 w-full justify-center",
          isSaved && "bg-emerald-700 hover:bg-emerald-800 text-white"
        )}
        onClick={() => onSaveAngle(gap.thesisAngle)}
      >
        {isSaved ? (
          <><Check className="h-3 w-3" /> Saved as thesis statement</>
        ) : (
          <><Save className="h-3 w-3" /> Save this angle as my thesis statement</>
        )}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GapFinder() {
  const { items } = useCollection();
  const { config } = useSupervisor();

  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<GapsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [savedAngle, setSavedAngle] = useState(getSavedThesis);
  const [savedFlash, setSavedFlash] = useState(false);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = items.length;
  const isUnlocked = count >= MIN_ITEMS;
  const discipline = config?.discipline ?? "general";

  // Cycle loading messages
  useEffect(() => {
    if (loading) {
      let idx = 0;
      loadingIntervalRef.current = setInterval(() => {
        idx = (idx + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[idx]);
      }, 2000);
    } else {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      setLoadingMsg(LOADING_MESSAGES[0]);
    }
    return () => { if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current); };
  }, [loading]);

  const handleSaveAngle = (angle: string) => {
    saveThesis(angle);
    setSavedAngle(angle);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const handleAnalyze = async () => {
    if (!isUnlocked) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const resp = await apiFetch("/api/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            title: item.title,
            authors: item.authors,
            year: item.year,
            journal: item.journal,
            originalSnippet: item.originalSnippet,
            paraphrase: item.paraphrase,
            abstract: item.abstract,
          })),
          topic: topic.trim() || "the research topic",
          discipline,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Analysis failed. Please try again.");
        return;
      }
      setResult(data as GapsResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Locked state ────────────────────────────────────────────────────────────
  if (!isUnlocked && !result) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/30 p-8 space-y-5 text-center max-w-2xl mx-auto">
        <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <Sparkles className="h-7 w-7 text-emerald-700/50" />
        </div>
        <div>
          <h3 className="font-serif text-xl text-foreground">Research Gap Finder</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Collect {MIN_ITEMS} snippets to unlock AI-powered gap analysis. Claude will identify
            genuine research gaps, contradictions, and thesis opportunities in your literature.
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{count} / {MIN_ITEMS} snippets collected</span>
            <span>{MIN_ITEMS - count} more needed</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400/60 rounded-full transition-all duration-500"
              style={{ width: `${(count / MIN_ITEMS) * 100}%` }}
            />
          </div>
        </div>

        <Button
          disabled
          className="bg-muted text-muted-foreground cursor-not-allowed gap-2 w-full max-w-xs"
        >
          <Sparkles className="h-4 w-4" />
          Analyze Research Gaps
        </Button>
      </div>
    );
  }

  // ── Unlocked / results ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header + trigger */}
      <div className="rounded-2xl border bg-gradient-to-br from-emerald-50/60 to-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-700" />
              Research Gap Finder
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {count} papers · {discipline} · Claude-powered analysis
            </p>
          </div>
          {result && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 shrink-0">
              {result.gaps.length} gaps found
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (e.g. mRNA vaccine efficacy in elderly populations)…"
            className="flex-1 h-9 rounded-lg border border-border bg-white px-3 text-sm placeholder:text-muted-foreground/60 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
            onKeyDown={(e) => e.key === "Enter" && !loading && handleAnalyze()}
          />
          <Button
            onClick={handleAnalyze}
            disabled={loading}
            className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 shrink-0 h-9"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {result ? "Re-analyze" : "Analyze Research Gaps"}
              </>
            )}
          </Button>
        </div>

        {/* Loading message cycle */}
        {loading && (
          <p className="text-sm text-emerald-700 font-medium animate-pulse flex items-center gap-2">
            <ChevronRight className="h-4 w-4" />
            {loadingMsg}
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* Saved thesis flash */}
      {savedFlash && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700">
          <Check className="h-4 w-4" />
          Thesis statement saved to your workspace.
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Strongest angle — featured gold card */}
          {result.strongestAngle && (
            <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-6 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">★</span>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  Strongest thesis angle
                </p>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{result.strongestAngle}</p>
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "gap-1.5 text-xs border-amber-300 text-amber-800 hover:bg-amber-50",
                  savedAngle === result.strongestAngle && "bg-amber-100"
                )}
                onClick={() => handleSaveAngle(result.strongestAngle)}
              >
                {savedAngle === result.strongestAngle ? (
                  <><Check className="h-3 w-3" /> Saved as thesis statement</>
                ) : (
                  <><Save className="h-3 w-3" /> Save this as my thesis statement</>
                )}
              </Button>
            </div>
          )}

          {/* Gap cards */}
          {result.gaps.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Research gaps ({result.gaps.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                {result.gaps.map((gap, i) => (
                  <GapCard
                    key={i}
                    gap={gap}
                    onSaveAngle={handleSaveAngle}
                    savedAngle={savedAngle}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Contradictions */}
          {result.contradictions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Contradictions in the literature ({result.contradictions.length})
              </h3>
              <div className="space-y-2">
                {result.contradictions.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-l-4 border-l-red-400 bg-red-50/50 px-4 py-3 flex items-start gap-3"
                  >
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                        <span className="text-red-800 bg-red-100 rounded px-1.5 py-0.5">{c.paperA}</span>
                        <span className="text-muted-foreground self-center">vs</span>
                        <span className="text-red-800 bg-red-100 rounded px-1.5 py-0.5">{c.paperB}</span>
                      </div>
                      <p className="text-sm text-foreground/80">{c.issue}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No gaps found */}
          {result.gaps.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <BookOpen className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No clear gaps identified. Try adding more diverse papers or adjusting your topic.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
