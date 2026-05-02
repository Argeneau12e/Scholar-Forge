import { safeFetch } from "./safeFetch";

interface EPMCHit {
  id?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  journalTitle?: string;
  abstractText?: string;
  doi?: string;
}

export interface EuropePMCResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  openAccess: boolean;
  source: "europepmc";
  snippets: [];
}

export async function searchEuropePMC(
  query: string,
  opts: { yearFrom?: number | null; yearTo?: number | null; phrase?: string | null } = {}
): Promise<EuropePMCResult[]> {
  const { yearFrom, yearTo, phrase } = opts;

  let q = `(${query}) OPEN_ACCESS:Y`;
  if (phrase) q += ` "${phrase}"`;
  if (yearFrom || yearTo) {
    const from = yearFrom ?? 1900;
    const to = yearTo ?? new Date().getFullYear();
    q += ` PUB_YEAR:[${from} TO ${to}]`;
  }

  const params = new URLSearchParams({
    query: q,
    resultType: "core",
    pageSize: "20",
    format: "json",
  });

  const res = await safeFetch(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`
  );
  if (!res.ok) throw new Error(`Europe PMC HTTP ${res.status}`);

  const json = (await res.json()) as {
    resultList?: { result?: EPMCHit[] };
  };
  const hits = json.resultList?.result ?? [];

  return hits.map((h): EuropePMCResult => {
    const authors = h.authorString
      ? h.authorString
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : [];
    const doi = h.doi ?? null;
    const url = doi
      ? `https://doi.org/${doi}`
      : `https://europepmc.org/article/${h.id ?? ""}`;
    return {
      id: `europepmc_${h.id ?? Math.random()}`,
      title: h.title ?? "Untitled",
      authors,
      abstract: h.abstractText ?? null,
      year: h.pubYear ? parseInt(h.pubYear) : null,
      venue: h.journalTitle ?? null,
      url,
      doi,
      openAccess: true,
      source: "europepmc",
      snippets: [],
    };
  });
}
