import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, searchHistoryTable, supervisorsTable } from "@workspace/db";
import Groq from "groq-sdk";
import { SearchPapersBody } from "@workspace/api-zod";
import { searchPubMed, type PubMedPaper } from "../lib/pubmed";
import { searchSemantic, type SemanticPaper, type SemanticResult } from "../lib/semantic";
import { searchOpenAlex, type OpenAlexResult } from "../lib/openalex";
import { searchEuropePMC, type EuropePMCResult } from "../lib/europepmc";
import { searchCORE, type COREResult } from "../lib/core";
import { searchArxiv, type ArxivResult } from "../lib/arxiv";
import { searchDOAJ, type DOAJResult } from "../lib/doaj";
import { searchBASE, type BASEResult } from "../lib/base";
import { enrichWithFreePdfs } from "../lib/unpaywall";

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
    sources: body.sources,
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
  if (queryCache.size > 200) {
    const oldest = queryCache.keys().next().value;
    if (oldest) queryCache.delete(oldest);
  }
}

// ── Unified paper shape ────────────────────────────────────────────────────
export interface UnifiedPaper {
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
  isPreprint: boolean;
  freePdfUrl: string | null;
  snippets: { text: string; section: string; matchScore: number }[];
}

type AnySourceResult =
  | PubMedPaper
  | SemanticPaper
  | OpenAlexResult
  | EuropePMCResult
  | COREResult
  | ArxivResult
  | DOAJResult
  | BASEResult;

function toUnified(p: AnySourceResult, source: string): UnifiedPaper {
  const base = {
    id: "id" in p ? (p as { id: string }).id : (p as PubMedPaper).pmcid,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract ?? null,
    year: p.year ?? null,
    venue: ("venue" in p ? p.venue : null) ?? ("journal" in p ? (p as PubMedPaper).journal : null) ?? null,
    url: ("url" in p ? p.url : "") ?? "",
    doi: p.doi ?? null,
    citationCount: ("citationCount" in p ? p.citationCount : null) ?? null,
    relevanceScore: null as number | null,
    supervisorNote: null as string | null,
    openAccess: ("openAccess" in p ? p.openAccess : null) ?? null,
    source,
    isPreprint: ("isPreprint" in p ? !!(p as ArxivResult).isPreprint : false),
    freePdfUrl: null as string | null,
    snippets: ("snippets" in p ? (p as PubMedPaper).snippets : []) ?? [],
  };

  // PubMed uses pmcid-based id
  if (source === "pubmed") {
    const pm = p as PubMedPaper;
    return {
      ...base,
      id: `pmc_${pm.pmcid}`,
      venue: pm.journal ?? null,
      url: pm.url,
      openAccess: true,
    };
  }

  return base;
}

// ── Deduplication ─────────────────────────────────────────────────────────
function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
}

function deduplicate(papers: UnifiedPaper[]): UnifiedPaper[] {
  const seenDoi = new Set<string>();
  const seenTitle = new Set<string>();
  return papers.filter((p) => {
    if (p.doi) {
      if (seenDoi.has(p.doi)) return false;
      seenDoi.add(p.doi);
    }
    const nt = normTitle(p.title);
    if (nt.length > 10) {
      if (seenTitle.has(nt)) return false;
      seenTitle.add(nt);
    }
    return true;
  });
}

// ── Sorting ───────────────────────────────────────────────────────────────
function sortByRelevance(papers: UnifiedPaper[]): UnifiedPaper[] {
  return [...papers].sort((a, b) => {
    const aSnip = a.snippets.reduce((s, sn) => s + sn.matchScore, 0);
    const bSnip = b.snippets.reduce((s, sn) => s + sn.matchScore, 0);
    if (bSnip !== aSnip) return bSnip - aSnip;
    const aCite = a.citationCount ?? 0;
    const bCite = b.citationCount ?? 0;
    if (bCite !== aCite) return bCite - aCite;
    return (b.year ?? 0) - (a.year ?? 0);
  });
}

