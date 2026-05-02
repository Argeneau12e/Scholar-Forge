import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

interface SimilarityResult {
  score: number;
  verdict: "high" | "moderate" | "low";
  sharedPhrases: string[];
  assessment: string;
}

function validateResult(obj: unknown): SimilarityResult {
  if (!obj || typeof obj !== "object") throw new Error("Not an object");
  const r = obj as Record<string, unknown>;

  const score = typeof r.score === "number" ? Math.round(Math.min(100, Math.max(0, r.score))) : null;
  if (score == null) throw new Error("Missing score");

  const verdict =
    r.verdict === "high" || r.verdict === "moderate" || r.verdict === "low"
      ? r.verdict
      : score > 80
      ? "high"
      : score >= 50
      ? "moderate"
      : "low";

  const sharedPhrases = Array.isArray(r.sharedPhrases)
    ? (r.sharedPhrases as unknown[]).filter((p) => typeof p === "string") as string[]
    : [];

  const assessment = typeof r.assessment === "string" ? r.assessment : "";

  return { score, verdict, sharedPhrases, assessment };
}

async function callClaude(
  client: Anthropic,
  original: string,
  paraphrase: string
): Promise<SimilarityResult> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    system:
      "You are a plagiarism detection assistant. Respond ONLY with a valid JSON object. No preamble, no explanation, no markdown.",
    messages: [
      {
        role: "user",
        content: `Analyze how similar this paraphrase is to the original. Return ONLY a JSON object with exactly these fields:
{
  "score": <integer 0-100 where 100 = identical wording and meaning>,
  "verdict": "<high if score>80, moderate if 50-80, low if <50>",
  "sharedPhrases": [<exact phrases of 4+ consecutive words appearing verbatim in both texts>],
  "assessment": "<one sentence plain English assessment of originality>"
}

ORIGINAL:
${original}

PARAPHRASE:
${paraphrase}`,
      },
    ],
  });

  const raw = message.content[0];
  if (raw.type !== "text") throw new Error("Non-text response");

  const jsonMatch = raw.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return validateResult(JSON.parse(jsonMatch[0]));
}

router.post("/similarity", async (req, res): Promise<void> => {
  const { original, paraphrase } = req.body as {
    original?: string;
    paraphrase?: string;
  };

  if (!original || typeof original !== "string" || !original.trim()) {
    res.status(400).json({ error: "original text is required" });
    return;
  }
  if (!paraphrase || typeof paraphrase !== "string" || !paraphrase.trim()) {
    res.status(400).json({ error: "paraphrase text is required" });
    return;
  }
  if (original.length > 6000 || paraphrase.length > 6000) {
    res.status(400).json({ error: "Text exceeds maximum length of 6000 characters" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI not configured. Add ANTHROPIC_API_KEY to enable this feature." });
    return;
  }

  const client = new Anthropic({ apiKey });

  // Try once, retry once on parse failure
  let result: SimilarityResult;
  try {
    result = await callClaude(client, original.trim(), paraphrase.trim());
  } catch (firstErr) {
    try {
      result = await callClaude(client, original.trim(), paraphrase.trim());
    } catch (secondErr) {
      const msg = secondErr instanceof Error ? secondErr.message : "Unknown error";
      res.status(500).json({ error: `Similarity check failed: ${msg}` });
      return;
    }
  }

  res.json(result);
});

export default router;
