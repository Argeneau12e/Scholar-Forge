import { useState } from "react";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  BookmarkCheck,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/hooks/useCollection";
import { ParaphrasePanel } from "@/components/ParaphrasePanel";
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

// ─── Main card ───────────────────────────────────────────────────────────────
export function SnippetCard({
  paper,
  searchPhrase = "",
  supervisorConfig,
}: SnippetCardProps) {
  const { toast } = useToast();
  const { addFromPaper, isInCollection } = useCollection();

  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [paraphraseOpen, setParaphraseOpen] = useState(false);

  const saved = isInCollection(paper.id);
  const compliance = getCompliance(paper, supervisorConfig);

  // Pick the best text to send to the paraphrase panel
  const paraphraseText =
    paper.snippets && paper.snippets.length > 0
      ? paper.snippets[0].text
      : paper.abstract ?? "";

  const handleSave = () => {
    const { added, total } = addFromPaper(paper);
    if (added) {
      toast({ title: `Added to your collection (${total} total)` });
    } else {
      toast({ title: "Already in your collection" });
    }
  };

  return (
    <>
      <article
        className={cn(
          "rounded-xl border bg-card p-5 space-y-3 transition-shadow hover:shadow-md",
          compliance.level === "red" && "border-red-200"
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

            {paper.source === "pubmed" ? (
              <Badge
                variant="outline"
                className="text-blue-700 border-blue-200 bg-blue-50 text-[10px]"
              >
                PMC
              </Badge>
            ) : paper.source === "semantic" ? (
              <Badge
                variant="outline"
                className="text-violet-700 border-violet-200 bg-violet-50 text-[10px]"
              >
                S2
              </Badge>
            ) : null}
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
            {paper.snippets.map((sn, i) => (
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
        <div className="flex items-center gap-2 pt-1">
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
                Save to collection
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
    </>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
export function SnippetCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3 animate-pulse">
      <div className="space-y-2">
        <div className="h-5 bg-muted rounded w-4/5" />
        <div className="h-5 bg-muted rounded w-3/5" />
        <div className="h-3.5 bg-muted rounded w-1/3 mt-1" />
      </div>
      <div className="h-2 bg-muted rounded w-20" />
      <div className="space-y-1.5">
        <div className="h-3.5 bg-muted rounded" />
        <div className="h-3.5 bg-muted rounded w-5/6" />
      </div>
      <div className="h-16 bg-muted/60 rounded-lg" />
      <div className="flex gap-2 pt-1">
        <div className="h-8 bg-muted rounded w-32" />
        <div className="h-8 bg-muted rounded w-36" />
      </div>
    </div>
  );
}