// ── Source selection from legacy `source` field ────────────────────────────
function sourcesFromLegacy(source: string | null | undefined): string[] {
  if (source === "pubmed") return ["pubmed"];
  if (source === "semantic") return ["semantic"];
  return ["pubmed", "semantic"]; // "both" or default
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
    source,
    page = 1,
    supervisorId,
    maxResults = 10,
  } = parsed.data;

  // Accept `sources` array from request body (not in Zod schema for backward compat)
  const rawSources: unknown = (req.body as Record<string, unknown>).sources;
  const requestedSources: string[] = Array.isArray(rawSources)
    ? (rawSources as string[])
    : sourcesFromLegacy(source);

  const effectiveTopic = (topic ?? query ?? "").trim();
  if (!effectiveTopic) {
    res.status(400).json({ error: "topic or query is required" });
    return;
  }

  // Cache check
  const ck = cacheKey({
    topic: effectiveTopic,
    phrase,
    yearFrom,
    yearTo,
    sources: requestedSources.slice().sort(),
    page,
  });
  const cached = getCache(ck);
  if (cached) {
    res.json(cached);
    return;
  }

  // Optionally load supervisor
  let supervisor = null;
  if (supervisorId) {
    const [found] = await db
      .select()
      .from(supervisorsTable)
      .where(eq(supervisorsTable.id, supervisorId));
    supervisor = found ?? null;
  }

  const effectiveYearFrom = yearFrom ?? supervisor?.minYear ?? null;
  const effectiveYearTo = yearTo ?? supervisor?.maxYear ?? null;

  const has = (s: string) => requestedSources.includes(s);
  const emptySemanticResult: SemanticResult = { papers: [], rateLimited: false };

  // ── Fan out to all requested sources ─────────────────────────────────────
  const [
    pubmedRaw,
    semanticResult,
    openAlexRaw,
    europePMCRaw,
    coreRaw,
    arxivRaw,
    doajRaw,
    baseRaw,
  ] = await Promise.all([
    has("pubmed")
      ? searchPubMed(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
          phrase: phrase ?? null,
          page: page ?? 1,
        }).catch(() => [] as PubMedPaper[])
      : Promise.resolve([] as PubMedPaper[]),

    has("semantic")
      ? searchSemantic(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
          limit: 20,
          offset: ((page ?? 1) - 1) * 20,
        }).catch(() => emptySemanticResult)
      : Promise.resolve(emptySemanticResult),

    has("openalex")
      ? searchOpenAlex(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
          page: page ?? 1,
        }).catch(() => [] as OpenAlexResult[])
      : Promise.resolve([] as OpenAlexResult[]),

    has("europepmc")
      ? searchEuropePMC(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
          phrase: phrase ?? null,
        }).catch(() => [] as EuropePMCResult[])
      : Promise.resolve([] as EuropePMCResult[]),

    has("core")
      ? searchCORE(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
        }).catch(() => [] as COREResult[])
      : Promise.resolve([] as COREResult[]),

    has("arxiv")
      ? searchArxiv(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
        }).catch(() => [] as ArxivResult[])
      : Promise.resolve([] as ArxivResult[]),

    has("doaj")
      ? searchDOAJ(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
        }).catch(() => [] as DOAJResult[])
      : Promise.resolve([] as DOAJResult[]),

    has("base")
      ? searchBASE(effectiveTopic, {
          yearFrom: effectiveYearFrom,
          yearTo: effectiveYearTo,
        }).catch(() => [] as BASEResult[])
      : Promise.resolve([] as BASEResult[]),
  ]);

  // Track which sources actually returned results
  const activeSources: string[] = [];
  if (pubmedRaw.length) activeSources.push("pubmed");
  if (semanticResult.papers.length && !semanticResult.rateLimited) activeSources.push("semantic");
  if (openAlexRaw.length) activeSources.push("openalex");
  if (europePMCRaw.length) activeSources.push("europepmc");
  if (coreRaw.length) activeSources.push("core");
  if (arxivRaw.length) activeSources.push("arxiv");
  if (doajRaw.length) activeSources.push("doaj");
  if (baseRaw.length) activeSources.push("base");

  // ── Merge, deduplicate, sort ─────────────────────────────────────────────
  const merged = deduplicate([
    ...pubmedRaw.map((p) => toUnified(p, "pubmed")),
    ...semanticResult.papers.map((p) => toUnified(p, "semantic")),
    ...openAlexRaw.map((p) => toUnified(p, "openalex")),
    ...europePMCRaw.map((p) => toUnified(p, "europepmc")),
    ...coreRaw.map((p) => toUnified(p, "core")),
    ...arxivRaw.map((p) => toUnified(p, "arxiv")),
    ...doajRaw.map((p) => toUnified(p, "doaj")),
    ...baseRaw.map((p) => toUnified(p, "base")),
  ]);

  let papers = sortByRelevance(merged);
  const totalFound = papers.length;

  // ── Enrich with Unpaywall free PDF links ──────────────────────────────────
  papers = await enrichWithFreePdfs(papers).catch(() => papers);

  // ── Optional AI supervisor filtering ─────────────────────────────────────
  let supervisorFiltered = false;
  if (supervisor && papers.length > 0) {
    const groqKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
    if (groqKey) {
      const client = new Groq({ apiKey: groqKey });
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

      try {
        const message = await client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
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

        const content = message.choices[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\[[\s\S]*\]/);
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
      } catch {
        // AI filtering is optional — continue without it
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
