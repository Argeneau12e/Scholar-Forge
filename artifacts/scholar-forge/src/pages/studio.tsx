import { apiFetch } from "@/lib/apiFetch";
import { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold, Italic, Underline as ULIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, AlignLeft, AlignCenter, Search,
  Save, Clock, FileText, Eye, EyeOff, BookOpen, History, RotateCcw,
  Download, ChevronRight, ChevronDown, Loader2, Check, X,
  Sparkles, Wand2, Target, Pencil, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection } from "@/hooks/useCollection";
import { useToast } from "@/hooks/use-toast";

// ─── Storage keys ─────────────────────────────────────────────────────────────
const DOCS_KEY   = "sf2_documents";
const ACTIVE_KEY = "sf2_active_doc";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Document {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  targetWords: number;
  wordGoalToday: number;
  wordsWrittenToday: number;
  createdAt: string;
  updatedAt: string;
  snapshots: { content: string; wordCount: number; ts: number }[];
}

interface CitedPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
}

type RightTab = "bibliography" | "ai" | "history";
type AIAction = "improve" | "simplify" | "academic" | "expand" | "hedge" | "cite";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function newDoc(): Document {
  return {
    id: crypto.randomUUID(),
    title: "Untitled dissertation",
    content: "",
    wordCount: 0,
    targetWords: 10000,
    wordGoalToday: 500,
    wordsWrittenToday: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    snapshots: [],
  };
}

function loadDocs(): Document[] {
  try { return JSON.parse(localStorage.getItem(DOCS_KEY) ?? "null") ?? [newDoc()]; } catch { return [newDoc()]; }
}

function saveDocs(docs: Document[]) {
  try { localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); } catch { /* quota exceeded */ }
}

function fmtCitation(paper: CitedPaper): string {
  const author = paper.authors[0]?.split(" ").pop() ?? "Unknown";
  const et = paper.authors.length > 1 ? " et al." : "";
  return `(${author}${et}, ${paper.year ?? "n.d."})`;
}

function fmtBibEntry(paper: CitedPaper, i: number): string {
  const authors = paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");
  return `${i + 1}. ${authors} (${paper.year ?? "n.d."}). ${paper.title}.${paper.doi ? ` https://doi.org/${paper.doi}` : ""}`;
}

// ─── Formatting toolbar ───────────────────────────────────────────────────────
function ToolbarBtn({ active, onClick, children, title }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-xs transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card/80">
      <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
        <ULIcon className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className="w-px h-5 bg-border mx-0.5" />
      <ToolbarBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className="w-px h-5 bg-border mx-0.5" />
      <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Block quote">
        <Quote className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className="w-px h-5 bg-border mx-0.5" />
      <ToolbarBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className="w-px h-5 bg-border mx-0.5" />
      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 ml-1">
        <BookOpen className="h-3 w-3" /> Type @ to cite
      </span>
    </div>
  );
}

// ─── Floating AI action bar ───────────────────────────────────────────────────
interface FloatingAIBarProps {
  selection: string;
  position: { top: number; left: number };
  onAction: (action: AIAction, selection: string) => void;
  onClose: () => void;
}

function FloatingAIBar({ selection, position, onAction, onClose }: FloatingAIBarProps) {
  const ACTIONS: { id: AIAction; label: string; icon: React.ReactNode }[] = [
    { id: "improve",  label: "Improve",  icon: <Wand2       className="h-3 w-3" /> },
    { id: "simplify", label: "Simplify", icon: <AlignLeft   className="h-3 w-3" /> },
    { id: "academic", label: "Academic", icon: <FileText    className="h-3 w-3" /> },
    { id: "expand",   label: "Expand",   icon: <Maximize2   className="h-3 w-3" /> },
    { id: "hedge",    label: "Hedge",    icon: <Target      className="h-3 w-3" /> },
  ];
  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-xl border border-border bg-card shadow-xl p-1"
      style={{ top: position.top - 48, left: Math.max(8, position.left - 60) }}
    >
      <Sparkles className="h-3.5 w-3.5 text-primary mx-1.5" />
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          onMouseDown={(e) => { e.preventDefault(); onAction(a.id, selection); }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors whitespace-nowrap"
        >
          {a.icon} {a.label}
        </button>
      ))}
      <button onMouseDown={(e) => { e.preventDefault(); onClose(); }}
        className="ml-0.5 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── AI suggestion diff view ──────────────────────────────────────────────────
