import { useState, useMemo, useRef } from "react";
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  Sparkles,
  Quote,
  Plus,
  X,
  Download,
  Filter,
  ChevronDown,
  BookOpen,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection, type CollectionItem } from "@/hooks/useCollection";
import { useSupervisor } from "@/hooks/useSupervisor";
import { ParaphrasePanel } from "@/components/ParaphrasePanel";
import { CitationDisplay } from "@/components/CitationDisplay";
import { ExportModal } from "@/components/ExportModal";
import type { Paper } from "@workspace/api-client-react/src/generated/api.schemas";

// ─── Types ───────────────────────────────────────────────────────────────────

type FilterCompliance = "all" | "compliant" | "flagged";
type SortMode = "date" | "year" | "author";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function supervisorStyleKey(style?: string): string {
  if (!style) return "apa";
  const l = style.toLowerCase();
  if (l.includes("vancouver")) return "vancouver";
  if (l.includes("harvard")) return "harvard";
  if (l.includes("mla")) return "mla";
  if (l.includes("chicago")) return "chicago";
  return "apa";
}

function isCompliant(item: CollectionItem, yearFrom?: number, yearTo?: number): boolean {
  if (yearFrom == null || yearTo == null) return true;
  if (item.year == null) return true;
  return item.year >= yearFrom && item.year <= yearTo;
}

/** Convert a CollectionItem back to a Paper-shaped object for panels */
function toPaper(item: CollectionItem): Paper {
  return {
    id: item.id,
    title: item.title,
    authors: item.authors,
    year: item.year ?? undefined,
    venue: item.journal ?? undefined,
    url: item.url ?? undefined,
    abstract: item.abstract ?? undefined,
    doi: item.doi ?? undefined,
    openAccess: item.openAccess ?? undefined,
    source: item.source ?? undefined,
    snippets: item.snippets ?? [],
  } as unknown as Paper;
}

function complianceColor(compliant: boolean): string {
  return compliant ? "bg-emerald-500" : "bg-red-400";
}

// ─── Tag editor ───────────────────────────────────────────────────────────────

function TagEditor({
  tags,
  allTags,
  onChange,
}: {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = allTags.filter(
    (t) =>
      !tags.includes(t) &&
      t.toLowerCase().includes(inputValue.toLowerCase()) &&
      inputValue.length > 0
  );

  const addTag = (tag: string) => {
    const cleaned = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleaned || tags.includes(cleaned)) return;
    onChange([...tags, cleaned]);
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Escape") {
      setAdding(false);
      setInputValue("");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
        >
          #{tag}
          <button
            onClick={() => removeTag(tag)}
            className="ml-0.5 rounded-full hover:bg-emerald-200 p-0.5 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      {adding ? (
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setTimeout(() => {
                setAdding(false);
                setInputValue("");
                setShowSuggestions(false);
              }, 150);
            }}
            placeholder="tag name…"
            className="h-6 rounded-full border border-emerald-300 bg-white px-2.5 text-[11px] outline-none focus:border-emerald-500 w-24"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-7 left-0 z-50 bg-white border border-border rounded-md shadow-lg py-1 min-w-[120px]">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onMouseDown={() => addTag(s)}
                  className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-muted"
                >
                  #{s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors"
        >
          <Plus className="h-2.5 w-2.5" />
          add tag
        </button>
      )}
    </div>
  );
}

// ─── Sortable card ────────────────────────────────────────────────────────────

