import { apiFetch } from "@/lib/apiFetch";
import { useState, useRef, useCallback } from "react";
import {
  FileArchive, Upload, Loader2, BookOpen, Search, Trash2,
  ExternalLink, FileText, MessageSquare, X, Send, Lightbulb, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ConceptExplainer } from "@/components/ConceptExplainer";
import { useSupervisor } from "@/hooks/useSupervisor";

interface PDFEntry {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  filename: string;
  pageCount: number;
  addedAt: string;
  readingStatus: "unread" | "reading" | "finished";
  readingProgress: number;
  extractedText: string;
  extractedTextSnippet: string;
  summary?: string;
  keyPoints?: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "sf2_pdf_library";

const SUGGESTED_QUESTIONS = [
  "Summarise this paper",
  "What method did they use?",
  "What were the limitations?",
  "What can I cite from this paper?",
];

const STATUS_BADGE: Record<string, string> = {
  unread:   "bg-slate-100 text-slate-600 border-slate-200",
  reading:  "bg-blue-100 text-blue-600 border-blue-200",
  finished: "bg-emerald-100 text-emerald-600 border-emerald-200",
};

function load(): PDFEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function save(lib: PDFEntry[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(lib)); }

function PDFChat({ entry, onClose }: { entry: PDFEntry; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [explainTerm, setExplainTerm] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { config } = useSupervisor();
  const { toast } = useToast();

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    let assistantText = "";
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...history, assistantMsg]);

