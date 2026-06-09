import { apiFetch } from "@/lib/apiFetch";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  BookmarkCheck,
  Sparkles,
  AlertTriangle,
  Quote,
  Share2,
  MessageSquareQuote,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCollection, type CollectionItem } from "@/hooks/useCollection";
import { ParaphrasePanel } from "@/components/ParaphrasePanel";
import { CitationDisplay } from "@/components/CitationDisplay";
import type { Paper } from "@workspace/api-client-react/src/generated/api.schemas";
import type { SupervisorConfig } from "@/hooks/useSupervisor";

interface SnippetCardProps {
  paper: Paper;
  searchPhrase?: string;
  supervisorConfig: SupervisorConfig | null;
}

// ─── Phrase highlight helper ─────────────────────────────────────────────────
function highlightText(text: string, phrase: string): React.ReactNode {
  if (!phrase.trim()) return text;

  const words = phrase
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (words.length === 0) return text;

  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark
            key={i}
            className="bg-emerald-100 text-emerald-900 font-semibold rounded-sm px-0.5 not-italic"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Source badge ────────────────────────────────────────────────────────────
const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  pubmed:    { label: "PMC",          className: "text-blue-700 border-blue-200 bg-blue-50" },
  semantic:  { label: "S2",           className: "text-violet-700 border-violet-200 bg-violet-50" },
  openalex:  { label: "OpenAlex",     className: "text-emerald-700 border-emerald-200 bg-emerald-50" },
  europepmc: { label: "Europe PMC",   className: "text-cyan-700 border-cyan-200 bg-cyan-50" },
  core:      { label: "CORE",         className: "text-amber-700 border-amber-200 bg-amber-50" },
  arxiv:     { label: "arXiv",        className: "text-red-700 border-red-200 bg-red-50" },
  doaj:      { label: "DOAJ",         className: "text-pink-700 border-pink-200 bg-pink-50" },
  base:      { label: "BASE",         className: "text-indigo-700 border-indigo-200 bg-indigo-50" },
};

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const cfg = SOURCE_BADGE[source];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className={cn(cfg.className, "text-[10px]")}>
      {cfg.label}
    </Badge>
  );
}

// ─── Compliance logic ────────────────────────────────────────────────────────
type ComplianceLevel = "green" | "yellow" | "red";

interface Compliance {
  level: ComplianceLevel;
  label: string;
  outsideRange: boolean;
}

function getCompliance(
  paper: Paper,
  config: SupervisorConfig | null
): Compliance {
  if (!config) {
    return { level: "green", label: "No constraints set", outsideRange: false };
  }

  const { yearFrom, yearTo, preferredJournals } = config;
  const year = paper.year;
  const yearKnown = year != null;
  const yearInRange = yearKnown && year >= yearFrom && year <= yearTo;

  if (yearKnown && !yearInRange) {
    return {
      level: "red",
      label: `Outside your ${yearFrom}–${yearTo} window`,
      outsideRange: true,
    };
  }

  const journals = preferredJournals ?? [];
  if (journals.length === 0 || !paper.venue) {
    return {
      level: "green",
      label: yearKnown ? `Within ${yearFrom}–${yearTo}` : "Year unknown",
      outsideRange: false,
    };
  }

  const venueNorm = paper.venue.toLowerCase();
  const journalMatch = journals.some((j) =>
    venueNorm.includes(j.toLowerCase())
  );

  return journalMatch
    ? { level: "green", label: "Preferred journal · year in range", outsideRange: false }
    : { level: "yellow", label: "Year in range · journal not in preferred list", outsideRange: false };
}

function ComplianceDot({
  level,
  label,
}: {
  level: ComplianceLevel;
  label: string;
}) {
  const colors: Record<ComplianceLevel, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-400",
    red: "bg-red-500",
  };
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      title={label}
    >
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full shrink-0",
          colors[level]
        )}
      />
      {label}
    </span>
  );
}

// ─── Citation Context Dialog ─────────────────────────────────────────────────
interface CiteContextData {
  total: number;
  analyzed: number;
  supporting: number;
  contrasting: number;
  mentioning: number;
  contexts: Array<{
    id: string;
    title: string;
    year: number | null;
    url: string;
    context: string;
    contextType: "supporting" | "contrasting" | "mentioning";
  }>;
}

