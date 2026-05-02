import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomingItem {
  title?: string;
  authors?: string[];
  year?: number | null;
  journal?: string | null;
  originalSnippet?: string | null;
  paraphrase?: string | null;
  abstract?: string | null;
}

interface GapResult {
  title: string;
  description: string;
  confidence: "high" | "medium" | "speculative";
  supportingPapers: string[];
  thesisAngle: string;
  type: "population" | "timeframe" | "methodology" | "contradiction" | "mechanism";
}

interface ContradictionResult {
  paperA: string;
  paperB: string;
  issue: string;
}

interface GapsResponse {
  gaps: GapResult[];
  contradictions: ContradictionResult[];
  strongestAngle: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemLabel(item: IncomingItem): string {
  const authors = (item.authors ?? []).slice(0, 2);
  const authorStr =
    authors.length === 0
      ? "Unknown"
      : authors.length === 1
      ? authors[0].split(",")[0]
      : `${authors[0].split(",")[0]} & ${authors[1].split(",")[0]}`;
  return `${authorStr} et al., ${item.year ?? "n.d."}`;
}

function buildSummary(items: IncomingItem[], useParaphrases: boolean): string {
  return items
    .map((item) => {
      const label = itemLabel(item);
      const journal = item.journal ?? "Unknown Journal";
      const text = useParaphrases
        ? item.paraphrase?.trim() || item.originalSnippet?.trim() || item.abstract?.trim() || "(no text)"
        : item.originalSnippet?.trim() || item.abstract?.trim() || item.paraphrase?.trim() || "(no text)";
      return `[${label}] in [${journal}]: ${text}`;
    })
    .join("\n\n");
}

function tryParseGaps(raw: string): GapsResponse | null {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // Extract JSON object if surrounded by other text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GapsResponse;
    if (!Array.isArray(parsed.gaps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are a senior academic research consultant analyzing a student's literature collection. Your job is to identify genuine gaps, contradictions, and opportunities for original contribution. You are rigorous, honest, and practical. Return ONLY valid JSON.`;

function buildUserPrompt(n: number, topic: string, discipline: string, summary: string): string {
  return `Analyze these ${n} papers on the topic of ${topic} in ${discipline}. Identify research gaps and thesis opportunities.

Papers:
${summary}

Return ONLY this JSON:
{
  "gaps": [
    {
      "title": "string (8 words max)",
      "description": "string (2-3 sentences explaining the gap)",
      "confidence": "high" | "medium" | "speculative",
      "supportingPapers": ["author+year of papers that reveal this gap"],
      "thesisAngle": "string (one sentence — how a student could address this gap)",
      "type": "population" | "timeframe" | "methodology" | "contradiction" | "mechanism"
    }
  ],
  "contradictions": [
    {
      "paperA": "string",
      "paperB": "string",
      "issue": "string (what they disagree on)"
    }
  ],
  "strongestAngle": "string (which gap is most feasible for a dissertation student and why, 2-3 sentences)"
}`;
}

function buildSimplePrompt(n: number, topic: string, discipline: string, summary: string): string {
  return `You are a research consultant. Analyze ${n} academic papers on "${topic}" in ${discipline} and find research gaps.

${summary}

Return ONLY valid JSON with this exact structure (no other text):
{"gaps":[{"title":"gap title","description":"2-3 sentences","confidence":"high","supportingPapers":["Author, Year"],"thesisAngle":"one sentence","type":"methodology"}],"contradictions":[],"strongestAngle":"2-3 sentences about the best thesis angle"}`;
}

// ─── POST /api/gaps ──────────────────────────────────────────────────────────

router.post("/gaps", async (req, res): Promise<void> => {
  const body = req.body as {
    items?: IncomingItem[];
    topic?: string;
    discipline?: string;
  };

  // Validate
  if (!Array.isArray(body.items) || body.items.length < 8) {
    res.status(400).json({
      error: "Collect at least 8 snippets to find research gaps.",
    });
    return;
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "general research";
  const discipline = typeof body.discipline === "string" ? body.discipline.trim() : "general";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "AI analysis is not configured. Add ANTHROPIC_API_KEY to enable this feature.",
    });
    return;
  }

  // Build consolidated summary — use originals, fallback to paraphrases if too long
  let summary = buildSummary(body.items, false);
  if (summary.length > 6000) {
    summary = buildSummary(body.items, true);
    // If still too long, truncate each item text
    if (summary.length > 6000) {
      summary = buildSummary(
        body.items.map((item) => ({
          ...item,
          originalSnippet: (item.originalSnippet ?? item.abstract ?? "").slice(0, 300),
          paraphrase: (item.paraphrase ?? "").slice(0, 300),
        })),
        true
      );
    }
  }

  const client = new Anthropic({ apiKey });
  const n = body.items.length;
  const wrappedSummary = wrapUserText(summary);

  // First attempt
  let result: GapsResponse | null = null;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(n, topic, discipline, wrappedSummary),
        },
      ],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const gapsValidation = validateClaudeResponse(raw);
    if (!gapsValidation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/gaps", reason: gapsValidation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed. Please try again." });
      return;
    }
    result = tryParseGaps(raw);
  } catch (err) {
    // Network/API failure — will attempt retry below
    const msg = err instanceof Error ? err.message : "API error";
    if (msg.includes("auth") || msg.includes("key") || msg.includes("429")) {
      res.status(503).json({ error: `AI service error: ${msg}` });
      return;
    }
  }

  // Retry with simpler prompt if JSON parse failed
  if (!result) {
    try {
      const message2 = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: buildSimplePrompt(n, topic, discipline, summary.slice(0, 4000)),
          },
        ],
      });
      const raw2 = message2.content[0]?.type === "text" ? message2.content[0].text : "";
      result = tryParseGaps(raw2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI retry failed";
      res.status(500).json({ error: `Gap analysis failed: ${msg}` });
      return;
    }
  }

  if (!result) {
    res.status(500).json({
      error: "Could not parse AI response. Please try again.",
    });
    return;
  }

  res.json(result);
});

export default router;
