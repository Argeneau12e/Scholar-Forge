import { safeFetch } from "./safeFetch";

interface COREWork {
  id?: string | number;
  title?: string;
  authors?: Array<{ name?: string }>;
  yearPublished?: number | null;
  publisher?: string;
  abstract?: string;
  doi?: string;
  downloadUrl?: string;
  sourceFulltextUrls?: string[];
}

export interface COREResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  openAccess: boolean;
  source: "core";
  snippets: [];
}

export async function searchCORE(
  query: string,
  opts: { yearFrom?: number | null; yearTo?: number | null } = {}
): Promise<COREResult[]> {
  const apiKey = process.env.CORE_API_KEY;
  if (!apiKey) return [];

  const { yearFrom, yearTo } = opts;

  const body: Record<string, unknown> = { q: query, limit: 20 };
  if (yearFrom || yearTo) {
    body.filters = {
      yearPublished: {
        ...(yearFrom ? { gte: yearFrom } : {}),
        ...(yearTo ? { lte: yearTo } : {}),
      },
    };
  }

  const res = await safeFetch("https://api.core.ac.uk/v3/search/works", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];

  const json = (await res.json()) as { results?: COREWork[] };
  return (json.results ?? []).map((w): COREResult => {
    const doi = w.doi ?? null;
    const url =
      w.downloadUrl ??
      w.sourceFulltextUrls?.[0] ??
      (doi ? `https://doi.org/${doi}` : "");
    return {
      id: `core_${w.id ?? Math.random()}`,
      title: w.title ?? "Untitled",
      authors: (w.authors ?? []).map((a) => a.name ?? "Unknown"),
      abstract: w.abstract ?? null,
      year: w.yearPublished ?? null,
      venue: w.publisher ?? null,
      url,
      doi,
      openAccess: true,
      source: "core",
      snippets: [],
    };
  });
}
