import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
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

  if (!topic || topic.trim().length < 5) {
    res.status(400).json({ error: "topic is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const client = new Anthropic({ apiKey });
  const safeTopic = wrapUserText(topic.slice(0, 300));
  const safeDisc = discipline.slice(0, 100);
  const safeCollection = collectionSummary.slice(0, 1000);

  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1200,
    messages: [{
      role: "user",
      content: `Generate content for an academic conference poster on this ${safeDisc} topic: ${safeTopic}
${safeCollection ? `Sources available: ${safeCollection}` : ""}
Authors: ${wrapUserText(authors.slice(0, 200))}
Institution: ${wrapUserText(institution.slice(0, 200))}

Return ONLY valid JSON (no markdown):
{
  "title": "poster title (concise, ≤12 words)",
  "authors": "author string",
  "institution": "institution string",
  "introduction": "100-word introduction paragraph",
  "objectives": ["objective 1", "objective 2", "objective 3"],
  "methods": "80-word methods paragraph",
  "keyFindings": ["finding 1", "finding 2", "finding 3", "finding 4"],
  "conclusions": "80-word conclusions paragraph",
  "references": ["Reference 1 formatted citation", "Reference 2"],
  "suggestedFigure": "description of ideal figure or diagram for this poster"
}

Base content on real academic conventions. Never fabricate specific statistics.`,
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    res.status(502).json({ error: "Could not parse AI response" });
    return;
  }

  try {
    const content = JSON.parse(match[0]);
    res.json(content);
  } catch {
    res.status(502).json({ error: "Invalid JSON from AI" });
  }
});

export default router;
