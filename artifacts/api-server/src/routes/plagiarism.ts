import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";
import { searchSemantic } from "../lib/semantic";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollectionItemInput {
  title: string;
  authors?: string[];
  year?: number | null;
  doi?: string | null;
  originalSnippet?: string | null;
  paraphrase?: string | null;
}

interface SourceMatch {
  citation: string;
  similarityScore: number;
  matchedPhrases: string[];
  verdict: "well-paraphrased" | "too-similar" | "direct-quote-detected";
}

interface WebMatch {
  title: string;
  authors: string[];
  year: number | null;
  url: string;
  matchedPhrase: string;
  abstract: string | null;
  doi: string | null;
}

// ─── Layer 3: Internal repetition detection ───────────────────────────────────

function findRepetitions(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  if (paragraphs.length < 2) return [];

  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ");

  const extractSentences = (para: string) =>
    para
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length >= 6);

  const paragraphSents = paragraphs.map((p) =>
    extractSentences(p).map((s) => ({ original: s, normalized: normalize(s) }))
  );

  const repeated = new Set<string>();

  for (let i = 0; i < paragraphSents.length; i++) {
    for (let j = i + 1; j < paragraphSents.length; j++) {
      for (const sentI of paragraphSents[i]) {
        for (const sentJ of paragraphSents[j]) {
          if (
            sentI.normalized === sentJ.normalized ||
            (sentI.normalized.length > 40 &&
              sentJ.normalized.includes(sentI.normalized.slice(0, 40)))
          ) {
            repeated.add(sentI.original);
          }
        }
      }
    }
  }

  return Array.from(repeated).slice(0, 5);
}

// ─── Layer 1: Claude source comparison ────────────────────────────────────────

function buildSourcesBlock(items: CollectionItemInput[]): string {
  return items
    .filter((item) => item.originalSnippet || item.paraphrase)
    .slice(0, 10)
    .map((item, idx) => {
      const authors = (item.authors ?? []).slice(0, 2).join(", ") || "Unknown";
      const year = item.year ? ` (${item.year})` : "";
      const snippet = (item.originalSnippet || item.paraphrase || "").slice(0, 500);
      return `Source ${idx + 1}: ${authors}${year} — "${item.title}"\n${snippet}`;
    })
    .join("\n\n");
}

interface ClaudeAnalysisResult {
  sourceMatches: SourceMatch[];
  overallRisk: "low" | "medium" | "high";
  distinctivePhrases: string[];
}

function validateSourceMatch(m: unknown): SourceMatch {
  const r = (m as Record<string, unknown>) ?? {};
  const score =
    typeof r.similarityScore === "number"
      ? Math.min(100, Math.max(0, Math.round(r.similarityScore)))
      : 0;
  const verdict: SourceMatch["verdict"] =
    r.verdict === "well-paraphrased" ||
    r.verdict === "too-similar" ||
    r.verdict === "direct-quote-detected"
      ? r.verdict
      : score > 70
      ? "direct-quote-detected"
      : score > 40
      ? "too-similar"
      : "well-paraphrased";

  return {
    citation: typeof r.citation === "string" ? r.citation : "Unknown",
    similarityScore: score,
    matchedPhrases: Array.isArray(r.matchedPhrases)
      ? (r.matchedPhrases as unknown[]).filter((p) => typeof p === "string") as string[]
      : [],
    verdict,
  };
}

