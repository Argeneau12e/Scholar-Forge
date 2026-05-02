import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  ClipboardPaste,
  Link2,
  AlertCircle,
  Wand2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSupervisor } from "@/hooks/useSupervisor";
import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/hooks/useCollection";

export interface PanelSearchParams {
  topic: string;
  phrase: string;
  yearFrom: number | null;
  yearTo: number | null;
  sources: string[];
}

interface SearchPanelProps {
  onSearch: (params: PanelSearchParams) => void;
  isSearching: boolean;
}

interface SourceOption {
  id: string;
  label: string;
  tooltip: string;
  defaultOn: boolean;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    id: "openalex",
    label: "OpenAlex",
    tooltip: "200M+ works — the broadest open-access index. Best primary source.",
    defaultOn: true,
  },
  {
    id: "pubmed",
    label: "PubMed",
    tooltip: "Biomedical & life-science open-access full text via PubMed Central.",
    defaultOn: true,
  },
  {
    id: "semantic",
    label: "Semantic Scholar",
    tooltip: "AI-powered relevance scoring across all disciplines.",
    defaultOn: false,
  },
  {
    id: "europepmc",
    label: "Europe PMC",
    tooltip: "Life sciences with European preprints and clinical data.",
    defaultOn: false,
  },
  {
    id: "core",
    label: "CORE",
    tooltip: "Humanities & social sciences open repositories with full text. Requires CORE_API_KEY.",
    defaultOn: false,
  },
  {
    id: "arxiv",
    label: "arXiv",
    tooltip: "Preprints in CS, physics, math, and quantitative biology. Not peer-reviewed.",
    defaultOn: false,
  },
  {
    id: "doaj",
    label: "DOAJ",
    tooltip: "Directory of Open Access Journals — verified gold open-access articles.",
    defaultOn: false,
  },
  {
    id: "base",
    label: "BASE",
    tooltip: "Bielefeld Academic Search Engine — broad multi-disciplinary fallback.",
    defaultOn: false,
  },
];

const DEFAULT_SOURCES = SOURCE_OPTIONS.filter((s) => s.defaultOn).map((s) => s.id);

// Discipline-based source recommendations
function recommendSources(focusAreas: string[]): string[] {
  const text = focusAreas.join(" ").toLowerCase();
  if (/\b(medic|bio|pharmac|clinic|health|disease|neuroscien|gene|cell|cancer)\b/.test(text)) {
    return ["pubmed", "europepmc", "openalex"];
  }
  if (/\b(comput|machine.?learn|software|algorithm|deep.?learn|ai|physics|math|quantum|robot)\b/.test(text)) {
    return ["arxiv", "semantic", "openalex"];
  }
  if (/\b(human|social|histor|literat|philos|educat|law|politic|econom|psycholog)\b/.test(text)) {
    return ["core", "base", "doaj", "openalex"];
  }
  return DEFAULT_SOURCES;
}

const MIN_ITEMS_GAP = 8;

