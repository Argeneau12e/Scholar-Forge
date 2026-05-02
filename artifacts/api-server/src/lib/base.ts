import { safeFetch } from "./safeFetch";

interface BASERecord {
  dcTitle?: string[];
  dcCreator?: string[];
  dcDate?: string[];
  dcDescription?: string[];
  dcIdentifier?: string[];
}

export interface BASEResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  openAccess: boolean;
  source: "base";
  snippets: [];
}

export async function searchBASE(
  query: string,
  opts: { yearFrom?: number | null; yearTo?: number | null } = {}
): Promise<BASEResult[]> {
  const { yearFrom, yearTo } = opts;

  const params = new URLSearchParams({
    func: "PerformSearch",
    query,
    hits: "20",
    offset: "0",
    fields: "dcTitle,dcCreator,dcDate,dcDescription,dcIdentifier",
    format: "json",
  });

  if (yearFrom || yearTo) {
    const from = yearFrom ?? 1900;
    const to = yearTo ?? new Date().getFullYear();
    params.set("filter", `dcYear:[${from} TO ${to}]`);
  }

  const res = await safeFetch(
    `https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi?${params}`
  );
  if (!res.ok) return [];

  const json = (await res.json()) as {
    response?: { docs?: BASERecord[] };
  };
  const docs = json.response?.docs ?? [];

  return docs.map((d, i): BASEResult => {
    const identifiers = d.dcIdentifier ?? [];
    const doi =
      identifiers
        .find((id) => id.startsWith("10.") || id.startsWith("doi:10."))
        ?.replace(/^doi:/, "") ?? null;
    const url =
      identifiers.find((id) => id.startsWith("http")) ??
      (doi ? `https://doi.org/${doi}` : "");
    const year = d.dcDate?.[0] ? parseInt(d.dcDate[0]) : null;

    return {
      id: `base_${i}_${Date.now()}`,
      title: d.dcTitle?.[0] ?? "Untitled",
      authors: d.dcCreator ?? [],
      abstract: d.dcDescription?.[0] ?? null,
      year,
      venue: null,
      url,
      doi,
      openAccess: true,
      source: "base",
      snippets: [],
    };
  });
}
