import { safeFetch } from "./safeFetch";

interface OAAuthorship {
  author?: { display_name?: string };
}

interface OAWork {
  id: string;
  title?: string;
  authorships?: OAAuthorship[];
  publication_year?: number | null;
  primary_location?: {
    source?: { display_name?: string };
    landing_page_url?: string;
  } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  cited_by_count?: number;
  doi?: string | null;
  open_access?: { is_oa?: boolean };
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string {
  if (!invertedIndex) return "";
  const words: Record<number, string> = {};
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) words[pos] = word;
  }
  return Object.keys(words)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => words[k])
    .join(" ");
}

export interface OpenAlexResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  citationCount: number;
  openAccess: boolean;
  source: "openalex";
  snippets: [];
}

export async function searchOpenAlex(
  query: string,
  opts: { yearFrom?: number | null; yearTo?: number | null; page?: number } = {}
): Promise<OpenAlexResult[]> {
  const { yearFrom, yearTo, page = 1 } = opts;

  const filters: string[] = ["open_access.is_oa:true"];
  if (yearFrom || yearTo) {
    const from = yearFrom ?? 1900;
    const to = yearTo ?? new Date().getFullYear();
    filters.push(`publication_year:${from}-${to}`);
  }

  const params = new URLSearchParams({
    search: query,
    filter: filters.join(","),
    "per-page": "20",
    page: String(page),
    select: [
      "id", "title", "authorships", "publication_year",
      "primary_location", "abstract_inverted_index",
      "cited_by_count", "doi", "open_access",
    ].join(","),
    mailto: "scholarforge@replit.dev",
  });

  const res = await safeFetch(`https://api.openalex.org/works?${params}`);
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);

  const json = (await res.json()) as { results?: OAWork[] };
  return (json.results ?? []).map((w): OpenAlexResult => {
    const doiRaw = w.doi ?? null;
    const doi = doiRaw?.replace("https://doi.org/", "") ?? null;
    const url =
      w.primary_location?.landing_page_url ??
      (doi ? `https://doi.org/${doi}` : "");
    return {
      id: `openalex_${w.id.split("/").pop() ?? w.id}`,
      title: w.title ?? "Untitled",
      authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? "Unknown"),
      abstract: reconstructAbstract(w.abstract_inverted_index) || null,
      year: w.publication_year ?? null,
      venue: w.primary_location?.source?.display_name ?? null,
      url,
      doi,
      citationCount: w.cited_by_count ?? 0,
      openAccess: w.open_access?.is_oa ?? true,
      source: "openalex",
      snippets: [],
    };
  });
}
