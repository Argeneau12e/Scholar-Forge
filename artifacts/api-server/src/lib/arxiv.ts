import { safeFetch } from "./safeFetch";
import { parseStringPromise } from "xml2js";

interface ArxivEntry {
  id?: [string];
  title?: [string];
  summary?: [string];
  published?: [string];
  author?: Array<{ name?: [string] }>;
  "arxiv:doi"?: [string];
}

interface ArxivFeed {
  feed?: { entry?: ArxivEntry[] };
}

export interface ArxivResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  openAccess: boolean;
  isPreprint: boolean;
  source: "arxiv";
  snippets: [];
}

export async function searchArxiv(
  query: string,
  opts: { yearFrom?: number | null; yearTo?: number | null } = {}
): Promise<ArxivResult[]> {
  const { yearFrom, yearTo } = opts;

  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: "0",
    max_results: "25",
    sortBy: "relevance",
  });

  const res = await safeFetch(
    `https://export.arxiv.org/api/query?${params}`
  );
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);

  const xml = await res.text();
  const parsed = (await parseStringPromise(xml, {
    explicitArray: true,
  })) as ArxivFeed;
  const entries: ArxivEntry[] = parsed?.feed?.entry ?? [];

  const results: ArxivResult[] = [];
  for (const entry of entries) {
    const rawId = entry.id?.[0] ?? "";
    const arxivId = rawId.split("/abs/")[1]?.replace(/v\d+$/, "") ?? rawId;
    const published = entry.published?.[0] ?? "";
    const year = published ? new Date(published).getFullYear() : null;

    if (yearFrom && year && year < yearFrom) continue;
    if (yearTo && year && year > yearTo) continue;

    const doi = entry["arxiv:doi"]?.[0] ?? null;
    results.push({
      id: `arxiv_${arxivId}`,
      title: (entry.title?.[0] ?? "Untitled").replace(/\s+/g, " ").trim(),
      authors: (entry.author ?? []).map((a) => a.name?.[0] ?? "Unknown"),
      abstract: entry.summary?.[0]?.replace(/\s+/g, " ").trim() ?? null,
      year,
      venue: "arXiv (Preprint)",
      url: `https://arxiv.org/abs/${arxivId}`,
      doi,
      openAccess: true,
      isPreprint: true,
      source: "arxiv",
      snippets: [],
    });
  }
  return results;
}
