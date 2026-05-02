import { logger } from "./logger";

export interface SemanticPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
  citationCount: number | null;
  openAccess: boolean | null;
  url: string;
  source: "semantic";
  snippets: never[];
}

export interface SemanticResult {
  papers: SemanticPaper[];
  rateLimited: boolean;
}

interface RawSemanticPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year?: number;
  venue?: string;
  externalIds?: { DOI?: string; ArXiv?: string };
  abstract?: string;
  citationCount?: number;
  openAccessPdf?: { url: string } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, retries = 1): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        if (attempt < retries) {
          logger.warn({ attempt }, "semantic: rate limited, retrying after delay");
          await sleep(3000);
          continue;
        }
        logger.warn("semantic: rate limited, no more retries");
        return res; // return 429 so caller can flag it
      }
      return res;
    } catch (err) {
      logger.warn({ err, attempt }, "semantic: network error");
      if (attempt >= retries) return null;
      await sleep(1000);
    }
  }
  return null;
}

export async function searchSemantic(
  topic: string,
  opts: {
    yearFrom?: number | null;
    yearTo?: number | null;
    limit?: number;
    offset?: number;
  } = {}
): Promise<SemanticResult> {
  const { yearFrom, yearTo, limit = 20, offset = 0 } = opts;

  const fields =
    "title,authors,year,venue,externalIds,abstract,citationCount,openAccessPdf";
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search` +
    `?query=${encodeURIComponent(topic)}&fields=${fields}&limit=${limit}&offset=${offset}`;

  const res = await fetchWithRetry(url, 1);

  if (!res) {
    return { papers: [], rateLimited: false };
  }

  if (res.status === 429) {
    return { papers: [], rateLimited: true };
  }

  if (!res.ok) {
    logger.warn({ status: res.status }, "semantic: search failed");
    return { papers: [], rateLimited: false };
  }

  let raw: RawSemanticPaper[] = [];
  try {
    const data = (await res.json()) as { data?: RawSemanticPaper[] };
    raw = data.data ?? [];
  } catch (err) {
    logger.warn({ err }, "semantic: JSON parse error");
    return { papers: [], rateLimited: false };
  }

  // Client-side year filter
  if (yearFrom || yearTo) {
    raw = raw.filter((p) => {
      if (!p.year) return false;
      if (yearFrom && p.year < yearFrom) return false;
      if (yearTo && p.year > yearTo) return false;
      return true;
    });
  }

  const papers: SemanticPaper[] = raw.map((p): SemanticPaper => {
    const allAuthors = (p.authors ?? []).map((a) => a.name);
    const authors =
      allAuthors.length > 3
        ? [...allAuthors.slice(0, 3), "et al."]
        : allAuthors;

    const doi = p.externalIds?.DOI ?? null;
    const paperUrl = doi
      ? `https://doi.org/${doi}`
      : `https://www.semanticscholar.org/paper/${p.paperId}`;

    return {
      id: `sem_${p.paperId}`,
      title: p.title,
      authors,
      year: p.year ?? null,
      journal: p.venue || null,
      doi,
      abstract: p.abstract ? p.abstract.slice(0, 300) : null,
      citationCount: p.citationCount ?? null,
      openAccess: p.openAccessPdf ? true : null,
      url: paperUrl,
      source: "semantic",
      snippets: [] as never[],
    };
  });

  return { papers, rateLimited: false };
}