interface AISuggestion {
  action: AIAction;
  original: string;
  suggestion: string;
  loading: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WritingStudioPage() {
  const [docs, setDocs] = useState<Document[]>(loadDocs);
  const [activeId, setActiveId] = useState<string>(() => {
    try { return localStorage.getItem(ACTIVE_KEY) ?? docs[0]?.id ?? ""; } catch { return docs[0]?.id ?? ""; }
  });
  const activeDoc = docs.find((d) => d.id === activeId) ?? docs[0] ?? newDoc();

  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [focus, setFocus] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("bibliography");
  const [rightOpen, setRightOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [cited, setCited] = useState<CitedPaper[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<CitedPaper[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [aiSuggestion, setAISuggestion] = useState<AISuggestion | null>(null);
  const [floatingBar, setFloatingBar] = useState<{ text: string; top: number; left: number } | null>(null);
  const [goalInput, setGoalInput] = useState<number | null>(null);

  const { items } = useCollection();
  const { toast } = useToast();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Update doc helper
  const updateDoc = useCallback((patch: Partial<Document>) => {
    setDocs((prev) => {
      const next = prev.map((d) => d.id === activeId ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d);
      saveDocs(next);
      return next;
    });
  }, [activeId]);

  // Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing, or type @ to insert a citation…" }),
      CharacterCount,
      Highlight,
      Typography,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: activeDoc.content,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[60vh] text-foreground font-serif leading-relaxed",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const wc = editor.storage.characterCount?.words() ?? editor.getText().split(/\s+/).filter(Boolean).length;

      // Detect @ for citation picker
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 1), from);
      if (textBefore === "@") {
        setPickerOpen(true);
        setPickerSearch("");
        setPickerResults(collectionAsOptions());
      }

      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        updateDoc({ content: html, wordCount: wc });
        setLastSaved(new Date());
      }, 2000);
    },
  });

  // Reload editor when switching docs
  useEffect(() => {
    if (editor && activeDoc.content !== undefined) {
      editor.commands.setContent(activeDoc.content, false);
    }
    localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  // Floating AI bar on selection
  useEffect(() => {
    if (!editor) return;
    const handleMouseUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setFloatingBar(null); return; }
        const text = sel.toString().trim();
        if (text.length < 5) { setFloatingBar(null); return; }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setFloatingBar({ text, top: rect.top + window.scrollY, left: rect.left + window.scrollX });
      }, 50);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [editor]);

  // Auto-snapshot every 30 min
  useEffect(() => {
    snapshotTimer.current = setInterval(() => {
      if (!editor) return;
      const content = editor.getHTML();
      const wc = editor.storage.characterCount?.words() ?? 0;
      if (!content || content === "<p></p>") return;
      updateDoc((doc => {
        const snaps = [{ content, wordCount: wc, ts: Date.now() }, ...(doc as unknown as Document).snapshots ?? []].slice(0, 20);
        return { snapshots: snaps } as Partial<Document>;
      }) as unknown as Partial<Document>);
      toast({ title: "Auto-snapshot saved" });
    }, 30 * 60 * 1000);
    return () => { if (snapshotTimer.current) clearInterval(snapshotTimer.current); };
  }, [editor, updateDoc]);

  // F11 distraction-free
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") { e.preventDefault(); setFocus((v) => !v); }
      if (e.key === "Escape" && focus) setFocus(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focus]);

  const wordCount = editor?.storage.characterCount?.words() ?? 0;
  const charCount = editor?.storage.characterCount?.characters() ?? 0;
  const readingMins = Math.max(1, Math.round(wordCount / 200));
  const targetWords = activeDoc.targetWords;
  const pct = Math.min(100, Math.round((wordCount / targetWords) * 100));

  // Headings for outline
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
    }));

  // Citation search
  const searchCitations = useCallback(async (q: string) => {
    const matches = collectionAsOptions().filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));
    setPickerResults(matches);
    if (q.length < 3) return;
    setPickerLoading(true);
    try {
      const res = await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, topic: q, maxResults: 5, sources: ["openalex"] }),
      });
      const data = await res.json();
      const live: CitedPaper[] = (data.papers ?? []).map((p: CitedPaper) => p);
      setPickerResults((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...live.filter((p) => !ids.has(p.id))];
      });
    } catch { /* ignore */ } finally { setPickerLoading(false); }
  }, [items]);

  useEffect(() => {
    if (!pickerOpen || !pickerSearch) return;
    const t = setTimeout(() => searchCitations(pickerSearch), 300);
    return () => clearTimeout(t);
  }, [pickerSearch, pickerOpen, searchCitations]);

  const insertCitation = (paper: CitedPaper) => {
    const { from } = editor!.state.selection;
    editor?.chain().focus()
      .deleteRange({ from: from - 1, to: from })
      .insertContent(fmtCitation(paper) + " ")
      .run();
    setCited((prev) => prev.find((p) => p.id === paper.id) ? prev : [...prev, paper]);
    setPickerOpen(false);
    setPickerSearch("");
    toast({ title: `Citation added: ${paper.authors[0]?.split(" ").pop() ?? "?"}, ${paper.year ?? "n.d."}` });
  };

  // AI inline actions
  const handleAIAction = async (action: AIAction, selection: string) => {
    setFloatingBar(null);
    setRightTab("ai");
    setRightOpen(true);
    setAISuggestion({ action, original: selection, suggestion: "", loading: true });

    const ACTION_PROMPTS: Record<AIAction, string> = {
      improve:  `Rewrite this academic text to be clearer and more compelling, keeping the same meaning:\n\n"${selection}"\n\nReturn ONLY the rewritten text.`,
      simplify: `Simplify this academic text so a non-specialist can understand it:\n\n"${selection}"\n\nReturn ONLY the simplified version.`,
      academic: `Make this text more formally academic in register and tone:\n\n"${selection}"\n\nReturn ONLY the improved text.`,
      expand:   `Expand this text with 2-3 additional sentences that develop the argument further:\n\n"${selection}"\n\nReturn ONLY the expanded version.`,
      hedge:    `Add appropriate academic hedging language to this text (words like 'suggests', 'may', 'appears to') where overconfident claims exist:\n\n"${selection}"\n\nReturn ONLY the hedged version.`,
      cite:     `This text makes a claim that needs a citation. Suggest what kind of source would best support it:\n\n"${selection}"\n\nReturn a 2-sentence suggestion.`,
    };

    try {
      const res = await apiFetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ACTION_PROMPTS[action], mode: "clarity", discipline: "academic" }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const suggestion = typeof data === "string" ? data : (data.revisedText ?? data.feedback ?? JSON.stringify(data));
      setAISuggestion({ action, original: selection, suggestion, loading: false });
    } catch {
      setAISuggestion({ action, original: selection, suggestion: "Could not get AI suggestion. Please try again.", loading: false });
    }
  };

  const acceptSuggestion = () => {
    if (!aiSuggestion || !editor) return;
    const { state, dispatch } = editor.view;
    const { from, to } = state.selection;
    if (from !== to) {
      const tr = state.tr.replaceWith(from, to, state.schema.text(aiSuggestion.suggestion));
      dispatch(tr);
    }
    setAISuggestion(null);
    toast({ title: "Suggestion applied" });
  };

  const newDocument = () => {
    const doc = newDoc();
    const next = [...docs, doc];
    setDocs(next);
    saveDocs(next);
    setActiveId(doc.id);
    editor?.commands.setContent("", false);
  };

  const exportDoc = () => {
    const text = editor?.getText() ?? "";
    const bib = cited.map(fmtBibEntry).join("\n\n");
    const full = `${activeDoc.title}\n${"─".repeat(40)}\n\n${text}\n\n─── Bibliography ───\n\n${bib}`;
    const blob = new Blob([full], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${activeDoc.title}.txt`; a.click();
  };

  const saveSnapshot = () => {
    if (!editor) return;
    const content = editor.getHTML();
    const wc = wordCount;
    setDocs((prev) => {
      const next = prev.map((d) => {
        if (d.id !== activeId) return d;
        const snaps = [{ content, wordCount: wc, ts: Date.now() }, ...d.snapshots].slice(0, 20);
        return { ...d, snapshots: snaps };
      });
      saveDocs(next);
      return next;
    });
    toast({ title: "Version saved" });
  };

  const restoreSnapshot = (snap: { content: string; wordCount: number; ts: number }) => {
    editor?.commands.setContent(snap.content, false);
    toast({ title: "Version restored" });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (focus) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col" onMouseMove={() => {}}>
        {/* Minimal top bar — reveals on hover */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-2 bg-background/90 backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity z-10">
          <span className="text-sm font-serif text-muted-foreground">{activeDoc.title}</span>
          <button onClick={() => setFocus(false)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Minimize2 className="h-3.5 w-3.5" /> Exit focus (Esc)
          </button>
        </div>

        {/* Writing surface */}
        <div className="flex-1 overflow-y-auto flex justify-center pt-16 pb-24">
          <div className="w-full max-w-[700px] px-8">
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>

        {/* Bottom: word count + goal bar */}
        <div className="fixed bottom-0 left-0 right-0 flex flex-col items-center pb-safe-bottom">
          <div className="w-full" style={{ height: 3, background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%)` }} />
          <p className="text-xs text-muted-foreground/50 py-1">{wordCount.toLocaleString()} words</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* ── Left sidebar ──────────────────────────────────────────── */}
      <aside className={cn(
        "border-r border-border bg-sidebar flex flex-col overflow-y-auto shrink-0 transition-all duration-200",
        leftOpen ? "w-52" : "w-10"
      )}>
        <button
          onClick={() => setLeftOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground border-b border-border shrink-0"
        >
          {leftOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 rotate-180" />}
          {leftOpen && "Documents"}
        </button>

        {leftOpen && (
          <div className="flex-1 flex flex-col p-2 gap-1 overflow-y-auto">
            {/* Document list */}
            {docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setActiveId(doc.id)}
                className={cn(
                  "text-left px-2 py-1.5 rounded-lg text-xs truncate transition-colors",
                  doc.id === activeId ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {doc.title}
              </button>
            ))}
            <button onClick={newDocument}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors mt-1">
              + New document
            </button>

            <div className="border-t border-border mt-2 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">Outline</p>
              {headings.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50 px-1">Headings appear here</p>
              ) : (
                headings.map((h, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground truncate py-0.5" style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }}>
                    {h.text}
                  </p>
                ))
              )}
            </div>

            <div className="border-t border-border mt-2 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">Daily goal</p>
              <div className="px-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{wordCount.toLocaleString()} words</span>
                  <span>{activeDoc.wordGoalToday}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, (wordCount / activeDoc.wordGoalToday) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main editor ───────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Title bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/80 shrink-0">
          <input
            className="flex-1 font-serif text-base font-medium bg-transparent border-none outline-none text-foreground min-w-0"
            value={activeDoc.title}
            onChange={(e) => updateDoc({ title: e.target.value })}
            placeholder="Document title"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            {lastSaved && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Save className="h-3 w-3" />
                {Math.round((Date.now() - lastSaved.getTime()) / 1000)}s ago
              </span>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={saveSnapshot}>
              <History className="h-3.5 w-3.5" /> Save version
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={exportDoc}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setFocus(true)}>
              <Maximize2 className="h-3.5 w-3.5" /> Focus (F11)
            </Button>
          </div>
        </div>

        {/* Formatting toolbar */}
        {editor && <EditorToolbar editor={editor} />}

        {/* Editor area */}
        <div ref={editorRef} className="flex-1 overflow-y-auto relative">
          <div className="max-w-[740px] mx-auto px-8 py-8 relative">
            {/* Citation picker */}
            {pickerOpen && (
              <div ref={pickerRef} className="absolute z-50 bg-card border border-border rounded-xl shadow-xl w-80 p-3 space-y-2" style={{ top: "2rem", left: "50%" }}>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input autoFocus placeholder="Search papers to cite…" className="w-full pl-8 text-sm rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setPickerOpen(false)} />
                </div>
                {pickerLoading && <p className="text-xs text-muted-foreground text-center py-1">Searching…</p>}
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {pickerResults.map((p) => (
                    <button key={p.id} onMouseDown={() => insertCitation(p)}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted text-xs space-y-0.5">
                      <p className="font-medium text-foreground line-clamp-1">{p.title}</p>
                      <p className="text-muted-foreground">{p.authors[0]}{p.year ? `, ${p.year}` : ""}</p>
                    </button>
                  ))}
                  {!pickerLoading && pickerResults.length === 0 && pickerSearch.length > 1 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No results</p>
                  )}
                  {pickerSearch.length === 0 && pickerResults.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Type to search your collection or OpenAlex</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setPickerOpen(false)}>Cancel (Esc)</Button>
              </div>
            )}
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground shrink-0">
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{wordCount.toLocaleString()} words</span>
          <span>{charCount.toLocaleString()} chars</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{readingMins} min read</span>
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-primary/70">{pct}% of {targetWords.toLocaleString()}</span>
          </div>
          <button onClick={() => {
            const g = parseInt(prompt("Daily word goal:", String(activeDoc.wordGoalToday)) ?? "");
            if (!isNaN(g) && g > 0) updateDoc({ wordGoalToday: g });
          }} className="ml-auto text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <Target className="h-3 w-3" /> Set goal
          </button>
        </div>
      </main>

      {/* ── Right panel ───────────────────────────────────────────── */}
      <aside className={cn(
        "border-l border-border bg-sidebar flex flex-col overflow-hidden shrink-0 transition-all duration-200",
        rightOpen ? "w-64" : "w-10"
      )}>
        <div className="flex items-center border-b border-border shrink-0">
          <button onClick={() => setRightOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0">
            {rightOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 rotate-180" />}
          </button>
          {rightOpen && (
            <div className="flex flex-1 overflow-hidden">
              {(["bibliography", "ai", "history"] as RightTab[]).map((tab) => (
                <button key={tab} onClick={() => setRightTab(tab)}
                  className={cn(
                    "flex-1 py-2.5 text-[10px] font-medium transition-colors capitalize border-b-2 truncate",
                    rightTab === tab ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
                  )}>
                  {tab === "bibliography" ? "Bib" : tab === "ai" ? "AI" : "History"}
                </button>
              ))}
            </div>
          )}
        </div>

        {rightOpen && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Bibliography */}
            {rightTab === "bibliography" && (
              <div className="flex-1 flex flex-col overflow-y-auto">
                <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                  {cited.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 leading-relaxed pt-2">
                      Papers you cite with @ will appear here automatically.
                    </p>
                  ) : (
                    cited.map((paper, i) => (
                      <div key={paper.id} className="text-xs border border-border/60 rounded-lg p-2 space-y-0.5 group relative">
                        <p className="text-foreground font-medium line-clamp-2 text-[11px]">{paper.title}</p>
                        <p className="text-muted-foreground">{paper.authors.slice(0, 2).join(", ")}{paper.authors.length > 2 ? " et al." : ""}</p>
                        {paper.year && <p className="text-muted-foreground">{paper.year}</p>}
                        <button onClick={() => setCited((prev) => prev.filter((p) => p.id !== paper.id))}
                          className="absolute top-1.5 right-1.5 h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {cited.length > 0 && (
                  <div className="p-3 border-t border-border space-y-1.5 shrink-0">
                    <p className="text-[10px] text-muted-foreground">APA format · {cited.length} reference{cited.length !== 1 ? "s" : ""}</p>
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={() => {
                      const text = cited.map(fmtBibEntry).join("\n\n");
                      const blob = new Blob([text], { type: "text/plain" });
                      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bibliography.txt"; a.click();
                    }}>
                      <Download className="h-3.5 w-3.5" /> Export bibliography
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* AI suggestions */}
            {rightTab === "ai" && (
              <div className="p-3 space-y-3 overflow-y-auto flex-1">
                {!aiSuggestion && (
                  <div className="text-center pt-4">
                    <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Select text in the editor to see AI writing actions.</p>
                  </div>
                )}
                {aiSuggestion?.loading && (
                  <div className="flex flex-col items-center gap-2 pt-4">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    <p className="text-xs text-muted-foreground capitalize">{aiSuggestion.action}ing…</p>
                  </div>
                )}
                {aiSuggestion && !aiSuggestion.loading && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Original</p>
                      <p className="text-xs text-muted-foreground line-clamp-3 bg-muted/30 rounded-lg p-2">{aiSuggestion.original}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">Suggestion</p>
                      <p className="text-xs text-foreground bg-primary/5 rounded-lg p-2 leading-relaxed">{aiSuggestion.suggestion}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 text-xs gap-1" onClick={acceptSuggestion}>
                        <Check className="h-3.5 w-3.5" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => setAISuggestion(null)}>
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Version history */}
            {rightTab === "history" && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-3 space-y-2">
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Auto-snapshots every 30 min · last {activeDoc.snapshots.length}/20
                  </p>
                  {activeDoc.snapshots.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60">No snapshots yet. Keep writing — they'll appear automatically.</p>
                  ) : (
                    activeDoc.snapshots.map((snap) => (
                      <div key={snap.ts} className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground text-[11px] font-medium">{new Date(snap.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                          <p className="text-muted-foreground">{snap.wordCount.toLocaleString()} words</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5 shrink-0" onClick={() => restoreSnapshot(snap)}>
                          <RotateCcw className="h-2.5 w-2.5" /> Restore
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Floating AI action bar */}
      {floatingBar && !pickerOpen && (
        <FloatingAIBar
          selection={floatingBar.text}
          position={{ top: floatingBar.top, left: floatingBar.left }}
          onAction={handleAIAction}
          onClose={() => setFloatingBar(null)}
        />
      )}
    </div>
  );
}
