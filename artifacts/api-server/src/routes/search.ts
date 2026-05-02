import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, searchHistoryTable, supervisorsTable } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import { SearchPapersBody } from "@workspace/api-zod";
import { searchPubMed, type PubMedPaper } from "../lib/pubmed";
import { searchSemantic, type SemanticPaper, type SemanticResult } from "../lib/semantic";

const router: IRouter = Router();

// ── Rate limiter: 30 requests per IP per hour ──────────────────────────────
const searchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many search requests. Please wait before trying again." },
});

// ── 2-second server-side cache per query string ────────────────────────────
interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const queryCache = new Map<string, CacheEntry>();

function cacheKey(body: Record<string, unknown>): string {
  return JSON.stringify({
    topic: body.topic ?? body.query,
    phrase: body.phrase,
    yearFrom: body.yearFrom,
    yearTo: body.yearTo,
    source: body.source ?? "both",
    page: body.page ?? 1,
  });
}

function getCache(key: string): unknown | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  queryCache.set(key, { data, expiresAt: Date.now() + 2000 });
  // Prevent unbounded growth
  if (queryCache.size > 200) {
    const oldest = queryCache.keys().next().value;
    if (oldest) queryCache.delete(oldest);
  }
}

// ── Unified paper shape ────────────────────────────────────────────────────
interface UnifiedPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  citationCount: number | null;
  relevanceScore: number | null;
  supervisorNote: string | null;
  openAccess: boolean | null;
  source: string | null;
  snippets: { text: string; section: string; matchScore: number }[];
}

function pubmedToUnified(p: PubMedPaper): UnifiedPaper {
  return {
    id: `pmc_${p.pmcid}`,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    year: p.year,
    venue: p.journal,
    url: p.url,
    doi: p.doi,
    citationCount: null,
    relevanceScore: null,
    supervisorNote: null,
    openAccess: true,
    source: "pubmed",
    snippets: p.snippets,
  };
}

function semanticToUnified(p: SemanticPaper): UnifiedPaper {
  return {
    id: p.id,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    year: p.year,
    venue: p.journal,
    url: p.url,
    doi: p.doi,
    citationCount: p.citationCount,
    relevanceScore: null,
    supervisorNote: null,
    openAccess: p.openAccess,
    source: "semantic",
    snippets: [],
  };
}

function deduplicateByDoi(papers: UnifiedPaper[]): UnifiedPaper[] {
  const seen = new Set<string>();
  return papers.filter((p) => {
    if (!p.doi) return true;
    if (seen.has(p.doi)) return false;
    seen.add(p.doi);
    return true;
  });
}

function sortByRelevance(papers: UnifiedPaper[]): UnifiedPaper[] {
  return [...papers].sort((a, b) => {
    // Phrase match score (sum of all snippet scores)
    const aScore = a.snippets.reduce((s, sn) => s + sn.matchScore, 0);
    const bScore = b.snippets.reduce((s, sn) => s + sn.matchScore, 0);
    if (bScore !== aScore) return bScore - aScore;
    // Then by year desc
    return (b.year ?? 0) - (a.year ?? 0);
  });
}

