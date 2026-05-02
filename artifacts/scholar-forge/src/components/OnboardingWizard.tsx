import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, BookOpen, Search, Bookmark, FileText, Download, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSupervisor, CITATION_STYLES, DISCIPLINES } from "@/hooks/useSupervisor";

const STORAGE_KEY = "sf_onboarded";

function isOnboarded(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
}
function markOnboarded(): void {
  try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /* noop */ }
}

// ─── Workflow Diagram ─────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { icon: Search,    label: "Search",     desc: "4M+ open-access papers", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { icon: Bookmark,  label: "Save",       desc: "Build your collection",   color: "text-blue-700 bg-blue-50 border-blue-200" },
  { icon: FileText,  label: "Paraphrase", desc: "AI rewrites with citations", color: "text-violet-700 bg-violet-50 border-violet-200" },
  { icon: Download,  label: "Export",     desc: "BibTeX, Word, plain text", color: "text-amber-700 bg-amber-50 border-amber-200" },
];

function WorkflowDiagram() {
  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap">
      {WORKFLOW_STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center gap-1.5">
            <div className={cn("flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 w-24", step.color)}>
              <Icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{step.label}</span>
              <span className="text-[10px] text-center opacity-75 leading-tight">{step.desc}</span>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1() {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-emerald-700" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-foreground">Welcome to ScholarForge</h2>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
          ScholarForge turns hours of research into minutes. Built by a student, for every student.
          Free and open source.
        </p>
      </div>
      <div className="pt-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Your research workflow</p>
        <WorkflowDiagram />
      </div>
    </div>
  );
}

function Step2({ onDone }: { onDone: () => void }) {
  const { config, updateConfig } = useSupervisor();
  const [yearFrom, setYearFrom] = useState(String(config?.yearFrom ?? 2020));
  const [yearTo, setYearTo] = useState(String(config?.yearTo ?? 2025));
  const [citationStyle, setCitationStyle] = useState(config?.citationStyle ?? "APA 7th");
  const [discipline, setDiscipline] = useState(config?.discipline ?? "Biomedical");

  const handleSave = () => {
    updateConfig({
      yearFrom: parseInt(yearFrom) || 2020,
      yearTo: parseInt(yearTo) || 2025,
      citationStyle,
      discipline,
      preferredJournals: config?.preferredJournals ?? [],
      maxFigures: config?.maxFigures ?? 5,
      universityName: config?.universityName ?? "",
    });
    onDone();
  };

  const fieldCls = "rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 w-full";
  const selectCls = "rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 w-full";

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="font-serif text-xl text-foreground">Set up Supervisor Mode</h2>
        <p className="text-sm text-muted-foreground">These constraints filter every search automatically.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Year from</label>
          <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} className={fieldCls} min="1900" max="2030" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Year to</label>
          <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} className={fieldCls} min="1900" max="2030" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Citation style</label>
        <select value={citationStyle} onChange={(e) => setCitationStyle(e.target.value)} className={selectCls}>
          {CITATION_STYLES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Discipline</label>
        <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className={selectCls}>
          {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>

      <Button onClick={handleSave} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white gap-2">
        Save constraints <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

const FEATURE_HIGHLIGHTS = [
  { icon: Sparkles, label: "Gap Finder",         desc: "Discover unexplored research angles in your collection",    color: "text-amber-700" },
  { icon: FileText, label: "Lit Review Composer", desc: "AI drafts a structured literature review from your papers", color: "text-blue-700" },
  { icon: Search,   label: "Argument Mapper",     desc: "Visualise how papers support, contradict, and extend each other", color: "text-violet-700" },
  { icon: BookOpen, label: "Writing Coach",        desc: "Paragraph-level feedback from an AI dissertation supervisor", color: "text-emerald-700" },
];

function Step3() {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="font-serif text-xl text-foreground">Your first search</h2>
        <p className="text-sm text-muted-foreground">Head to the Workspace and try a topic from your dissertation.</p>
      </div>

      <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1">Sample topic to try</p>
        <p className="text-sm font-mono text-emerald-900">"climate change adaptation"</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Powerful tools waiting in your collection</p>
        <div className="space-y-2">
          {FEATURE_HIGHLIGHTS.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5">
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", f.color)} />
                <div>
                  <p className="text-xs font-semibold text-foreground">{f.label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Step4({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <Sparkles className="h-8 w-8 text-emerald-700" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-foreground">You're ready!</h2>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
          Your workspace is set up. Start with a real topic from your dissertation and build your collection.
          Every tool gets smarter the more papers you save.
        </p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-left space-y-1">
        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Quick tip</p>
        <p className="text-sm text-emerald-900">Save 5+ papers to unlock the Gap Finder, Literature Review Composer, and Argument Mapper.</p>
      </div>
      <Button onClick={onDone} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white gap-2 h-11 text-base">
        Start researching <ArrowRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

const STEP_COUNT = 4;

const STEP_LABELS = ["Welcome", "Supervisor Mode", "First Search", "Ready"];

export function OnboardingWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [step2Done, setStep2Done] = useState(false);

  useEffect(() => {
    if (!isOnboarded()) setOpen(true);
  }, []);

  const dismiss = () => {
    markOnboarded();
    setOpen(false);
  };

  const next = () => {
    if (step < STEP_COUNT - 1) setStep((s) => s + 1);
    else dismiss();
  };

  const back = () => { if (step > 0) setStep((s) => s - 1); };

  if (!open) return null;

  const isLast = step === STEP_COUNT - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  i === step ? "bg-emerald-700" : i < step ? "bg-emerald-400" : "bg-muted-foreground/20"
                )} />
                {i < STEP_LABELS.length - 1 && <div className="h-px w-4 bg-muted-foreground/20" />}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{step + 1} / {STEP_COUNT}</span>
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Skip onboarding"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 && <Step1 />}
          {step === 1 && <Step2 onDone={() => { setStep2Done(true); next(); }} />}
          {step === 2 && <Step3 />}
          {step === 3 && <Step4 onDone={dismiss} />}
        </div>

        {/* Footer navigation — hidden on step 1 (has its own save btn) and step 3 (has its own done btn) */}
        {step !== 1 && step !== 3 && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={step === 0 ? dismiss : back}
            >
              {step === 0 ? (
                "Skip for now"
              ) : (
                <><ChevronLeft className="h-4 w-4" /> Back</>
              )}
            </Button>

            {!isLast && (
              <Button
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5"
                onClick={next}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Skip link on step 1 (save button is primary CTA, skip is secondary) */}
        {step === 1 && (
          <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={back}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <button onClick={next} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
