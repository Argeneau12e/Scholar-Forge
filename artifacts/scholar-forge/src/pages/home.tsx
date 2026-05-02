import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sidebar, type SearchParams } from "@/components/sidebar";
import {
  useSearchPapers,
  useGetActiveSupervisor,
  useGetWorkspace,
  useAddToWorkspace,
  useRemoveFromWorkspace,
  useGetWorkspaceStats,
  useGetWorkspaceAnalysis,
  getGetSearchHistoryQueryKey,
  getGetWorkspaceQueryKey,
  getGetWorkspaceStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  BookmarkPlus,
  BookmarkMinus,
  Sparkles,
  Filter,
  Calendar,
  Users,
  BarChart3,
  Search,
  BookMarked,
  FileText,
  FlaskConical,
  Globe,
} from "lucide-react";
import type {
  Paper,
  SearchPapersResponse,
} from "@workspace/api-client-react/src/generated/api.schemas";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"results" | "workspace">(
    "results"
  );
  const [searchResults, setSearchResults] =
    useState<SearchPapersResponse | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: activeSupervisorData } = useGetActiveSupervisor();
  const activeSupervisorId = activeSupervisorData?.supervisor?.id;

  const searchMutation = useSearchPapers({
    mutation: {
      onSuccess: (data) => {
        setSearchResults(data);
        setActiveTab("results");
        queryClient.invalidateQueries({
          queryKey: getGetSearchHistoryQueryKey(),
        });
      },
      onError: () => {
        toast({
          title: "Search failed",
          description: "An error occurred while searching. Try again shortly.",
          variant: "destructive",
        });
      },
    },
  });

  const handleSearch = (params: SearchParams) => {
    searchMutation.mutate({
      data: {
        query: params.query,
        topic: params.query,
        phrase: params.phrase ?? null,
        source: params.source ?? "both",
        yearFrom: params.yearFrom ?? null,
        yearTo: params.yearTo ?? null,
        maxResults: params.maxResults,
        supervisorId: activeSupervisorId,
      },
    });
  };

  return (
    <div className="flex h-full w-full">
      <Sidebar onSearch={handleSearch} isSearching={searchMutation.isPending} />

      <main className="flex-1 overflow-hidden bg-background flex flex-col">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "results" | "workspace")}
          className="h-full flex flex-col"
        >
          <div className="border-b border-border bg-card px-6 py-2 flex items-center justify-between">
            <TabsList className="bg-muted">
              <TabsTrigger
                value="results"
                className="data-[state=active]:bg-background"
              >
                <Search className="h-4 w-4 mr-2" />
                Results
              </TabsTrigger>
              <TabsTrigger
                value="workspace"
                className="data-[state=active]:bg-background"
              >
                <BookMarked className="h-4 w-4 mr-2" />
                Workspace
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              {searchResults?.semanticRateLimited && (
                <Badge
                  variant="outline"
                  className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]"
                  title="Semantic Scholar is temporarily rate-limited. Showing PubMed results only."
                >
                  S2 rate-limited · PubMed only
                </Badge>
              )}
              {searchResults?.sources && searchResults.sources.length > 0 && (
                <div className="flex items-center gap-1">
                  {searchResults.sources.map((s) => (
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
                </div>
              )}
              {activeTab === "results" && searchResults?.supervisorFiltered && (
                <Badge
                  variant="outline"
                  className="text-primary border-primary/20 bg-primary/5"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Supervisor Filtered
                </Badge>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent
              value="results"
              className="h-full m-0 data-[state=inactive]:hidden"
            >
              <ResultsView
                results={searchResults}
                isSearching={searchMutation.isPending}
              />
            </TabsContent>

            <TabsContent
              value="workspace"
              className="h-full m-0 data-[state=inactive]:hidden"
            >
              <WorkspaceView />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}

function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null;
  if (source === "pubmed") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 font-medium">
        <Globe className="h-2.5 w-2.5" />
        PMC
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 font-medium">
      <FlaskConical className="h-2.5 w-2.5" />
      S2
    </span>
  );
}

function ResultsView({
  results,
  isSearching,
}: {
  results: SearchPapersResponse | null;
  isSearching: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: workspacePapers } = useGetWorkspace();
  const workspacePaperIds = new Set(
    workspacePapers?.map((p) => p.paperId) || []
  );

  const addToWorkspace = useAddToWorkspace({
    mutation: {
      onSuccess: () => {
        toast({ title: "Added to workspace" });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetWorkspaceStatsQueryKey(),
        });
      },
    },
  });

  if (isSearching) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
        <p className="text-center text-sm text-muted-foreground mt-4">
          Querying PubMed and Semantic Scholar…
        </p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-serif text-2xl text-foreground">
          ScholarForge Workspace
        </h2>
        <p className="text-muted-foreground">
          Enter a query in the sidebar to search PubMed and Semantic Scholar.
          Your supervisor constraints are automatically applied.
        </p>
      </div>
    );
  }

  if (results.papers.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
        <Filter className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="font-serif text-xl text-foreground">No papers found</h2>
        <p className="text-muted-foreground">
          Try broadening your search query or adjusting the year range in your
          supervisor settings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">
          {results.total} result{results.total !== 1 ? "s" : ""} for "
          {results.query}"
        </h2>
      </div>

      <div className="space-y-4">
        {results.papers.map((paper: Paper) => {
          const inWorkspace = workspacePaperIds.has(paper.id);

          return (
            <Card key={paper.id} className="transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SourceBadge source={paper.source} />
                      {paper.openAccess && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-medium">
                          Open Access
                        </span>
                      )}
                    </div>
                    <CardTitle className="font-serif text-xl text-primary leading-tight">
                      {paper.url ? (
                        <a
                          href={paper.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline inline-flex items-center gap-1.5"
                          data-testid={`link-paper-${paper.id}`}
                        >
                          {paper.title}{" "}
                          <ExternalLink className="h-4 w-4 opacity-50 shrink-0" />
                        </a>
                      ) : (
                        paper.title
                      )}
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="flex items-center gap-1 text-foreground/80">
                        <Users className="h-3.5 w-3.5" />
                        {paper.authors.slice(0, 3).join(", ")}
                        {paper.authors.length > 3 ? " et al." : ""}
                      </span>
                      {paper.year && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" /> {paper.year}
                        </span>
                      )}
                      {paper.venue && (
                        <span className="flex items-center gap-1 font-medium">
                          <BookOpen className="h-3.5 w-3.5" /> {paper.venue}
                        </span>
                      )}
                    </CardDescription>
                  </div>

                  {paper.relevanceScore != null && paper.relevanceScore > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary border-primary/20 shrink-0"
                    >
                      {(paper.relevanceScore * 100).toFixed(0)}% Match
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {paper.supervisorNote && (
                  <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-sm italic border border-amber-200 flex gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                    <p>{paper.supervisorNote}</p>
                  </div>
                )}

                {paper.abstract && (
                  <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3">
                    {paper.abstract}
                  </p>
                )}

                {/* Snippets from PubMed phrase matching */}
                {paper.snippets && paper.snippets.length > 0 && (
                  <div className="space-y-2 border-t border-border/50 pt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Matched Sections
                    </p>
                    {paper.snippets.map((sn, i) => (
                      <div
                        key={i}
                        className="bg-muted/50 rounded-md p-2.5 border border-border/50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {sn.section}
                          </span>
                          {sn.matchScore > 0 && (
                            <span className="text-[10px] text-primary font-medium">
                              {sn.matchScore} keyword{sn.matchScore !== 1 ? "s" : ""} matched
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed line-clamp-4">
                          {sn.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-2 flex justify-between border-t border-border/40 mt-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  {paper.citationCount != null
                    ? `${paper.citationCount} citations`
                    : "Open Access"}
                </div>

                <Button
                  variant={inWorkspace ? "secondary" : "outline"}
                  size="sm"
                  disabled={inWorkspace || addToWorkspace.isPending}
                  onClick={() =>
                    addToWorkspace.mutate({
                      data: {
                        paperId: paper.id,
                        title: paper.title,
                        authors: paper.authors,
                        abstract: paper.abstract,
                        year: paper.year,
                        venue: paper.venue,
                        url: paper.url,
                        citationCount: paper.citationCount,
                      },
                    })
                  }
                  data-testid={`button-add-workspace-${paper.id}`}
                >
                  {inWorkspace ? (
                    <>
                      <BookMarked className="h-4 w-4 mr-2" /> Saved
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="h-4 w-4 mr-2" /> Add to Workspace
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

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

  const removeFromWorkspace = useRemoveFromWorkspace({
    mutation: {
      onSuccess: () => {
        toast({ title: "Removed from workspace" });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetWorkspaceStatsQueryKey(),
        });
      },
    },
  });

  if (isLoadingPapers || isLoadingStats) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading workspace...
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
        <p className="text-muted-foreground">
          Search for papers and add them to your workspace to organize your
          research.
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
              <div className="text-3xl font-serif text-primary">
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
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-primary">
                AI Research Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="default"
                className="w-full"
                onClick={() => {
                  setAnalysisOpen(true);
                  fetchAnalysis();
                }}
                data-testid="button-analyze"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Analyze Collection
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {analysisOpen && (
        <Card className="border-primary/30 bg-primary/5 shadow-md">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
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
                    <h4 className="font-medium text-sm text-primary uppercase tracking-wider mb-2">
                      Key Themes
                    </h4>
                    <ul className="space-y-1">
                      {analysis.themes.map((theme: string, i: number) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span> {theme}
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
                          <span className="text-amber-600 mt-0.5">•</span>{" "}
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
                <h4 className="font-serif text-lg font-medium leading-tight">
                  {paper.url ? (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline text-foreground"
                    >
                      {paper.title}
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
                  {paper.year && <span>• {paper.year}</span>}
                  {paper.venue && (
                    <span className="font-medium text-foreground/70">
                      • {paper.venue}
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
                  onClick={() =>
                    removeFromWorkspace.mutate({ id: paper.id })
                  }
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
