import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";

const router: IRouter = Router();

type Intensity = "literal" | "moderate" | "student";

interface ParaphraseBody {
  text: string;
  intensity: Intensity;
  discipline?: string;
  citation?: {
    authors?: string;
    year?: number | string;
    journal?: string;
    doi?: string;
  };
}

const VALID_INTENSITIES: Intensity[] = ["literal", "moderate", "student"];

const SYSTEM_PROMPT = `You are an expert academic writing assistant helping a university student paraphrase research text for their dissertation. You must:
1. Preserve ALL scientific facts, measurements, and findings exactly
2. Never introduce claims not present in the original
3. Always maintain academic register appropriate for the discipline
4. Return ONLY the paraphrased text followed by the formatted citation
5. Never add commentary or explain what you did`;

function buildUserPrompt(
  text: string,
  intensity: Intensity,
  discipline: string,
  citation: { authors?: string; year?: number | string }
): string {
  const citationStr = [citation.authors || "Unknown", citation.year || "n.d."]
    .filter(Boolean)
    .join(", ");

  const citationInstruction = `End with this citation in parentheses: (${citationStr})`;

  if (intensity === "literal") {
    return `Paraphrase this text with minimal changes. Change sentence structure slightly but keep most of the same vocabulary. Discipline: ${discipline}.

Original text: ${text}

${citationInstruction}`;
  }

  if (intensity === "moderate") {
    return `Paraphrase this text significantly. Use different vocabulary and sentence structure while preserving all facts and meaning. Discipline: ${discipline}.

Original text: ${text}

${citationInstruction}`;
  }

  // student
  return `Rewrite this text in the voice of a knowledgeable student explaining the concept to a peer. Use natural academic language, not stiff jargon. Preserve all facts. Discipline: ${discipline}.

Original text: ${text}

${citationInstruction}`;
}

router.post("/paraphrase", async (req, res): Promise<void> => {
  const body = req.body as ParaphraseBody;

  if (!body?.text || typeof body.text !== "string" || !body.text.trim()) {
    res.status(400).json({ error: "text is required and must be a non-empty string" });
    return;
  }
  if (body.text.length > 8000) {
    res.status(400).json({ error: "text exceeds maximum length of 8000 characters" });
    return;
  }
  if (!body.intensity || !VALID_INTENSITIES.includes(body.intensity)) {
    res.status(400).json({ error: "intensity must be one of: literal, moderate, student" });
    return;
  }

  const discipline = body.discipline?.trim() || "general";
  const citation = body.citation ?? {};

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "AI paraphrasing is not configured. Add ANTHROPIC_API_KEY to enable this feature.",
    });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(wrapUserText(body.text), body.intensity, discipline, citation),
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      res.status(500).json({ error: "Unexpected response format from AI" });
      return;
    }

    const raw = content.text.trim();
    const validation = validateClaudeResponse(raw);
    if (!validation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/paraphrase", reason: validation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed. Please try again." });
      return;
    }
    const citationMatch = raw.match(/(\([^)]+\))\s*$/);
    const citationInline = citationMatch ? citationMatch[1] : "";
    const paraphrase = citationMatch
      ? raw.slice(0, citationMatch.index).trim()
      : raw;

    res.json({ paraphrase, citationInline });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Paraphrasing failed: ${msg}` });
  }
});

export default router;
