import { useState } from "react";
import { ChevronDown, ChevronRight, Search, ClipboardPaste, Link2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSupervisor } from "@/hooks/useSupervisor";
import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/hooks/useCollection";

export type SearchSource = "pubmed" | "both" | "semantic";

export interface PanelSearchParams {
  topic: string;
  phrase: string;
  yearFrom: number | null;
  yearTo: number | null;
  source: SearchSource;
}

interface SearchPanelProps {
  onSearch: (params: PanelSearchParams) => void;
  isSearching: boolean;
}

const SOURCE_OPTIONS: { value: SearchSource; label: string; hint: string }[] = [
  { value: "pubmed",   label: "PubMed",          hint: "Open access full text" },
  { value: "both",     label: "Both",             hint: "Recommended" },
  { value: "semantic", label: "Semantic Scholar", hint: "Broader coverage" },
];

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
  const [source, setSource] = useState<SearchSource>("both");
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

  const canSearch = topic.trim().length >= 3 && !isSearching && !yearError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    onSearch({
      topic: topic.trim(),
      phrase: phrase.trim(),
      yearFrom: yearFrom ? parseInt(yearFrom) : null,
      yearTo: yearTo ? parseInt(yearTo) : null,
      source,
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
                aria-describedby={topic.length > 0 && topic.trim().length < 3 ? "topic-error" : undefined}
              />
            </div>
            {topic.length > 0 && topic.trim().length < 3 && (
              <p id="topic-error" role="alert" className="text-[11px] text-destructive flex items-center gap-1">
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
              <span className="text-muted-foreground text-xs shrink-0" aria-hidden>–</span>
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

          {/* Source toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Source</Label>
            <div className="flex gap-1 flex-wrap" role="group" aria-label="Search source">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSource(opt.value)}
                  title={opt.hint}
                  aria-pressed={source === opt.value}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                    source === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground/70 border-border hover:border-primary/60 hover:text-primary"
                  )}
                  data-testid={`sp-source-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
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
            <span className="font-medium text-foreground">{gapProgress}/{MIN_ITEMS_GAP}</span> snippets
            {" "}— save {gapNeeded} more to unlock{" "}
            <span className="font-medium text-foreground">Gap Finder</span>
          </p>
          <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={gapProgress} aria-valuemax={MIN_ITEMS_GAP}>
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
          Searches PubMed (open access full text) and Semantic Scholar.
          Supervisor constraints and year filters are applied automatically.
        </p>
      </div>
    </aside>
  );
}
