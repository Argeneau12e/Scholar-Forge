import { apiFetch } from "@/lib/apiFetch";
import { useState } from "react";
import { CalendarDays, Clock, Target, TrendingUp, AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ScheduleDay {
  date: string;
  dayOfWeek: string;
  isWritingDay: boolean;
  wordTarget: number;
  section: string;
  taskDescription: string;
  motivation: string;
  tip: string;
  actualWords?: number;
}

interface ScheduleResult {
  days: ScheduleDay[];
  totalWords: number;
  wordsPerDay: number;
  paceLevel: "comfortable" | "challenging" | "intense";
  availableDays: number;
  deadline: string;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SchedulePage() {
  const [deadline, setDeadline] = useState("");
  const [currentWords, setCurrentWords] = useState(0);
  const [targetWords, setTargetWords] = useState(10000);
  const [selectedDays, setSelectedDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [bufferDays, setBufferDays] = useState(7);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [logDayIndex, setLogDayIndex] = useState<number | null>(null);
  const [logWords, setLogWords] = useState("");
  const { toast } = useToast();

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? (prev.length > 1 ? prev.filter((d) => d !== day) : prev) : [...prev, day]
    );
  };

  const generateSchedule = async () => {
    if (!deadline) { toast({ title: "Please set a deadline" }); return; }
    if (selectedDays.length === 0) { toast({ title: "Select at least one writing day" }); return; }

    setLoading(true);
    try {
      const res = await apiFetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline, currentWords, targetWords, selectedDays, hoursPerDay, bufferDays, topic }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to generate schedule");
      setSchedule(await res.json());
    } catch (e) {
      toast({ title: "Could not generate schedule", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const logProgress = (dayIndex: number) => {
    const words = parseInt(logWords);
    if (isNaN(words) || words < 0) return;
    setSchedule((prev) => {
      if (!prev) return prev;
      const days = [...prev.days];
      days[dayIndex] = { ...days[dayIndex], actualWords: words };
      return { ...prev, days };
    });
    setLogDayIndex(null);
    setLogWords("");
    toast({ title: "Progress logged!" });
  };

  const paceColor = schedule
    ? schedule.paceLevel === "comfortable" ? "text-emerald-600" : schedule.paceLevel === "challenging" ? "text-amber-600" : "text-red-600"
    : "";

  const paceIcon = schedule
    ? schedule.paceLevel === "comfortable" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />
    : null;

  const totalActual = schedule?.days.reduce((sum, d) => sum + (d.actualWords ?? 0), 0) ?? 0;
  const progress = targetWords > 0 ? Math.min(100, Math.round(((currentWords + totalActual) / targetWords) * 100)) : 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-2xl text-foreground">Writing Schedule</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Generate a realistic day-by-day writing plan tailored to your deadline and pace.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input form */}
          <div className="lg:col-span-1 space-y-5">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Your writing details</h2>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Dissertation deadline *</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Topic / dissertation title</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Effects of climate change on…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Current words</label>
                  <input
                    type="number"
                    min={0}
                    value={currentWords}
                    onChange={(e) => setCurrentWords(parseInt(e.target.value) || 0)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Target words</label>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={targetWords}
                    onChange={(e) => setTargetWords(parseInt(e.target.value) || 10000)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Writing days</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                        selectedDays.includes(d)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Hours per day: <span className="text-foreground font-semibold">{hoursPerDay}h</span>
                </label>
                <input
                  type="range" min={1} max={8} value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Buffer days (for editing): <span className="text-foreground font-semibold">{bufferDays}</span>
                </label>
                <input
                  type="range" min={0} max={14} value={bufferDays}
                  onChange={(e) => setBufferDays(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <Button onClick={generateSchedule} disabled={loading} className="w-full">
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : <><CalendarDays className="h-4 w-4 mr-2" />Generate my schedule</>}
              </Button>
            </div>
          </div>

          {/* Schedule output */}
          <div className="lg:col-span-2 space-y-4">
            {!schedule && !loading && (
              <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-dashed border-border">
                <CalendarDays className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground text-sm">Fill in your details and generate a personalised writing schedule.</p>
              </div>
            )}

            {schedule && (
              <>
                {/* Stats bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: <Target className="h-4 w-4" />, label: "Words to write", value: (schedule.totalWords - currentWords).toLocaleString() },
                    { icon: <Clock className="h-4 w-4" />, label: "Words per day", value: schedule.wordsPerDay.toLocaleString() },
                    { icon: <CalendarDays className="h-4 w-4" />, label: "Writing days", value: schedule.availableDays },
                    { icon: <TrendingUp className="h-4 w-4" />, label: "Progress", value: `${progress}%` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{s.icon}<span className="text-[10px]">{s.label}</span></div>
                      <p className="text-lg font-semibold text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Pace badge */}
                <div className={cn("flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-3 border",
                  schedule.paceLevel === "comfortable" ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                  : schedule.paceLevel === "challenging" ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
                  : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
                )}>
                  {paceIcon}
                  <span className={paceColor}>
                    {schedule.paceLevel === "comfortable" && "Comfortable pace — you have plenty of time."}
                    {schedule.paceLevel === "challenging" && "Challenging pace — ambitious but achievable with focus."}
                    {schedule.paceLevel === "intense" && "Intense pace — consider negotiating a deadline extension."}
                  </span>
                </div>

                {/* Export */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    const ics = buildICS(schedule.days);
                    const blob = new Blob([ics], { type: "text/calendar" });
                    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "writing-schedule.ics"; a.click();
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Export to Calendar (.ics)
                  </Button>
                </div>

                {/* Calendar grid */}
                <div className="space-y-2">
                  {schedule.days.map((day, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-lg border p-4 transition-colors",
                        day.isWritingDay
                          ? "bg-card border-border"
                          : "bg-muted/30 border-border/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-muted-foreground">{day.dayOfWeek}</span>
                            <span className="text-xs text-muted-foreground">{new Date(day.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            {!day.isWritingDay && <Badge variant="outline" className="text-[10px] py-0">Rest day</Badge>}
                          </div>
                          {day.isWritingDay && (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-bold text-foreground">{day.wordTarget.toLocaleString()} words</span>
                                {day.section && <Badge variant="secondary" className="text-[10px]">{day.section}</Badge>}
                                {day.actualWords !== undefined && (
                                  <Badge className={cn("text-[10px]", day.actualWords >= day.wordTarget ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200")}>
                                    {day.actualWords >= day.wordTarget ? "✓ Done" : `${day.actualWords} logged`}
                                  </Badge>
                                )}
                              </div>
                              {day.taskDescription && (
                                <p className="text-sm text-muted-foreground mt-1">{day.taskDescription}</p>
                              )}
                              {day.motivation && (
                                <p className="text-xs italic text-primary/70 mt-1">"{day.motivation}"</p>
                              )}
                            </>
                          )}
                        </div>
                        {day.isWritingDay && (
                          <div className="shrink-0">
                            {logDayIndex === idx ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number" min={0} value={logWords}
                                  onChange={(e) => setLogWords(e.target.value)}
                                  placeholder="words"
                                  className="w-20 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                  autoFocus
                                />
                                <Button size="sm" onClick={() => logProgress(idx)}>Log</Button>
                                <Button size="sm" variant="ghost" onClick={() => setLogDayIndex(null)}>✕</Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => { setLogDayIndex(idx); setLogWords(""); }}>
                                Log words
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildICS(days: ScheduleDay[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ScholarForge//Writing Schedule//EN",
    "CALSCALE:GREGORIAN",
  ];
  days.filter((d) => d.isWritingDay).forEach((day) => {
    const dt = day.date.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${dt}`,
      `SUMMARY:Write ${day.wordTarget} words — ${day.section || "Dissertation"}`,
      `DESCRIPTION:${day.taskDescription || ""}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
