import { useState } from "react";
import { Search, AlertCircle, Loader2, BookOpen, ThumbsUp, ThumbsDown, Minus, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuestionPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  abstract: string | null;
  citationCount: number | null;
  stance: "supports" | "contradicts" | "neutral" | "insufficient_data";
  confidence: "high" | "medium" | "low";
  keyFinding: string;
}

interface QuestionResult {
  question: string;
  verdict: string;
  supportCount: number;
  contradictCount: number;
  neutralCount: number;
  insufficientCount: number;
  total: number;
  supportPercent: number;
  papers: QuestionPaper[];
}

function StanceIcon({ stance }: { stance: QuestionPaper["stance"] }) {
  if (stance === "supports") return <ThumbsUp className="h-4 w-4 text-emerald-600" />;
  if (stance === "contradicts") return <ThumbsDown className="h-4 w-4 text-red-500" />;
  if (stance === "neutral") return <Minus className="h-4 w-4 text-amber-500" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

const stanceBorder: Record<QuestionPaper["stance"], string> = {
  supports: "border-l-emerald-500",
  contradicts: "border-l-red-500",
  neutral: "border-l-amber-400",
  insufficient_data: "border-l-muted-foreground/30",
};

const stanceBadge: Record<QuestionPaper["stance"], string> = {
  supports: "bg-emerald-50 text-emerald-700 border-emerald-200",
  contradicts: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-amber-50 text-amber-700 border-amber-200",
  insufficient_data: "bg-muted text-muted-foreground border-border",
};

function DonutChart({ support, contradict, neutral, insufficient, total }: {
  support: number; contradict: number; neutral: number; insufficient: number; total: number;
}) {
  if (total === 0) return null;
  const r = 40;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * r;

  const segments = [
    { count: support, color: "#10b981", label: "Supports" },
    { count: contradict, color: "#ef4444", label: "Contradicts" },
    { count: neutral, color: "#f59e0b", label: "Neutral" },
    { count: insufficient, color: "#94a3b8", label: "Insufficient" },
  ].filter((s) => s.count > 0);

  let offset = 0;
  const arcs = segments.map((s) => {
    const pct = s.count / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const arc = { ...s, dash, gap, offset: offset * circumference };
    offset += pct;
    return arc;
  });

  return (
    <svg width="120" height="120" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="16" />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth="16"
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" className="text-xs" fill="#0f172a" fontSize="14" fontWeight="bold">
        {total}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#64748b" fontSize="10">
        papers
      </text>
    </svg>
  );
}

export default function QuestionPage() {
  const [question, setQuestion] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 10) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), discipline: discipline.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Search failed");
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-medium text-foreground">Research Question Answering</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask a research question in plain language. We'll search the literature and show you what the evidence says.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-5">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Research question</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Textarea
              placeholder="e.g. Do statins reduce cardiovascular mortality in diabetic patients?"
              className="pl-10 resize-none min-h-[80px] text-sm bg-background"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Discipline (optional)</Label>
          <Input
            placeholder="e.g. cardiology, psychology, economics"
            className="text-sm bg-background"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={question.trim().length < 10 || loading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analysing literature…</> : "Ask the literature"}
        </Button>
      </form>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Verdict banner */}
          <div className={cn(
            "rounded-xl border p-5 flex items-center gap-5",
            result.supportPercent >= 60 ? "bg-emerald-50 border-emerald-200" :
            result.supportPercent <= 30 && result.contradictCount > 0 ? "bg-red-50 border-red-200" :
            "bg-amber-50 border-amber-200"
          )}>
            <DonutChart
              support={result.supportCount}
              contradict={result.contradictCount}
              neutral={result.neutralCount}
              insufficient={result.insufficientCount}
              total={result.total}
            />
            <div className="space-y-2 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Verdict</p>
              <p className="font-serif text-xl font-medium text-foreground">{result.verdict}</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{result.supportCount} of {result.total} studies support this</span>
                  <span>{result.supportPercent}%</span>
                </div>
                <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-border/40">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${result.supportPercent}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-3 text-[11px]">
                <span className="text-emerald-700 font-medium">{result.supportCount} support</span>
                <span className="text-red-600 font-medium">{result.contradictCount} contradict</span>
                <span className="text-amber-600 font-medium">{result.neutralCount} neutral</span>
              </div>
            </div>
          </div>

          {/* Paper list */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Evidence ({result.papers.length} papers)
            </h3>
            {result.papers.map((paper) => (
              <div
                key={paper.id}
                className={cn(
                  "bg-card border border-border rounded-xl p-4 border-l-4",
                  stanceBorder[paper.stance]
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1.5">
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-sm text-foreground hover:underline line-clamp-2 leading-snug"
                    >
                      {paper.title}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}
                      {paper.year ? ` · ${paper.year}` : ""}
                      {paper.venue ? ` · ${paper.venue}` : ""}
                    </p>
                    {paper.keyFinding && (
                      <p className="text-xs text-foreground/80 italic border-l-2 border-border/60 pl-2 mt-1">
                        "{paper.keyFinding}"
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge variant="outline" className={cn("text-[10px] flex items-center gap-1", stanceBadge[paper.stance])}>
                      <StanceIcon stance={paper.stance} />
                      {paper.stance.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{paper.confidence} confidence</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed border-t border-border pt-4">
            <BookOpen className="h-3 w-3 inline mr-1" />
            AI-generated analysis. Always read the primary sources before drawing conclusions.
          </p>
        </div>
      )}
    </div>
  );
}
