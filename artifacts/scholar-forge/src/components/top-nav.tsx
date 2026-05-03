import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  UserCog, Library, PenLine, ImagePlay, Moon, Sun, Github, ShieldCheck,
  ChevronDown, Brain, Share2, BookOpen, FlaskConical, Star, Newspaper,
  Edit3, Search,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface NavDropdownItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  desc?: string;
}

function NavDropdown({
  label,
  items,
  active,
}: {
  label: string;
  items: NavDropdownItem[];
  active: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "relative flex items-center gap-1 py-1 text-[13px] font-medium transition-colors duration-150 border-b-2 outline-none",
            active
              ? "text-primary border-primary"
              : "text-muted-foreground hover:text-foreground border-transparent"
          )}
        >
          {label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} className="flex items-center gap-2.5 cursor-pointer">
              <span className="text-muted-foreground">{item.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                {item.desc && <p className="text-[10px] text-muted-foreground">{item.desc}</p>}
              </div>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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

  const writeItems: NavDropdownItem[] = [
    { href: "/studio", label: "Writing Studio", icon: <Edit3 className="h-3.5 w-3.5" />, desc: "Full-page editor with citations" },
    { href: "/coach", label: "Writing Coach", icon: <PenLine className="h-3.5 w-3.5" />, desc: "AI feedback on your prose" },
    { href: "/outline", label: "Outline Editor", icon: <BookOpen className="h-3.5 w-3.5" />, desc: "Structure & methodology advice" },
  ];

  const analyseItems: NavDropdownItem[] = [
    { href: "/question", label: "Question Answering", icon: <Brain className="h-3.5 w-3.5" />, desc: "What does the evidence say?" },
    { href: "/papergraph", label: "Connected Papers", icon: <Share2 className="h-3.5 w-3.5" />, desc: "Citation network graph" },
    { href: "/visuals", label: "Visual Sourcer", icon: <ImagePlay className="h-3.5 w-3.5" />, desc: "Charts, diagrams & figures" },
  ];

  const toolsItems: NavDropdownItem[] = [
    { href: "/originality", label: "Plagiarism Check", icon: <ShieldCheck className="h-3.5 w-3.5" />, desc: "3-layer originality check" },
    { href: "/journals", label: "Journal Recommender", icon: <Star className="h-3.5 w-3.5" />, desc: "Find the best journal for you" },
    { href: "/outline", label: "Methodology Advisor", icon: <FlaskConical className="h-3.5 w-3.5" />, desc: "Research design guidance" },
    { href: "/supervisors", label: "Supervisors", icon: <UserCog className="h-3.5 w-3.5" />, desc: "Manage citation & style rules" },
  ];

  const analyseActive = ["/question", "/papergraph", "/visuals"].includes(location);
  const writeActive = ["/studio", "/coach", "/outline"].includes(location);
  const toolsActive = ["/originality", "/journals", "/supervisors"].includes(location);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80"
      style={{ height: 56 }}>
      <div className="flex h-full items-center justify-between px-6 gap-5">

        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0">
          <span className="font-serif text-[17px] font-medium text-primary">Scholar</span>
          <span className="font-sans text-[17px] font-normal text-muted-foreground">Forge</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-5 flex-1">

          <Link href="/" className={linkCls("/")}>
            <Search className="h-3.5 w-3.5" />
            Search
          </Link>

          <NavDropdown label="Write" items={writeItems} active={writeActive} />

          <Link href="/collection" className={linkCls("/collection")}>
            <Library className="h-3.5 w-3.5" />
            Collection
            {items.length > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {items.length}
              </span>
            )}
          </Link>

          <NavDropdown label="Analyse" items={analyseItems} active={analyseActive} />

          <NavDropdown label="Tools" items={toolsItems} active={toolsActive} />

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