export function SearchPanel({ onSearch, isSearching }: SearchPanelProps) {
  const { config } = useSupervisor();
  const { toast } = useToast();
  const { addRawSnippet, items } = useCollection();

  const [topic, setTopic] = useState("");
  const [phrase, setPhrase] = useState("");
  const [yearFrom, setYearFrom] = useState<string>(
    config?.yearFrom?.toString() ?? "2020"
  );
  const [yearTo, setYearTo] = useState<string>(
    config?.yearTo?.toString() ?? "2025"
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(DEFAULT_SOURCES);
  const [yearError, setYearError] = useState<string | null>(null);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [doi, setDoi] = useState("");

  const validateYears = (from: string, to: string) => {
    const f = parseInt(from);
    const t = parseInt(to);
    if (from && to && !isNaN(f) && !isNaN(t) && f > t) {
      setYearError("Start year can't be after end year");
    } else {
      setYearError(null);
    }
  };

  const handleYearFromChange = (val: string) => {
    setYearFrom(val);
    validateYears(val, yearTo);
  };

  const handleYearToChange = (val: string) => {
    setYearTo(val);
    validateYears(yearFrom, val);
  };

  const toggleSource = (id: string) => {
    setSelectedSources((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // always keep at least one
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  };

  const handleAutoSelect = () => {
    const focusAreas = config?.focusAreas ?? [];
    if (!focusAreas.length) {
      toast({
        title: "No supervisor focus areas set",
        description: "Set focus areas in your supervisor profile to auto-select sources.",
      });
      return;
    }
    const recommended = recommendSources(focusAreas);
    setSelectedSources(recommended);
    toast({ title: "Sources auto-selected based on your supervisor's discipline" });
  };

  const canSearch =
    topic.trim().length >= 3 && !isSearching && !yearError && selectedSources.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    onSearch({
      topic: topic.trim(),
      phrase: phrase.trim(),
      yearFrom: yearFrom ? parseInt(yearFrom) : null,
      yearTo: yearTo ? parseInt(yearTo) : null,
      sources: selectedSources,
    });
  };

  const handleAddSnippet = () => {
    if (rawText.trim().length < 20) {
      toast({
        title: "Snippet too short",
        description: "Paste at least a sentence or two for a useful snippet.",
        variant: "destructive",
      });
      return;
    }
    const { added, total } = addRawSnippet(rawText, doi);
    if (added) {
      toast({ title: `Snippet added — ${total} in your collection` });
      setRawText("");
      setDoi("");
      setPasteOpen(false);
    }
  };

  const gapProgress = Math.min(items.length, MIN_ITEMS_GAP);
  const gapNeeded = MIN_ITEMS_GAP - gapProgress;

  return (
    <aside className="w-[300px] shrink-0 border-r border-border bg-sidebar flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-border">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-4">
          Search papers
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Topic */}
          <div className="space-y-1.5">
            <Label htmlFor="sp-topic" className="text-xs font-medium text-muted-foreground">
              Research topic <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="sp-topic"
                placeholder="e.g. amyloid-beta synaptic toxicity"
                className="pl-8 text-sm bg-background"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                data-testid="sp-topic"
                aria-required="true"
                aria-describedby={
                  topic.length > 0 && topic.trim().length < 3 ? "topic-error" : undefined
                }
              />
            </div>
            {topic.length > 0 && topic.trim().length < 3 && (
              <p
                id="topic-error"
                role="alert"
                className="text-[11px] text-destructive flex items-center gap-1"
              >
                <AlertCircle className="h-3 w-3" aria-hidden />
                Enter at least 3 characters
              </p>
            )}
          </div>

          {/* Exact phrase */}
          <div className="space-y-1.5">
            <Label htmlFor="sp-phrase" className="text-xs font-medium text-muted-foreground">
              Exact phrase{" "}
              <span className="font-normal text-muted-foreground/60">(optional)</span>
            </Label>
            <Input
              id="sp-phrase"
              placeholder="e.g. tau protein aggregation"
              className="text-sm bg-background"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              data-testid="sp-phrase"
            />
          </div>

          {/* Year range */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Year range
              {config && (
                <span className="ml-1.5 font-normal text-muted-foreground/60">
                  (from supervisor)
                </span>
              )}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1900}
                max={2099}
                placeholder="From"
                className={cn("text-sm bg-background w-full", yearError && "border-destructive")}
                value={yearFrom}
                onChange={(e) => handleYearFromChange(e.target.value)}
                data-testid="sp-year-from"
                aria-label="Year from"
                aria-invalid={!!yearError}
              />
              <span className="text-muted-foreground text-xs shrink-0" aria-hidden>
                –
              </span>
              <Input
                type="number"
                min={1900}
                max={2099}
                placeholder="To"
                className={cn("text-sm bg-background w-full", yearError && "border-destructive")}
                value={yearTo}
                onChange={(e) => handleYearToChange(e.target.value)}
                data-testid="sp-year-to"
                aria-label="Year to"
                aria-invalid={!!yearError}
              />
            </div>
            {yearError && (
              <p role="alert" className="text-[11px] text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" aria-hidden />
                {yearError}
              </p>
            )}
          </div>

          {/* Sources multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Sources</Label>
              {config?.focusAreas?.length ? (
                <button
                  type="button"
                  onClick={handleAutoSelect}
                  title="Auto-select sources based on your supervisor's discipline"
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                >
                  <Wand2 className="h-3 w-3" />
                  Best for my discipline
                </button>
              ) : null}
            </div>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Select search sources"
            >
              {SOURCE_OPTIONS.map((opt) => {
                const active = selectedSources.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleSource(opt.id)}
                    title={opt.tooltip}
                    aria-pressed={active}
                    data-testid={`sp-source-${opt.id}`}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground/60 border-border hover:border-primary/50 hover:text-foreground/80"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              Hover a chip for details. At least one source must be selected.
            </p>
          </div>

          {/* Search button */}
          <Button
            type="submit"
            disabled={!canSearch}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            data-testid="sp-search"
          >
            {isSearching ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Searching papers…
              </span>
            ) : (
              "Search papers"
            )}
          </Button>
        </form>
      </div>

      {/* Gap Finder progress */}
      {gapNeeded > 0 && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">
              {gapProgress}/{MIN_ITEMS_GAP}
            </span>{" "}
            snippets — save {gapNeeded} more to unlock{" "}
            <span className="font-medium text-foreground">Gap Finder</span>
          </p>
          <div
            className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={gapProgress}
            aria-valuemax={MIN_ITEMS_GAP}
          >
            <div
              className="h-full bg-primary/50 rounded-full transition-all duration-500"
              style={{ width: `${(gapProgress / MIN_ITEMS_GAP) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Paste your own snippet */}
      <div className="border-b border-border">
        <button
          type="button"
          onClick={() => setPasteOpen((p) => !p)}
          aria-expanded={pasteOpen}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          data-testid="sp-paste-toggle"
        >
          <ClipboardPaste className="h-4 w-4 text-primary" aria-hidden />
          Paste your own snippet
          {pasteOpen ? (
            <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" aria-hidden />
          )}
        </button>

        {pasteOpen && (
          <div className="px-4 pb-4 space-y-3">
            <Textarea
              placeholder="Paste text from a paper — e.g. an introduction paragraph, methods section, or key finding…"
              className="text-sm min-h-[120px] resize-y bg-background"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              data-testid="sp-paste-text"
              aria-label="Snippet text to paste"
            />
            {rawText.length > 0 && rawText.trim().length < 20 && (
              <p role="alert" className="text-[11px] text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" aria-hidden />
                Paste a full sentence or more
              </p>
            )}
            <div className="relative">
              <Link2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <Input
                placeholder="DOI or URL (optional)"
                className="pl-8 text-sm bg-background"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                data-testid="sp-paste-doi"
                aria-label="DOI or URL for this snippet"
              />
            </div>
            <Button
              onClick={handleAddSnippet}
              disabled={rawText.trim().length < 20}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="sp-paste-add"
            >
              Save snippet to collection
            </Button>
          </div>
        )}
      </div>

      <div className="p-4 flex-1">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Searches up to 8 open-access academic sources simultaneously.
          Supervisor constraints and year filters are applied automatically.
          Results are deduplicated by DOI and title.
        </p>
      </div>
    </aside>
  );
}
