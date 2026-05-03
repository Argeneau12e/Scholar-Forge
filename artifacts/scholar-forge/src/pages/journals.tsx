import { useState } from "react";
import { Loader2, AlertCircle, ExternalLink, Star, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface JournalRecommendation {
  name: string;
  issn: string | null;
  publisher: string | null;
  openAccess: boolean;
  apcUsd: number | null;
  subjectArea: string | null;
  fitScore: number;
  rationale: string;
  submissionUrl: string | null;
  averageReviewWeeks: number | null;
  citationStyle: string | null;
}

function FitMeter({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-400" : "bg-slate-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-8 text-right">{score}%</span>
    </div>
  );
}

export default function JournalsPage() {
  const [abstract, setAbstract] = useState("");
  const [topic, setTopic] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<JournalRecommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (abstract.trim().length < 50) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/journals/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abstract: abstract.trim(), topic: topic.trim() || undefined, discipline: discipline.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Recommendation failed");
      const data = await res.json();
      setResults(data.recommendations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-medium text-foreground">Journal Recommender</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste your abstract to find the best open-access journals for your work, with fit scores and submission details.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-5">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Your abstract <span className="text-destructive">*</span>
          </Label>
          <Textarea
            placeholder="Paste your paper abstract here (at least 50 characters)…"
            className="resize-none min-h-[140px] text-sm bg-background"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
          />
          {abstract.length > 0 && abstract.trim().length < 50 && (
            <p className="text-[11px] text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />At least 50 characters required
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Topic (optional)</Label>
            <Input placeholder="e.g. machine learning in healthcare" className="text-sm bg-background" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Discipline (optional)</Label>
            <Input placeholder="e.g. biomedical informatics" className="text-sm bg-background" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
          </div>
        </div>
        <Button type="submit" disabled={abstract.trim().length < 50 || loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Finding journals…</> : <><Star className="h-4 w-4 mr-2" />Find journals</>}
        </Button>
      </form>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Top {results.length} journal matches
          </h3>

          {results.map((journal, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-foreground">{journal.name}</h4>
                    {journal.openAccess && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        <CheckCircle className="h-2.5 w-2.5 mr-1" />Open Access
                      </Badge>
                    )}
                    {journal.citationStyle && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{journal.citationStyle}</Badge>
                    )}
                  </div>
                  {journal.publisher && <p className="text-xs text-muted-foreground mt-0.5">{journal.publisher}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground mb-1">Fit score</p>
                  <p className={cn("text-2xl font-serif font-bold",
                    journal.fitScore >= 80 ? "text-emerald-700" : journal.fitScore >= 60 ? "text-amber-600" : "text-slate-500"
                  )}>
                    {journal.fitScore}
                  </p>
                </div>
              </div>

              <FitMeter score={journal.fitScore} />

              <p className="text-sm text-foreground/80 leading-relaxed">{journal.rationale}</p>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {journal.issn && <span>ISSN: {journal.issn}</span>}
                {journal.apcUsd !== null && (
                  <span>{journal.apcUsd === 0 ? "No APC" : `APC: $${journal.apcUsd.toLocaleString()}`}</span>
                )}
                {journal.averageReviewWeeks && <span>~{journal.averageReviewWeeks} weeks review</span>}
                {journal.subjectArea && <span>{journal.subjectArea}</span>}
              </div>

              {journal.submissionUrl && (
                <a
                  href={journal.submissionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />Submission guidelines ↗
                </a>
              )}
            </div>
          ))}

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed border-t border-border pt-4">
            Always verify journal scope and open-access status on the publisher's website before submitting.
          </p>
        </div>
      )}
    </div>
  );
}
