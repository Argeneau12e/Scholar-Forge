import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";
import { searchSemantic } from "../lib/semantic";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollectionItemInput {
  title?: string;
  authors?: string[];
  year?: number | null;
  originalSnippet?: string | null;
  paraphrase?: string | null;
  abstract?: string | null;
}

interface SourceMatch {
  citation: string;
  similarityScore: number;
  matchedPhrases: string[];
  verdict: "direct-quote-detected" | "too-similar" | "well-paraphrased";
}

interface ClaudeAnalysisResult {
  sourceMatches: SourceMatch[];
  overallRisk: "low" | "medium" | "high";
  distinctivePhrases: string[];
}

interface WebSearchResult {
  phrase: string;
  hits: Array<{ title: string; url: string; snippet: string }>;
}

interface PlagiarismResult {
  sourceMatches: SourceMatch[];
  overallRisk: "low" | "medium" | "high";
  distinctivePhrases: string[];
  webSearchResults: WebSearchResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSourcesBlock(items: CollectionItemInput[]): string {
  if (!items || items.length === 0) return "";
  return items.map((item) => {
    const authors = (item.authors ?? []).slice(0, 2).map((a) => a.split(",")[0].trim());
    const citation = authors.length > 0
      ? `${authors.join(" & ")} (${item.year ?? "n.d."})`
      : `Unknown (${item.year ?? "n.d."})`;
    const text = item.originalSnippet?.trim() || item.abstract?.trim() || item.paraphrase?.trim() || "(no source text)";
    return `Source: ${citation}\n${text.slice(0, 800)}`;
  }).join("\n\n---\n\n");
}

function validateSourceMatch(obj: unknown): SourceMatch {
  if (!obj || typeof obj !== "object") return { citation: "Unknown", similarityScore: 0, matchedPhrases: [], verdict: "well-paraphrased" };
  const r = obj as Record<string, unknown>;
  const score = typeof r.similarityScore === "number"
    ? Math.round(Math.min(100, Math.max(0, r.similarityScore))) : 0;
  const verdict = r.verdict === "direct-quote-detected" || r.verdict === "too-similar" || r.verdict === "well-paraphrased"
    ? r.verdict
    : score > 70 ? "direct-quote-detected" : score > 40 ? "too-similar" : "well-paraphrased";
  return {
    citation: typeof r.citation === "string" ? r.citation : "Unknown",
    similarityScore: score,
    matchedPhrases: Array.isArray(r.matchedPhrases)
      ? (r.matchedPhrases as unknown[]).filter((p) => typeof p === "string") as string[] : [],
    verdict,
  };
}

async function runAIAnalysis(
  client: Groq,
  wrappedText: string,
  items: CollectionItemInput[]
): Promise<ClaudeAnalysisResult> {
  const sourcesBlock = buildSourcesBlock(items);
  const hasSources = sourcesBlock.trim().length > 0;
  const sourceSection = hasSources ? `\n\n=== SAVED SOURCES ===\n${sourcesBlock}\n=== END SAVED SOURCES ===` : "";
  const sourceMatchInstruction = hasSources
    ? `"sourceMatches": [{"citation": "<Author Year>","similarityScore": <integer 0-100>,"matchedPhrases": ["<exact phrases 4+ words>"],"verdict": "<well-paraphrased|too-similar|direct-quote-detected>"}],`
    : `"sourceMatches": [],`;
  const riskRule = hasSources
    ? `overallRisk: "high" if any score > 70 or any verdict is "direct-quote-detected"; "medium" if any score > 40 or "too-similar"; else "low".`
    : `overallRisk: always "low" when no sources provided.`;

  const prompt = `Analyse this student text for academic originality.

Return ONLY a valid JSON object:
{
  ${sourceMatchInstruction}
  "overallRisk": "<low|medium|high>",
  "distinctivePhrases": ["<phrase1>", "<phrase2>", "<phrase3>"]
}

Rules:
- Include one sourceMatch entry per source, even if similarity is 0.
- ${riskRule}
- distinctivePhrases: the 3 most technical or distinctive multi-word phrases (4+ words) worth searching online.

=== STUDENT TEXT ===
${wrappedText}
=== END STUDENT TEXT ===${sourceSection}`;

  const message = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: "You are a plagiarism detection assistant helping students understand similarity between their writing and academic sources. Respond ONLY with valid JSON — no markdown, no preamble.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = message.choices[0]?.message?.content ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in AI response");

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const sourceMatches: SourceMatch[] = Array.isArray(parsed.sourceMatches)
    ? (parsed.sourceMatches as unknown[]).map(validateSourceMatch) : [];
  const overallRisk: "low" | "medium" | "high" =
    parsed.overallRisk === "low" || parsed.overallRisk === "medium" || parsed.overallRisk === "high"
      ? parsed.overallRisk
      : sourceMatches.some((m) => m.verdict === "direct-quote-detected" || m.similarityScore > 70) ? "high"
      : sourceMatches.some((m) => m.verdict === "too-similar" || m.similarityScore > 40) ? "medium"
      : "low";
  const distinctivePhrases = Array.isArray(parsed.distinctivePhrases)
    ? (parsed.distinctivePhrases as unknown[]).filter((p) => typeof p === "string").slice(0, 3) as string[] : [];

  return { sourceMatches, overallRisk, distinctivePhrases };
}

// ─── Web phrase search via Semantic Scholar ──────────────────────────────────

async function searchPhrases(phrases: string[]): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];
  for (const phrase of phrases.slice(0, 3)) {
    try {
      const semanticResult = await searchSemantic(phrase, { limit: 3 });
      results.push({
        phrase,
        hits: semanticResult.papers.slice(0, 3).map((p) => ({
          title: p.title,
          url: p.url,
          snippet: p.abstract?.slice(0, 150) ?? "",
        })),
      });
    } catch {
      results.push({ phrase, hits: [] });
    }
  }
  return results;
}

// ─── POST /api/plagiarism ─────────────────────────────────────────────────────

router.post("/plagiarism", async (req, res): Promise<void> => {
  const { text, collectionItems } = req.body as {
    text?: string;
    collectionItems?: CollectionItemInput[];
  };

  if (!text || text.trim().length < 20) {
    res.status(400).json({ error: "text must be at least 20 characters" }); return;
  }
  if (text.length > 10000) {
    res.status(400).json({ error: "text exceeds maximum length of 10000 characters" }); return;
  }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const items: CollectionItemInput[] = Array.isArray(collectionItems) ? collectionItems.slice(0, 20) : [];
  const wrappedText = wrapUserText(text.trim().slice(0, 8000));

  try {
    const client = new Groq({ apiKey });
    const analysis = await runAIAnalysis(client, wrappedText, items);
    const validation = validateClaudeResponse(JSON.stringify(analysis));
    if (!validation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/plagiarism", reason: validation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed." }); return;
    }

    const webSearchResults = await searchPhrases(analysis.distinctivePhrases);
    const result: PlagiarismResult = { ...analysis, webSearchResults };
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Originality check failed: ${msg}` });
  }
});

export default router;
