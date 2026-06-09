import { apiFetch } from "@/lib/apiFetch";
import { useState, useCallback } from "react";
import {
  PenLine,
  LayoutList,
  Languages,
  AlertTriangle,
  Check,
  Copy,
  ChevronRight,
  ArrowDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSupervisor } from "@/hooks/useSupervisor";

// ─── Types ────────────────────────────────────────────────────────────────────

type IssueType =
  | "citation_missing"
  | "jargon"
  | "passive_voice"
  | "unclear_argument"
  | "undefined_term"
  | "structural";

interface IssueItem {
  type: IssueType;
  quote: string;
  explanation: string;
  fix: string;
}

interface CoachResult {
  scores: {
    clarity: number;
    structure: number;
    academicRegister: number;
    citationNeeds: number;
  };
  passiveVoiceCount: number;
  jargonDensity: "low" | "medium" | "high";
  issues: IssueItem[];
  rewrite: string;
  clarityVersion: string;
  overallFeedback: string;
}

interface ParagraphResult {
  implied_topic: string;
  issues: string[];
}

interface OutlineResult {
  paragraphs: ParagraphResult[];
  flowProblems: string[];
  definitionIssues: string[];
}

type Tab = "paragraph" | "structure" | "jargon";

// ─── Constants ────────────────────────────────────────────────────────────────

const ISSUE_META: Record<IssueType, { label: string; border: string; bg: string; color: string }> = {
  citation_missing: { label: "Citation missing",  border: "border-l-amber-500",  bg: "bg-amber-50",  color: "text-amber-700" },
  jargon:           { label: "Jargon",            border: "border-l-violet-500", bg: "bg-violet-50", color: "text-violet-700" },
  passive_voice:    { label: "Passive voice",     border: "border-l-blue-500",   bg: "bg-blue-50",   color: "text-blue-700" },
  unclear_argument: { label: "Unclear argument",  border: "border-l-red-500",    bg: "bg-red-50",    color: "text-red-700" },
  undefined_term:   { label: "Undefined term",    border: "border-l-orange-500", bg: "bg-orange-50", color: "text-orange-700" },
  structural:       { label: "Structural",        border: "border-l-teal-500",   bg: "bg-teal-50",   color: "text-teal-700" },
};

