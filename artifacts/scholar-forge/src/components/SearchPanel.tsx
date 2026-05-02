import { useState } from "react";
import { ChevronDown, ChevronRight, Search, ClipboardPaste, Link2 } from "lucide-react";
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

const SOURCE_OPTIONS: { value: SearchSource; label: string }[] = [
  { value: "pubmed", label: "PubMed" },
  { value: "both", label: "Both" },
  { value: "semantic", label: "Semantic Scholar" },
];

export function SearchPanel({ onSearch, isSearching }: SearchPanelProps) {
  const { config } = useSupervisor();
  const { toast } = useToast();
  const { addRawSnippet } = useCollection();

  const [topic, setTopic] = useState("");
  const [phrase, setPhrase] = useState("");
  const [yearFrom, setYearFrom] = useState<string>(
    config?.yearFrom?.toString() ?? "2020"
  );
  const [yearTo, setYearTo] = useState<string>(
    config?.yearTo?.toString() ?? "2025"
  );
  const [source, setSource] = useState<SearchSource>("both");

  const [pasteOpen, setPasteOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [doi, setDoi] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    onSearch({
      topic: topic.trim(),
      phrase: phrase.trim(),
      yearFrom: yearFrom ? parseInt(yearFrom) : null,
      yearTo: yearTo ? parseInt(yearTo) : null,
      source,
    });
  };

  const handleAddSnippet = () => {
    if (!rawText.trim()) {
      toast({ title: "Paste some text first", variant: "destructive" });
      return;
    }
    const { added, total } = addRawSnippet(rawText, doi);
    if (added) {
      toast({ title: `Added to your collection (${total} total)` });
      setRawText("");
      setDoi("");
      setPasteOpen(false);
    }
  };

  return (
    <aside className="w-[280px] shrink-0 border-r border-border bg-sidebar flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-border">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/60 mb-4">
          Search
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Topic */}
          <div className="space-y-1.5">
            <Label
              htmlFor="sp-topic"
              className="text-xs font-medium text-sidebar-foreground/70"
            >
              Research topic
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
              />
            </div>
          </div>

          {/* Exact phrase */}
          <div className="space-y-1.5">
            <Label
              htmlFor="sp-phrase"
              className="text-xs font-medium text-sidebar-foreground/70"
            >
              Exact phrase{" "}
              <span className="font-normal text-muted-foreground/60">
                (optional)
              </span>
            </Label>
            <Input
              id="sp-phrase"
              placeholder="exact phrase to find inside papers"
              className="text-sm bg-background"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              data-testid="sp-phrase"
            />
          </div>

          {/* Year range */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-sidebar-foreground/70">
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
                className="text-sm bg-background w-full"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                data-testid="sp-year-from"
              />
              <span className="text-muted-foreground text-xs shrink-0">–</span>
              <Input
                type="number"
                min={1900}
                max={2099}
                placeholder="To"
                className="text-sm bg-background w-full"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                data-testid="sp-year-to"
              />
            </div>
          </div>

          {/* Source toggle: radio pills */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-sidebar-foreground/70">
              Source
            </Label>
            <div className="flex gap-1 flex-wrap">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSource(opt.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                    source === opt.value
                      ? "bg-emerald-700 text-white border-emerald-700"
                      : "bg-background text-foreground/70 border-border hover:border-emerald-600 hover:text-emerald-700"
                  )}
                  data-testid={`sp-source-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search button — deep mint full-width */}
          <Button
            type="submit"
            disabled={!topic.trim() || isSearching}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium"
            data-testid="sp-search"
          >
            {isSearching ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
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
                Searching…
              </span>
            ) : (
              "Search"
            )}
          </Button>
        </form>
      </div>

      {/* Paste your own snippet expander */}
      <div className="border-b border-border">
        <button
          type="button"
          onClick={() => setPasteOpen((p) => !p)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-sidebar-foreground/80 hover:text-foreground hover:bg-muted/30 transition-colors"
          data-testid="sp-paste-toggle"
        >
          <ClipboardPaste className="h-4 w-4 text-emerald-700" />
          Paste your own snippet
          {pasteOpen ? (
            <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
          )}
        </button>

        {pasteOpen && (
          <div className="px-4 pb-4 space-y-3">
            <Textarea
              placeholder="Paste raw text from a paper — introduction, methods, conclusion…"
              className="text-sm min-h-[120px] resize-y bg-background"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              data-testid="sp-paste-text"
            />
            <div className="relative">
              <Link2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="DOI (optional)"
                className="pl-8 text-sm bg-background"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                data-testid="sp-paste-doi"
              />
            </div>
            <Button
              onClick={handleAddSnippet}
              disabled={!rawText.trim()}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
              data-testid="sp-paste-add"
            >
              Add to collection
            </Button>
          </div>
        )}
      </div>

      <div className="p-4 flex-1">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Results are pulled from PubMed (open access full text) and Semantic
          Scholar. Supervisor constraints are applied automatically.
        </p>
      </div>
    </aside>
  );
}
