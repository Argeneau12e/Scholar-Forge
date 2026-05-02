import { Link, useLocation } from "wouter";
import { BookOpen, Github, UserCog } from "lucide-react";
import { useGetActiveSupervisor } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export function TopNav() {
  const { data, isLoading } = useGetActiveSupervisor();
  const activeSupervisor = data?.supervisor;
  const [location] = useLocation();

  const constraintsCount = activeSupervisor ? 
    (activeSupervisor.constraints?.length || 0) + 
    (activeSupervisor.focusAreas?.length || 0) + 
    (activeSupervisor.excludeKeywords?.length || 0) : 0;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-serif text-lg font-semibold text-primary">ScholarForge</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link 
              href="/" 
              className={`transition-colors hover:text-primary ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              Workspace
            </Link>
            <Link 
              href="/supervisors" 
              className={`flex items-center gap-1 transition-colors hover:text-primary ${location === '/supervisors' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <UserCog className="h-4 w-4" />
              Supervisors
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {!isLoading && activeSupervisor && (
            <Badge variant="secondary" className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-normal border-primary/20 bg-primary/10 text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              {activeSupervisor.name}
              {constraintsCount > 0 && (
                <span className="ml-1 text-xs opacity-80">({constraintsCount} rules)</span>
              )}
            </Badge>
          )}
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-5 w-5" />
            <span className="sr-only">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
