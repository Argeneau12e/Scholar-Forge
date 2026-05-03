import { useState } from "react";
import { Loader2, AlertCircle, Sparkles, BookOpen, ChevronDown, ChevronRight, ExternalLink, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface OutlineIssue {
  section: string;
  type: string;
  description: string;
  fix: string;
}

interface OutlineAnalysis {
  overallFeedback: string;
  structureScore: number;
  issues: OutlineIssue[];
  suggestedRevision: string;
  sectionsNeedingMoreSources: string[];
  recommendedWordDistribution: Record<string, number>;
  missingEssentialSections: string[];
}

interface SectionPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  citationCount: number | null;
  source: string;
}

interface MethodologyItem {
  name: string;
  type: "quantitative" | "qualitative" | "mixed";
  suitability: "high" | "medium" | "low";
  rationale: string;
  commonPitfalls: string[];
  keyPapers: Array<{ title: string; url: string; year: number | null; authors: string[] }>;
}

interface MethodologyResponse {
  recommended: MethodologyItem[];
  notRecommended: Array<{ name: string; reason: string }>;
  ethicsConsiderations: string[];
  dataCollectionSuggestions: string[];
}

const ISSUE_COLORS: Record<string, string> = {
  missing_section: "text-red-700 bg-red-50 border-red-200",
  no_methodology: "text-red-700 bg-red-50 border-red-200",
  wrong_order: "text-amber-700 bg-amber-50 border-amber-200",
  too_broad: "text-amber-700 bg-amber-50 border-amber-200",
  too_narrow: "text-amber-700 bg-amber-50 border-amber-200",
  weak_conclusion: "text-amber-700 bg-amber-50 border-amber-200",
  citation_heavy_without_analysis: "text-blue-700 bg-blue-50 border-blue-200",
};

const SUITABILITY_BADGE: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-red-50 text-red-700 border-red-200",
};

type ActiveTab = "feedback" | "resources" | "methodology";