    try {
      const res = await apiFetch("/api/pdf/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          conversationHistory: messages.slice(-6),
          extractedText: entry.extractedText?.slice(0, 15000) ?? entry.extractedTextSnippet,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error((await res.json()).error ?? "Failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text) {
              assistantText += parsed.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: assistantText };
                return next;
              });
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* partial JSON */ }
        }
      }
    } catch (e) {
      toast({ title: "Chat error", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming, entry]);

  const copyMsg = (text: string) => { navigator.clipboard.writeText(text); toast({ title: "Copied" }); };

  const thesisQ = config?.thesisStatement ? `How does this relate to: "${config.thesisStatement.slice(0, 80)}…"?` : null;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{entry.title}</span>
        </div>
        <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">Ask anything about this paper</p>
            <div className="grid grid-cols-1 gap-1.5">
              {[...SUGGESTED_QUESTIONS, ...(thesisQ ? [thesisQ] : [])].map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-left px-3 py-2 rounded-lg bg-muted/40 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
            <div className={cn(
              "max-w-[85%] rounded-xl px-3 py-2.5 text-sm leading-relaxed",
              m.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm"
            )}>
              {m.content || (streaming && i === messages.length - 1 ? <span className="inline-block h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : "")}
              {m.role === "assistant" && m.content && (
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-border/40">
                  <button onClick={() => copyMsg(m.content)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="h-2.5 w-2.5" /> Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask about this paper… (Enter to send)"
            rows={2}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors shrink-0 self-end"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <button onClick={() => setMessages([])} className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          Clear chat
        </button>
      </div>

      {/* Concept explainer portal */}
      {explainTerm && (
        <ConceptExplainer
          term={explainTerm}
          onClose={() => setExplainTerm(null)}
        />
      )}
    </div>
  );
}

export default function PDFLibraryPage() {
  const [library, setLibrary] = useState<PDFEntry[]>(load);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeChat, setActiveChat] = useState<PDFEntry | null>(null);
  const [explainTerm, setExplainTerm] = useState<string | null>(null);
  const [conceptInput, setConceptInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { config } = useSupervisor();
  const { toast } = useToast();

  const update = (next: PDFEntry[]) => { setLibrary(next); save(next); };

  const processFile = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) { toast({ title: "Please upload a PDF file", variant: "destructive" }); return; }
    if (file.size > 25 * 1024 * 1024) { toast({ title: "File too large (max 25 MB)", variant: "destructive" }); return; }

    setProcessing(true);
    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdf.numPages;

      let fullText = "";
      for (let i = 1; i <= Math.min(pageCount, 20); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((it: { str?: string }) => it.str ?? "").join(" ") + "\n";
      }

      const doiMatch = fullText.match(/10\.\d{4,}\/[^\s"<>]+/);
      const doi = doiMatch ? doiMatch[0].replace(/[.)]+$/, "") : null;

      const entry: PDFEntry = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.pdf$/i, ""),
        authors: [],
        year: null,
        doi,
        filename: file.name,
        pageCount,
        addedAt: new Date().toISOString(),
        readingStatus: "unread",
        readingProgress: 0,
        extractedText: fullText.slice(0, 40000),
        extractedTextSnippet: fullText.slice(0, 600),
      };

      if (doi) {
        try {
          const meta = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`).then((r) => r.json());
          const w = meta?.message;
          if (w) {
            entry.title = w.title?.[0] ?? entry.title;
            entry.authors = (w.author ?? []).slice(0, 4).map((a: { given?: string; family?: string }) => [a.given, a.family].filter(Boolean).join(" "));
            entry.year = w.published?.["date-parts"]?.[0]?.[0] ?? null;
          }
        } catch { /* best effort */ }
      }

      const next = [entry, ...library];
      update(next);
      toast({ title: `"${entry.title}" added to library`, description: `${pageCount} pages · ${Math.round(fullText.length / 5)} words extracted` });
    } catch (e) {
      toast({ title: "Could not read PDF", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }, [library]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const deleteEntry = (id: string) => {
    if (activeChat?.id === id) setActiveChat(null);
    update(library.filter((e) => e.id !== id));
  };

  const updateStatus = (id: string, status: PDFEntry["readingStatus"]) =>
    update(library.map((e) => e.id === id ? { ...e, readingStatus: status } : e));

  const filtered = search
    ? library.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()) || e.authors.some((a) => a.toLowerCase().includes(search.toLowerCase())))
    : library;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main library panel */}
      <div className={cn("flex flex-col overflow-auto transition-all duration-200", activeChat ? "w-1/2" : "flex-1")}>
        <div className={cn("px-6 py-8", activeChat ? "max-w-2xl" : "max-w-4xl mx-auto w-full")}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <FileArchive className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-2xl text-foreground">PDF Library</h1>
          </div>
          <p className="text-muted-foreground text-sm mb-6">Upload research papers to read and chat with them directly.</p>

          {/* Upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !processing && fileInputRef.current?.click()}
            className={cn(
              "relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 mb-5",
              dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/20"
            )}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
            {processing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Extracting text and metadata…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Drop a PDF or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Max 25 MB · Text extracted automatically</p>
                </div>
              </div>
            )}
          </div>

          {/* Concept search */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">Concept Explainer</span>
            </div>
            <div className="flex gap-2">
              <input
                value={conceptInput}
                onChange={(e) => setConceptInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && conceptInput.trim()) { setExplainTerm(conceptInput.trim()); setConceptInput(""); } }}
                placeholder="Type any academic term to explain…"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button size="sm" onClick={() => { if (conceptInput.trim()) { setExplainTerm(conceptInput.trim()); setConceptInput(""); } }}>
                Explain
              </Button>
            </div>
          </div>

          {/* Search */}
          {library.length > 3 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search library…"
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          )}

          {/* Library */}
          {filtered.length === 0 && library.length === 0 && (
            <div className="text-center py-10">
              <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Upload a PDF paper to get started.</p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((entry) => (
              <div key={entry.id} className={cn(
                "rounded-xl border bg-card p-4 flex items-start gap-4 transition-all",
                activeChat?.id === entry.id ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-border/80"
              )}>
                <div className="h-12 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                      {entry.authors.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {entry.authors.slice(0, 2).join(", ")}{entry.authors.length > 2 ? " et al." : ""}{entry.year ? ` · ${entry.year}` : ""}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] py-0">{entry.pageCount} pages</Badge>
                        <Badge className={cn("text-[10px] py-0 border", STATUS_BADGE[entry.readingStatus])}>
                          {entry.readingStatus === "unread" ? "Unread" : entry.readingStatus === "reading" ? "Reading" : "Finished"}
                        </Badge>
                      </div>
                      {entry.extractedTextSnippet && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{entry.extractedTextSnippet}</p>
                      )}
                    </div>
                    <button onClick={() => deleteEntry(entry.id)}
                      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <select value={entry.readingStatus} onChange={(e) => updateStatus(entry.id, e.target.value as PDFEntry["readingStatus"])}
                      className="text-xs rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <option value="unread">Unread</option>
                      <option value="reading">Reading</option>
                      <option value="finished">Finished</option>
                    </select>
                    {entry.doi && (
                      <a href={`https://doi.org/${entry.doi}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink className="h-3 w-3" /> View paper
                      </a>
                    )}
                    <Button variant={activeChat?.id === entry.id ? "default" : "outline"} size="sm" className="text-xs ml-auto"
                      onClick={() => setActiveChat(activeChat?.id === entry.id ? null : entry)}>
                      <BookOpen className="h-3 w-3 mr-1" />
                      {activeChat?.id === entry.id ? "Close chat" : "Chat with paper"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat panel */}
      {activeChat && (
        <div className="w-1/2 border-l border-border">
          <PDFChat entry={activeChat} onClose={() => setActiveChat(null)} />
        </div>
      )}

      {/* Concept explainer */}
      {explainTerm && (
        <ConceptExplainer
          term={explainTerm}
          discipline={config?.discipline ?? "general"}
          onClose={() => setExplainTerm(null)}
        />
      )}
    </div>
  );
}
