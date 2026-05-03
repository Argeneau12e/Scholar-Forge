import { useState } from "react";
import { FileText, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSupervisor } from "@/hooks/useSupervisor";

interface AbstractResult {
  abstract: string;
  wordCount: number;
  keywords: string[];
  sections?: {
    background?: string;
    objective?: string;
    methods?: string;
    results?: string;
    conclusions?: string;
  };
}

const WORD_LIMITS = [150, 200, 250, 300, 500];

export default function AbstractGeneratorPage() {
  const [source, setSource] = useState("");
  const [wordLimit, setWordLimit] = useState(250);
  const [abstractType, setAbstractType] = useState<"structured" | "unstructured">("unstructured");
  const [keywords, setKeywords] = useState("");
  const [result, setResult] = useState<AbstractResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { config } = useSupervisor();
  const { toast } = useToast();

  const generate = async () => {
    if (source.trim().length < 50) {
      toast({ title: "Please provide at least 50 characters of content" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/abstract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentContent: source.trim(),
          wordLimit,
          abstractType,
          discipline: config?.discipline ?? "general",
          keywords: keywords.trim() ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setResult(await res.json());
    } catch (e) {
      toast({ title: "Could not generate abstract", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.abstract).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const wordCount = result?.wordCount ?? 0;
  const pct = wordLimit > 0 ? Math.round((wordCount / wordLimit) * 100) : 0;
  const countColour = pct > 100 ? "text-red-600" : pct >= 90 ? "text-emerald-600" : "text-muted-foreground";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl text-foreground">Abstract Generator</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">
          Generate a polished abstract from your draft — structured or unstructured, any word limit.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Config */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold">Settings</h2>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Word limit</label>
                <div className="flex gap-1.5 flex-wrap">
                  {WORD_LIMITS.map((w) => (
                    <button key={w} onClick={() => setWordLimit(w)}
                      className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        wordLimit === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Abstract type</label>
                <div className="space-y-2">
                  {([["unstructured", "Unstructured", "Single paragraph — humanities, social sciences"],
                    ["structured",   "Structured",   "Labelled sections — biomedical, scientific"]] as const).map(([val, label, desc]) => (
                    <button key={val} onClick={() => setAbstractType(val)}
                      className={cn("w-full text-left px-3 py-2.5 rounded-lg border transition-all",
                        abstractType === val ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
                      <p className="text-xs font-medium">{label}</p>
                      <p className="text-[10px] opacity-70">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Keywords (comma-separated, optional)
                </label>
                <input value={keywords} onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. machine learning, clinical trials"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
          </div>

          {/* Main input + output */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-xs font-medium text-muted-foreground block">Your draft / summary *</label>
              <textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                rows={10}
                placeholder="Paste your full draft, a detailed summary, or a few paragraphs describing your research…"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{source.trim().split(/\s+/).filter(Boolean).length} words</span>
                <Button onClick={generate} disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : "Generate abstract"}
                </Button>
              </div>
            </div>

            {/* Result */}
            {result && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">Generated abstract</span>
                    <Badge variant="outline" className={cn("text-[10px]", countColour)}>
                      {wordCount} / {wordLimit} words
                    </Badge>
                    {pct > 100 && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">Over limit</Badge>}
                    {pct <= 100 && pct >= 90 && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">✓ Within limit</Badge>}
                  </div>
                  <Button variant="outline" size="sm" onClick={copy}>
                    {copied ? <><Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy</>}
                  </Button>
                </div>

                {/* Structured sections */}
                {abstractType === "structured" && result.sections && (
                  <div className="space-y-3 pb-2 border-b border-border">
                    {(["background","objective","methods","results","conclusions"] as const).map((sec) => {
                      const text = result.sections?.[sec];
                      if (!text) return null;
                      return (
                        <div key={sec}>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{sec}</p>
                          <p className="text-sm text-foreground leading-relaxed">{text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-lg bg-muted/30 p-4">
                  <p className="text-sm text-foreground leading-relaxed">{result.abstract}</p>
                </div>

                {result.keywords.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Suggested keywords</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.keywords.map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[10px]">{kw}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
