import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import rateLimit from "express-rate-limit";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

const conceptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many concept requests. Please wait." },
});

router.post("/concept", conceptLimiter, async (req, res): Promise<void> => {
  const { term, context, discipline } = req.body as {
    term?: string;
    context?: string;
    discipline?: string;
  };

  if (!term || term.trim().length === 0) { res.status(400).json({ error: "term is required" }); return; }
  if (term.length > 300) { res.status(400).json({ error: "term too long (max 300 chars)" }); return; }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." });
    return;
  }

  const client = new Groq({ apiKey });
  const safeTerm = wrapUserText(term.trim().slice(0, 300));
  const safeContext = context ? wrapUserText(context.slice(0, 1000)) : null;
  const safeDisc = (discipline ?? "general academic").slice(0, 100);
  const contextLine = safeContext ? `\n\nContext from the paper where this term appears:\n${safeContext}` : "";

  try {
    const msg = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Explain the concept "${safeTerm}" for a ${safeDisc} student.${contextLine}

Return ONLY this JSON (no markdown):
{
  "term": "${safeTerm}",
  "definition": "clear 2-3 sentence definition",
  "example": "one concrete real-world example",
  "relatedTerms": ["term1", "term2", "term3"],
  "whyItMatters": "one sentence on why this matters for research in ${safeDisc}"
}`,
      }],
    });

    const raw = msg.choices[0]?.message?.content ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }
    res.json(JSON.parse(match[0]));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

export default router;
