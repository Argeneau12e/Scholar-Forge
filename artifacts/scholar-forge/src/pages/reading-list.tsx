import { useState, useEffect } from "react";
import {
  List, BookOpen, CheckCircle2, Clock, Plus, GripVertical,
  ExternalLink, BarChart2, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection } from "@/hooks/useCollection";
import { useToast } from "@/hooks/use-toast";
import { ReadingDashboard } from "@/components/ReadingDashboard";
import { ConceptExplainer } from "@/components/ConceptExplainer";
import { useSupervisor } from "@/hooks/useSupervisor";

type ReadingStatus = "to-read" | "reading" | "finished";
type TabId = "list" | "analytics";

interface ReadingEntry {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  status: ReadingStatus;
  progress: number;
  addedAt: string;
  tags: string[];
  note: string;
}

const STORAGE_KEY = "sf2_reading_list";
function loadList(): ReadingEntry[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; } }
function saveList(list: ReadingEntry[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

const STATUS_META: Record<ReadingStatus, { label: string; column: string; icon: React.ReactNode }> = {
  "to-read":  { label: "To Read",  column: "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700",  icon: <Clock       className="h-4 w-4 text-slate-500" /> },
  "reading":  { label: "Reading",  column: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",        icon: <BookOpen    className="h-4 w-4 text-blue-500" /> },
  "finished": { label: "Finished", column: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
};

function hashColour(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (Math.imul(31, h) + title.charCodeAt(i)) | 0;
  return ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"][Math.abs(h) % 8];
}

function PaperCard({ entry, onStatusChange, onProgressChange }: {
  entry: ReadingEntry;
  onStatusChange: (id: string, s: ReadingStatus) => void;
  onProgressChange: (id: string, p: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow">
      <div className="h-1.5 w-full rounded-full" style={{ background: hashColour(entry.title) }} />
      <div>
        <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{entry.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {entry.authors.slice(0, 2).join(", ")}{entry.authors.length > 2 ? " et al." : ""}{entry.year ? ` · ${entry.year}` : ""}
        </p>
        {entry.journal && <p className="text-[10px] text-muted-foreground italic">{entry.journal}</p>}
      </div>

      {entry.status === "reading" && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>Progress</span><span>{entry.progress}%</span></div>
          <input type="range" min={0} max={100} value={entry.progress}
            onChange={(e) => onProgressChange(entry.id, parseInt(e.target.value))}
            className="w-full h-1.5 accent-primary" />
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {(["to-read","reading","finished"] as ReadingStatus[]).map((s) => (
          <button key={s} onClick={() => onStatusChange(entry.id, s)}
            className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
              entry.status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
            {STATUS_META[s].label}
          </button>
        ))}
        {entry.doi && (
          <a href={`https://doi.org/${entry.doi}`} target="_blank" rel="noreferrer"
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function ReadingListPage() {
  const [list, setList] = useState<ReadingEntry[]>(loadList);
  const [activeTab, setActiveTab] = useState<TabId>("list");
  const [explainTerm, setExplainTerm] = useState<string | null>(null);
  const [conceptInput, setConceptInput] = useState("");
  const { items: collectionItems } = useCollection();
  const { config } = useSupervisor();
  const { toast } = useToast();

  const update = (next: ReadingEntry[]) => { setList(next); saveList(next); };

  useEffect(() => {
    const existing = new Set(list.map((e) => e.id));
    const newEntries: ReadingEntry[] = collectionItems
      .filter((ci) => !existing.has(ci.id))
      .map((ci) => ({
        id: ci.id, title: ci.title, authors: ci.authors ?? [],
        year: ci.year ?? null, journal: ci.journal ?? null, doi: ci.doi ?? null,
        status: "to-read", progress: 0,
        addedAt: new Date().toISOString(), tags: [], note: "",
      }));
    if (newEntries.length > 0) {
      const next = [...list, ...newEntries];
      update(next);
      toast({ title: `${newEntries.length} paper${newEntries.length > 1 ? "s" : ""} synced from collection` });
    }
  }, [collectionItems.length]);

  const changeStatus = (id: string, status: ReadingStatus) => update(list.map((e) => e.id === id ? { ...e, status } : e));
  const changeProgress = (id: string, progress: number) => update(list.map((e) => e.id === id ? { ...e, progress } : e));

  const byStatus = (s: ReadingStatus) => list.filter((e) => e.status === s);
  const toReadCount = byStatus("to-read").length;
  const readingCount = byStatus("reading").length;
  const finishedCount = byStatus("finished").length;
  const estimatedHours = Math.round((list.length * 8000) / 200 / 60);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <List className="h-5 w-5 text-primary" />
              <h1 className="font-serif text-2xl text-foreground">Reading List</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {toReadCount} to read · {readingCount} in progress · {finishedCount} finished · ~{estimatedHours}h remaining
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Concept explainer quick input */}
            <div className="flex gap-1.5">
              <input value={conceptInput} onChange={(e) => setConceptInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && conceptInput.trim()) { setExplainTerm(conceptInput.trim()); setConceptInput(""); } }}
                placeholder="Explain a term…"
                className="w-40 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <Button size="sm" variant="outline" className="text-xs"
                onClick={() => { if (conceptInput.trim()) { setExplainTerm(conceptInput.trim()); setConceptInput(""); } }}>
                <Brain className="h-3 w-3 mr-1" /> Explain
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([["list", <List className="h-3.5 w-3.5" />, "List"], ["analytics", <BarChart2 className="h-3.5 w-3.5" />, "Analytics"]] as const).map(([id, icon, label]) => (
                <button key={id} onClick={() => setActiveTab(id as TabId)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                    activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === "analytics" && <ReadingDashboard />}

        {activeTab === "list" && (
          <>
            {/* Kanban */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(["to-read","reading","finished"] as ReadingStatus[]).map((status) => {
                const meta = STATUS_META[status];
                const entries = byStatus(status);
                return (
                  <div key={status} className={cn("rounded-xl border p-4 min-h-48", meta.column)}>
                    <div className="flex items-center gap-2 mb-4">
                      {meta.icon}
                      <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">{entries.length}</Badge>
                    </div>

                    {entries.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <GripVertical className="h-6 w-6 text-muted-foreground/30 mb-2" />
                        <p className="text-xs text-muted-foreground">
                          {status === "to-read" ? "Papers from your collection appear here" : "No papers here yet"}
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      {entries.map((entry) => (
                        <PaperCard key={entry.id} entry={entry} onStatusChange={changeStatus} onProgressChange={changeProgress} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {list.length === 0 && (
              <div className="mt-8 text-center">
                <p className="text-muted-foreground text-sm">Papers you save to your collection automatically appear here.</p>
                <Button variant="outline" className="mt-4" onClick={() => window.location.href = "/"}>
                  <Plus className="h-4 w-4 mr-2" /> Search for papers
                </Button>
              </div>
            )}
          </>
        )}
      </div>

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
