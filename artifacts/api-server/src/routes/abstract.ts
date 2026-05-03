import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

// POST /api/abstract
router.post("/abstract", async (req, res): Promise<void> => {
  const { documentContent, wordLimit = 250, abstractType = "unstructured", discipline = "general", keywords = [] } = req.body as {
    documentContent: string;
    wordLimit?: number;
    abstractType?: "structured" | "unstructured";
    discipline?: string;
    keywords?: string[];
  };

  if (!documentContent || documentContent.trim().length < 50) {
    res.status(400).json({ error: "documentContent must be at least 50 characters" });
    return;
  }

  const clampedLimit = Math.min(Math.max(wordLimit, 50), 600);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const client = new Anthropic({ apiKey });
  const safeContent = wrapUserText(documentContent.slice(0, 12000));
  const safeDisc = discipline.slice(0, 100);
  const keywordHint = keywords.length > 0 ? `Suggested keywords to weave in: ${keywords.slice(0, 8).join(", ")}.` : "";

  const structuredNote = abstractType === "structured"
    ? `Structure the abstract with these clearly labelled sections: Background | Objective | Methods | Results | Conclusions. Also return each section separately in the "sections" field.`
    : `Write as a single flowing paragraph.`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `You are an expert academic abstract writer. Write a ${clampedLimit}-word abstract for this ${safeDisc} paper/dissertation.

${structuredNote}
${keywordHint}

Rules:
- Stay within ${clampedLimit} words (count carefully)
- Never add information not in the source text
- Use appropriate academic register for ${safeDisc}
- Include background, objective, methods, results, and conclusions implicitly even in unstructured format

Source text:
${safeContent}

Return ONLY valid JSON:
{
  "abstract": "the full abstract text",
  "wordCount": <exact word count as integer>,
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5"],
  "sections": ${abstractType === "structured" ? '{"background":"...","objective":"...","methods":"...","results":"...","conclusions":"..."}' : "null"}
}`,
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    res.status(502).json({ error: "Could not parse AI response" });
    return;
  }

  try {
    const result = JSON.parse(match[0]);
    // Recount words ourselves as a sanity check
    const actualCount = (result.abstract ?? "").trim().split(/\s+/).filter(Boolean).length;
    result.wordCount = actualCount;
    res.json(result);
  } catch {
    res.status(502).json({ error: "Invalid JSON from AI" });
  }
});

export default router;
