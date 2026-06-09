import { apiFetch } from "@/lib/apiFetch";
import { useState, useEffect } from "react";
import { X, BookOpen, Loader2, ChevronRight, AlertTriangle, ExternalLink, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface ConceptExplainerProps {
  term: string;
  context?: string;
  discipline?: string;
  onClose: () => void;
}

interface ConceptResult {
  term: string;
  simple: string;
  student: string;
  technical: string;
  etymology: string;
  relatedTerms: string[];
  commonMistake: string;
  disciplines: string[];
  furtherReading: Array<{
    id: string;
    title: string;
    doi: string | null;
    year: number | null;
    authors: string[];
    journal: string | null;
  }>;
}

type Tab = "simple" | "student" | "technical";

const GLOSSARY_KEY = "sf2_glossary";

interface GlossaryEntry {
  term: string;
  simpleExplanation: string;
  savedAt: string;
  discipline: string;
}

function loadGlossary(): GlossaryEntry[] {
  try { return JSON.parse(localStorage.getItem(GLOSSARY_KEY) ?? "[]"); } catch { return []; }
}
function saveGlossary(g: GlossaryEntry[]) {
  localStorage.setItem(GLOSSARY_KEY, JSON.stringify(g));
}

export function ConceptExplainer({ term, context, discipline = "general", onClose }: ConceptExplainerProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConceptResult | null>(null);
  const [tab, setTab] = useState<Tab>("student");
  const [relatedTerm, setRelatedTerm] = useState<string | null>(null);
  const [savedToGlossary, setSavedToGlossary] = useState(false);
  const { toast } = useToast();

  const fetch_ = async (t: string, ctx?: string) => {
    setLoading(true);
    setData(null);
    try {
      const res = await apiFetch("/api/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: t, context: ctx ?? context, discipline }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setData(await res.json());
    } catch {
      toast({ title: "Could not explain term", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch_(term, context); }, []);

  const explainRelated = (t: string) => {
    setRelatedTerm(t);
    fetch_(t);
  };

  const addToGlossary = () => {
    if (!data) return;
    const g = loadGlossary();
    if (!g.find((e) => e.term.toLowerCase() === data.term.toLowerCase())) {
      g.unshift({ term: data.term, simpleExplanation: data.simple, savedAt: new Date().toISOString(), discipline });
      saveGlossary(g);
      setSavedToGlossary(true);
      toast({ title: `"${data.term}" saved to your glossary` });
    } else {
      toast({ title: "Already in your glossary" });
    }
  };

  const copyDefinition = () => {
    if (!data) return;
    const text = tab === "simple" ? data.simple : tab === "student" ? data.student : data.technical;
    navigator.clipboard.writeText(`${data.term}: ${text}`);
    toast({ title: "Definition copied" });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="w-[400px] bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <h2 className="font-serif text-lg text-foreground truncate">
              {relatedTerm ?? term}
            </h2>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Explaining…</p>
            </div>
          </div>
        )}

        {!loading && data && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* Tabs */}
              <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
                {(["simple", "student", "technical"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                      tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t === "simple" ? "Simple" : t === "student" ? "Student" : "Technical"}
                  </button>
                ))}
              </div>

              {/* Explanation */}
              <p className="text-sm text-foreground leading-relaxed">
                {tab === "simple" ? data.simple : tab === "student" ? data.student : data.technical}
              </p>

              {/* Etymology */}
              {data.etymology && (
                <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">{data.etymology}</p>
              )}

              {/* Common mistake */}
              {data.commonMistake && (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Common misconception</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">{data.commonMistake}</p>
                  </div>
                </div>
              )}

              {/* Related terms */}
              {data.relatedTerms?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Related terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.relatedTerms.map((t) => (
                      <button
                        key={t}
                        onClick={() => explainRelated(t)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-muted/30 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                      >
                        {t} <ChevronRight className="h-3 w-3 opacity-50" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Disciplines */}
              {data.disciplines?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {data.disciplines.map((d) => (
                    <Badge key={d} variant="secondary" className="text-[10px]">{d}</Badge>
                  ))}
                </div>
              )}

              {/* Further reading */}
              {data.furtherReading?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Further reading</p>
                  <div className="space-y-2">
                    {data.furtherReading.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs font-medium text-foreground line-clamp-2 mb-1">{p.title}</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {p.authors[0]}{p.authors.length > 1 ? " et al." : ""} {p.year ? `· ${p.year}` : ""}
                          </span>
                          {p.doi && (
                            <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer actions */}
        {!loading && data && (
          <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={copyDefinition} className="text-xs">
              Copy definition
            </Button>
            <Button
              variant={savedToGlossary ? "secondary" : "outline"}
              size="sm"
              onClick={addToGlossary}
              className="text-xs flex items-center gap-1.5"
            >
              <Bookmark className="h-3 w-3" />
              {savedToGlossary ? "Saved" : "Add to glossary"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
