import { useMemo } from "react";
import { TrendingUp, BookOpen, Flame, Brain, Clock, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFEntry {
  id: string;
  readingStatus: "unread" | "reading" | "finished";
  addedAt: string;
  extractedTextSnippet: string;
}

interface ReadingEntry {
  id: string;
  status: "to-read" | "reading" | "finished";
  addedAt: string;
}

interface GlossaryEntry {
  term: string;
  savedAt: string;
}

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

function getDayKey(d: Date) {
  return d.toISOString().split("T")[0];
}

function getLastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return getDayKey(d);
  });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

export function ReadingDashboard() {
  const analytics = useMemo(() => {
    const pdfs = loadJSON<PDFEntry[]>("sf2_pdf_library", []);
    const readingList = loadJSON<ReadingEntry[]>("sf2_reading_list", []);
    const glossary = loadJSON<GlossaryEntry[]>("sf2_glossary", []);

    const last7 = getLastNDays(7);

    // Papers added/interacted per day (from PDF library + reading list)
    const papersByDay: Record<string, number> = {};
    last7.forEach((d) => (papersByDay[d] = 0));
    [...pdfs, ...readingList].forEach((e) => {
      const day = getDayKey(new Date(e.addedAt));
      if (papersByDay[day] !== undefined) papersByDay[day]++;
    });

    // Reading streak: consecutive days with at least 1 activity
    let streak = 0;
    const today = getDayKey(new Date());
    const activityDays = new Set([...pdfs, ...readingList].map((e) => getDayKey(new Date(e.addedAt))));
    let cursor = new Date();
    while (true) {
      const key = getDayKey(cursor);
      if (!activityDays.has(key) && key !== today) break;
      if (activityDays.has(key)) streak++;
      cursor.setDate(cursor.getDate() - 1);
      if (streak > 365) break;
    }

    // Totals
    const finished = readingList.filter((e) => e.status === "finished").length + pdfs.filter((e) => e.readingStatus === "finished").length;
    const inProgress = readingList.filter((e) => e.status === "reading").length + pdfs.filter((e) => e.readingStatus === "reading").length;
    const totalPapers = readingList.length + pdfs.length;

    // Estimated reading time remaining (200 wpm, ~8000 words per paper avg)
    const remaining = readingList.filter((e) => e.status !== "finished").length + pdfs.filter((e) => e.readingStatus !== "finished").length;
    const estimatedHours = Math.round((remaining * 8000) / 200 / 60);

    // Concepts explained
    const conceptsCount = glossary.length;
    const recentConcepts = glossary.slice(0, 5);

    // Weekly reading
    const weeklyPapers = Object.values(papersByDay).reduce((s, v) => s + v, 0);

    const maxDay = Math.max(...Object.values(papersByDay), 1);

    return {
      last7,
      papersByDay,
      maxDay,
      streak,
      finished,
      inProgress,
      totalPapers,
      estimatedHours,
      conceptsCount,
      recentConcepts,
      weeklyPapers,
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { icon: <TrendingUp className="h-4 w-4" />, label: "This week",    value: analytics.weeklyPapers, unit: "papers" },
          { icon: <Flame       className="h-4 w-4" />, label: "Streak",      value: analytics.streak,       unit: `day${analytics.streak !== 1 ? "s" : ""}` },
          { icon: <BookOpen    className="h-4 w-4" />, label: "Finished",    value: analytics.finished,     unit: "papers" },
          { icon: <Brain       className="h-4 w-4" />, label: "Concepts",    value: analytics.conceptsCount, unit: "saved" },
          { icon: <Clock       className="h-4 w-4" />, label: "Time left",   value: analytics.estimatedHours, unit: "hours est." },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">{stat.icon}<span className="text-[10px]">{stat.label}</span></div>
            <p className="text-2xl font-bold text-foreground leading-none">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stat.unit}</p>
          </div>
        ))}
      </div>

      {/* Bar chart — papers per day */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Papers added this week</h3>
        <div className="flex items-end gap-2 h-28">
          {analytics.last7.map((day) => {
            const count = analytics.papersByDay[day] ?? 0;
            const pct = (count / analytics.maxDay) * 100;
            const isToday = day === new Date().toISOString().split("T")[0];
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="flex-1 w-full flex items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all duration-500",
                      isToday ? "bg-primary" : "bg-primary/30",
                      pct === 0 ? "h-1" : ""
                    )}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{dayLabel(day)}</span>
                {count > 0 && <span className="text-[9px] font-medium text-foreground">{count}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Progress overview */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Reading progress</h3>
          <div className="space-y-3">
            {analytics.totalPapers === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No papers yet — add some to your reading list</p>
            ) : (
              <>
                {[
                  { label: "To read",   value: analytics.totalPapers - analytics.finished - analytics.inProgress, color: "bg-slate-300 dark:bg-slate-600" },
                  { label: "Reading",   value: analytics.inProgress, color: "bg-blue-400" },
                  { label: "Finished",  value: analytics.finished,   color: "bg-emerald-400" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-medium text-foreground">{s.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", s.color)}
                        style={{ width: `${analytics.totalPapers > 0 ? (s.value / analytics.totalPapers) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Recent glossary entries */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Recent concepts</h3>
          </div>
          {analytics.recentConcepts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Highlight a term in a PDF or search the Concept Explainer to build your glossary
            </p>
          ) : (
            <div className="space-y-2">
              {analytics.recentConcepts.map((c) => (
                <div key={c.term} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{c.term}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(c.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reading pace */}
      {analytics.totalPapers > 0 && (
        <div className="rounded-xl border border-border bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">Your reading pace: </span>
              {analytics.weeklyPapers > 0
                ? `At ${analytics.weeklyPapers} paper${analytics.weeklyPapers !== 1 ? "s" : ""} per week, you'll complete your reading list in approximately ${Math.ceil((analytics.totalPapers - analytics.finished) / Math.max(analytics.weeklyPapers, 1))} week${Math.ceil((analytics.totalPapers - analytics.finished) / Math.max(analytics.weeklyPapers, 1)) !== 1 ? "s" : ""}.`
                : "Start reading this week to see your pace estimate here."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
