import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

type CoachMode = "full" | "clarity" | "structure" | "jargon";

interface CoachBody {
  text?: string;
  mode?: string;
  discipline?: string;
}

interface IssueItem {
  type: "citation_missing" | "jargon" | "passive_voice" | "unclear_argument" | "undefined_term" | "structural";
  quote: string;
  explanation: string;
  fix: string;
}

interface CoachResult {
  scores: {
    clarity: number;
    structure: number;
    academicRegister: number;
    citationNeeds: number;
  };
  passiveVoiceCount: number;
  jargonDensity: "low" | "medium" | "high";
  issues: IssueItem[];
  rewrite: string;
  clarityVersion: string;
  overallFeedback: string;
}

interface OutlineBody {
  text?: string;
}

interface ParagraphResult {
  implied_topic: string;
  issues: string[];
}

interface OutlineResult {
  paragraphs: ParagraphResult[];
  flowProblems: string[];
  definitionIssues: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tryParseJson<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are an experienced dissertation supervisor providing constructive feedback on a student's academic writing. Be specific, actionable, and encouraging. Return ONLY valid JSON.`;

function buildFullPrompt(text: string, discipline: string): string {
  return `Analyze this student's paragraph from a ${discipline} dissertation and provide detailed feedback.

Paragraph:
${text}

Return ONLY this JSON:
{
  "scores": {
    "clarity": 7,
    "structure": 6,
    "academicRegister": 8,
    "citationNeeds": 5
  },
  "passiveVoiceCount": 2,
  "jargonDensity": "medium",
  "issues": [
    {
      "type": "citation_missing",
      "quote": "exact problematic phrase max 10 words",
      "explanation": "what is wrong in one sentence",
      "fix": "specific suggestion in one sentence"
    }
  ],
  "rewrite": "improved version of the full paragraph",
  "clarityVersion": "plain English version of the paragraph for comparison",
  "overallFeedback": "2-3 encouraging but honest sentences of overall feedback"
}

Issue types: citation_missing | jargon | passive_voice | unclear_argument | undefined_term | structural
Scores 1-10. citationNeeds: 10 = all claims properly cited.`;
}

function buildJargonPrompt(text: string, discipline: string): string {
  return `You are a writing clarity coach. Take this ${discipline} academic text and produce a plain English version that a non-specialist could understand, while preserving all meaning and facts.

Text:
${text}

Return ONLY this JSON:
{
  "clarityVersion": "plain English rewrite of the text"
}`;
}

function buildOutlinePrompt(text: string): string {
  return `Analyze the structure of this academic writing section. For each paragraph, extract the implied topic sentence and identify any structural issues.

Text:
${text}

Return ONLY this JSON:
{
  "paragraphs": [
    {
      "implied_topic": "one sentence summarising what this paragraph is actually about",
      "issues": ["any structural issue with this paragraph"]
    }
  ],
  "flowProblems": ["description of any logical flow problem between consecutive paragraphs"],
  "definitionIssues": ["any term used before being properly defined"]
}

Be specific. If no issues exist for a paragraph, return an empty issues array. Identify genuine flow problems only.`;
}

// ─── POST /api/coach ─────────────────────────────────────────────────────────

router.post("/coach", async (req, res): Promise<void> => {
  const body = req.body as CoachBody;

  if (typeof body.text !== "string" || !body.text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (body.text.trim().length < 20) {
    res.status(400).json({ error: "Please paste at least a full sentence to analyse." });
    return;
  }

  const VALID_MODES: CoachMode[] = ["full", "clarity", "structure", "jargon"];
  const mode: CoachMode = VALID_MODES.includes(body.mode as CoachMode)
    ? (body.mode as CoachMode)
    : "full";
  const discipline = typeof body.discipline === "string" ? body.discipline.trim() || "general" : "general";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI coaching is not configured. Add ANTHROPIC_API_KEY to enable." });
    return;
  }

  const client = new Anthropic({ apiKey });

  try {
    if (mode === "jargon") {
      // Jargon mode: just return plain-English version
      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildJargonPrompt(body.text.trim(), discipline) }],
      });
      const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
      const parsed = tryParseJson<{ clarityVersion: string }>(raw);
      res.json({ clarityVersion: parsed?.clarityVersion ?? raw, original: body.text.trim() });
      return;
    }

    // Full / clarity / structure — all use the full analysis prompt
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildFullPrompt(body.text.trim(), discipline) }],
    });
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    let result = tryParseJson<CoachResult>(raw);

    // Retry once with simplified prompt if parse fails
    if (!result) {
      const msg2 = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Review this paragraph briefly. Return JSON: {"scores":{"clarity":7,"structure":7,"academicRegister":7,"citationNeeds":7},"passiveVoiceCount":1,"jargonDensity":"medium","issues":[],"rewrite":"improved version","clarityVersion":"plain English version","overallFeedback":"feedback here"}\n\nParagraph: ${body.text.trim().slice(0, 800)}`,
          },
        ],
      });
      const raw2 = msg2.content[0]?.type === "text" ? msg2.content[0].text : "";
      result = tryParseJson<CoachResult>(raw2);
    }

    if (!result) {
      res.status(500).json({ error: "Could not parse AI response. Please try again." });
      return;
    }

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Coaching failed: ${msg}` });
  }
});

// ─── POST /api/coach/outline ──────────────────────────────────────────────────

router.post("/coach/outline", async (req, res): Promise<void> => {
  const body = req.body as OutlineBody;

  if (typeof body.text !== "string" || !body.text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI coaching is not configured. Add ANTHROPIC_API_KEY to enable." });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildOutlinePrompt(body.text.trim()) }],
    });
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const result = tryParseJson<OutlineResult>(raw);

    if (!result) {
      res.status(500).json({ error: "Could not parse AI response. Please try again." });
      return;
    }

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Structure analysis failed: ${msg}` });
  }
});

export default router;
