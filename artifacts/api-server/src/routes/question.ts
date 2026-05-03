import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText } from "../lib/promptSafety";
import { searchOpenAlex } from "../lib/openalex";
import { searchPubMed } from "../lib/pubmed";

const router: IRouter = Router();

interface StanceResult {
  stance: "supports" | "contradicts" | "neutral" | "insufficient_data";
  confidence: "high" | "medium" | "low";
  keyFinding: string;
}

interface QuestionPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  abstract: string | null;
  citationCount: number | null;
  stance: StanceResult["stance"];
  confidence: StanceResult["confidence"];
  keyFinding: string;
}

async function detectStance(
  client: Anthropic,
  question: string,
  title: string,
  abstract: string
): Promise<StanceResult> {
  const safeQuestion = wrapUserText(question.slice(0, 300));
  const safeAbstract = wrapUserText(abstract.slice(0, 1500));

  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Does this paper's findings support, contradict, or take a neutral position on this research question?

Question: ${safeQuestion}
Paper title: ${title.slice(0, 200)}
Paper abstract: ${safeAbstract}

Return ONLY valid JSON (no markdown):
{"stance":"supports"|"contradicts"|"neutral"|"insufficient_data","confidence":"high"|"medium"|"low","keyFinding":"one sentence max 25 words"}`,
      },
    ],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { stance: "insufficient_data", confidence: "low", keyFinding: "Could not extract finding." };
  const parsed = JSON.parse(match[0]) as Partial<StanceResult>;
  return {
    stance: parsed.stance ?? "insufficient_data",
    confidence: parsed.confidence ?? "low",
    keyFinding: (parsed.keyFinding ?? "No finding extracted.").slice(0, 200),
  };
}

// POST /api/question
router.post("/question", async (req, res): Promise<void> => {
  const { question, discipline } = req.body as {
    question?: string;
    discipline?: string;
  };

  if (!question || question.trim().length < 10) {
    res.status(400).json({ error: "question must be at least 10 characters" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const q = question.trim().slice(0, 400);
  const searchTopic = discipline ? `${q} ${discipline}` : q;

  // Fetch from OpenAlex + PubMed in parallel
  const [openAlexRaw, pubmedRaw] = await Promise.all([
    searchOpenAlex(searchTopic, { yearFrom: 2015 }).catch(() => []),
    searchPubMed(searchTopic, { yearFrom: 2015, yearTo: null, phrase: null, page: 1 }).catch(() => []),
  ]);

  // Merge, prefer papers with abstracts
  const allPapers = [
    ...openAlexRaw.map((p) => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      venue: p.venue,
      url: p.url,
      doi: p.doi,
      abstract: p.abstract,
      citationCount: p.citationCount,
    })),
    ...pubmedRaw.map((p) => ({
      id: `pmc_${p.pmcid}`,
      title: p.title,
      authors: p.authors,
      year: p.year,
      venue: p.journal,
      url: p.url,
      doi: p.doi,
      abstract: p.abstract,
      citationCount: null as number | null,
    })),
  ];

  // Deduplicate by DOI + title, prefer ones with abstracts
  const seen = new Set<string>();
  const candidates = allPapers
    .filter((p) => {
      const key = p.doi ?? p.title.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((p) => p.abstract && p.abstract.length > 100)
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 10);

  const client = new Anthropic({ apiKey });

  // Detect stance for all papers in parallel (with per-paper timeout)
  const stanceResults = await Promise.allSettled(
    candidates.map((p) =>
      detectStance(client, q, p.title, p.abstract!).catch(() => ({
        stance: "insufficient_data" as const,
        confidence: "low" as const,
        keyFinding: "Analysis unavailable.",
      }))
    )
  );

  const papers: QuestionPaper[] = candidates.map((p, i) => {
    const stance =
      stanceResults[i].status === "fulfilled"
        ? stanceResults[i].value
        : { stance: "insufficient_data" as const, confidence: "low" as const, keyFinding: "Analysis unavailable." };
    return { ...p, ...stance };
  });

  const supportCount = papers.filter((p) => p.stance === "supports").length;
  const contradictCount = papers.filter((p) => p.stance === "contradicts").length;
  const neutralCount = papers.filter((p) => p.stance === "neutral").length;
  const insufficientCount = papers.filter((p) => p.stance === "insufficient_data").length;
  const total = papers.length;

  let verdict = "Inconclusive evidence";
  if (total > 0) {
    const supportPct = supportCount / total;
    const contradictPct = contradictCount / total;
    if (supportPct >= 0.7) verdict = "Strong support";
    else if (supportPct >= 0.5) verdict = "Moderate support";
    else if (contradictPct >= 0.7) verdict = "Strong contradiction";
    else if (contradictPct >= 0.5) verdict = "Moderate contradiction";
    else if (neutralCount / total >= 0.6) verdict = "Mixed / neutral evidence";
  }

  res.json({
    question: q,
    verdict,
    supportCount,
    contradictCount,
    neutralCount,
    insufficientCount,
    total,
    supportPercent: total > 0 ? Math.round((supportCount / total) * 100) : 0,
    papers: papers.sort((a, b) => {
      const order = { supports: 0, contradicts: 1, neutral: 2, insufficient_data: 3 };
      return order[a.stance] - order[b.stance];
    }),
  });
});

export default router;
