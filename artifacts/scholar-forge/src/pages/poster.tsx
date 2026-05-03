import { useState } from "react";
import { LayoutTemplate, Loader2, Download, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/hooks/useCollection";
import { useSupervisor } from "@/hooks/useSupervisor";

interface PosterContent {
  title: string;
  authors: string;
  institution: string;
  introduction: string;
  objectives: string[];
  methods: string;
  keyFindings: string[];
  conclusions: string;
  references: string[];
  suggestedFigure: string;
}

type Theme = "academic" | "navy" | "earth" | "mono";

const THEMES: Record<Theme, { name: string; bg: string; accent: string; text: string; border: string }> = {
  academic: { name: "Academic",   bg: "bg-white",         accent: "bg-emerald-600",  text: "text-gray-900",  border: "border-emerald-200" },
  navy:     { name: "Navy",       bg: "bg-slate-900",     accent: "bg-amber-400",    text: "text-white",     border: "border-slate-700" },
  earth:    { name: "Earth",      bg: "bg-amber-50",      accent: "bg-stone-700",    text: "text-stone-900", border: "border-stone-300" },
  mono:     { name: "Monochrome", bg: "bg-white",         accent: "bg-gray-900",     text: "text-gray-900",  border: "border-gray-300" },
};

export default function PosterBuilderPage() {
  const [topic, setTopic] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [theme, setTheme] = useState<Theme>("academic");
  const [content, setContent] = useState<PosterContent | null>(null);
  const [loading, setLoading] = useState(false);
  const { items } = useCollection();
  const { config } = useSupervisor();
  const { toast } = useToast();

  const generate = async () => {
    if (!topic.trim()) { toast({ title: "Enter your research topic" }); return; }
    setLoading(true);
    try {
      const collectionSummary = items.slice(0, 10).map((i) => `${i.title} (${i.year ?? "n.d."})`).join("; ");
      const res = await fetch("/api/poster/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          discipline: config?.discipline ?? "general",
          collection: items.slice(0, 15),
          authors: authorName || "Author",
          institution: config && "universityName" in config ? (config as Record<string, unknown>).universityName : "",
          collectionSummary,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setContent(await res.json());
    } catch (e) {
      toast({ title: "Could not generate poster content", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const t = THEMES[theme];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-2">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl text-foreground">Poster Builder</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-6">Generate an academic conference poster from your research.</p>

        {/* Setup */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">Setup</h2>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Research topic *</label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. mRNA vaccine efficacy in elderly populations"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Author name(s)</label>
              <input value={authorName} onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1"><Palette className="h-3 w-3" /> Colour theme</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, val]) => (
                  <button key={key} onClick={() => setTheme(key)}
                    className={cn("px-2.5 py-2 rounded-lg text-xs font-medium border transition-all",
                      theme === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40")}>
                    {val.name}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : "Generate poster"}
            </Button>

            {items.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{items.length} collection item{items.length !== 1 ? "s" : ""} will be used as references.</p>
            )}
          </div>

          {/* Poster preview */}
          <div className="lg:col-span-3">
            {!content && !loading && (
              <div className="flex flex-col items-center justify-center h-96 rounded-xl border-2 border-dashed border-border">
                <LayoutTemplate className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Your poster will appear here after generation.</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-96 rounded-xl border border-border">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
                <p className="text-muted-foreground text-sm">Generating poster content…</p>
              </div>
            )}

            {content && (
              <div className={cn("rounded-xl border-2 overflow-hidden shadow-lg", t.border)}>
                {/* Export buttons */}
                <div className="flex gap-2 p-3 bg-muted/30 border-b border-border">
                  <Button variant="outline" size="sm" onClick={() => toast({ title: "PDF export — use your browser's print function (Ctrl+P) and select 'Save as PDF'" })}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF
                  </Button>
                  <div className="ml-auto flex gap-1.5">
                    {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, val]) => (
                      <button key={key} onClick={() => setTheme(key)}
                        className={cn("w-5 h-5 rounded-full border-2 transition-all", val.accent, theme === key ? "border-primary scale-125" : "border-transparent")}
                        title={val.name} />
                    ))}
                  </div>
                </div>

                {/* Poster body */}
                <div className={cn("p-6 space-y-4", t.bg, t.text)}>
                  {/* Title bar */}
                  <div className={cn("rounded-lg p-4 text-white", t.accent)}>
                    <h1 className="text-xl font-bold leading-tight mb-1" contentEditable suppressContentEditableWarning>{content.title}</h1>
                    <p className="text-sm opacity-90">{content.authors}</p>
                    {content.institution && <p className="text-xs opacity-75">{content.institution}</p>}
                  </div>

                  {/* Content grid */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className={cn("rounded-lg border p-3 space-y-2", t.border)}>
                      <h3 className="text-xs font-bold uppercase tracking-wider opacity-70">Introduction</h3>
                      <p className="text-xs leading-relaxed" contentEditable suppressContentEditableWarning>{content.introduction}</p>
                    </div>
                    <div className={cn("rounded-lg border p-3 space-y-2", t.border)}>
                      <h3 className="text-xs font-bold uppercase tracking-wider opacity-70">Methods</h3>
                      <p className="text-xs leading-relaxed" contentEditable suppressContentEditableWarning>{content.methods}</p>
                    </div>
                    <div className={cn("rounded-lg border p-3 space-y-2", t.border)}>
                      <h3 className="text-xs font-bold uppercase tracking-wider opacity-70">Key Findings</h3>
                      <ul className="text-xs space-y-1">
                        {content.keyFindings.map((f, i) => (
                          <li key={i} className="flex gap-1.5 leading-relaxed">
                            <span className="shrink-0 font-bold">•</span>
                            <span contentEditable suppressContentEditableWarning>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Objectives */}
                  <div className={cn("rounded-lg border p-3", t.border)}>
                    <h3 className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">Objectives</h3>
                    <div className="flex gap-3 flex-wrap">
                      {content.objectives.map((o, i) => (
                        <div key={i} className={cn("flex-1 min-w-32 text-xs p-2 rounded", t.accent, "text-white")}>
                          <span contentEditable suppressContentEditableWarning>{o}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Conclusions + References */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={cn("rounded-lg border p-3", t.border)}>
                      <h3 className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">Conclusions</h3>
                      <p className="text-xs leading-relaxed" contentEditable suppressContentEditableWarning>{content.conclusions}</p>
                    </div>
                    <div className={cn("rounded-lg border p-3", t.border)}>
                      <h3 className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">References</h3>
                      <ol className="text-[10px] space-y-1 list-decimal list-inside opacity-80">
                        {content.references.slice(0, 5).map((r, i) => (
                          <li key={i} className="leading-snug">{r}</li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {content.suggestedFigure && (
                    <div className={cn("rounded-lg border border-dashed p-3 text-center opacity-60", t.border)}>
                      <p className="text-xs italic">{content.suggestedFigure}</p>
                      <p className="text-[10px] mt-1">← Figure placeholder — upload your own image</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
