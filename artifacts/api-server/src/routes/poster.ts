import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

// POST /api/poster/content
router.post("/poster/content", async (req, res): Promise<void> => {
  const { topic, discipline = "general", authors = "Author", institution = "", collectionSummary = "" } = req.body as {
    topic: string;
    discipline?: string;
    authors?: string;
    institution?: string;
    collectionSummary?: string;
  };

  if (!topic || topic.trim().length < 5) { res.status(400).json({ error: "topic is required (min 5 chars)" }); return; }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const client = new Groq({ apiKey });
  const safeTopic = wrapUserText(topic.slice(0, 300));
  const safeDisc = discipline.slice(0, 100);
  const safeCollection = collectionSummary ? wrapUserText(collectionSummary.slice(0, 3000)) : "";
  const collectionContext = safeCollection ? `\n\nUse this research context where relevant:\n${safeCollection}` : "";

  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `Create content for a professional academic conference poster about: "${safeTopic}" in the field of ${safeDisc}.${collectionContext}

Return ONLY this JSON (no markdown):
{
  "title": "clear, specific poster title",
  "authors": "${authors}",
  "institution": "${institution}",
  "introduction": "2-3 sentences: background and why this research matters",
  "methods": "2-3 sentences: how the research was/could be conducted",
  "findings": "3-5 bullet points of key findings or expected outcomes (as array of strings)",
  "conclusions": "2-3 sentences: implications and future work",
  "limitations": "1-2 sentences on limitations",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Keep each section concise — poster text should be scannable.`,
    }],
  });

  const text = msg.choices[0]?.message?.content ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }

  try {
    res.json(JSON.parse(match[0]));
  } catch {
    res.status(502).json({ error: "Invalid JSON from AI" });
  }
});

export default router;