function SortableCollectionCard({
  item,
  allTags,
  yearFrom,
  yearTo,
  onUpdate,
  onRemove,
  onParaphrase,
  onCite,
}: {
  item: CollectionItem;
  allTags: string[];
  yearFrom?: number;
  yearTo?: number;
  onUpdate: (id: string, changes: Partial<CollectionItem>) => void;
  onRemove: (id: string) => void;
  onParaphrase: (item: CollectionItem) => void;
  onCite: (item: CollectionItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const compliant = isCompliant(item, yearFrom, yearTo);
  const hasParaphrase = !!item.paraphrase?.trim();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex gap-0 rounded-xl border bg-card shadow-sm transition-shadow",
        isDragging && "shadow-lg",
        !compliant && "border-red-200"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center px-2.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing rounded-l-xl hover:bg-muted/50 transition-colors shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Card body */}
      <div className="flex-1 py-4 pr-4 space-y-2.5 min-w-0">
        {/* Title + meta */}
        <div>
          <p
            className="font-serif text-[15px] leading-snug text-foreground truncate"
            style={{ fontFamily: "Lora, Georgia, serif" }}
            title={item.title}
          >
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {item.authors.slice(0, 3).join(", ")}
            {item.authors.length > 3 ? " et al." : ""}
            {item.year && <> · {item.year}</>}
            {item.journal && (
              <> · <span className="font-medium text-foreground/60">{item.journal}</span></>
            )}
          </p>
        </div>

        {/* Tags */}
        <TagEditor
          tags={item.tags ?? []}
          allTags={allTags}
          onChange={(tags) => onUpdate(item.id, { tags })}
        />

        {/* Status badges + compliance */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Paraphrase status */}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              hasParaphrase
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-zinc-100 text-zinc-500 border border-zinc-200"
            )}
          >
            {hasParaphrase ? (
              <><Check className="h-2.5 w-2.5" /> Paraphrased</>
            ) : (
              <>Pending</>
            )}
          </span>

          {/* Kind badge */}
          {item.kind === "paste" && (
            <Badge variant="outline" className="text-[10px] font-normal">
              Pasted
            </Badge>
          )}

          {/* Compliance dot */}
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                compliant ? "bg-emerald-500" : "bg-red-400"
              )}
            />
            {compliant ? "Compliant" : `Outside ${yearFrom}–${yearTo}`}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          <Button
            size="sm"
            className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white gap-1"
            onClick={() => onParaphrase(item)}
          >
            <Sparkles className="h-3 w-3" />
            {hasParaphrase ? "Re-paraphrase" : "Paraphrase"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            onClick={() => onCite(item)}
          >
            <Quote className="h-3 w-3" />
            Cite
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionWorkspace() {
  const { items, updateItem, reorder, remove, getAllTags } = useCollection();
  const { config } = useSupervisor();

  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterCompliance, setFilterCompliance] = useState<FilterCompliance>("all");
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [exportOpen, setExportOpen] = useState(false);
  const [paraphraseTarget, setParaphraseTarget] = useState<CollectionItem | null>(null);
  const [citeTarget, setCiteTarget] = useState<CollectionItem | null>(null);

  const allTags = getAllTags();
  const yearFrom = config?.yearFrom;
  const yearTo = config?.yearTo;
  const style = supervisorStyleKey(config?.citationStyle);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const displayItems = useMemo(() => {
    let list = [...items];

    if (filterTags.length > 0) {
      list = list.filter((item) =>
        filterTags.every((t) => (item.tags ?? []).includes(t))
      );
    }
    if (filterCompliance === "compliant") {
      list = list.filter((item) => isCompliant(item, yearFrom, yearTo));
    } else if (filterCompliance === "flagged") {
      list = list.filter((item) => !isCompliant(item, yearFrom, yearTo));
    }

    list.sort((a, b) => {
      if (sortMode === "year") return (b.year ?? 0) - (a.year ?? 0);
      if (sortMode === "author")
        return (a.authors[0] ?? "").localeCompare(b.authors[0] ?? "");
      // date (default): newest first
      return (
        new Date(b.addedAt ?? 0).getTime() - new Date(a.addedAt ?? 0).getTime()
      );
    });

    return list;
  }, [items, filterTags, filterCompliance, sortMode, yearFrom, yearTo]);

  // ── DnD ───────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Reorder against the full `items` list (unfiltered)
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) {
      reorder(arrayMove(items, oldIdx, newIdx).map((i) => i.id));
    }
  };

  const toggleFilterTag = (tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4 px-4">
        <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-emerald-700" />
        </div>
        <h2 className="font-serif text-2xl">My Collection</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Save papers, paraphrases, and snippets from search results to build
          your personal research collection.
        </p>
      </div>
    );
  }

  const paraphrasePaper = paraphraseTarget ? toPaper(paraphraseTarget) : null;
  const paraphraseText =
    paraphraseTarget?.originalSnippet?.trim() ||
    paraphraseTarget?.abstract?.trim() ||
    "";
  const citePaper = citeTarget ? toPaper(citeTarget) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5 pb-16">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-foreground">
            My Collection
            <span className="ml-2 text-muted-foreground font-sans text-base font-normal">
              ({items.length} item{items.length !== 1 ? "s" : ""})
            </span>
          </h1>
          {config && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Citation style: <span className="font-medium">{config.citationStyle}</span>
              {yearFrom && yearTo && (
                <> · Year range: <span className="font-medium">{yearFrom}–{yearTo}</span></>
              )}
            </p>
          )}
        </div>
        <Button
          className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shrink-0"
          size="sm"
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-3.5 w-3.5" />
          Export Bibliography
        </Button>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 bg-muted/40 rounded-xl px-4 py-3">
        {/* Tag filter pills */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mr-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleFilterTag(tag)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors",
                  filterTags.includes(tag)
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-white text-muted-foreground border-border hover:border-emerald-400"
                )}
              >
                #{tag}
              </button>
            ))}
            {filterTags.length > 0 && (
              <button
                onClick={() => setFilterTags([])}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Compliance filter */}
          <div className="relative">
            <select
              value={filterCompliance}
              onChange={(e) => setFilterCompliance(e.target.value as FilterCompliance)}
              className="h-7 rounded-md border border-border bg-white pl-2.5 pr-7 text-[11px] text-foreground appearance-none cursor-pointer"
            >
              <option value="all">All</option>
              <option value="compliant">Compliant only</option>
              <option value="flagged">Flagged only</option>
            </select>
            <ChevronDown className="h-3 w-3 absolute right-2 top-2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-7 rounded-md border border-border bg-white pl-2.5 pr-7 text-[11px] text-foreground appearance-none cursor-pointer"
            >
              <option value="date">Date added</option>
              <option value="year">Year</option>
              <option value="author">Author</option>
            </select>
            <ChevronDown className="h-3 w-3 absolute right-2 top-2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── Item count after filter ── */}
      {(filterTags.length > 0 || filterCompliance !== "all") && (
        <p className="text-xs text-muted-foreground">
          Showing {displayItems.length} of {items.length} items
        </p>
      )}

      {displayItems.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No items match the current filters.
        </div>
      )}

      {/* ── Sortable list ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={displayItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {displayItems.map((item) => (
              <SortableCollectionCard
                key={item.id}
                item={item}
                allTags={allTags}
                yearFrom={yearFrom}
                yearTo={yearTo}
                onUpdate={updateItem}
                onRemove={remove}
                onParaphrase={setParaphraseTarget}
                onCite={setCiteTarget}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* ── Paraphrase panel ── */}
      {paraphrasePaper && (
        <ParaphrasePanel
          paper={paraphrasePaper}
          text={paraphraseText}
          open={!!paraphraseTarget}
          onOpenChange={(o) => !o && setParaphraseTarget(null)}
        />
      )}

      {/* ── Citation panel ── */}
      {citePaper && (
        <CitationDisplay
          paper={citePaper}
          open={!!citeTarget}
          onOpenChange={(o) => !o && setCiteTarget(null)}
        />
      )}

      {/* ── Export modal ── */}
      <ExportModal
        items={items}
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultStyle={config?.citationStyle}
        universityName={config?.universityName}
      />
    </div>
  );
}