// ── POST /search ───────────────────────────────────────────────────────────
router.post("/search", searchLimiter, async (req, res): Promise<void> => {
  const parsed = SearchPapersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    query,
    topic,
    phrase,
    yearFrom,
    yearTo,
    source = "both",
    page = 1,
    supervisorId,
    maxResults = 10,
  } = parsed.data;

  const effectiveTopic = (topic ?? query ?? "").trim();
  if (!effectiveTopic) {
    res.status(400).json({ error: "topic or query is required" });
    return;
  }

  // Cache check
  const ck = cacheKey({ topic: effectiveTopic, phrase, yearFrom, yearTo, source, page });
  const cached = getCache(ck);
  if (cached) {
    res.json(cached);
    return;
  }

  // Optionally load supervisor for AI filtering
  let supervisor = null;
  if (supervisorId) {
    const [found] = await db
      .select()
      .from(supervisorsTable)
      .where(eq(supervisorsTable.id, supervisorId));
    supervisor = found ?? null;
  }

  // Effective year bounds (body takes precedence over supervisor)
  const effectiveYearFrom = yearFrom ?? supervisor?.minYear ?? null;
  const effectiveYearTo = yearTo ?? supervisor?.maxYear ?? null;

  // ── Fetch from selected sources in parallel ──────────────────────────────
  const usePubMed = source !== "semantic";
  const useSemantic = source !== "pubmed";

  const emptySemanticResult: SemanticResult = { papers: [], rateLimited: false };
  const [pubmedRaw, semanticResult] = await Promise.all([
    usePubMed
      ? searchPubMed(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
          phrase: phrase ?? null,
          page: page ?? 1,
        })
      : Promise.resolve([]),
    useSemantic
      ? searchSemantic(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
          limit: 20,
          offset: ((page ?? 1) - 1) * 20,
        })
      : Promise.resolve(emptySemanticResult),
  ]);

  const activeSources: string[] = [];
  if (usePubMed) activeSources.push("pubmed");
  if (useSemantic && !semanticResult.rateLimited) activeSources.push("semantic");

  // ── Merge, dedup, sort ───────────────────────────────────────────────────
  const merged = deduplicateByDoi([
    ...pubmedRaw.map(pubmedToUnified),
    ...semanticResult.papers.map(semanticToUnified),
  ]);

  let papers = sortByRelevance(merged);
  const totalFound = papers.length;

  // ── Optional AI supervisor filtering ─────────────────────────────────────
  let supervisorFiltered = false;
  if (supervisor && papers.length > 0) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const client = new Anthropic({ apiKey: anthropicKey });
      const constraints = (supervisor.constraints ?? []).join("; ");
      const focusAreas = (supervisor.focusAreas ?? []).join(", ");
      const excludeKeywords = (supervisor.excludeKeywords ?? []).join(", ");
      const yearFilter =
        supervisor.minYear || supervisor.maxYear
          ? `years ${supervisor.minYear ?? "any"} to ${supervisor.maxYear ?? "present"}`
          : "any year";

      const paperSummaries = papers
        .map(
          (p, i) =>
            `${i + 1}. "${p.title}" (${p.year ?? "unknown"}) — ${p.venue ?? "unknown venue"}`
        )
        .join("\n");

      const message = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a research supervisor. Rate these papers:
Constraints: ${constraints || "none"}
Focus areas: ${focusAreas || "general"}
Exclude keywords: ${excludeKeywords || "none"}
Year range: ${yearFilter}

Papers:
${paperSummaries}

Respond with a JSON array (score 0-1, note max 15 words, only include score >= 0.3):
[{"index": 1, "score": 0.95, "note": "Directly relevant"}]`,
          },
        ],
      });

      const content = message.content[0];
      if (content.type === "text") {
        const jsonMatch = content.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const ratings = JSON.parse(jsonMatch[0]) as {
            index: number;
            score: number;
            note: string;
          }[];
          const ratingMap = new Map(ratings.map((r) => [r.index - 1, r]));
          papers = papers
            .map((p, i) => {
              const r = ratingMap.get(i);
              return r
                ? { ...p, relevanceScore: r.score, supervisorNote: r.note }
                : { ...p, relevanceScore: 0 };
            })
            .filter((p) => (p.relevanceScore ?? 0) >= 0.3)
            .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
          supervisorFiltered = true;
        }
      }
    }
  }

  papers = papers.slice(0, maxResults ?? 10);

  // ── Persist search history ───────────────────────────────────────────────
  await db.insert(searchHistoryTable).values({
    query: effectiveTopic,
    resultsCount: papers.length,
    supervisorId: supervisorId ?? null,
  });

  const response = {
    papers,
    totalFound,
    total: totalFound,
    supervisorFiltered,
    query: effectiveTopic,
    sources: activeSources,
    semanticRateLimited: semanticResult.rateLimited,
  };

  setCache(ck, response);
  res.json(response);
});

// ── GET /search/history ────────────────────────────────────────────────────
router.get("/search/history", async (_req, res): Promise<void> => {
  const history = await db
    .select()
    .from(searchHistoryTable)
    .orderBy(desc(searchHistoryTable.searchedAt))
    .limit(20);
  res.json(
    history.map((h) => ({
      ...h,
      searchedAt: h.searchedAt.toISOString(),
    }))
  );
});

export default router;
