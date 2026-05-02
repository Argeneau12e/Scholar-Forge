import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, searchHistoryTable, supervisorsTable } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import { SearchPapersBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  abstract?: string;
  year?: number;
  venue?: string;
  externalIds?: { DOI?: string };
  citationCount?: number;
}

async function fetchSemanticScholarPapers(query: string, limit = 10): Promise<SemanticScholarPaper[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,abstract,year,venue,externalIds,citationCount`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json() as { data?: SemanticScholarPaper[] };
  return data.data ?? [];
}

router.post("/search", async (req, res): Promise<void> => {
  const parsed = SearchPapersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { query, supervisorId, maxResults = 10 } = parsed.data;

  let supervisor = null;
  if (supervisorId) {
    const [found] = await db.select().from(supervisorsTable).where(eq(supervisorsTable.id, supervisorId));
    supervisor = found ?? null;
  }

  const rawPapers = await fetchSemanticScholarPapers(query, Math.min(maxResults * 2, 20));

  let papers = rawPapers.map((p) => ({
    id: p.paperId,
    title: p.title,
    authors: (p.authors ?? []).map((a) => a.name),
    abstract: p.abstract ?? null,
    year: p.year ?? null,
    venue: p.venue ?? null,
    url: p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : `https://www.semanticscholar.org/paper/${p.paperId}`,
    citationCount: p.citationCount ?? null,
    relevanceScore: null as number | null,
    supervisorNote: null as string | null,
  }));

  let supervisorFiltered = false;

  if (supervisor && papers.length > 0) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const client = new Anthropic({ apiKey: anthropicKey });
      const constraints = (supervisor.constraints ?? []).join("; ");
      const focusAreas = (supervisor.focusAreas ?? []).join(", ");
      const excludeKeywords = (supervisor.excludeKeywords ?? []).join(", ");
      const yearFilter = supervisor.minYear || supervisor.maxYear
        ? `years ${supervisor.minYear ?? "any"} to ${supervisor.maxYear ?? "present"}`
        : "any year";

      const paperSummaries = papers.map((p, i) =>
        `${i + 1}. "${p.title}" (${p.year ?? "unknown"}) - ${p.venue ?? "unknown venue"}`
      ).join("\n");

      const message = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are a research supervisor. Rate these papers for a student with these constraints:
Constraints: ${constraints || "none"}
Focus areas: ${focusAreas || "general"}
Exclude keywords: ${excludeKeywords || "none"}
Year range: ${yearFilter}

Papers:
${paperSummaries}

For each paper, provide a relevance score (0-1) and a brief note (max 15 words). Only include papers with score >= 0.3.

Respond with JSON array:
[{"index": 1, "score": 0.95, "note": "Directly relevant to focus area"}, ...]`
        }]
      });

      const content = message.content[0];
      if (content.type === "text") {
        const jsonMatch = content.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const ratings = JSON.parse(jsonMatch[0]) as { index: number; score: number; note: string }[];
          const ratingMap = new Map(ratings.map(r => [r.index - 1, r]));
          papers = papers
            .map((p, i) => {
              const rating = ratingMap.get(i);
              return rating
                ? { ...p, relevanceScore: rating.score, supervisorNote: rating.note }
                : { ...p, relevanceScore: 0, supervisorNote: null };
            })
            .filter(p => (p.relevanceScore ?? 0) >= 0.3)
            .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
          supervisorFiltered = true;
        }
      }
    }
  }

  papers = papers.slice(0, maxResults);

  await db.insert(searchHistoryTable).values({
    query,
    resultsCount: papers.length,
    supervisorId: supervisorId ?? null,
  });

  res.json({
    papers,
    totalFound: papers.length,
    supervisorFiltered,
    query,
  });
});

router.get("/search/history", async (_req, res): Promise<void> => {
  const history = await db.select().from(searchHistoryTable).orderBy(desc(searchHistoryTable.searchedAt)).limit(20);
  res.json(history.map(h => ({
    ...h,
    searchedAt: h.searchedAt.toISOString(),
  })));
});

export default router;
