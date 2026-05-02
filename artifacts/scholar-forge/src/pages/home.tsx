import { useState } from "react";
import { useRotatingMessage } from "@/hooks/useRotatingMessage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchPanel, type PanelSearchParams } from "@/components/SearchPanel";
import { SnippetCard, SnippetCardSkeleton } from "@/components/SnippetCard";
import {
  useSearchPapers,
  useGetWorkspace,
  useRemoveFromWorkspace,
  useGetWorkspaceStats,
  useGetWorkspaceAnalysis,
  useAddToWorkspace,
  getGetSearchHistoryQueryKey,
  getGetWorkspaceQueryKey,
  getGetWorkspaceStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSupervisor } from "@/hooks/useSupervisor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  ExternalLink,
  BookmarkMinus,
  Sparkles,
  Filter,
  Search,
  BookMarked,
  AlertCircle,
  WifiOff,
} from "lucide-react";
import type { SearchPapersResponse } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"results" | "workspace">("results");
  const [searchResults, setSearchResults] = useState<SearchPapersResponse | null>(null);
  const [searchPhrase, setSearchPhrase] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { config: supervisorConfig } = useSupervisor();

  const searchMutation = useSearchPapers({
    mutation: {
      onSuccess: (data) => {
        setSearchResults(data);
        setSearchError(null);
        setActiveTab("results");
        queryClient.invalidateQueries({ queryKey: getGetSearchHistoryQueryKey() });
      },
      onError: (err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : "Something went wrong while searching. Check your connection and try again.";
        setSearchError(msg);
        setSearchResults(null);
      },
    },
  });

  const handleSearch = (params: PanelSearchParams) => {
    setSearchPhrase(params.phrase);
    setSearchError(null);
    searchMutation.mutate({
      data: {
        query: params.topic,
        topic: params.topic,
        phrase: params.phrase || null,
        source: params.source === "both" ? "both" : params.source,
        yearFrom: params.yearFrom,
        yearTo: params.yearTo,
        maxResults: 10,
      },
    });
  };

  return (
    <div className="flex h-full w-full">
      <SearchPanel onSearch={handleSearch} isSearching={searchMutation.isPending} />

      <main className="flex-1 overflow-hidden bg-background flex flex-col">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "results" | "workspace")}
          className="h-full flex flex-col"
        >
          <div className="border-b border-border bg-card px-6 py-2 flex items-center justify-between shrink-0">
            <TabsList className="bg-muted">
              <TabsTrigger value="results" className="data-[state=active]:bg-background">
                <Search className="h-4 w-4 mr-2" />
                Results
              </TabsTrigger>
              <TabsTrigger value="workspace" className="data-[state=active]:bg-background">
                <BookMarked className="h-4 w-4 mr-2" />
                Workspace
              </TabsTrigger>
            </TabsList>

            {/* Status chips */}
            <div className="flex items-center gap-2">
              {searchResults?.semanticRateLimited && (
                <Badge
                  variant="outline"
                  className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]"
                  title="Semantic Scholar is temporarily rate-limited. Showing PubMed results only."
                >
                  <WifiOff className="h-2.5 w-2.5 mr-1" />
                  S2 rate-limited · PubMed only
                </Badge>
              )}
              {searchResults?.sources?.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className={
                    s === "pubmed"
                      ? "text-blue-700 border-blue-300 bg-blue-50 text-[10px]"
                      : "text-violet-700 border-violet-300 bg-violet-50 text-[10px]"
                  }
                >
                  {s === "pubmed" ? "PubMed" : "Semantic Scholar"}
                </Badge>
              ))}
              {activeTab === "results" && searchResults?.supervisorFiltered && (
                <Badge
                  variant="outline"
                  className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[10px]"
                >
                  <Sparkles className="h-2.5 w-2.5 mr-1" />
                  Supervisor Filtered
                </Badge>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="results" className="m-0 data-[state=inactive]:hidden">
              <ResultsView
                results={searchResults}
                isSearching={searchMutation.isPending}
                searchPhrase={searchPhrase}
                searchError={searchError}
                supervisorConfig={supervisorConfig}
              />
            </TabsContent>

            <TabsContent value="workspace" className="m-0 data-[state=inactive]:hidden">
              <WorkspaceView />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}

// ─── Results view ──────────────────────────────────────────────────────────
const SEARCH_MESSAGES = [
  "Searching 4 million open-access papers…",
  "Extracting relevant passages…",
  "Checking supervisor rules…",
];

function ResultsView({
  results,
  isSearching,
  searchPhrase,
  searchError,
  supervisorConfig,
}: {
  results: SearchPapersResponse | null;
  isSearching: boolean;
  searchPhrase: string;
  searchError: string | null;
  supervisorConfig: ReturnType<typeof useSupervisor>["config"];
}) {
  const searchMessage = useRotatingMessage(SEARCH_MESSAGES, 2000);

  // Loading skeleton
  if (isSearching) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <SnippetCardSkeleton />
        <SnippetCardSkeleton />
        <SnippetCardSkeleton />
        <p className="text-center text-sm text-muted-foreground mt-2 animate-pulse">
          {searchMessage}
        </p>
      </div>
    );
  }

  // Error state
  if (searchError) {
    return (
      <div className="max-w-md mx-auto h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="font-serif text-xl text-foreground">Search failed</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {searchError.includes("rate")
            ? "You've hit the rate limit. Please wait a moment before searching again."
            : searchError.includes("network") || searchError.includes("fetch")
            ? "Could not reach the search servers. Check your connection and try again."
            : searchError}
        </p>
      </div>
    );
  }

  // Empty state (no search yet)
  if (!results) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
        <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
          <BookOpen className="h-8 w-8 text-emerald-700" />
        </div>
        <h2 className="font-serif text-2xl text-foreground">ScholarForge</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Enter a topic in the sidebar to search PubMed and Semantic Scholar.
          Supervisor constraints and year range filters are applied automatically.
        </p>
      </div>
    );
  }

  // No results found
  if (results.papers.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
        <Filter className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="font-serif text-xl text-foreground">No papers found</h2>
        <p className="text-muted-foreground text-sm">
          Try broadening the topic, relaxing the year range, or switching to
          "Both" sources.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <p className="text-sm text-muted-foreground mb-5">
        <span className="font-medium text-foreground">{results.total}</span>{" "}
        result{results.total !== 1 ? "s" : ""} for "
        <span className="font-medium text-foreground">{results.query}</span>"
      </p>

      <div className="space-y-4">
        {results.papers.map((paper) => (
          <SnippetCard
            key={paper.id}
            paper={paper}
            searchPhrase={searchPhrase}
            supervisorConfig={supervisorConfig}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Workspace view (unchanged) ─────────────────────────────────────────────
function WorkspaceView() {
  const { data: papers, isLoading: isLoadingPapers } = useGetWorkspace();
  const { data: stats, isLoading: isLoadingStats } = useGetWorkspaceStats();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const {
    data: analysis,
    isLoading: isLoadingAnalysis,
    refetch: fetchAnalysis,
  } = useGetWorkspaceAnalysis({ query: { enabled: false } });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const addToWorkspace = useAddToWorkspace({
    mutation: {
      onSuccess: () => {
        toast({ title: "Added to workspace" });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey() });
      },
    },
  });

  const removeFromWorkspace = useRemoveFromWorkspace({
    mutation: {
      onSuccess: () => {
        toast({ title: "Removed from workspace" });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey() });
      },
    },
  });

  if (isLoadingPapers || isLoadingStats) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 p-8" aria-live="polite" aria-label="Loading workspace">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
              <div className="h-3.5 rounded w-1/2 sf-shimmer" />
              <div className="h-8 rounded w-1/3 sf-shimmer" />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="h-5 rounded w-3/4 sf-shimmer" />
            <div className="h-4 rounded w-1/2 sf-shimmer" />
            <div className="h-3 rounded w-full sf-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (!papers || papers.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
        <BookMarked className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="font-serif text-xl text-foreground">
          Your workspace is empty
        </h2>
        <p className="text-muted-foreground text-sm">
          Save papers from search results to organise your research and run
          AI analysis across your collection.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Papers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-serif text-emerald-700">
                {stats.totalPapers}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Year Range
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-serif text-foreground">
                {stats.yearRange.min || "N/A"} – {stats.yearRange.max || "N/A"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 border-emerald-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-700">
                AI Research Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => {
                  setAnalysisOpen(true);
                  fetchAnalysis();
                }}
                data-testid="button-analyze"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Analyse Collection
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {analysisOpen && (
        <Card className="border-emerald-200 bg-emerald-50/30 shadow-md">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-700" />
              Research Collection Analysis
            </CardTitle>
            <CardDescription>
              AI-generated insights based on your {papers.length} saved papers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAnalysis || !analysis ? (
              <div className="space-y-4 animate-pulse">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-sm text-foreground/80 uppercase tracking-wider mb-2">
                    Summary
                  </h4>
                  <p className="text-sm text-foreground leading-relaxed">
                    {analysis.summary}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-sm text-emerald-700 uppercase tracking-wider mb-2">
                      Key Themes
                    </h4>
                    <ul className="space-y-1">
                      {analysis.themes.map((theme: string, i: number) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-emerald-600 mt-0.5">•</span>
                          {theme}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-amber-600 uppercase tracking-wider mb-2">
                      Research Gaps
                    </h4>
                    <ul className="space-y-1">
                      {analysis.gaps.map((gap: string, i: number) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-amber-600 mt-0.5">•</span>
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnalysisOpen(false)}
            >
              Close
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="space-y-4">
        <h3 className="font-serif text-xl border-b border-border pb-2">
          Saved Papers
        </h3>

        {papers.map((paper) => (
          <Card key={paper.id} className="group">
            <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <h4
                  className="font-serif text-lg font-medium leading-tight"
                  style={{ fontFamily: "Lora, Georgia, serif" }}
                >
                  {paper.url ? (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline text-foreground inline-flex items-center gap-1.5 group/link"
                    >
                      {paper.title}
                      <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover/link:opacity-40 transition-opacity" />
                    </a>
                  ) : (
                    paper.title
                  )}
                </h4>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    {paper.authors.slice(0, 3).join(", ")}
                    {paper.authors.length > 3 ? " et al." : ""}
                  </span>
                  {paper.year && <span>· {paper.year}</span>}
                  {paper.venue && (
                    <span className="font-medium text-foreground/70">
                      · {paper.venue}
                    </span>
                  )}
                </div>
                {paper.abstract && (
                  <p className="text-sm text-foreground/80 line-clamp-2 mt-2">
                    {paper.abstract}
                  </p>
                )}
              </div>
              <div className="shrink-0 flex items-start">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeFromWorkspace.mutate({ id: paper.id })}
                  title="Remove from workspace"
                  data-testid={`button-remove-${paper.id}`}
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
