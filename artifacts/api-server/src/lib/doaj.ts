import { safeFetch } from "./safeFetch";

interface DOAJBibjson {
  title?: string;
  author?: Array<{ name?: string }>;
  year?: string;
  journal?: { title?: string };
  abstract?: string;
  identifier?: Array<{ type: string; id: string }>;
  link?: Array<{ type: string; url: string }>;
}

interface DOAJArticle {
  bibjson?: DOAJBibjson;
}

export interface DOAJResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  openAccess: boolean;
  source: "doaj";
  snippets: [];
}

export async function searchDOAJ(
  query: string,
  opts: { yearFrom?: number | null; yearTo?: number | null } = {}
): Promise<DOAJResult[]> {
  const { yearFrom, yearTo } = opts;

  const encoded = encodeURIComponent(query);
  const params = new URLSearchParams({ pageSize: "20" });

  const res = await safeFetch(
    `https://doaj.org/api/search/articles/${encoded}?${params}`
  );
  if (!res.ok) return [];

  const json = (await res.json()) as { results?: DOAJArticle[] };
  const out: DOAJResult[] = [];

  for (let i = 0; i < (json.results ?? []).length; i++) {
    const b = (json.results ?? [])[i].bibjson;
    if (!b) continue;

    const year = b.year ? parseInt(b.year) : null;
    if (yearFrom && year && year < yearFrom) continue;
    if (yearTo && year && year > yearTo) continue;

    const doi = b.identifier?.find((id) => id.type === "doi")?.id ?? null;
    const url =
      b.link?.find((l) => l.type === "fulltext")?.url ??
      (doi ? `https://doi.org/${doi}` : "");

    out.push({
      id: `doaj_${i}_${Date.now()}`,
      title: b.title ?? "Untitled",
      authors: (b.author ?? []).map((a) => a.name ?? "Unknown"),
      abstract: b.abstract ?? null,
      year,
      venue: b.journal?.title ?? null,
      url,
      doi,
      openAccess: true,
      source: "doaj",
      snippets: [],
    });
  }
  return out;
}
