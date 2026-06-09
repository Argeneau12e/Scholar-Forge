import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import rateLimit from "express-rate-limit";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

const langLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many language requests. Please wait before trying again." },
});

// ─── POST /api/language/check ─────────────────────────────────────────────────

router.post("/language/check", langLimiter, async (req, res): Promise<void> => {
  const { text, nativeLanguage = "unknown", discipline = "general" } = req.body as {
    text?: string;
    nativeLanguage?: string;
    discipline?: string;
  };

  if (!text || text.trim().length < 20) { res.status(400).json({ error: "text must be at least 20 characters" }); return; }
  if (text.length > 5000) { res.status(400).json({ error: "text too long (max 5000 chars)" }); return; }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const client = new Groq({ apiKey });
  const safeText = wrapUserText(text.slice(0, 5000));

  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: "You are an expert academic English writing coach specialising in helping ESL students write clear, formal academic prose. Return ONLY valid JSON.",
      },
      {
        role: "user",
        content: `Analyse this ${discipline} academic writing from an ESL student (native language: ${nativeLanguage}).

Text:
${safeText}

Return ONLY this JSON:
{
  "scores": {
    "overall": 7,
    "grammar": 7,
    "register": 7,
    "clarity": 7
  },
  "issues": [
    {
      "type": "grammar|register|clarity|vocabulary|structure",
      "quote": "exact problematic phrase max 10 words",
      "explanation": "what is wrong",
      "suggestion": "improved version"
    }
  ],
  "positives": ["strength 1", "strength 2"],
  "vocabularyGaps": ["word/phrase that should be avoided or upgraded"],
  "l1Interference": "one sentence on any patterns suggesting L1 interference (or null)",
  "suggestedRewrite": "improved version of the full text preserving meaning"
}
Scores 1-10. Identify up to 5 real issues only.`,
      },
    ],
  });

  const raw = msg.choices[0]?.message?.content ?? "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }
  res.json(JSON.parse(match[0]));
});

// ─── POST /api/language/translate ────────────────────────────────────────────

router.post("/language/translate", langLimiter, async (req, res): Promise<void> => {
  const { text, targetLanguage, discipline = "general", preserveTerms = true } = req.body as {
    text?: string;
    targetLanguage?: string;
    discipline?: string;
    preserveTerms?: boolean;
  };

  if (!text || text.trim().length < 10) { res.status(400).json({ error: "text must be at least 10 characters" }); return; }
  if (!targetLanguage || targetLanguage.trim().length === 0) { res.status(400).json({ error: "targetLanguage is required" }); return; }
  if (text.length > 5000) { res.status(400).json({ error: "text too long (max 5000 chars)" }); return; }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const client = new Groq({ apiKey });
  const safeText = wrapUserText(text.slice(0, 5000));
  const safeLang = targetLanguage.slice(0, 50);
  const termNote = preserveTerms
    ? "Keep technical/scientific terms in English (or provide them in parentheses after the translation if they have a standard equivalent)."
    : "Translate all terms, including technical ones.";

  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are an expert academic translator. You translate academic texts with high fidelity, preserving academic register and meaning. Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Translate this ${discipline} academic text into ${safeLang}. ${termNote}

Text:
${safeText}

Return ONLY this JSON:
{
  "translation": "the full translated text",
  "glossary": [
    { "original": "English term", "translated": "translated term", "note": "optional brief note" }
  ],
  "notes": "any translation challenges or important caveats (or null)"
}
Include up to 10 key technical terms in glossary.`,
      },
    ],
  });

  const raw = msg.choices[0]?.message?.content ?? "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }
  res.json(JSON.parse(match[0]));
});

// ─── POST /api/language/simplify ─────────────────────────────────────────────

router.post("/language/simplify", langLimiter, async (req, res): Promise<void> => {
  const { text, targetLanguage, discipline = "general" } = req.body as {
    text?: string;
    targetLanguage?: string;
    discipline?: string;
  };

  if (!text || text.trim().length < 10) { res.status(400).json({ error: "text must be at least 10 characters" }); return; }
  if (text.length > 5000) { res.status(400).json({ error: "text too long (max 5000 chars)" }); return; }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const client = new Groq({ apiKey });
  const safeText = wrapUserText(text.slice(0, 5000));
  const translateNote = targetLanguage
    ? `Also translate the plain English version into ${targetLanguage.slice(0, 50)}.`
    : "Do not translate.";

  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: "You are an expert at making complex academic text understandable. Return ONLY valid JSON.",
      },
      {
        role: "user",
        content: `Simplify this ${discipline} academic text into plain English that a non-specialist can understand. Keep all facts accurate. ${translateNote}

Text:
${safeText}

Return ONLY this JSON:
{
  "simplified": "plain English version preserving all facts",
  "translation": ${targetLanguage ? '"translation into ' + targetLanguage + '"' : "null"},
  "keyTerms": [
    { "term": "technical term", "definition": "plain English definition" }
  ],
  "readabilityNote": "one sentence on the main simplification made"
}
Include up to 8 key terms.`,
      },
    ],
  });

  const raw = msg.choices[0]?.message?.content ?? "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }
  res.json(JSON.parse(match[0]));
});

export default router;
