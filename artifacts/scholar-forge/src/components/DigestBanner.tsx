import { useState, useEffect } from "react";
import { Newspaper, X, BookmarkPlus, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCollection } from "@/hooks/useCollection";
import { useToast } from "@/hooks/use-toast";

const DIGEST_TS_KEY = "sf_digest_ts";
const DIGEST_DATA_KEY = "sf_digest_data";
const DIGEST_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface DigestPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  summary: string;
  citedByCount: number;
}

interface DigestData {
  papers: DigestPaper[];
  generatedAt: string;
  query: string;
}

interface DigestBannerProps {
  topics?: string[];
  discipline?: string;
}

export function DigestBanner({ topics = [], discipline }: DigestBannerProps) {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { addRawSnippet } = useCollection();
  const { toast } = useToast();

  useEffect(() => {
    // Check if we should fetch a new digest
    const lastTs = (() => { try { return parseInt(localStorage.getItem(DIGEST_TS_KEY) ?? "0"); } catch { return 0; } })();
    const now = Date.now();

    if (now - lastTs < DIGEST_TTL) {
      // Use cached
      try {
        const cached = localStorage.getItem(DIGEST_DATA_KEY);
        if (cached) setData(JSON.parse(cached));
      } catch { /* ignore */ }
      return;
    }

    if (!topics.length) return;

    setLoading(true);
    fetch("/api/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topics, discipline }),
    })
      .then((r) => r.json())
      .then((d: DigestData) => {
        if (d.papers?.length) {
          setData(d);
          try {
            localStorage.setItem(DIGEST_TS_KEY, String(Date.now()));
            localStorage.setItem(DIGEST_DATA_KEY, JSON.stringify(d));
          } catch { /* ignore */ }
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, []);

  if (dismissed || loading || !data || !data.papers.length) return null;

  const handleSave = (paper: DigestPaper) => {
    addRawSnippet(`${paper.title}\n\n${paper.summary}`, paper.doi ?? paper.url);
    toast({ title: "Added to collection" });
  };

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">New this week</span>
          <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">{data.papers.length} papers</Badge>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-blue-400 hover:text-blue-600 transition-colors"
          aria-label="Dismiss digest"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="divide-y divide-blue-200/60 dark:divide-blue-800/60">
        {data.papers.map((paper) => (
          <div key={paper.id} className="px-4 py-3 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-blue-900 dark:text-blue-100 hover:underline line-clamp-1 flex items-center gap-1"
              >
                {paper.title}
                <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-blue-600 hover:text-blue-800"
                onClick={() => handleSave(paper)}
                title="Add to collection"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {paper.authors.slice(0, 2).join(", ")}{paper.authors.length > 2 ? " et al." : ""}
              {paper.year ? ` · ${paper.year}` : ""}
              {paper.venue ? ` · ${paper.venue}` : ""}
            </p>
            <p className="text-xs text-blue-800/80 dark:text-blue-200/80 leading-relaxed">{paper.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
