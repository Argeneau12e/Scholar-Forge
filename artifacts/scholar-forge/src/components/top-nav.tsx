import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { UserCog, Library, PenLine, ImagePlay, Moon, Sun, Github } from "lucide-react";
import { useGetActiveSupervisor } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { useCollection } from "@/hooks/useCollection";
import { cn } from "@/lib/utils";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("sf_theme") === "dark"; } catch { return false; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) { root.classList.add("dark"); localStorage.setItem("sf_theme", "dark"); }
    else       { root.classList.remove("dark"); localStorage.setItem("sf_theme", "light"); }
  }, [dark]);

  return [dark, setDark] as const;
}

export function TopNav() {
  const { data, isLoading } = useGetActiveSupervisor();
  const activeSupervisor = data?.supervisor;
  const [location] = useLocation();
  const { items } = useCollection();
  const [dark, setDark] = useDarkMode();

  const constraintsCount = activeSupervisor
    ? (activeSupervisor.constraints?.length || 0) +
      (activeSupervisor.focusAreas?.length || 0) +
      (activeSupervisor.excludeKeywords?.length || 0)
    : 0;

  const linkCls = (href: string) =>
    cn(
      "relative flex items-center gap-1.5 py-1 text-[13px] font-medium transition-colors duration-150 border-b-2",
      location === href
        ? "text-primary border-primary"
        : "text-muted-foreground hover:text-foreground border-transparent"
    );

  const navLink = (href: string, label: string, icon?: React.ReactNode, badge?: React.ReactNode) => (
    <Link href={href} className={linkCls(href)}>
      {icon}
      {label}
      {badge}
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80"
      style={{ height: 56 }}>
      <div className="flex h-full items-center justify-between px-6 gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0">
          <span className="font-serif text-[17px] font-medium text-primary">Scholar</span>
          <span className="font-sans text-[17px] font-normal text-muted-foreground">Forge</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-5 flex-1">
          {navLink("/", "Workspace")}
          {navLink("/supervisors", "Supervisors", <UserCog className="h-3.5 w-3.5" />)}
          <Link href="/collection" className={linkCls("/collection")}>
            <Library className="h-3.5 w-3.5" />
            My Collection
            {items.length > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {items.length}
              </span>
            )}
          </Link>
          {navLink("/coach", "Writing Coach", <PenLine className="h-3.5 w-3.5" />)}
          {navLink("/visuals", "Visual Sourcer", <ImagePlay className="h-3.5 w-3.5" />)}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {!isLoading && activeSupervisor && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-normal border-primary/20 bg-primary/10 text-primary text-[11px]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {activeSupervisor.name}
              {constraintsCount > 0 && (
                <span className="opacity-70">({constraintsCount})</span>
              )}
            </Badge>
          )}

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="GitHub"
          >
            <Github className="h-4 w-4" />
          </a>

          <button
            onClick={() => setDark((d) => !d)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
