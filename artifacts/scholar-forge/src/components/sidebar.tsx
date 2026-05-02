import { useState } from "react";
import { Link } from "wouter";
import { 
  Search, 
  History, 
  Settings2, 
  BookMarked,
  Filter
} from "lucide-react";
import { 
  useListSupervisors, 
  useGetActiveSupervisor, 
  useActivateSupervisor,
  useSearchPapers,
  useGetSearchHistory,
  getGetActiveSupervisorQueryKey,
  getListSupervisorsQueryKey,
  getGetSearchHistoryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface SidebarProps {
  onSearch: (query: string, maxResults: number) => void;
  isSearching: boolean;
}

export function Sidebar({ onSearch, isSearching }: SidebarProps) {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState("10");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: supervisorsData, isLoading: isLoadingSupervisors } = useListSupervisors();
  const { data: activeSupervisorData } = useGetActiveSupervisor();
  const { data: searchHistory, isLoading: isLoadingHistory } = useGetSearchHistory();
  
  const activateSupervisor = useActivateSupervisor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveSupervisorQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSupervisorsQueryKey() });
        toast({
          title: "Supervisor activated",
          description: "Search constraints updated.",
        });
      }
    }
  });

  const activeSupervisor = activeSupervisorData?.supervisor;
  const supervisors = supervisorsData || [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query.trim(), parseInt(maxResults));
  };

  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery);
    onSearch(historyQuery, parseInt(maxResults));
  };

  return (
    <div className="w-[280px] shrink-0 border-r border-border bg-sidebar flex flex-col">
      <div className="p-4 border-b border-border">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="search-query" className="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wider">
              Research Query
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search-query"
                placeholder="Keywords, topics, authors..."
                className="pl-9 bg-background border-input focus-visible:ring-primary"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={maxResults} onValueChange={setMaxResults}>
                <SelectTrigger className="bg-background" data-testid="select-max-results">
                  <SelectValue placeholder="Results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 results</SelectItem>
                  <SelectItem value="10">10 results</SelectItem>
                  <SelectItem value="20">20 results</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              type="submit" 
              disabled={!query.trim() || isSearching}
              className="px-6"
              data-testid="button-search"
            >
              {isSearching ? "..." : "Search"}
            </Button>
          </div>
        </form>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Supervisor
              </h3>
              <Link href="/supervisors" className="text-xs text-primary hover:underline">
                Manage
              </Link>
            </div>
            
            {isLoadingSupervisors ? (
              <Skeleton className="h-10 w-full" />
            ) : supervisors.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md border border-border/50 text-center">
                No supervisors created.<br/>
                <Link href="/supervisors" className="text-primary hover:underline mt-1 inline-block">Create one</Link> to apply constraints.
              </div>
            ) : (
              <Select 
                value={activeSupervisor?.id?.toString() || "none"} 
                onValueChange={(val) => {
                  if (val === "none") return; // API doesn't support deactivating easily here, just selecting another
                  activateSupervisor.mutate({ id: parseInt(val) });
                }}
              >
                <SelectTrigger className="bg-background" data-testid="select-supervisor">
                  <SelectValue placeholder="Select supervisor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select a supervisor</SelectItem>
                  {supervisors.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {activeSupervisor && (
              <div className="mt-3 p-3 bg-primary/5 rounded-md border border-primary/10 space-y-2">
                {activeSupervisor.focusAreas && activeSupervisor.focusAreas.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground mb-1 block">Focus Areas:</span>
                    <div className="flex flex-wrap gap-1">
                      {activeSupervisor.focusAreas.map(f => (
                        <Badge key={f} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-background/80">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {activeSupervisor.excludeKeywords && activeSupervisor.excludeKeywords.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground mb-1 block">Excluding:</span>
                    <div className="flex flex-wrap gap-1">
                      {activeSupervisor.excludeKeywords.map(k => (
                        <Badge key={k} variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-destructive border-destructive/20">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {(activeSupervisor.minYear || activeSupervisor.maxYear) && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Years: {activeSupervisor.minYear || 'Any'} - {activeSupervisor.maxYear || 'Any'}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              Recent Searches
            </h3>
            
            {isLoadingHistory ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : searchHistory && searchHistory.length > 0 ? (
              <div className="space-y-1">
                {searchHistory.slice(0, 5).map(record => (
                  <button
                    key={record.id}
                    onClick={() => handleHistoryClick(record.query)}
                    className="w-full text-left px-2 py-1.5 text-sm text-foreground/80 hover:text-foreground hover:bg-background rounded-md transition-colors truncate"
                    title={record.query}
                  >
                    {record.query}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md border border-border/50 text-center">
                No search history.
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
