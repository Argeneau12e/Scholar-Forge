import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

const langLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many language requests. Please wait." },
});

const SUPPORTED_LANGUAGES = [
  "Arabic", "Chinese (Simplified)", "Chinese (Traditional)", "Dutch", "French",
  "German", "Hindi", "Indonesian", "Italian", "Japanese", "Korean",
  "Polish", "Portuguese", "Russian", "Spanish", "Swedish", "Turkish", "Vietnamese",
];

// POST /api/language/check — ESL writing check
router.post("/language/check", langLimiter, async (req, res): Promise<void> => {
  const { text, nativeLanguage = "not specified", targetRegister = "academic" } = req.body as {
    text: string; nativeLanguage?: string; targetRegister?: string;
  };

  if (!text || text.trim().length < 20) { res.status(400).json({ error: "text is required (min 20 chars)" }); return; }
  if (text.length > 8000) { res.status(400).json({ error: "Text too long (max 8000 chars)" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "AI features not configured" }); return; }

  const client = new Anthropic({ apiKey });
  const safeText = wrapUserText(text.slice(0, 6000));
  const safeLang = (nativeLanguage ?? "").slice(0, 100);

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      system: "You are an expert academic writing coach specialising in helping non-native English speakers write at a high academic level. Return ONLY valid JSON.",
      messages: [{
        role: "user",
        content: `Analyse this ${targetRegister} text written by a non-native English speaker whose native language is ${safeLang || "unknown"}:

${safeText}

Return ONLY this JSON (no markdown):
{
  "overallScore": 7,
  "registrerScore": 7,
  "clarityScore": 7,
  "grammarScore": 7,
  "summary": "2-3 sentence overall assessment",
  "issues": [
    {
      "type": "grammar|register|clarity|vocabulary|preposition|article|syntax",
      "original": "exact quoted problematic phrase (max 80 chars)",
      "suggestion": "corrected version",
      "explanation": "why this is an issue (1 sentence)",
      "priority": "high|medium|low"
    }
  ],
  "positives": ["strength 1", "strength 2"],
  "vocabularyGaps": ["term you should know", "term you should know"],
  "l1Interference": "If the native language is known, describe typical L1 interference patterns — 1 sentence. Empty string if unknown.",
  "rewrittenParagraph": "If text is a single paragraph, rewrite it at a high academic level. Otherwise empty string."
}`,
      }],
    });

    const raw = resp.content[0]?.type === "text" ? resp.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : {};
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

// POST /api/language/translate — translate academic text
router.post("/language/translate", langLimiter, async (req, res): Promise<void> => {
  const { text, targetLanguage, preserveFormatting = true } = req.body as {
    text: string; targetLanguage: string; preserveFormatting?: boolean;
  };

  if (!text || text.trim().length < 5) { res.status(400).json({ error: "text is required" }); return; }
  if (text.length > 5000) { res.status(400).json({ error: "Text too long (max 5000 chars)" }); return; }
  if (!targetLanguage || !SUPPORTED_LANGUAGES.some((l) => l.toLowerCase() === targetLanguage.toLowerCase())) {
    res.status(400).json({ error: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(", ")}` });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "AI features not configured" }); return; }

  const client = new Anthropic({ apiKey });
  const safeText = wrapUserText(text.slice(0, 4000));

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system: `You are a professional academic translator. Translate with precision, preserving technical terminology, academic register, and structure. Return ONLY valid JSON.`,
      messages: [{
        role: "user",
        content: `Translate this academic text to ${targetLanguage}. Preserve all formatting, headings, and academic register.

Text to translate:
${safeText}

Return ONLY this JSON:
{
  "translation": "the full translated text",
  "notes": "any important translation notes — e.g. terms that have no direct equivalent, or regional variations (max 3 bullet points as a plain string, or empty string)",
  "technicalTerms": [{"source": "English term", "target": "translated term"}]
}`,
      }],
    });

    const raw = resp.content[0]?.type === "text" ? resp.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : {};
    res.json({ ...data, targetLanguage });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

// POST /api/language/simplify — plain language version + back-translation
router.post("/language/simplify", langLimiter, async (req, res): Promise<void> => {
  const { text, targetLanguage = "English", readingLevel = "undergraduate" } = req.body as {
    text: string; targetLanguage?: string; readingLevel?: string;
  };

  if (!text || text.trim().length < 20) { res.status(400).json({ error: "text is required" }); return; }
  if (text.length > 5000) { res.status(400).json({ error: "Text too long (max 5000 chars)" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "AI features not configured" }); return; }

  const client = new Anthropic({ apiKey });
  const safeText = wrapUserText(text.slice(0, 4000));

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      system: "You are an academic writing simplification expert. Return ONLY valid JSON.",
      messages: [{
        role: "user",
        content: `Simplify this academic text for a ${readingLevel} student${targetLanguage !== "English" ? `, and also provide a version in ${targetLanguage}` : ""}.

${safeText}

Return ONLY this JSON:
{
  "simplified": "plain English simplified version — same meaning, simpler words",
  "keyTermsDefined": [{"term": "jargon term", "definition": "plain language definition"}],
  "translation": ${targetLanguage !== "English" ? `"simplified version translated to ${targetLanguage}"` : `""`}
}`,
      }],
    });

    const raw = resp.content[0]?.type === "text" ? resp.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : {};
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

export { SUPPORTED_LANGUAGES };
export default router;
