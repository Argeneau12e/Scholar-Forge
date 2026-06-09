import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Edit3, BookOpen, CalendarDays,
  Search, Brain, Share2,
  Library, List, FileArchive,
  Lightbulb, GitBranch, Quote,
  PenLine, ShieldCheck, Star, FlaskConical, LayoutTemplate, FileText,
  Moon, Sun, Github, Menu, X, UserCog, ChevronRight,
  MessageSquare, Languages, Key,
} from "lucide-react";
import { useGetActiveSupervisor } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { useCollection } from "@/hooks/useCollection";
import { cn } from "@/lib/utils";
import { GroqKeyGate } from "@/components/GroqKeyGate";
import { useGroqKey } from "@/hooks/useGroqKey";

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

type SectionId = "write" | "search" | "collection" | "analyse" | "tools";

interface SubItem { href: string; label: string; icon: React.ReactNode; }

const SECTIONS: { id: SectionId; label: string; items: SubItem[] }[] = [
  {
    id: "write",
    label: "Write",
    items: [
      { href: "/studio",   label: "Studio",          icon: <Edit3           className="h-3.5 w-3.5" /> },
      { href: "/outline",  label: "Outline",          icon: <BookOpen        className="h-3.5 w-3.5" /> },
      { href: "/schedule", label: "Schedule",         icon: <CalendarDays    className="h-3.5 w-3.5" /> },
      { href: "/feedback", label: "Peer Feedback",    icon: <MessageSquare   className="h-3.5 w-3.5" /> },
      { href: "/language", label: "Language Support", icon: <Languages       className="h-3.5 w-3.5" /> },
    ],
  },
  {
    id: "search",
    label: "Search",
    items: [
      { href: "/",           label: "Papers",             icon: <Search className="h-3.5 w-3.5" /> },
      { href: "/question",   label: "Question Answering", icon: <Brain  className="h-3.5 w-3.5" /> },
      { href: "/papergraph", label: "Connected Papers",   icon: <Share2 className="h-3.5 w-3.5" /> },
    ],
  },
  {
    id: "collection",
    label: "Collection",
    items: [
      { href: "/collection",   label: "My Collection", icon: <Library     className="h-3.5 w-3.5" /> },
      { href: "/reading-list", label: "Reading List",  icon: <List        className="h-3.5 w-3.5" /> },
      { href: "/pdf-library",  label: "PDF Library",   icon: <FileArchive className="h-3.5 w-3.5" /> },
    ],
  },
  {
    id: "analyse",
    label: "Analyse",
    items: [
      { href: "/gaps",             label: "Gap Finder",       icon: <Lightbulb className="h-3.5 w-3.5" /> },
      { href: "/argmap",           label: "Argument Map",     icon: <GitBranch className="h-3.5 w-3.5" /> },
      { href: "/citecontext-page", label: "Citation Context", icon: <Quote     className="h-3.5 w-3.5" /> },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      { href: "/coach",       label: "Writing Coach",      icon: <PenLine        className="h-3.5 w-3.5" /> },
      { href: "/originality", label: "Originality",        icon: <ShieldCheck    className="h-3.5 w-3.5" /> },
      { href: "/journals",    label: "Journal Finder",     icon: <Star           className="h-3.5 w-3.5" /> },
      { href: "/outline",     label: "Methodology",        icon: <FlaskConical   className="h-3.5 w-3.5" /> },
      { href: "/poster",      label: "Poster Builder",     icon: <LayoutTemplate className="h-3.5 w-3.5" /> },
      { href: "/abstract",    label: "Abstract Generator", icon: <FileText       className="h-3.5 w-3.5" /> },
    ],
  },
];

function sectionForPath(path: string): SectionId | null {
  const writeRoutes  = ["/studio", "/outline", "/schedule", "/feedback", "/language"];
  const searchRoutes = ["/", "/question", "/papergraph"];
  const collectionRoutes = ["/collection", "/reading-list", "/pdf-library"];
  const analyseRoutes = ["/gaps", "/argmap", "/citecontext-page"];
  const toolsRoutes   = ["/coach", "/originality", "/journals", "/poster", "/abstract"];

  if (writeRoutes.some((r) => path === r)) return "write";
  if (searchRoutes.some((r) => path === r)) return "search";
  if (collectionRoutes.some((r) => path === r || path.startsWith(r + "/"))) return "collection";
  if (analyseRoutes.some((r) => path === r)) return "analyse";
  if (toolsRoutes.some((r) => path === r)) return "tools";
  return null;
}