const JARGON_DENSITY_META: Record<string, { label: string; classes: string }> = {
  low:    { label: "Low jargon",    classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { label: "Medium jargon", classes: "bg-amber-50 text-amber-700 border-amber-200" },
  high:   { label: "High jargon",   classes: "bg-red-50 text-red-700 border-red-200" },
};

function scoreColor(s: number): string {
  if (s >= 8) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (s >= 5) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const RING_R = 22;
const RING_CIRC = 2 * Math.PI * RING_R;
const RING_COLOR: Record<string, string> = { green: "#2d6a4f", amber: "#b45309", red: "#dc2626" };

function ScoreCard({ label, score }: { label: string; score: number }) {
  const tier = score >= 8 ? "green" : score >= 5 ? "amber" : "red";
  const ringColor = RING_COLOR[tier];
  const offset = RING_CIRC * (1 - score / 10);

  return (
    <div className={cn("rounded-xl border p-3 text-center flex flex-col items-center gap-1.5", scoreColor(score))}>
      <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
        <svg className="absolute inset-0" style={{ transform: "rotate(-90deg)" }} width={56} height={56}>
          <circle cx={28} cy={28} r={RING_R} fill="none" stroke="currentColor" strokeWidth={3} className="opacity-15" />
          <circle
            cx={28} cy={28} r={RING_R}
            fill="none"
            stroke={ringColor}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <span className="text-2xl font-bold tabular-nums leading-none">{score}</span>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 leading-tight">{label}</div>
      <div className="text-[10px] opacity-45">/ 10</div>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ─── Tab: Paragraph Review ────────────────────────────────────────────────────

function ParagraphReview({ discipline }: { discipline: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyse = useCallback(async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await apiFetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), mode: "full", discipline }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError((data as { error: string }).error ?? "Analysis failed."); return; }
      setResult(data as CoachResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [text, discipline, loading]);

  return (
    <div className="space-y-5">
      {/* Input */}
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a paragraph from your draft…"
          rows={6}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 resize-none font-serif"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
          <Button
            onClick={handleAnalyse}
            disabled={loading || text.trim().length < 20}
            className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 h-9"
          >
            {loading ? <><Spinner /> Analysing…</> : <><PenLine className="h-4 w-4" /> Analyse</>}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
              JARGON_DENSITY_META[result.jargonDensity]?.classes)}>
              {JARGON_DENSITY_META[result.jargonDensity]?.label}
            </span>
            <span className="inline-flex items-center rounded-full border bg-blue-50 text-blue-700 border-blue-200 px-2.5 py-0.5 text-[11px] font-medium">
              {result.passiveVoiceCount} passive voice{result.passiveVoiceCount !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">{result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} found</span>
          </div>

          {/* Score cards 2×2 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ScoreCard label="Clarity" score={result.scores.clarity} />
            <ScoreCard label="Structure" score={result.scores.structure} />
            <ScoreCard label="Academic register" score={result.scores.academicRegister} />
            <ScoreCard label="Citation needs" score={result.scores.citationNeeds} />
          </div>

          {/* Overall feedback */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Supervisor's feedback</p>
            <p className="text-sm text-foreground leading-relaxed">{result.overallFeedback}</p>
          </div>

          {/* Issues list */}
          {result.issues.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Issues to address</p>
              {result.issues.map((issue, i) => {
                const meta = ISSUE_META[issue.type] ?? ISSUE_META.structural;
                return (
                  <div key={i} className={cn("rounded-xl border border-l-4 px-4 py-3 space-y-2", meta.border, meta.bg)}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider", meta.color)}>
                        {meta.label}
                      </span>
                    </div>
                    <p className={cn("text-sm italic leading-snug", meta.color)}>"{issue.quote}"</p>
                    <p className="text-xs text-foreground/80">{issue.explanation}</p>
                    <div className="flex items-start gap-1.5">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground font-medium">{issue.fix}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Two-column rewrite panel */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rewrite comparison</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your original</p>
                <p className="text-sm text-foreground/80 leading-relaxed font-serif">{text}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Improved version</p>
                  <CopyButton text={result.rewrite} label="Apply rewrite" />
                </div>
                <p className="text-sm text-foreground leading-relaxed font-serif">{result.rewrite}</p>
              </div>
            </div>
          </div>

          {/* Plain English version */}
          {result.clarityVersion && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Plain English version</p>
                <CopyButton text={result.clarityVersion} label="Copy" />
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.clarityVersion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Structure Check ─────────────────────────────────────────────────────

function StructureCheck() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OutlineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = useCallback(async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await apiFetch("/api/coach/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError((data as { error: string }).error ?? "Analysis failed."); return; }
      setResult(data as OutlineResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [text, loading]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a full section or multiple paragraphs to check the structure and logical flow…"
          rows={9}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 resize-none font-serif"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleCheck}
            disabled={loading || text.trim().length < 40}
            className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 h-9"
          >
            {loading ? <><Spinner /> Checking…</> : <><LayoutList className="h-4 w-4" /> Check Structure</>}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Paragraph outline */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Paragraph outline ({result.paragraphs.length})
            </p>
            <div className="space-y-2">
              {result.paragraphs.map((para, i) => (
                <div key={i}>
                  <div className={cn(
                    "rounded-xl border bg-card px-4 py-3 space-y-2",
                    para.issues.length > 0 ? "border-amber-200" : "border-border"
                  )}>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <p className="text-sm text-foreground leading-snug font-medium">{para.implied_topic}</p>
                    </div>
                    {para.issues.length > 0 && (
                      <div className="ml-8 space-y-1">
                        {para.issues.map((issue, j) => (
                          <div key={j} className="flex items-start gap-1.5 text-xs text-amber-700">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Flow problem connector (between paragraphs) */}
                  {i < result.paragraphs.length - 1 && result.flowProblems[i] && (
                    <div className="flex items-center gap-2 my-1 px-3">
                      <div className="flex-1 h-px bg-red-200" />
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-full px-3 py-1 text-[10px] text-red-700">
                        <ArrowDown className="h-3 w-3" />
                        {result.flowProblems[i]}
                      </div>
                      <div className="flex-1 h-px bg-red-200" />
                    </div>
                  )}

                  {/* No flow problem — just an arrow */}
                  {i < result.paragraphs.length - 1 && !result.flowProblems[i] && (
                    <div className="flex justify-center my-1">
                      <ArrowDown className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Remaining flow problems not tied to a specific gap */}
          {result.flowProblems.length > result.paragraphs.length - 1 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Additional flow problems</p>
              {result.flowProblems.slice(result.paragraphs.length - 1).map((p, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <ArrowDown className="h-4 w-4 shrink-0 mt-0.5" /> {p}
                </div>
              ))}
            </div>
          )}

          {/* Definition issues */}
          {result.definitionIssues.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Terms used before being defined ({result.definitionIssues.length})
              </p>
              {result.definitionIssues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {issue}
                </div>
              ))}
            </div>
          )}

          {/* All clear */}
          {result.flowProblems.length === 0 && result.definitionIssues.length === 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
              <Check className="h-5 w-5 text-emerald-700 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">No major structural problems detected.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Jargon Clarity ──────────────────────────────────────────────────────

function JargonClarity({ discipline }: { discipline: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ clarityVersion: string; original: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullWidth, setFullWidth] = useState<"original" | "simplified" | null>(null);

  const handleSimplify = useCallback(async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await apiFetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), mode: "jargon", discipline }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError((data as { error: string }).error ?? "Simplification failed."); return; }
      setResult(data as { clarityVersion: string; original: string });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [text, discipline, loading]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste any academic text to see a plain-English version side by side…"
          rows={6}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none font-serif"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleSimplify}
            disabled={loading || text.trim().length < 20}
            className="bg-blue-700 hover:bg-blue-800 text-white gap-2 h-9"
          >
            {loading ? <><Spinner /> Simplifying…</> : <><Languages className="h-4 w-4" /> Simplify</>}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Toggle */}
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground mr-auto">Click a version to expand it full-width</p>
            {fullWidth && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => setFullWidth(null)}
              >
                <RefreshCw className="h-3 w-3" /> Side by side
              </Button>
            )}
          </div>

          <div className={cn("grid gap-3", fullWidth ? "grid-cols-1" : "sm:grid-cols-2")}>
            {/* Original */}
            {(!fullWidth || fullWidth === "original") && (
              <div
                className="rounded-xl border bg-card p-4 space-y-2 cursor-pointer hover:border-muted-foreground/30 transition-colors"
                onClick={() => setFullWidth(fullWidth === "original" ? null : "original")}
              >
                <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Academic version
                  </p>
                  <CopyButton text={result.original} />
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed font-serif">{result.original}</p>
              </div>
            )}

            {/* Plain English */}
            {(!fullWidth || fullWidth === "simplified") && (
              <div
                className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-2 cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => setFullWidth(fullWidth === "simplified" ? null : "simplified")}
              >
                <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    Plain English version
                  </p>
                  <CopyButton text={result.clarityVersion} />
                </div>
                <p className="text-sm text-foreground leading-relaxed">{result.clarityVersion}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "paragraph", label: "Paragraph Review", icon: <PenLine className="h-4 w-4" />, desc: "Detailed feedback on a single paragraph" },
  { id: "structure", label: "Structure Check",  icon: <LayoutList className="h-4 w-4" />, desc: "Logical flow of a full section" },
  { id: "jargon",    label: "Jargon Clarity",   icon: <Languages className="h-4 w-4" />, desc: "Side-by-side plain English version" },
];

export function WritingCoach() {
  const { config } = useSupervisor();
  const [tab, setTab] = useState<Tab>("paragraph");
  const discipline = config?.discipline ?? "general";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl text-foreground flex items-center gap-2">
          <PenLine className="h-6 w-6 text-emerald-700" />
          Writing Coach
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered dissertation writing feedback — {discipline}
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition-all",
              tab === t.id
                ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                : "border-border bg-card text-foreground hover:border-emerald-300"
            )}
          >
            <div className="flex items-center gap-2 font-medium text-sm">
              {t.icon}
              {t.label}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.desc}</p>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-2xl border bg-card p-6">
        {tab === "paragraph" && <ParagraphReview discipline={discipline} />}
        {tab === "structure" && <StructureCheck />}
        {tab === "jargon"    && <JargonClarity discipline={discipline} />}
      </div>

      {/* Academic integrity note */}
      <p className="text-center text-xs text-muted-foreground italic border-t pt-4">
        ScholarForge helps you improve your writing — it does not write your dissertation for you. Always review and take full ownership of all submitted work.
      </p>
    </div>
  );
}
