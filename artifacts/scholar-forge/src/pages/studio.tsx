import { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Save, Clock, FileText, Eye, EyeOff, BookOpen, Plus, Search,
  History, RotateCcw, Download, ChevronRight, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection } from "@/hooks/useCollection";
import { useToast } from "@/hooks/use-toast";

const AUTOSAVE_KEY = "sf_studio_content";
const AUTOSAVE_TITLE_KEY = "sf_studio_title";
const HISTORY_KEY = "sf_studio_history";
const MAX_HISTORY = 20;

interface SnapshotEntry {
  ts: number;
  content: string;
  wordCount: number;
}

interface CitedPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  citationStyle: string;
}

function formatCitation(paper: CitedPaper): string {
  const author = paper.authors[0]?.split(" ").pop() ?? "Unknown";
  const et = paper.authors.length > 1 ? " et al." : "";
  return `(${author}${et}, ${paper.year ?? "n.d."})`;
}

function formatBibEntry(paper: CitedPaper, index: number): string {
  const authors = paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");
  const doi = paper.doi ? ` https://doi.org/${paper.doi}` : "";
  return `${index + 1}. ${authors} (${paper.year ?? "n.d."}). ${paper.title}.${doi}`;
}

export default function WritingStudioPage() {
  const [title, setTitle] = useState(() => {
    try { return localStorage.getItem(AUTOSAVE_TITLE_KEY) ?? "Untitled dissertation"; } catch { return "Untitled dissertation"; }
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [focus, setFocus] = useState(false);
  const [bibOpen, setBibOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SnapshotEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
  });
  const [cited, setCited] = useState<CitedPaper[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<CitedPaper[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const { items } = useCollection();
  const { toast } = useToast();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const savedContent = (() => {
    try { return localStorage.getItem(AUTOSAVE_KEY) ?? ""; } catch { return ""; }
  })();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing your dissertation here…" }),
    ],
    content: savedContent,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[400px] text-foreground",
      },
    },
    onUpdate: ({ editor }) => {
      // Detect @ trigger
      const text = editor.getText();
      const lastChar = text.slice(-1);
      if (lastChar === "@") {
        setPickerOpen(true);
        setPickerSearch("");
        setPickerResults(collectionAsOptions());
      }

      // Autosave after 2s idle
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, editor.getHTML());
          setLastSaved(new Date());
        } catch { /* ignore */ }
      }, 2000);
    },
  });

  const wordCount = editor?.getText().split(/\s+/).filter(Boolean).length ?? 0;
  const sentenceCount = (editor?.getText().match(/[.!?]+/g) ?? []).length;
  const readingMins = Math.max(1, Math.round(wordCount / 200));

  // Extract headings for structure panel
  const headings = editor?.getJSON().content
    ?.filter((n) => n.type === "heading")
    .map((n) => ({
      level: (n.attrs?.level as number) ?? 1,
      text: n.content?.map((c) => ((c as Record<string, unknown>).text as string) ?? "").join("") ?? "",
    })) ?? [];

  const collectionAsOptions = (): CitedPaper[] =>
    items.map((item) => ({
      id: item.id,
      title: item.title ?? "Untitled",
      authors: item.authors ?? [],
      year: item.year ?? null,
      doi: item.doi ?? null,
      citationStyle: "APA",
    }));

  // Search for citation picker
  const searchCitations = useCallback(async (q: string) => {
    const collectionMatches = collectionAsOptions().filter(
      (p) => p.title.toLowerCase().includes(q.toLowerCase()) && q.length > 1
    );
    setPickerResults(collectionMatches);

    if (q.length < 3) return;
    setPickerLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, topic: q, maxResults: 5, sources: ["openalex"] }),
      });
      const data = await res.json();
      const livePapers: CitedPaper[] = (data.papers ?? []).map((p: { id: string; title: string; authors: string[]; year: number | null; doi: string | null }) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        year: p.year,
        doi: p.doi,
        citationStyle: "APA",
      }));
      setPickerResults([...collectionMatches, ...livePapers]);
    } catch { /* ignore */ } finally {
      setPickerLoading(false);
    }
  }, [items]);

  useEffect(() => {
    if (!pickerOpen || !pickerSearch) return;
    const t = setTimeout(() => searchCitations(pickerSearch), 300);
    return () => clearTimeout(t);
  }, [pickerSearch, pickerOpen, searchCitations]);

  const insertCitation = (paper: CitedPaper) => {
    const citation = formatCitation(paper);
    // Remove trailing @ and insert citation
    editor?.commands.deleteRange({
      from: (editor.state.selection.from) - 1,
      to: editor.state.selection.from,
    });
    editor?.commands.insertContent(citation + " ");
    setCited((prev) => {
      if (prev.find((p) => p.id === paper.id)) return prev;
      return [...prev, paper];
    });
    setPickerOpen(false);
    setPickerSearch("");
  };

  // Snapshot history every 30 min
  useEffect(() => {
    historyTimer.current = setInterval(() => {
      if (!editor) return;
      const content = editor.getHTML();
      const wc = editor.getText().split(/\s+/).filter(Boolean).length;
      setHistory((prev) => {
        const next = [{ ts: Date.now(), content, wordCount: wc }, ...prev].slice(0, MAX_HISTORY);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }, 30 * 60 * 1000);
    return () => { if (historyTimer.current) clearInterval(historyTimer.current); };
  }, [editor]);

  // Save title
  useEffect(() => {
    try { localStorage.setItem(AUTOSAVE_TITLE_KEY, title); } catch { /* ignore */ }
  }, [title]);

  const restoreSnapshot = (snap: SnapshotEntry) => {
    editor?.commands.setContent(snap.content);
    setHistoryOpen(false);
    toast({ title: "Snapshot restored" });
  };

  const exportBib = () => {
    const text = cited.map(formatBibEntry).join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bibliography.txt";
    a.click();
  };

  return (
    <div className={cn("flex h-full overflow-hidden", focus ? "bg-white dark:bg-slate-950" : "")}>
      {/* Document structure sidebar (hidden in focus mode) */}
      {!focus && (
        <aside className="w-52 shrink-0 border-r border-border bg-sidebar flex flex-col overflow-y-auto p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Structure</p>
          {headings.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Headings you type will appear here for navigation.
            </p>
          ) : (
            <nav className="space-y-0.5">
              {headings.map((h, i) => (
                <button
                  key={i}
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 truncate"
                  style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          )}
        </aside>
      )}

      {/* Main editor area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/80 shrink-0">
          <input
            className="flex-1 font-serif text-base font-medium bg-transparent border-none outline-none text-foreground min-w-0"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex items-center gap-2 shrink-0">
            {lastSaved && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Save className="h-3 w-3" />
                Saved {Math.round((Date.now() - lastSaved.getTime()) / 1000)}s ago
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <History className="h-3.5 w-3.5" />
              History
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setFocus((v) => !v)}
            >
              {focus ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {focus ? "Exit focus" : "Focus"}
            </Button>
          </div>
        </div>

        {/* Version history panel */}
        {historyOpen && (
          <div className="border-b border-border bg-muted/30 p-3 max-h-40 overflow-y-auto">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Version History</p>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Snapshots saved every 30 minutes will appear here.</p>
            ) : (
              <div className="space-y-1">
                {history.map((snap) => (
                  <div key={snap.ts} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(snap.ts).toLocaleString()} · {snap.wordCount} words</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => restoreSnapshot(snap)}
                    >
                      <RotateCcw className="h-3 w-3" />Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Editor */}
        <div className={cn("flex-1 overflow-y-auto relative", focus ? "flex justify-center" : "")}>
          <div className={cn("p-8", focus ? "w-full max-w-[700px]" : "w-full")}>
            {/* Citation picker */}
            {pickerOpen && (
              <div
                ref={pickerRef}
                className="absolute z-50 bg-card border border-border rounded-xl shadow-xl w-80 p-3 space-y-2"
                style={{ top: "4rem", left: "50%" }}
              >
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Search papers to cite…"
                    className="pl-8 text-sm"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setPickerOpen(false)}
                  />
                </div>
                {pickerLoading && <p className="text-xs text-muted-foreground text-center py-2">Searching…</p>}
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {pickerResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted text-xs space-y-0.5"
                      onClick={() => insertCitation(p)}
                    >
                      <p className="font-medium text-foreground line-clamp-1">{p.title}</p>
                      <p className="text-muted-foreground">{p.authors[0]}{p.year ? `, ${p.year}` : ""}</p>
                    </button>
                  ))}
                  {!pickerLoading && pickerResults.length === 0 && pickerSearch.length > 1 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No results</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setPickerOpen(false)}>
                  Cancel (Esc)
                </Button>
              </div>
            )}

            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border bg-muted/30 text-[10px] text-muted-foreground shrink-0">
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{wordCount} words</span>
          <span>{sentenceCount} sentences</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{readingMins} min read</span>
          <span className="ml-auto flex items-center gap-1 text-primary/70">
            <BookOpen className="h-3 w-3" />Type @ to insert a citation
          </span>
        </div>
      </main>

      {/* Bibliography panel */}
      {!focus && (
        <aside className={cn("border-l border-border bg-sidebar flex flex-col transition-all", bibOpen ? "w-64" : "w-10")}>
          <button
            className="flex items-center gap-2 px-3 py-3 text-xs font-medium text-muted-foreground hover:text-foreground border-b border-border"
            onClick={() => setBibOpen((v) => !v)}
          >
            {bibOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {bibOpen ? "Bibliography" : ""}
          </button>

          {bibOpen && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {cited.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 leading-relaxed">
                    Papers you cite with @ will appear here automatically.
                  </p>
                ) : (
                  cited.map((paper, i) => (
                    <div key={paper.id} className="text-xs text-muted-foreground border border-border/60 rounded-lg p-2 space-y-0.5">
                      <p className="text-foreground font-medium line-clamp-2">{paper.title}</p>
                      <p>{paper.authors.slice(0, 2).join(", ")}{paper.authors.length > 2 ? " et al." : ""}</p>
                      {paper.year && <p>{paper.year}</p>}
                    </div>
                  ))
                )}
              </div>
              {cited.length > 0 && (
                <div className="p-3 border-t border-border">
                  <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={exportBib}>
                    <Download className="h-3.5 w-3.5" />Export .txt
                  </Button>
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
