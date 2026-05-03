import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

interface ScheduleDay {
  date: string;
  dayOfWeek: string;
  isWritingDay: boolean;
  wordTarget: number;
  section: string;
  taskDescription: string;
  motivation: string;
  tip: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function computeSchedule(
  deadline: string,
  currentWords: number,
  targetWords: number,
  selectedDays: string[],
  bufferDays: number,
  topic: string
): { days: ScheduleDay[]; totalWords: number; wordsPerDay: number; paceLevel: "comfortable" | "challenging" | "intense"; availableDays: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline + "T12:00:00");
  const effectiveDeadline = new Date(deadlineDate);
  effectiveDeadline.setDate(effectiveDeadline.getDate() - bufferDays);

  const days: ScheduleDay[] = [];
  const cursor = new Date(today);
  const wordsRemaining = Math.max(0, targetWords - currentWords);

  // Collect all writing days up to effective deadline
  const writingDays: Date[] = [];
  while (cursor <= effectiveDeadline) {
    const dayName = DAY_NAMES[cursor.getDay()];
    if (selectedDays.includes(dayName)) {
      writingDays.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const availableDays = writingDays.length;
  const wordsPerDay = availableDays > 0 ? Math.round(wordsRemaining / availableDays) : 0;
  const paceLevel: "comfortable" | "challenging" | "intense" =
    wordsPerDay <= 500 ? "comfortable" : wordsPerDay <= 900 ? "challenging" : "intense";

  // Phase-based distribution: early (20%) = lighter, middle (60%) = normal, late (20%) = lighter
  const earlyEnd = Math.floor(availableDays * 0.2);
  const lateStart = Math.floor(availableDays * 0.8);

  // Build writing day targets
  const writingTargets = new Map<string, number>();
  writingDays.forEach((d, i) => {
    const key = d.toISOString().split("T")[0];
    let target: number;
    if (i < earlyEnd) {
      target = Math.round(wordsPerDay * 0.85); // research-heavy phase
    } else if (i >= lateStart) {
      target = Math.round(wordsPerDay * 0.75); // editing phase
    } else {
      target = wordsPerDay; // steady writing
    }
    writingTargets.set(key, target);
  });

  // Generate all calendar days from today to deadline
  const cal = new Date(today);
  const calEnd = new Date(deadlineDate);
  calEnd.setDate(calEnd.getDate() + 1);
  while (cal < calEnd) {
    const dateStr = cal.toISOString().split("T")[0];
    const dayName = DAY_NAMES[cal.getDay()];
    const isWriting = writingTargets.has(dateStr);
    days.push({
      date: dateStr,
      dayOfWeek: dayName,
      isWritingDay: isWriting,
      wordTarget: isWriting ? (writingTargets.get(dateStr) ?? 0) : 0,
      section: "",
      taskDescription: "",
      motivation: "",
      tip: "",
    });
    cal.setDate(cal.getDate() + 1);
  }

  return { days, totalWords: targetWords, wordsPerDay, paceLevel, availableDays };
}

// POST /api/schedule
router.post("/schedule", async (req, res): Promise<void> => {
  const { deadline, currentWords = 0, targetWords = 10000, selectedDays = ["Mon","Tue","Wed","Thu","Fri"], hoursPerDay = 3, bufferDays = 7, topic = "" } = req.body as {
    deadline: string;
    currentWords?: number;
    targetWords?: number;
    selectedDays?: string[];
    hoursPerDay?: number;
    bufferDays?: number;
    topic?: string;
  };

  if (!deadline) {
    res.status(400).json({ error: "deadline is required" });
    return;
  }

  const computed = computeSchedule(deadline, currentWords, targetWords, selectedDays, bufferDays, topic);

  // Try to enhance with Claude (optional — degrades gracefully)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || computed.days.filter((d) => d.isWritingDay).length === 0) {
    // Provide basic task descriptions without Claude
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
    res.json(computed);
    return;
  }

  try {
    const client = new Anthropic({ apiKey });
    const writingDays = computed.days.filter((d) => d.isWritingDay).slice(0, 30); // cap for token safety

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

    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
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
    }
  } catch {
    // Enhancement failed — basic descriptions are already set above
  }

  res.json(computed);
});

export default router;