function CiteContextDialog({
  open,
  onOpenChange,
  doi,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doi: string;
  title: string;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CiteContextData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchContext = async () => {
    if (fetched) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/citecontext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi, title }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setData(await res.json());
      setFetched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (o: boolean) => {
    onOpenChange(o);
    if (o) fetchContext();
  };

  const ctxColor: Record<string, string> = {
    supporting: "text-emerald-700 bg-emerald-50 border-emerald-200",
    contrasting: "text-red-700 bg-red-50 border-red-200",
    mentioning: "text-muted-foreground bg-muted border-border",
  };

  const ctxIcon: Record<string, React.ReactNode> = {
    supporting: <ThumbsUp className="h-3 w-3" />,
    contrasting: <ThumbsDown className="h-3 w-3" />,
    mentioning: <Minus className="h-3 w-3" />,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif text-base leading-snug">
            How is this paper cited?
          </DialogTitle>
          <p className="text-xs text-muted-foreground line-clamp-1">{title}</p>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center py-4">{error}</p>
        )}

        {data && !loading && (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Summary counts */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { count: data.supporting, label: "Supporting", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                { count: data.contrasting, label: "Contrasting", color: "text-red-700 bg-red-50 border-red-200" },
                { count: data.mentioning, label: "Mentioning", color: "text-muted-foreground bg-muted border-border" },
              ].map((item) => (
                <div key={item.label} className={cn("rounded-xl border p-3", item.color)}>
                  <p className="text-2xl font-bold font-serif">{item.count}</p>
                  <p className="text-[11px]">{item.label}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Cited {data.total} times in OpenAlex · {data.analyzed} analysed
            </p>

            {/* Context list */}
            <div className="space-y-2">
              {data.contexts.map((ctx) => (
                <div key={ctx.id} className={cn("rounded-lg border p-3 space-y-1", ctxColor[ctx.contextType])}>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                    {ctxIcon[ctx.contextType]}
                    {ctx.contextType}
                  </div>
                  <a href={ctx.url} target="_blank" rel="noreferrer" className="text-xs font-medium hover:underline line-clamp-1">
                    {ctx.title}{ctx.year ? ` (${ctx.year})` : ""}
                  </a>
                  <p className="text-xs opacity-80 leading-relaxed">{ctx.context}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main card ───────────────────────────────────────────────────────────────
export function SnippetCard({
  paper,
  searchPhrase = "",
  supervisorConfig,
}: SnippetCardProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { addFromPaper, addFromPaperForce, isInCollection } = useCollection();

  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [paraphraseOpen, setParaphraseOpen] = useState(false);
  const [citeOpen, setCiteOpen] = useState(false);
  const [citeContextOpen, setCiteContextOpen] = useState(false);
  const [duplicatePaper, setDuplicatePaper] = useState<CollectionItem | null>(null);

  const saved = isInCollection(paper.id);
  const compliance = getCompliance(paper, supervisorConfig);

  const paraphraseText =
    paper.snippets && paper.snippets.length > 0
      ? paper.snippets[0].text
      : paper.abstract ?? "";

  const paperDoi = (paper as unknown as { doi?: string | null }).doi ?? null;

  const handleSave = () => {
    const result = addFromPaper(paper);
    if (result.added) {
      toast({ title: `Added to your collection (${result.total} total)` });
    } else if (result.duplicate) {
      setDuplicatePaper(result.duplicate);
    } else {
      toast({ title: "Already in your collection" });
    }
  };

  const handleForceAdd = () => {
    const { total } = addFromPaperForce(paper);
    setDuplicatePaper(null);
    toast({ title: `Added another snippet (${total} total)` });
  };

  const handleConnectedPapers = () => {
    const doi = paperDoi;
    if (doi) {
      navigate(`/papergraph?doi=${encodeURIComponent(doi)}`);
    } else {
      navigate(`/papergraph?title=${encodeURIComponent(paper.title)}`);
    }
  };

  return (
    <>
      <article
        className={cn(
          "rounded-xl bg-card p-5 space-y-3",
          "border border-l-4 transition-all duration-200 hover:-translate-y-px hover:shadow-md",
          compliance.level === "red"    ? "border-l-red-500"     :
          compliance.level === "yellow" ? "border-l-amber-400"   :
                                          "border-l-emerald-500"
        )}
        data-testid={`snippet-card-${paper.id}`}
      >
        {/* Outside-range banner */}
        {compliance.outsideRange && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Outside your {supervisorConfig?.yearFrom}–{supervisorConfig?.yearTo}{" "}
            window
          </div>
        )}

        {/* Title + badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5 flex-1">
            {paper.url ? (
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="font-serif text-[16px] leading-snug text-primary hover:underline inline-flex items-start gap-1.5 group"
                style={{ fontFamily: "Lora, Georgia, serif" }}
                data-testid={`card-title-${paper.id}`}
              >
                <span>{paper.title}</span>
                <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
              </a>
            ) : (
              <p
                className="font-serif text-[16px] leading-snug text-foreground"
                style={{ fontFamily: "Lora, Georgia, serif" }}
              >
                {paper.title}
              </p>
            )}

            <p className="text-[13px] text-muted-foreground leading-tight">
              {paper.authors.slice(0, 3).join(", ")}
              {paper.authors.length > 3 ? " et al." : ""}
              {paper.year && <> · {paper.year}</>}
              {paper.venue && (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-medium text-foreground/70">
                    {paper.venue}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {paper.openAccess === true ? (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-medium hover:bg-emerald-50">
                Open Access
              </Badge>
            ) : paper.openAccess === false ? (
              <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-medium hover:bg-amber-50">
                Paywalled
              </Badge>
            ) : null}

            <SourceBadge source={paper.source ?? null} />
            {(paper as unknown as { isPreprint?: boolean }).isPreprint && (
              <Badge
                variant="outline"
                className="text-orange-700 border-orange-200 bg-orange-50 text-[10px]"
                title="This is a preprint and has not been peer-reviewed"
              >
                Preprint
              </Badge>
            )}
            {(paper as unknown as { freePdfUrl?: string | null }).freePdfUrl && (
              <a
                href={(paper as unknown as { freePdfUrl: string }).freePdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-300 bg-emerald-50 rounded-full px-2 py-0.5 hover:bg-emerald-100 transition-colors"
                title="Free full-text PDF via Unpaywall"
              >
                Free PDF ↗
              </a>
            )}
          </div>
        </div>

        {/* Compliance indicator */}
        <ComplianceDot level={compliance.level} label={compliance.label} />

        {/* Abstract (expandable) */}
        {paper.abstract && (
          <div>
            <p
              className={cn(
                "text-sm text-foreground/80 leading-relaxed",
                !abstractExpanded && "line-clamp-2"
              )}
            >
              {paper.abstract}
            </p>
            {paper.abstract.length > 200 && (
              <button
                onClick={() => setAbstractExpanded((v) => !v)}
                className="mt-1 text-[11px] text-emerald-700 hover:underline flex items-center gap-0.5"
              >
                {abstractExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" /> Show more
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Matched snippets with highlighted phrase */}
        {paper.snippets && paper.snippets.length > 0 && (
          <div className="space-y-2">
            {(paper.snippets as Array<{ section?: string; matchScore: number; text: string }>).map((sn, i) => (
              <div
                key={i}
                className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-sm text-emerald-900 leading-relaxed"
                data-testid={`snippet-${paper.id}-${i}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                    {sn.section}
                  </span>
                  {sn.matchScore > 0 && (
                    <span className="text-[10px] text-emerald-600">
                      {sn.matchScore} match{sn.matchScore !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>
                <p>{highlightText(sn.text, searchPhrase)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5"
            onClick={() => setParaphraseOpen(true)}
            disabled={!paraphraseText}
            data-testid={`btn-paraphrase-${paper.id}`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Paraphrase this
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setCiteOpen(true)}
            data-testid={`btn-cite-${paper.id}`}
          >
            <Quote className="h-3.5 w-3.5" />
            Cite
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleConnectedPapers}
            title="See papers in the same citation network"
          >
            <Share2 className="h-3.5 w-3.5" />
            Connected Papers
          </Button>

          {paperDoi && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setCiteContextOpen(true)}
              title="How do other papers cite this one?"
            >
              <MessageSquareQuote className="h-3.5 w-3.5" />
              How cited?
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={saved}
            onClick={handleSave}
            className={cn(
              "gap-1.5",
              saved && "text-emerald-700 border-emerald-300 bg-emerald-50"
            )}
            data-testid={`btn-save-${paper.id}`}
          >
            {saved ? (
              <>
                <BookmarkCheck className="h-3.5 w-3.5" />
                Saved
              </>
            ) : (
              <>
                <BookmarkPlus className="h-3.5 w-3.5" />
                Save
              </>
            )}
          </Button>
        </div>
      </article>

      {/* Paraphrase panel */}
      <ParaphrasePanel
        paper={paper}
        text={paraphraseText}
        open={paraphraseOpen}
        onOpenChange={setParaphraseOpen}
      />

      {/* Citation panel */}
      <CitationDisplay
        paper={paper}
        open={citeOpen}
        onOpenChange={setCiteOpen}
      />

      {/* Citation Context dialog */}
      {paperDoi && (
        <CiteContextDialog
          open={citeContextOpen}
          onOpenChange={setCiteContextOpen}
          doi={paperDoi}
          title={paper.title}
        />
      )}

      {/* Duplicate detection modal */}
      <Dialog
        open={!!duplicatePaper}
        onOpenChange={(o) => !o && setDuplicatePaper(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-base leading-snug">
              Already in your collection
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You already have{" "}
            <span className="font-medium text-foreground">
              "{duplicatePaper?.title}"
            </span>{" "}
            in your collection. Add another snippet from this paper or cancel?
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white flex-1"
              onClick={handleForceAdd}
            >
              Add another snippet
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setDuplicatePaper(null)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
export function SnippetCardSkeleton() {
  return (
    <div className="rounded-xl border border-l-4 border-l-muted bg-card p-5 space-y-3">
      <div className="space-y-2">
        <div className="h-5 rounded w-4/5 sf-shimmer" />
        <div className="h-5 rounded w-3/5 sf-shimmer" />
        <div className="h-3.5 rounded w-1/3 mt-1 sf-shimmer" />
      </div>
      <div className="h-2 rounded w-20 sf-shimmer" />
      <div className="space-y-1.5">
        <div className="h-3.5 rounded sf-shimmer" />
        <div className="h-3.5 rounded w-5/6 sf-shimmer" />
      </div>
      <div className="h-16 rounded-lg sf-shimmer" />
      <div className="flex gap-2 pt-1">
        <div className="h-8 rounded w-32 sf-shimmer" />
        <div className="h-8 rounded w-36 sf-shimmer" />
      </div>
    </div>
  );
}
