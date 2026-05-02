import { safeFetch } from "./safeFetch";

interface UnpaywallResponse {
  is_oa?: boolean;
  best_oa_location?: { url?: string | null } | null;
}

export async function enrichWithFreePdfs<
  T extends { doi: string | null; freePdfUrl?: string | null },
>(papers: T[]): Promise<T[]> {
  const withDoi = papers.filter((p) => p.doi);
  if (!withDoi.length) return papers;

  const settled = await Promise.allSettled(
    withDoi.map(async (p) => {
      const encoded = encodeURIComponent(p.doi!);
      const res = await safeFetch(
        `https://api.unpaywall.org/v2/${encoded}?email=scholarforge@replit.dev`
      );
      if (!res.ok) return null;
      const json = (await res.json()) as UnpaywallResponse;
      const url = json.best_oa_location?.url;
      if (!json.is_oa || !url) return null;
      return { doi: p.doi!, url };
    })
  );

  const freeMap = new Map<string, string>();
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) {
      freeMap.set(r.value.doi, r.value.url);
    }
  }

  return papers.map((p) => ({
    ...p,
    freePdfUrl: p.doi ? (freeMap.get(p.doi) ?? null) : null,
  }));
}
