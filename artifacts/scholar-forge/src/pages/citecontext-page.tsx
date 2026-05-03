import { useState } from "react";
import { Quote, Loader2, BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/hooks/useCollection";
import { cn } from "@/lib/utils";

interface CiteContextResult {
  explanation: string;
  citationType: string;
  confidence: "high" | "medium" | "low";
}

export default function CiteContextPage() {
  const [doi, setDoi] = useState("");
  const [title, setTitle] = useState("");
  const [citingTitle, setCitingTitle] = useState("");
  const [citingAbstract, setCitingAbstract] = useState("");
  const [result, setResult] = useState<CiteContextResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { items } = useCollection();
  const { toast } = useToast();

  const run = async () => {
    if (!doi.trim() && !title.trim()) {
      toast({ title: "Enter a DOI or paper title" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/citecontext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doi: doi.trim() || undefined,
          title: title.trim() || undefined,
          citingTitle: citingTitle.trim() || "My dissertation",
          citingAbstract: citingAbstract.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      setResult(await res.json());
    } catch (e) {
      toast({ title: "Request failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const confidenceColour = result
    ? result.confidence === "high" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : result.confidence === "medium" ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-slate-100 text-slate-600 border-slate-200"
    : "";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-2">
          <Quote className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl text-foreground">Citation Context</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">
          Understand exactly how a paper has been cited and why — so you can use it correctly in your own writing.
        </p>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground">Paper you want to cite</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">DOI</label>
              <input
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder="10.1001/example.2023"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">or Paper title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Exact paper title"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <h2 className="text-sm font-semibold text-foreground pt-2">Your paper (context)</h2>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Your dissertation / paper title</label>
            <input
              value={citingTitle}
              onChange={(e) => setCitingTitle(e.target.value)}
              placeholder="e.g. The role of social media in teen anxiety"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Your abstract or research question (optional)</label>
            <textarea
              value={citingAbstract}
              onChange={(e) => setCitingAbstract(e.target.value)}
              rows={3}
              placeholder="Paste your abstract or a summary of your research here for more targeted context…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          <Button onClick={run} disabled={loading}>
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing…</>
              : <><ArrowRight className="h-4 w-4 mr-2" />Explain citation context</>}
          </Button>
        </div>

        {/* Quick-pick from collection */}
        {items.length > 0 && !result && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 mb-6">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Quick-pick from your collection</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {items.slice(0, 10).map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setDoi(item.doi ?? ""); setTitle(item.doi ? "" : item.title); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/80 transition-colors"
                >
                  <p className="text-xs font-medium text-foreground line-clamp-1">{item.title}</p>
                  {item.doi && <p className="text-[10px] text-muted-foreground">{item.doi}</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Citation analysis</span>
              </div>
              <div className="flex items-center gap-2">
                {result.citationType && (
                  <Badge variant="outline" className="text-[10px]">{result.citationType}</Badge>
                )}
                {result.confidence && (
                  <Badge className={cn("text-[10px] border", confidenceColour)}>
                    {result.confidence} confidence
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{result.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
}
