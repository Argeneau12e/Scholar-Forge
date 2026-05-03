import { useState } from "react";
import { Languages, Loader2, Copy, Check, Wand2, BookOpen, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tool = "check" | "translate" | "simplify";

const SUPPORTED_LANGUAGES = [
  "Arabic", "Chinese (Simplified)", "Chinese (Traditional)", "Dutch", "French",
  "German", "Hindi", "Indonesian", "Italian", "Japanese", "Korean",
  "Polish", "Portuguese", "Russian", "Spanish", "Swedish", "Turkish", "Vietnamese",
];

const NATIVE_LANGUAGES = [
  "Arabic", "Chinese", "Dutch", "French", "German", "Hindi", "Indonesian",
  "Italian", "Japanese", "Korean", "Malay", "Polish", "Portuguese", "Russian",
  "Spanish", "Swedish", "Turkish", "Vietnamese", "Other",
];

const PRIORITY_STYLE: Record<string, string> = {
  high:   "border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-800",
  medium: "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800",
  low:    "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800",
};

interface ESLResult {
  overallScore: number;
  registrerScore: number;
  clarityScore: number;
  grammarScore: number;
  summary: string;
  issues: Array<{ type: string; original: string; suggestion: string; explanation: string; priority: string }>;
  positives: string[];
  vocabularyGaps: string[];
  l1Interference: string;
  rewrittenParagraph: string;
}

interface TranslateResult {
  translation: string;
  notes: string;
  technicalTerms: Array<{ source: string; target: string }>;
  targetLanguage: string;
}

interface SimplifyResult {
  simplified: string;
  keyTermsDefined: Array<{ term: string; definition: string }>;
  translation: string;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100;
  const colour = score >= 8 ? "text-emerald-600" : score >= 6 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="2.8" />
          <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.8"
            stroke={score >= 8 ? "#059669" : score >= 6 ? "#d97706" : "#dc2626"}
            strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-lg font-bold", colour)}>{score}</span>
      </div>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}

export default function LanguagePage() {
  const [activeTool, setActiveTool] = useState<Tool>("check");
  const [text, setText] = useState("");
  const [nativeLang, setNativeLang] = useState("");
  const [targetLang, setTargetLang] = useState("French");
  const [simplifyLang, setSimplifyLang] = useState("");
  const [loading, setLoading] = useState(false);
  const [eslResult, setEslResult] = useState<ESLResult | null>(null);
  const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null);
  const [simplifyResult, setSimplifyResult] = useState<SimplifyResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const runCheck = async () => {
    if (text.trim().length < 20) { toast({ title: "Enter at least 20 characters" }); return; }
    setLoading(true);
    setEslResult(null);
    try {
      const res = await fetch("/api/language/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), nativeLanguage: nativeLang, targetRegister: "academic" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setEslResult(await res.json());
    } catch (e) {
      toast({ title: "Check failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const runTranslate = async () => {
    if (text.trim().length < 5) { toast({ title: "Enter text to translate" }); return; }
    setLoading(true);
    setTranslateResult(null);
    try {
      const res = await fetch("/api/language/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), targetLanguage: targetLang }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setTranslateResult(await res.json());
    } catch (e) {
      toast({ title: "Translation failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const runSimplify = async () => {
    if (text.trim().length < 20) { toast({ title: "Enter at least 20 characters" }); return; }
    setLoading(true);
    setSimplifyResult(null);
    try {
      const res = await fetch("/api/language/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), targetLanguage: simplifyLang || "English" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setSimplifyResult(await res.json());
    } catch (e) {
      toast({ title: "Simplify failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleRun = () => {
    if (activeTool === "check") runCheck();
    else if (activeTool === "translate") runTranslate();
    else runSimplify();
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Languages className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl text-foreground">Language Support</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          Write with confidence — get ESL writing checks, academic translations, and plain-language simplifications.
        </p>

        {/* Tool selector */}
        <div className="flex gap-1 rounded-xl bg-muted/40 p-1 mb-6 w-fit">
          {([
            ["check",     "ESL Writing Check"],
            ["translate", "Translate"],
            ["simplify",  "Simplify"],
          ] as [Tool, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTool(id)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTool === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Input panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">

              {/* Tool-specific config */}
              {activeTool === "check" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Your native language (optional)</label>
                  <select value={nativeLang} onChange={(e) => setNativeLang(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                    <option value="">— not specified —</option>
                    {NATIVE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">Helps identify language-specific patterns</p>
                </div>
              )}

              {activeTool === "translate" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target language</label>
                  <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                    {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              )}

              {activeTool === "simplify" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Also translate to (optional)</label>
                  <select value={simplifyLang} onChange={(e) => setSimplifyLang(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                    <option value="">— English only —</option>
                    {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  {activeTool === "check" ? "Your academic text" : activeTool === "translate" ? "Text to translate" : "Academic text to simplify"}
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={12}
                  placeholder={
                    activeTool === "check"
                      ? "Paste a paragraph or section of your academic writing…"
                      : activeTool === "translate"
                      ? "Paste the text you want to translate (abstracts, sections, key findings)…"
                      : "Paste complex academic text to get a plain-language version…"
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{text.trim().split(/\s+/).filter(Boolean).length} words</p>
              </div>

              <Button onClick={handleRun} disabled={loading} className="w-full">
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing…</> : <>
                  {activeTool === "check" ? <Wand2 className="h-4 w-4 mr-2" /> : activeTool === "translate" ? <Languages className="h-4 w-4 mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {activeTool === "check" ? "Check my writing" : activeTool === "translate" ? `Translate to ${targetLang}` : "Simplify"}
                </>}
              </Button>
            </div>
          </div>

          {/* Results panel */}
          <div className="lg:col-span-3 space-y-4">
            {!loading && !eslResult && !translateResult && !simplifyResult && (
              <div className="flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed border-border">
                <Languages className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  {activeTool === "check"
                    ? "Paste your text and get detailed feedback tailored for non-native English academic writers."
                    : activeTool === "translate"
                    ? "Translate academic text to 18 languages with technical term glossary."
                    : "Get a plain-language version of complex academic text, with optional translation."}
                </p>
              </div>
            )}

            {/* ESL Check results */}
            {eslResult && activeTool === "check" && (
              <div className="space-y-4">
                {/* Score cards */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap gap-6 justify-center mb-4">
                    <ScoreRing score={eslResult.overallScore} label="Overall" />
                    <ScoreRing score={eslResult.grammarScore} label="Grammar" />
                    <ScoreRing score={eslResult.registrerScore} label="Register" />
                    <ScoreRing score={eslResult.clarityScore} label="Clarity" />
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{eslResult.summary}</p>
                  {eslResult.l1Interference && (
                    <p className="text-xs text-muted-foreground italic mt-2 border-l-2 border-primary/30 pl-3">{eslResult.l1Interference}</p>
                  )}
                </div>

                {/* Positives */}
                {eslResult.positives?.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">What you're doing well</p>
                    <ul className="space-y-1">
                      {eslResult.positives.map((p, i) => (
                        <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5"><span>✓</span>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Issues */}
                {eslResult.issues?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Issues ({eslResult.issues.length})</p>
                    <div className="space-y-2">
                      {eslResult.issues.map((issue, i) => (
                        <div key={i} className={cn("rounded-lg border p-3 space-y-1.5", PRIORITY_STYLE[issue.priority] ?? "border-border bg-card")}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize">{issue.type}</Badge>
                            <Badge variant="outline" className={cn("text-[10px] capitalize",
                              issue.priority === "high" ? "border-red-200 text-red-700" : issue.priority === "medium" ? "border-amber-200 text-amber-700" : "border-blue-200 text-blue-700")}>
                              {issue.priority}
                            </Badge>
                          </div>
                          <div className="text-xs space-y-1">
                            <p><span className="line-through text-muted-foreground">{issue.original}</span></p>
                            <p className="font-medium text-foreground">→ {issue.suggestion}</p>
                            <p className="text-muted-foreground">{issue.explanation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vocabulary gaps */}
                {eslResult.vocabularyGaps?.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vocabulary to learn</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {eslResult.vocabularyGaps.map((v) => (
                        <Badge key={v} variant="secondary" className="text-[10px]">{v}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rewritten paragraph */}
                {eslResult.rewrittenParagraph && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Suggested rewrite</p>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copy(eslResult.rewrittenParagraph, "rewrite")}>
                        {copied === "rewrite" ? <><Check className="h-3 w-3 text-emerald-600" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                      </Button>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed bg-primary/5 rounded-lg p-3">{eslResult.rewrittenParagraph}</p>
                  </div>
                )}
              </div>
            )}

            {/* Translation results */}
            {translateResult && activeTool === "translate" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{translateResult.targetLanguage}</Badge>
                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copy(translateResult.translation, "trans")}>
                      {copied === "trans" ? <><Check className="h-3 w-3 text-emerald-600" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                    </Button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed bg-muted/30 rounded-lg p-4">{translateResult.translation}</p>
                  {translateResult.notes && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">{translateResult.notes}</p>
                  )}
                </div>

                {translateResult.technicalTerms?.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Technical term glossary</p>
                    <div className="space-y-1.5">
                      {translateResult.technicalTerms.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-xs gap-3">
                          <span className="text-foreground font-medium">{t.source}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-primary">{t.target}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Simplify results */}
            {simplifyResult && activeTool === "simplify" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Simplified version</p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copy(simplifyResult.simplified, "simp")}>
                      {copied === "simp" ? <><Check className="h-3 w-3 text-emerald-600" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                    </Button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed bg-primary/5 rounded-lg p-4">{simplifyResult.simplified}</p>
                </div>

                {simplifyResult.keyTermsDefined?.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Key terms explained</p>
                    <div className="space-y-2">
                      {simplifyResult.keyTermsDefined.map((t, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-semibold text-foreground">{t.term}</span>
                          <span className="text-muted-foreground ml-2">{t.definition}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {simplifyResult.translation && (
                  <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{simplifyLang} translation</Badge>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copy(simplifyResult.translation, "trans2")}>
                        {copied === "trans2" ? <><Check className="h-3 w-3 text-emerald-600" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                      </Button>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed bg-muted/30 rounded-lg p-4">{simplifyResult.translation}</p>
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
