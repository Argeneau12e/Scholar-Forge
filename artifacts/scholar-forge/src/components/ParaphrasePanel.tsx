import { apiFetch } from "@/lib/apiFetch";
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, BookmarkPlus, Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupervisor } from "@/hooks/useSupervisor";
import { useCollection } from "@/hooks/useCollection";
import { useToast } from "@/hooks/use-toast";
import { OriginalityPanel } from "@/components/OriginalityPanel";
import type { Paper } from "@workspace/api-client-react/src/generated/api.schemas";

type Intensity = "literal" | "moderate" | "student";

const INTENSITY_STOPS: { value: Intensity; short: string; long: string }[] = [
  { value: "literal",  short: "Stay close",       long: "Minimal changes — keep most of the same vocabulary" },
  { value: "moderate", short: "Moderate rewrite",  long: "Different vocabulary and structure, same facts" },
  { value: "student",  short: "My voice",          long: "Explain it like a knowledgeable student would" },
];

interface ParaphrasePanelProps {
  paper: Paper;
  text: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ParaphrasePanel({ paper, text, open, onOpenChange }: ParaphrasePanelProps) {
  const { config } = useSupervisor();
  const { addParaphrase } = useCollection();
  const { toast } = useToast();

  const [intensityIdx, setIntensityIdx] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ paraphrase: string; citationInline: string } | null>(null);
  const [editedParaphrase, setEditedParaphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [originalityOpen, setOriginalityOpen] = useState(false);

  const intensity = INTENSITY_STOPS[intensityIdx];

  const authorsStr =
    paper.authors.slice(0, 3).join(", ") +
    (paper.authors.length > 3 ? " et al." : "");

  const runParaphrase = useCallback(
    async (overrideIdx?: number) => {
      if (!text.trim()) return;
      const idx = overrideIdx ?? intensityIdx;
      const chosenIntensity = INTENSITY_STOPS[idx].value;

      setIsLoading(true);
      setError(null);
      setSaved(false);

      try {
        const resp = await apiFetch("/api/paraphrase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            intensity: chosenIntensity,
            discipline: config?.discipline ?? "general",
            citation: {
              authors: authorsStr,
              year: paper.year ?? undefined,
              journal: paper.venue ?? undefined,
              doi: paper.doi ?? undefined,
            },
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          setError(data.error ?? "Paraphrasing failed. Please try again.");
          return;
        }

        setResult(data);
        setEditedParaphrase(data.paraphrase);
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [text, intensityIdx, config?.discipline, authorsStr, paper]
  );

  /** Called from OriginalityPanel → bump intensity toward "student" and re-run */
  const handleRevise = useCallback(() => {
    setOriginalityOpen(false);
    const nextIdx = Math.min(intensityIdx + 1, INTENSITY_STOPS.length - 1);
    setIntensityIdx(nextIdx);
    setResult(null);
    setEditedParaphrase("");
    runParaphrase(nextIdx);
  }, [intensityIdx, runParaphrase]);

  const handleSave = () => {
    const txt = editedParaphrase.trim();
    if (!txt) return;
    const citation = result?.citationInline ?? `(${authorsStr}, ${paper.year ?? "n.d."})`;
    const { added, total } = addParaphrase(txt, citation, paper);
    if (added) {
      setSaved(true);
      toast({ title: `Added to your collection (${total} total)` });
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setResult(null);
      setEditedParaphrase("");
      setError(null);
      setSaved(false);
      setOriginalityOpen(false);
    }
    onOpenChange(o);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-700" />
              AI Paraphrase
            </DialogTitle>
            <p
              className="text-sm text-muted-foreground leading-snug truncate mt-0.5"
              title={paper.title}
            >
              {paper.title}
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Original text */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Original text
              </p>
              <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-sm text-foreground leading-relaxed max-h-36 overflow-y-auto">
                {text}
              </div>
            </div>

            {/* Intensity slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Intensity
                </p>
                <Badge
                  variant="outline"
                  className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[10px]"
                >
                  {intensity.short}
                </Badge>
              </div>

              <div className="space-y-3">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={intensityIdx}
                  onChange={(e) => {
                    setIntensityIdx(parseInt(e.target.value));
                    setResult(null);
                    setEditedParaphrase("");
                  }}
                  className="w-full h-2 accent-emerald-700 cursor-pointer"
                  data-testid="intensity-slider"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  {INTENSITY_STOPS.map((s) => (
                    <span key={s.value} className="text-center leading-tight max-w-[80px]">
                      {s.short}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground italic">
                  {intensity.long}
                </p>
              </div>
            </div>

            {/* Discipline */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Discipline:</span>
              <span className="font-medium text-foreground">
                {config?.discipline ?? "General"}
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Paraphrased text
                  <span className="ml-2 font-normal normal-case text-muted-foreground/60">
                    — edit freely before saving
                  </span>
                </p>
                <Textarea
                  value={editedParaphrase}
                  onChange={(e) => setEditedParaphrase(e.target.value)}
                  className="min-h-[140px] resize-y text-sm leading-relaxed bg-background"
                  data-testid="paraphrase-result"
                />
                {result.citationInline && (
                  <p className="text-sm font-medium text-emerald-700">
                    {result.citationInline}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex items-center gap-2 flex-wrap">
            {!result ? (
              <Button
                className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 flex-1"
                onClick={() => runParaphrase()}
                disabled={isLoading || !text.trim()}
                data-testid="btn-paraphrase-run"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Paraphrasing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Paraphrase
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => runParaphrase()}
                  disabled={isLoading}
                  data-testid="btn-paraphrase-retry"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                  Try again
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  onClick={() => setOriginalityOpen(true)}
                  disabled={!editedParaphrase.trim() || isLoading}
                  data-testid="btn-check-originality"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Check originality
                </Button>

                <Button
                  className={cn(
                    "gap-1.5 flex-1",
                    saved
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
                      : "bg-emerald-700 hover:bg-emerald-800 text-white"
                  )}
                  size="sm"
                  onClick={handleSave}
                  disabled={saved || !editedParaphrase.trim()}
                  data-testid="btn-paraphrase-save"
                >
                  {saved ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Saved
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      Save to collection
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Originality panel — opens on top */}
      <OriginalityPanel
        open={originalityOpen}
        onOpenChange={setOriginalityOpen}
        original={text}
        paraphrase={editedParaphrase}
        onRevise={handleRevise}
      />
    </>
  );
}