export function TopNav() {
  const { data, isLoading } = useGetActiveSupervisor();
  const activeSupervisor = data?.supervisor;
  const [location] = useLocation();
  const { items } = useCollection();
  const [dark, setDark] = useDarkMode();
  const [openSection, setOpenSection] = useState<SectionId | null>(() => sectionForPath(location));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [keyGateOpen, setKeyGateOpen] = useState(false);
  const { hasKey } = useGroqKey();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sec = sectionForPath(location);
    if (sec) setOpenSection(sec);
    setMobileOpen(false);
  }, [location]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (navRef.current && !navRef.current.contains(e.target as Node)) {
      setOpenSection(null);
    }
  }, []);
  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const constraintsCount = activeSupervisor
    ? (activeSupervisor.constraints?.length ?? 0) + (activeSupervisor.focusAreas?.length ?? 0) + (activeSupervisor.excludeKeywords?.length ?? 0)
    : 0;

  const collectionCount = items.length;
  const activeSection = sectionForPath(location);

  const toggleSection = (id: SectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  const currentSubItems = openSection ? SECTIONS.find((s) => s.id === openSection)?.items ?? [] : [];

  return (
    <header
      ref={navRef}
      className="sticky top-0 z-50 w-full bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80 border-b border-border/60"
    >
      {/* ── Tier 1 ─────────────────────────────────────────── */}
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 gap-4">

        <Link href="/" className="flex items-center shrink-0">
          <span className="font-serif text-[17px] font-semibold text-primary">Scholar</span>
          <span className="font-sans text-[17px] font-normal text-muted-foreground">Forge</span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {SECTIONS.map((sec) => {
            const isOn = activeSection === sec.id || openSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => toggleSection(sec.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 border-b-2 outline-none select-none",
                  isOn
                    ? "text-primary border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/40"
                )}
              >
                {sec.label}
                {sec.id === "collection" && collectionCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground leading-none">
                    {collectionCount}
                  </span>
                )}
                <ChevronRight
                  className={cn(
                    "h-3 w-3 opacity-40 transition-transform duration-200",
                    openSection === sec.id ? "rotate-90" : ""
                  )}
                />
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isLoading && activeSupervisor && (
            <Badge
              variant="secondary"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-normal border-primary/20 bg-primary/10 text-primary text-[11px]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {activeSupervisor.name}
              {constraintsCount > 0 && <span className="opacity-60">({constraintsCount})</span>}
            </Badge>
          )}

          <Link
            href="/supervisors"
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Supervisors"
          >
            <UserCog className="h-4 w-4" />
          </Link>

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="GitHub"
          >
            <Github className="h-4 w-4" />
          </a>

          <button
            onClick={() => setKeyGateOpen(true)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              hasKey
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                : "text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
            )}
            title={hasKey ? "Change Groq API Key" : "Set Groq API Key (required for AI features)"}
          >
            <Key className="h-4 w-4" />
          </button>

          <button
            onClick={() => setDark((d) => !d)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label={dark ? "Light mode" : "Dark mode"}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <GroqKeyGate open={keyGateOpen} onClose={() => setKeyGateOpen(false)} mode="change" />

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Tier 2 — desktop animated sub-nav ──────────────── */}
      <div
        className="hidden md:block overflow-hidden border-t border-border/40"
        style={{
          maxHeight: openSection ? 52 : 0,
          transition: "max-height 0.2s ease",
        }}
      >
        <div className="flex items-center gap-0.5 px-6 h-[52px]">
          {currentSubItems.map((item) => {
            const isItemActive =
              item.href === "/"
                ? location === "/"
                : location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpenSection(null)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150 border-b-2 whitespace-nowrap",
                  isItemActive
                    ? "text-primary border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/40"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Mobile bottom sheet ─────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-2xl border-t border-border">
            <div className="h-1 w-12 bg-muted-foreground/20 rounded-full mx-auto mt-3 mb-2" />
            <div className="px-4 pb-8 max-h-[70vh] overflow-y-auto">
              {SECTIONS.map((sec) => (
                <div key={sec.id} className="mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-2">
                    {sec.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {sec.items.map((item) => {
                      const isItemActive =
                        item.href === "/"
                          ? location === "/"
                          : location === item.href || location.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-3.5 rounded-xl text-[13px] font-medium transition-colors",
                            isItemActive
                              ? "bg-primary/10 text-primary"
                              : "bg-muted/50 text-foreground hover:bg-muted"
                          )}
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="border-t border-border pt-3 flex flex-wrap gap-2">
                <Link
                  href="/supervisors"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-[12px] text-muted-foreground"
                >
                  <UserCog className="h-3.5 w-3.5" /> Supervisors
                </Link>
                <button
                  onClick={() => setDark((d) => !d)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-[12px] text-muted-foreground"
                >
                  {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {dark ? "Light mode" : "Dark mode"}
                </button>
                <button
                  onClick={() => { setMobileOpen(false); setKeyGateOpen(true); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-[12px]",
                    hasKey ? "text-muted-foreground" : "text-amber-500"
                  )}
                >
                  <Key className="h-3.5 w-3.5" />
                  {hasKey ? "Change API Key" : "Set API Key"}
                </button>
              </div>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