export default function OutlinePage() {
  const [outline, setOutline] = useState("");
  const [topic, setTopic] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [wordTarget, setWordTarget] = useState("10000");

  const [analysis, setAnalysis] = useState<OutlineAnalysis | null>(null);
  const [resources, setResources] = useState<Record<string, SectionPaper[]> | null>(null);
  const [methodology, setMethodology] = useState<MethodologyResponse | null>(null);

  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [loadingMethodology, setLoadingMethodology] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("feedback");
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);

  const handleAnalyze = async () => {
    if (!outline.trim() || !topic.trim()) return;
    setLoadingAnalysis(true);
    setError(null);
    try {
      const res = await fetch("/api/outline/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, topic, discipline, wordTarget: parseInt(wordTarget) || 10000 }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Analysis failed");
      setAnalysis(await res.json());
      setActiveTab("feedback");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleResources = async () => {
    if (!outline.trim() || !topic.trim()) return;
    setLoadingResources(true);
    try {
      const res = await fetch("/api/outline/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, topic, discipline }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Resource search failed");
      const data = await res.json();
      setResources(data.sections ?? {});
      setActiveTab("resources");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resource search failed");
    } finally {
      setLoadingResources(false);
    }
  };

  const handleMethodology = async () => {
    if (!topic.trim()) return;
    setLoadingMethodology(true);
    try {
      const res = await fetch("/api/methodology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, researchQuestion: researchQuestion || topic, discipline }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setMethodology(await res.json());
      setActiveTab("methodology");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Methodology analysis failed");
    } finally {
      setLoadingMethodology(false);
    }
  };

  const scoreColor = analysis
    ? analysis.structureScore >= 8 ? "text-emerald-700" : analysis.structureScore >= 6 ? "text-amber-600" : "text-red-600"
    : "";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: outline input */}
      <aside className="w-80 shrink-0 border-r border-border bg-sidebar flex flex-col p-4 space-y-3 overflow-y-auto">
        <div>
          <h1 className="font-serif text-lg font-medium text-foreground">Outline Editor</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Get AI feedback, paper recommendations, and methodology advice.</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Research topic <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. Climate change adaptation in urban areas" className="text-sm bg-background" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Research question (for methodology)</Label>
            <Input placeholder="e.g. How do cities adapt to flooding?" className="text-sm bg-background" value={researchQuestion} onChange={(e) => setResearchQuestion(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Discipline</Label>
              <Input placeholder="e.g. Geography" className="text-sm bg-background" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Word target</Label>
              <Input type="number" placeholder="10000" className="text-sm bg-background" value={wordTarget} onChange={(e) => setWordTarget(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Your outline <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder={"1. Introduction\n2. Literature Review\n   2.1 Background\n   2.2 Key debates\n3. Methodology\n4. Results\n5. Discussion\n6. Conclusion"}
              className="text-sm bg-background resize-none min-h-[200px] font-mono text-xs"
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleAnalyze}
            disabled={!outline.trim() || !topic.trim() || loadingAnalysis}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {loadingAnalysis ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Analysing…</> : <><Sparkles className="h-3.5 w-3.5 mr-2" />Analyse outline</>}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={handleResources} disabled={!outline.trim() || !topic.trim() || loadingResources}>
              {loadingResources ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5 mr-1" />}
              Resources
            </Button>
            <Button variant="outline" size="sm" onClick={handleMethodology} disabled={!topic.trim() || loadingMethodology}>
              {loadingMethodology ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
              Methodology
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
      </aside>

      {/* Right: results */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border shrink-0 bg-card px-4">
          {(["feedback", "resources", "methodology"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "py-2.5 px-4 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Feedback tab */}
          {activeTab === "feedback" && (
            analysis ? (
              <div className="max-w-2xl space-y-5">
                {/* Score + feedback */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Structure Score</p>
                      <p className={cn("text-4xl font-serif font-bold", scoreColor)}>{analysis.structureScore}<span className="text-xl text-muted-foreground">/10</span></p>
                    </div>
                    {analysis.missingEssentialSections.length > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground mb-1">Missing sections</p>
                        {analysis.missingEssentialSections.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 block mb-0.5">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{analysis.overallFeedback}</p>
                </div>

                {/* Issues */}
                {analysis.issues.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Issues ({analysis.issues.length})</h3>
                    {analysis.issues.map((issue, i) => (
                      <div key={i} className={cn("rounded-xl border p-3.5 cursor-pointer", ISSUE_COLORS[issue.type] ?? "bg-muted border-border")}>
                        <button className="w-full flex items-start justify-between gap-2 text-left" onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}>
                          <div>
                            <p className="text-xs font-semibold">{issue.section}</p>
                            <p className="text-xs opacity-80 mt-0.5">{issue.description}</p>
                          </div>
                          {expandedIssue === i ? <ChevronDown className="h-4 w-4 shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5" />}
                        </button>
                        {expandedIssue === i && (
                          <div className="mt-2 pt-2 border-t border-current/20 text-xs space-y-1">
                            <p className="font-medium">Fix:</p>
                            <p>{issue.fix}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggested revision */}
                {analysis.suggestedRevision && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Suggested Revision</h3>
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setOutline(analysis.suggestedRevision)}>
                        Accept revision
                      </Button>
                    </div>
                    <pre className="text-xs bg-muted/30 border border-border rounded-xl p-4 whitespace-pre-wrap font-mono leading-relaxed text-foreground/80">
                      {analysis.suggestedRevision}
                    </pre>
                  </div>
                )}

                {/* Word distribution */}
                {Object.keys(analysis.recommendedWordDistribution).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recommended Word Distribution</h3>
                    {Object.entries(analysis.recommendedWordDistribution).map(([section, words]) => {
                      const total = Object.values(analysis.recommendedWordDistribution).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (words / total) * 100 : 0;
                      return (
                        <div key={section} className="space-y-0.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{section}</span>
                            <span>{words.toLocaleString()} words</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center max-w-sm mx-auto">
                <div className="space-y-3">
                  <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">Paste your outline and click "Analyse outline" to get AI feedback on structure, issues, and improvements.</p>
                </div>
              </div>
            )
          )}

          {/* Resources tab */}
          {activeTab === "resources" && (
            resources ? (
              <div className="max-w-2xl space-y-6">
                {Object.entries(resources).map(([section, papers]) => (
                  <div key={section} className="space-y-2">
                    <h3 className="font-medium text-sm text-foreground border-b border-border pb-1">{section}</h3>
                    {papers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No papers found for this section.</p>
                    ) : (
                      papers.map((p) => (
                        <div key={p.id} className="bg-card border border-border rounded-lg p-3 space-y-1">
                          <a href={p.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground hover:underline flex items-start gap-1.5">
                            {p.title}
                            <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
                          </a>
                          <p className="text-xs text-muted-foreground">
                            {p.authors.slice(0, 2).join(", ")}{p.authors.length > 2 ? " et al." : ""}
                            {p.year ? ` · ${p.year}` : ""}
                            {p.venue ? ` · ${p.venue}` : ""}
                            {p.citationCount ? ` · ${p.citationCount} citations` : ""}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center max-w-sm mx-auto">
                <div className="space-y-3">
                  <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">Click "Resources" to find papers for each section of your outline.</p>
                </div>
              </div>
            )
          )}

          {/* Methodology tab */}
          {activeTab === "methodology" && (
            methodology ? (
              <div className="max-w-2xl space-y-5">
                {methodology.recommended.map((m, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-foreground">{m.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">{m.type} · {m.rationale}</p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] shrink-0", SUITABILITY_BADGE[m.suitability])}>
                        {m.suitability} fit
                      </Badge>
                    </div>
                    {m.commonPitfalls.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Common pitfalls:</p>
                        <ul className="space-y-0.5">
                          {m.commonPitfalls.map((p, j) => (
                            <li key={j} className="text-xs text-foreground/70 flex items-start gap-1.5">
                              <span className="text-amber-500 mt-0.5">⚠</span>{p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.keyPapers.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Key methodology papers:</p>
                        <div className="space-y-1">
                          {m.keyPapers.map((p, j) => (
                            <a key={j} href={p.url} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline line-clamp-1">
                              {p.title}{p.year ? ` (${p.year})` : ""}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {methodology.ethicsConsiderations.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-700">Ethics Considerations</h3>
                    <ul className="space-y-1">
                      {methodology.ethicsConsiderations.map((c, i) => (
                        <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5"><span>•</span>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center max-w-sm mx-auto">
                <div className="space-y-3">
                  <FlaskConical className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">Click "Methodology" to get AI-recommended research approaches with pitfalls and key papers.</p>
                </div>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
