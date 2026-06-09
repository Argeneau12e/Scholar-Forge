import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText } from "../lib/promptSafety";

const router: IRouter = Router();

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

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." });
    return;
  }

  const clampedLimit = Math.min(Math.max(wordLimit, 50), 600);
  const client = new Groq({ apiKey });
  const safeContent = wrapUserText(documentContent.slice(0, 12000));
  const safeDisc = discipline.slice(0, 100);
  const keywordHint = keywords.length > 0 ? `Suggested keywords to weave in: ${keywords.slice(0, 8).join(", ")}.` : "";
  const structuredNote = abstractType === "structured"
    ? `Structure the abstract with these clearly labelled sections: Background | Objective | Methods | Results | Conclusions. Also return each section separately in the "sections" field.`
    : `Write as a single flowing paragraph.`;

  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
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

  const text = msg.choices[0]?.message?.content ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }

  try {
    const result = JSON.parse(match[0]);
    result.wordCount = (result.abstract ?? "").trim().split(/\s+/).filter(Boolean).length;
    res.json(result);
  } catch {
    res.status(502).json({ error: "Invalid JSON from AI" });
  }
});

export default router;
