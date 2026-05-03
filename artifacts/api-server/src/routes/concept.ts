import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";
import { safeFetch } from "../lib/safeFetch";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

const conceptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many concept requests. Please wait." },
});

// POST /api/concept
router.post("/concept", conceptLimiter, async (req, res): Promise<void> => {
  const { term, context = "", discipline = "general" } = req.body as {
    term: string;
    context?: string;
    discipline?: string;
  };

  if (!term || term.trim().length === 0) {
    res.status(400).json({ error: "term is required" });
    return;
  }
  if (term.length > 500) {
    res.status(400).json({ error: "Term too long (max 500 chars)" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const client = new Anthropic({ apiKey });
  const safeTerm = wrapUserText(term.slice(0, 300));
  const safeContext = context ? `\nContext: "${context.slice(0, 500)}"` : "";
  const safeDisc = discipline.slice(0, 100);

  const [aiResult, papersResult] = await Promise.allSettled([
    client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      system: "You are an expert academic tutor who can explain any concept at exactly the right level. You are patient, clear, and never condescending. Return ONLY valid JSON — no markdown, no commentary.",
      messages: [{
        role: "user",
        content: `Explain ${safeTerm} to a university student studying ${safeDisc}.${safeContext}

Return ONLY this JSON:
{
  "simple": "explanation for someone with no background — 2-3 sentences, no jargon, use an everyday analogy",
  "student": "explanation for a student studying this — 4-5 sentences, correct terminology, one example from the field",
  "technical": "full academic definition with precision — as it would appear in a methods textbook",
  "etymology": "where the word/term comes from, if interesting — 1 sentence, or empty string if not notable",
  "relatedTerms": ["term1", "term2", "term3"],
  "commonMistake": "the most common misconception about this term — 1 sentence, or empty string if none",
  "disciplines": ["discipline1", "discipline2"]
}`,
      }],
    }),
    safeFetch(`https://api.openalex.org/works?search=${encodeURIComponent(term)}&sort=cited_by_count:desc&filter=open_access.is_oa:true&per-page=3&select=id,title,authorships,publication_year,doi,primary_location`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .catch(() => ({ results: [] })),
  ]);

  // Parse AI response
  let explanation: Record<string, unknown> = {};
  if (aiResult.status === "fulfilled") {
    const text = aiResult.value.content[0]?.type === "text" ? aiResult.value.content[0].text : "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { explanation = JSON.parse(match[0]); } catch { explanation = {}; }
    }
  }

  // Parse further reading papers
  type OAWork = { id?: string; title?: string; doi?: string; publication_year?: number; authorships?: Array<{ author?: { display_name?: string } }>; primary_location?: { source?: { display_name?: string } } };
  const papers = papersResult.status === "fulfilled"
    ? ((papersResult.value as { results?: OAWork[] }).results ?? []).slice(0, 3).map((w: OAWork) => ({
        id: w.id,
        title: w.title,
        doi: w.doi,
        year: w.publication_year,
        authors: (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name ?? ""),
        journal: w.primary_location?.source?.display_name ?? null,
      }))
    : [];

  res.json({ ...explanation, furtherReading: papers, term });
});

export default router;
