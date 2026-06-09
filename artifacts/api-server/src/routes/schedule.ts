import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

interface ScheduleDay {
  date: string;
  dayOfWeek: string;
  isWritingDay: boolean;
  wordTarget: number;
  section?: string;
  taskDescription?: string;
  motivation?: string;
  tip?: string;
}

interface ScheduleResult {
  days: ScheduleDay[];
  totalDays: number;
  availableDays: number;
  wordsPerDay: number;
  paceLevel: "comfortable" | "moderate" | "intensive" | "extreme";
  deadline: string;
}

function computeSchedule(
  deadline: string,
  currentWords: number,
  targetWords: number,
  selectedDays: string[],
  bufferDays: number,
  topic: string | undefined
): ScheduleResult {
  const today = new Date();
  const deadlineDate = new Date(deadline);
  const msPerDay = 86400000;
  const allDays: ScheduleDay[] = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const activeDays = selectedDays.length > 0 ? selectedDays : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  let cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(deadlineDate);
  end.setHours(0, 0, 0, 0);

  const bufferEnd = new Date(end);
  bufferEnd.setDate(bufferEnd.getDate() - bufferDays);

  while (cursor <= bufferEnd) {
    const dayName = dayNames[cursor.getDay()];
    allDays.push({
      date: cursor.toISOString().split("T")[0],
      dayOfWeek: dayName,
      isWritingDay: activeDays.includes(dayName),
      wordTarget: 0,
    });
    cursor = new Date(cursor.getTime() + msPerDay);
  }

  const writingDays = allDays.filter((d) => d.isWritingDay);
  const wordsNeeded = Math.max(0, targetWords - currentWords);
  const wordsPerDay = writingDays.length > 0 ? Math.ceil(wordsNeeded / writingDays.length) : 0;

  let pace: ScheduleResult["paceLevel"] = "comfortable";
  if (wordsPerDay > 2000) pace = "extreme";
  else if (wordsPerDay > 1200) pace = "intensive";
  else if (wordsPerDay > 600) pace = "moderate";

  writingDays.forEach((d) => { d.wordTarget = wordsPerDay; });

  return {
    days: allDays,
    totalDays: allDays.length,
    availableDays: writingDays.length,
    wordsPerDay,
    paceLevel: pace,
    deadline,
  };
}

function applyBasicDescriptions(computed: ScheduleResult): void {
  const writingDays = computed.days.filter((d) => d.isWritingDay);
  const sections = [
    "Research & note-taking", "Literature review", "Introduction",
    "Methodology", "Results", "Discussion", "Conclusion", "Editing & review",
  ];
  writingDays.forEach((day, i) => {
    const sectionIndex = Math.floor((i / writingDays.length) * sections.length);
    day.section = sections[Math.min(sectionIndex, sections.length - 1)];
    day.taskDescription = `Focus on your ${day.section.toLowerCase()} today. Aim for ${day.wordTarget.toLocaleString()} words.`;
    day.motivation = "Every word you write today brings you closer to done.";
    day.tip = "Start with the easiest part first to build momentum.";
  });
}

// POST /api/schedule
router.post("/schedule", async (req, res): Promise<void> => {
  const {
    deadline,
    currentWords = 0,
    targetWords = 10000,
    selectedDays = [],
    hoursPerDay,
    bufferDays = 3,
    topic,
  } = req.body as {
    deadline?: string;
    currentWords?: number;
    targetWords?: number;
    selectedDays?: string[];
    hoursPerDay?: number;
    bufferDays?: number;
    topic?: string;
  };

  void hoursPerDay;

  if (!deadline) { res.status(400).json({ error: "deadline is required" }); return; }

  const computed = computeSchedule(deadline, currentWords, targetWords, selectedDays, bufferDays, topic);

  const noWritingDays = computed.days.filter((d) => d.isWritingDay).length === 0;
  if (noWritingDays) {
    applyBasicDescriptions(computed);
    res.json(computed);
    return;
  }

  // Try to enhance with Groq (optional — degrades gracefully if no key)
  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    applyBasicDescriptions(computed);
    res.json(computed);
    return;
  }

  try {
    const client = new Groq({ apiKey });
    const writingDays = computed.days.filter((d) => d.isWritingDay).slice(0, 30);
    const safeTopic = wrapUserText((topic || "dissertation").slice(0, 200));

    const prompt = `A student is writing a ${safeTopic} with ${computed.wordsPerDay} words needed per writing day.
They have ${computed.availableDays} writing days until deadline. Pace: ${computed.paceLevel}.

For each of these ${writingDays.length} writing days, suggest: a specific task description (1 sentence, what to write that day), 
a motivating sentence, and one practical writing tip.

Days (index, date, wordTarget):
${writingDays.map((d, i) => `${i + 1}. ${d.date} — ${d.wordTarget} words`).join("\n")}

Also assign each day to one of these dissertation phases in order:
Research & reading → Introduction → Literature review → Methodology → Results → Discussion → Conclusion → Editing

Return ONLY a JSON array with ${writingDays.length} objects:
[{"section":"...","taskDescription":"...","motivation":"...","tip":"..."}]`;

    const msg = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.choices[0]?.message?.content ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const enhancements = JSON.parse(match[0]) as Array<{ section: string; taskDescription: string; motivation: string; tip: string }>;
      let eIdx = 0;
      computed.days.forEach((day) => {
        if (day.isWritingDay && eIdx < enhancements.length) {
          const e = enhancements[eIdx++];
          day.section = e.section ?? "";
          day.taskDescription = e.taskDescription ?? "";
          day.motivation = e.motivation ?? "";
          day.tip = e.tip ?? "";
        }
      });
    } else {
      applyBasicDescriptions(computed);
    }
  } catch {
    applyBasicDescriptions(computed);
  }

  res.json(computed);
});

export default router;