async function runClaudeAnalysis(
  client: Anthropic,
  wrappedText: string,
  items: CollectionItemInput[]
): Promise<ClaudeAnalysisResult> {
  const sourcesBlock = buildSourcesBlock(items);
  const hasSources = sourcesBlock.trim().length > 0;

  const sourceSection = hasSources
    ? `\n\n=== SAVED SOURCES ===\n${sourcesBlock}\n=== END SAVED SOURCES ===`
    : "";

  const sourceMatchInstruction = hasSources
    ? `"sourceMatches": [
    {
      "citation": "<Author Year>",
      "similarityScore": <integer 0-100, 100 = identical wording>,
      "matchedPhrases": ["<exact phrases of 4+ consecutive words found in both texts>"],
      "verdict": "<well-paraphrased|too-similar|direct-quote-detected>"
    }
  ],`
    : `"sourceMatches": [],`;

  const riskRule = hasSources
    ? `overallRisk: "high" if any score > 70 or any verdict is "direct-quote-detected"; "medium" if any score > 40 or "too-similar"; else "low".`
    : `overallRisk: always "low" when no sources provided.`;

  const prompt = `Analyse this student text for academic originality.

Return ONLY a valid JSON object with exactly these fields (no markdown fences, no preamble):
{
  ${sourceMatchInstruction}
  "overallRisk": "<low|medium|high>",
  "distinctivePhrases": ["<phrase1>", "<phrase2>", "<phrase3>"]
}

Rules:
- Include one sourceMatch entry per source, even if similarity is 0.
- ${riskRule}
- distinctivePhrases: the 3 most technical or distinctive multi-word phrases (4+ words) in the student text worth searching online.

=== STUDENT TEXT ===
${wrappedText}
=== END STUDENT TEXT ===${sourceSection}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system:
      "You are a plagiarism detection assistant helping students understand similarity between their writing and academic sources. Respond ONLY with valid JSON — no markdown, no preamble.",
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Claude response");

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const sourceMatches: SourceMatch[] = Array.isArray(parsed.sourceMatches)
    ? (parsed.sourceMatches as unknown[]).map(validateSourceMatch)
    : [];

  const overallRisk: "low" | "medium" | "high" =
    parsed.overallRisk === "low" ||
    parsed.overallRisk === "medium" ||
    parsed.overallRisk === "high"
      ? parsed.overallRisk
      : sourceMatches.some(
          (m) => m.verdict === "direct-quote-detected" || m.similarityScore > 70
        )
      ? "high"
      : sourceMatches.some(
          (m) => m.verdict === "too-similar" || m.similarityScore > 40
        )
      ? "medium"
      : "low";

  const distinctivePhrases = Array.isArray(parsed.distinctivePhrases)
    ? (parsed.distinctivePhrases as unknown[])
        .filter((p) => typeof p === "string")
        .slice(0, 3) as string[]
    : [];

  return { sourceMatches, overallRisk, distinctivePhrases };
}

// ─── Layer 2: Web phrase search ───────────────────────────────────────────────

interface WebMatchResult {
  title: string;
  authors: string[];
  year: number | null;
  url: string;
  matchedPhrase: string;
  abstract: string | null;
  doi: string | null;
}

async function runWebSearch(phrases: string[]): Promise<WebMatchResult[]> {
  const matches: WebMatchResult[] = [];

  await Promise.all(
    phrases.slice(0, 3).map(async (phrase) => {
      if (!phrase || phrase.length < 12) return;
      try {
        const result = await searchSemantic(phrase, { limit: 5 });
        for (const paper of result.papers) {
          if (!paper.abstract) continue;
          if (paper.abstract.toLowerCase().includes(phrase.toLowerCase())) {
            matches.push({
              title: paper.title,
              authors: paper.authors,
              year: paper.year,
              url: paper.url,
              matchedPhrase: phrase,
              abstract: paper.abstract,
              doi: paper.doi,
            });
          }
        }
      } catch {
        // Non-fatal — skip phrase
      }
    })
  );

  // De-duplicate by URL
  const seen = new Set<string>();
  return matches.filter((m) => {
    if (seen.has(m.url)) return false;
    seen.add(m.url);
    return true;
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/plagiarism", async (req, res): Promise<void> => {
  const body = req.body as { text?: unknown; collectionItems?: unknown };

  if (!body?.text || typeof body.text !== "string" || !body.text.trim()) {
    res.status(400).json({ error: "text is required and must be a non-empty string" });
    return;
  }
  if (body.text.length > 10_000) {
    res.status(400).json({ error: "text exceeds 10,000 character limit" });
    return;
  }

  const items: CollectionItemInput[] = Array.isArray(body.collectionItems)
    ? (body.collectionItems as unknown[])
        .filter(
          (it): it is CollectionItemInput =>
            typeof it === "object" &&
            it !== null &&
            typeof (it as Record<string, unknown>).title === "string"
        )
        .slice(0, 20)
    : [];

  const studentText = body.text.trim();

  // Layer 3 always runs (no API key needed)
  const repetitions = findRepetitions(studentText);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.json({ sourceMatches: [], overallRisk: "low", webMatches: [], repetitions, limitedMode: true });
    return;
  }

  const client = new Anthropic({ apiKey });
  const wrappedText = wrapUserText(studentText);

  // Layer 1
  let sourceMatches: SourceMatch[] = [];
  let overallRisk: "low" | "medium" | "high" = "low";
  let distinctivePhrases: string[] = [];

  try {
    const analysis = await runClaudeAnalysis(client, wrappedText, items);
    sourceMatches = analysis.sourceMatches;
    overallRisk = analysis.overallRisk;
    distinctivePhrases = analysis.distinctivePhrases;

    const validation = validateClaudeResponse(JSON.stringify(sourceMatches));
    if (!validation.safe) {
      req.log.warn(
        { ip: req.ip, route: "/api/plagiarism", reason: validation.reason },
        "promptSafety: suspicious response blocked"
      );
      sourceMatches = [];
      overallRisk = "low";
    }
  } catch (err) {
    req.log.warn({ err }, "plagiarism: Claude analysis failed");
  }

  // Layer 2 — race against 8-second timeout
  let webMatches: WebMatch[] = [];
  try {
    const webResult = await Promise.race([
      runWebSearch(distinctivePhrases),
      new Promise<WebMatch[]>((resolve) => setTimeout(() => resolve([]), 8_000)),
    ]);
    webMatches = webResult;
  } catch (err) {
    req.log.warn({ err }, "plagiarism: web search failed");
  }

  res.json({ sourceMatches, overallRisk, webMatches, repetitions });
});

export default router;
