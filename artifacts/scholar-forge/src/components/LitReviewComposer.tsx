import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  BookText,
  Bold,
  Italic,
  Undo2,
  FileDown,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection, type CollectionItem } from "@/hooks/useCollection";
import { useSupervisor } from "@/hooks/useSupervisor";

// ─── Constants ────────────────────────────────────────────────────────────────

const THESIS_KEY = "sf_thesis";
const MIN_ITEMS = 1;

const LOADING_MESSAGES = [
  "Reading your collection…",
  "Structuring your review…",
  "Drafting transitions…",
  "Adding citation markers…",
  "Finalising synthesis…",
];

type Structure = "thematic" | "chronological" | "methodological";

const STRUCTURES: { value: Structure; label: string; desc: string }[] = [
  { value: "thematic",       label: "Thematic",      desc: "Grouped by topic/tag" },
  { value: "chronological",  label: "Chronological",  desc: "Ordered by publication date" },
  { value: "methodological", label: "By Method",      desc: "Grouped by research method" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSavedThesis(): string {
  try { return localStorage.getItem(THESIS_KEY) ?? ""; } catch { return ""; }
}

function itemLabel(item: CollectionItem): string {
  const authors = item.authors.slice(0, 2);
  const authorStr =
    authors.length === 0 ? "Unknown" :
    authors.length === 1 ? (authors[0].split(",")[0] ?? "Unknown") :
    `${authors[0].split(",")[0]} & ${authors[1].split(",")[0]}`;
  return `${authorStr} et al., ${item.year ?? "n.d."}`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function processLitReview(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map((para) => {
      const parts = para.split(/(\[STUDENT:[^\]]*\]|\[SUGGESTION:[^\]]*\])/);
      const html = parts
        .map((part) => {
          if (part.startsWith("[STUDENT:")) {
            return `<mark style="background:#fef3c7;border-radius:3px;padding:1px 4px;font-style:italic">${escHtml(part)}</mark>`;
          }
          if (part.startsWith("[SUGGESTION:")) {
            return `<mark style="background:#dbeafe;border-radius:3px;padding:1px 4px;font-style:italic">${escHtml(part)}</mark>`;
          }
          return escHtml(part).replace(/\n/g, "<br>");
        })
        .join("");
      return `<p style="margin:0 0 1rem;line-height:1.75">${html}</p>`;
    })
    .join("");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function supervisorStyleKey(style?: string): string {
  if (!style) return "apa";
  const map: Record<string, string> = {
    "APA 7th": "apa",
    "Vancouver": "vancouver",
    "Harvard": "harvard",
    "MLA 9th": "mla",
    "Chicago 17th": "chicago",
  };
  return map[style] ?? "apa";
}

// ─── Sortable item (Step 1 list) ──────────────────────────────────────────────

function SortableItemRow({ item }: { item: CollectionItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-sm"
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium leading-snug">{item.title}</p>
        <p className="text-[11px] text-muted-foreground">{itemLabel(item)}</p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-700"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {item.paraphrase?.trim() && (
        <Badge variant="outline" className="shrink-0 self-start text-[10px] text-emerald-700 border-emerald-200">
          paraphrased
        </Badge>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LitReviewComposer() {
  const { items: collectionItems } = useCollection();
  const { config } = useSupervisor();

  // Step 1 state
  const [localItems, setLocalItems] = useState<CollectionItem[]>([]);
  const [structure, setStructure] = useState<Structure>("thematic");
  const [targetWordCount, setTargetWordCount] = useState(800);
  const [thesis, setThesis] = useState(() => getSavedThesis());

  // Step 2 state
  const [step, setStep] = useState<"compose" | "result">("compose");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [citationsUsed, setCitationsUsed] = useState<string[]>([]);
  const [liveWordCount, setLiveWordCount] = useState(0);
  const [showStructurePicker, setShowStructurePicker] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const [autoSaved, setAutoSaved] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const discipline = config?.discipline ?? "general";
  const style = supervisorStyleKey(config?.citationStyle);
  const universityName = config?.universityName ?? "";

  // Sync collection items → local copy (only on mount or if collection changes while in compose step)
  useEffect(() => {
    if (step === "compose") {
      setLocalItems([...collectionItems].sort((a, b) => a.order - b.order));
    }
  }, [collectionItems, step]);

  // Loading message cycle
  useEffect(() => {
    if (loading) {
      let idx = 0;
      loadingIntervalRef.current = setInterval(() => {
        idx = (idx + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[idx]);
      }, 2000);
    } else {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      setLoadingMsg(LOADING_MESSAGES[0]);
    }
    return () => { if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current); };
  }, [loading]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }, []);

  // Live word count + auto-save draft
  const DRAFT_KEY = "sf_litreview_draft";
  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      setLiveWordCount(countWords(editorRef.current.textContent ?? ""));
      // Debounced auto-save (3 seconds after last keystroke)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        if (editorRef.current) {
          try {
            localStorage.setItem(DRAFT_KEY, editorRef.current.innerHTML);
            setAutoSaved(true);
            setTimeout(() => setAutoSaved(false), 2500);
          } catch { /* quota exceeded */ }
        }
      }, 3000);
    }
  }, []);

  // Draft / regenerate
  const handleDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    initializedRef.current = false;

    try {
      const resp = await fetch("/api/litreview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: localItems.map((item) => ({
            title: item.title,
            authors: item.authors,
            year: item.year,
            journal: item.journal,
            tags: item.tags,
            paraphrase: item.paraphrase,
            originalSnippet: item.originalSnippet,
            abstract: item.abstract,
          })),
          thesis: thesis.trim(),
          structure,
          discipline,
          targetWordCount,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Draft generation failed. Please try again.");
        return;
      }

      // Populate editor
      if (editorRef.current) {
        editorRef.current.innerHTML = processLitReview(data.litreview as string);
        setLiveWordCount(data.wordCount as number);
        initializedRef.current = true;
      } else {
        // editor not yet mounted — set after transition
        setTimeout(() => {
          if (editorRef.current && !initializedRef.current) {
            editorRef.current.innerHTML = processLitReview(data.litreview as string);
            setLiveWordCount(data.wordCount as number);
            initializedRef.current = true;
          }
        }, 80);
      }

      setCitationsUsed(data.citationsUsed as string[]);
      setStep("result");
      setShowStructurePicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [localItems, thesis, structure, discipline, targetWordCount]);

  // Export to .docx
  const handleExportDocx = useCallback(async () => {
    const text = editorRef.current?.innerText ?? "";
    if (!text.trim()) return;
    setExportLoading(true);
    try {
      const resp = await fetch("/api/export/litreview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          discipline,
          style,
          universityName,
          title: thesis.trim() ? thesis.slice(0, 80) : "Literature Review Draft",
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.base64) {
        setError(data.error ?? "Export failed");
        return;
      }
      const bytes = atob(data.base64 as string);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ScholarForge-LitReview-${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  }, [discipline, style, universityName, thesis]);

  // ── STEP 1: Compose ─────────────────────────────────────────────────────────

  if (step === "compose") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-foreground flex items-center gap-2">
              <BookText className="h-5 w-5 text-emerald-700" />
              Literature Review Composer
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Arrange your sources, choose a structure, and let Claude draft your review.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {localItems.length} source{localItems.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Empty state */}
        {localItems.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
            <BookText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">
              Add papers to your collection first — they'll appear here for ordering.
            </p>
          </div>
        )}

        {/* Ordered source list */}
        {localItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Drag to set the order Claude will follow
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localItems.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {localItems.map((item) => (
                    <SortableItemRow key={item.id} item={item} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Settings */}
        <div className="rounded-xl border bg-muted/30 p-5 space-y-5">
          {/* Structure */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Review structure
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STRUCTURES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStructure(s.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-all",
                    structure === s.value
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                      : "border-border bg-card text-foreground hover:border-emerald-300"
                  )}
                >
                  <p className="text-sm font-medium leading-none">{s.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Word count slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Target word count
              </label>
              <span className="text-sm font-semibold text-emerald-700">{targetWordCount} words</span>
            </div>
            <input
              type="range"
              min={500}
              max={2000}
              step={100}
              value={targetWordCount}
              onChange={(e) => setTargetWordCount(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>500</span>
              <span>1000</span>
              <span>1500</span>
              <span>2000</span>
            </div>
          </div>

          {/* Thesis statement */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Thesis statement{" "}
              <span className="normal-case font-normal text-muted-foreground/70">(optional — frames the review)</span>
            </label>
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="e.g. This review argues that mRNA vaccine hesitancy in elderly populations stems primarily from communication failures rather than safety concerns…"
              rows={3}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 resize-none"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Draft button */}
        <Button
          onClick={handleDraft}
          disabled={loading || localItems.length < MIN_ITEMS}
          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white gap-2 h-11 text-base"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="animate-pulse">{loadingMsg}</span>
            </>
          ) : (
            <>
              <BookText className="h-4 w-4" />
              Draft Literature Review
            </>
          )}
        </Button>
      </div>
    );
  }

  // ── STEP 2: Result ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <BookText className="h-5 w-5 text-emerald-700" />
          <h2 className="font-serif text-xl text-foreground">Literature Review Draft</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{liveWordCount} words</span>
          <Badge variant="outline" className="capitalize">{structure}</Badge>
          <button
            onClick={() => { setStep("compose"); setError(null); }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-200" />
          <span className="text-muted-foreground">[STUDENT:] — your input needed</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-200" />
          <span className="text-muted-foreground">[SUGGESTION:] — structural suggestion</span>
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-2 py-1.5 flex-wrap">
        <button
          title="Bold"
          onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold"); }}
          className="rounded px-2.5 py-1 text-sm font-bold hover:bg-background hover:shadow-sm transition-all"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          title="Italic"
          onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic"); }}
          className="rounded px-2.5 py-1 text-sm italic hover:bg-background hover:shadow-sm transition-all"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          title="Undo"
          onMouseDown={(e) => { e.preventDefault(); document.execCommand("undo"); }}
          className="rounded px-2.5 py-1 hover:bg-background hover:shadow-sm transition-all"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={handleExportDocx}
          disabled={exportLoading}
        >
          {exportLoading ? (
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          Export to .docx
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {autoSaved && (
            <span className="text-[11px] text-emerald-600 flex items-center gap-1 animate-in fade-in">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              Auto-saved
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {liveWordCount} words
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowStructurePicker((v) => !v)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Regenerate structure picker */}
      {showStructurePicker && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Choose a different structure to regenerate
          </p>
          <div className="grid grid-cols-3 gap-2">
            {STRUCTURES.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setStructure(s.value);
                  setShowStructurePicker(false);
                  handleDraft();
                }}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-all",
                  structure === s.value
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-border bg-card text-foreground hover:border-emerald-300"
                )}
              >
                <p className="text-sm font-medium leading-none">{s.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Contenteditable editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleEditorInput}
        className={cn(
          "min-h-[500px] rounded-xl border bg-white px-8 py-7 outline-none",
          "text-[15px] leading-relaxed text-foreground",
          "focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100",
          "font-serif"
        )}
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      />

      {/* Citations used */}
      {citationsUsed.length > 0 && (
        <div className="rounded-xl border bg-muted/20 p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Citations used in this draft ({citationsUsed.length})
          </h3>
          <div className="space-y-1">
            {citationsUsed.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
