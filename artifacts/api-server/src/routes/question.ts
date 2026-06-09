import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
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
  client: Groq,
  question: string,
  title: string,
  abstract: string
): Promise<StanceResult> {
  const safeQuestion = wrapUserText(question.slice(0, 300));
  const safeAbstract = wrapUserText(abstract.slice(0, 1500));

  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `Does this paper's findings support, contradict, or take a neutral position on this research question?

Question: ${safeQuestion}
Paper title: ${title.slice(0, 200)}
Paper abstract: ${safeAbstract}

Return ONLY valid JSON (no markdown):
{"stance":"supports"|"contradicts"|"neutral"|"insufficient_data","confidence":"high"|"medium"|"low","keyFinding":"one sentence max 25 words"}`,
    }],
  });

  const text = msg.choices[0]?.message?.content ?? "{}";
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
    res.status(400).json({ error: "question must be at least 10 characters" }); return;
  }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const q = question.trim().slice(0, 400);
  const searchTopic = discipline ? `${q} ${discipline}` : q;

  const [openAlexRaw, pubmedRaw] = await Promise.all([
    searchOpenAlex(searchTopic, { yearFrom: 2015 }).catch(() => []),
    searchPubMed(searchTopic, { yearFrom: 2015, yearTo: null, phrase: null, page: 1 }).catch(() => []),
  ]);

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

  const seen = new Set<string>();
  const candidates = allPapers
    .filter((p) => {
      const key = p.doi ?? p.title.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((p) => p.abstract && p.abstract.length > 100)
    .slice(0, 15);

  const client = new Groq({ apiKey });

  const classified = await Promise.allSettled(
    candidates.map((p) =>
      detectStance(client, q, p.title, p.abstract!).catch(() => ({
        stance: "insufficient_data" as const,
        confidence: "low" as const,
        keyFinding: "Could not analyse this paper.",
      }))
    )
  );

  const papers: QuestionPaper[] = candidates.map((p, i) => {
    const stance = classified[i].status === "fulfilled"
      ? classified[i].value
      : { stance: "insufficient_data" as const, confidence: "low" as const, keyFinding: "Analysis failed." };
    return { ...p, ...stance };
  });

  // Sort: supports first, then contradicts, then neutral
  const order: Record<StanceResult["stance"], number> = { supports: 0, contradicts: 1, neutral: 2, insufficient_data: 3 };
  papers.sort((a, b) => order[a.stance] - order[b.stance]);

  const supportCount = papers.filter((p) => p.stance === "supports").length;
  const contradictCount = papers.filter((p) => p.stance === "contradicts").length;
  const neutralCount = papers.filter((p) => p.stance === "neutral").length;

  res.json({
    question: q,
    papers,
    summary: {
      total: papers.length,
      supports: supportCount,
      contradicts: contradictCount,
      neutral: neutralCount,
    },
  });
});

export default router;
