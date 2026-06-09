import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";

const router: IRouter = Router();

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
  scores: { clarity: number; structure: number; academicRegister: number; citationNeeds: number };
  passiveVoiceCount: number;
  jargonDensity: "low" | "medium" | "high";
  issues: IssueItem[];
  rewrite: string;
  clarityVersion: string;
  overallFeedback: string;
}

interface OutlineBody { text?: string; }

interface ParagraphResult { implied_topic: string; issues: string[]; }
interface OutlineResult {
  paragraphs: ParagraphResult[];
  flowProblems: string[];
  definitionIssues: string[];
}

function tryParseJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]) as T; } catch { return null; }
}

const SYSTEM_PROMPT = `You are an experienced dissertation supervisor providing constructive feedback on a student's academic writing. Be specific, actionable, and encouraging. Return ONLY valid JSON.`;

function buildFullPrompt(text: string, discipline: string): string {
  return `Analyze this student's paragraph from a ${discipline} dissertation and provide detailed feedback.

Paragraph:
${text}

Return ONLY this JSON:
{
  "scores": {"clarity": 7,"structure": 6,"academicRegister": 8,"citationNeeds": 5},
  "passiveVoiceCount": 2,
  "jargonDensity": "medium",
  "issues": [{"type": "citation_missing","quote": "exact problematic phrase max 10 words","explanation": "what is wrong","fix": "specific suggestion"}],
  "rewrite": "improved version of the full paragraph",
  "clarityVersion": "plain English version of the paragraph",
  "overallFeedback": "2-3 encouraging but honest sentences"
}
Issue types: citation_missing | jargon | passive_voice | unclear_argument | undefined_term | structural
Scores 1-10.`;
}

function buildJargonPrompt(text: string, discipline: string): string {
  return `You are a writing clarity coach. Take this ${discipline} academic text and produce a plain English version a non-specialist could understand.

Text:
${text}

Return ONLY this JSON:
{"clarityVersion": "plain English rewrite"}`;
}

function buildOutlinePrompt(text: string): string {
  return `Analyze the structure of this academic writing section.

Text:
${text}

Return ONLY this JSON:
{
  "paragraphs": [{"implied_topic": "one sentence","issues": ["any structural issue"]}],
  "flowProblems": ["description of any logical flow problem"],
  "definitionIssues": ["any term used before being defined"]
}
Be specific. Empty issues array if no issues.`;
}

// ─── POST /api/coach ──────────────────────────────────────────────────────────

router.post("/coach", async (req, res): Promise<void> => {
  const body = req.body as CoachBody;

  if (typeof body.text !== "string" || !body.text.trim()) { res.status(400).json({ error: "text is required" }); return; }
  if (body.text.trim().length < 20) { res.status(400).json({ error: "Please paste at least a full sentence to analyse." }); return; }

  const VALID_MODES: CoachMode[] = ["full", "clarity", "structure", "jargon"];
  const mode: CoachMode = VALID_MODES.includes(body.mode as CoachMode) ? (body.mode as CoachMode) : "full";
  const discipline = typeof body.discipline === "string" ? body.discipline.trim() || "general" : "general";

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const client = new Groq({ apiKey });
  const safeText = wrapUserText(body.text.trim());

  try {
    if (mode === "jargon") {
      const message = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildJargonPrompt(safeText, discipline) },
        ],
      });
      const raw = message.choices[0]?.message?.content ?? "";
      const jargonValidation = validateClaudeResponse(raw);
      if (!jargonValidation.safe) {
        req.log.warn({ ip: req.ip, route: "/api/coach/jargon", reason: jargonValidation.reason }, "promptSafety: suspicious response blocked");
        res.status(500).json({ error: "Response validation failed." }); return;
      }
      const parsed = tryParseJson<{ clarityVersion: string }>(raw);
      res.json({ clarityVersion: parsed?.clarityVersion ?? raw, original: body.text.trim() });
      return;
    }

    const message = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildFullPrompt(safeText, discipline) },
      ],
    });
    const raw = message.choices[0]?.message?.content ?? "";
    const coachValidation = validateClaudeResponse(raw);
    if (!coachValidation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/coach", reason: coachValidation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed." }); return;
    }
    let result = tryParseJson<CoachResult>(raw);

    if (!result) {
      const msg2 = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Review this paragraph briefly. Return JSON: {"scores":{"clarity":7,"structure":7,"academicRegister":7,"citationNeeds":7},"passiveVoiceCount":1,"jargonDensity":"medium","issues":[],"rewrite":"improved version","clarityVersion":"plain English version","overallFeedback":"feedback here"}\n\nParagraph: ${body.text.trim().slice(0, 800)}`,
        }],
      });
      const raw2 = msg2.choices[0]?.message?.content ?? "";
      result = tryParseJson<CoachResult>(raw2);
    }

    if (!result) { res.status(500).json({ error: "Could not parse AI response. Please try again." }); return; }
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Coaching failed: ${msg}` });
  }
});

// ─── POST /api/coach/outline ──────────────────────────────────────────────────

router.post("/coach/outline", async (req, res): Promise<void> => {
  const body = req.body as OutlineBody;

  if (typeof body.text !== "string" || !body.text.trim()) { res.status(400).json({ error: "text is required" }); return; }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  try {
    const client = new Groq({ apiKey });
    const message = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildOutlinePrompt(body.text.trim()) },
      ],
    });
    const raw = message.choices[0]?.message?.content ?? "";
    const result = tryParseJson<OutlineResult>(raw);
    if (!result) { res.status(500).json({ error: "Could not parse AI response." }); return; }
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Structure analysis failed: ${msg}` });
  }
});

export default router;
