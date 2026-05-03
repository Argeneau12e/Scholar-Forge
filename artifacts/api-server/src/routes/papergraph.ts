import { Router, type IRouter } from "express";
import { safeFetch } from "../lib/safeFetch";

const router: IRouter = Router();

interface OAWork {
  id: string;
  title?: string;
  publication_year?: number | null;
  cited_by_count?: number;
  doi?: string | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { landing_page_url?: string; source?: { display_name?: string } } | null;
  referenced_works?: string[];
  related_works?: string[];
  abstract_inverted_index?: Record<string, number[]> | null;
}

function oaId(url: string): string {
  return url.split("/").pop() ?? url;
}

function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return "";
  const words: Record<number, string> = {};
  for (const [w, positions] of Object.entries(inv))
    for (const p of positions) words[p] = w;
  return Object.keys(words).map(Number).sort((a, b) => a - b).map((k) => words[k]).join(" ");
}

async function fetchWork(identifier: string): Promise<OAWork | null> {
  // Try by DOI first, then by ID
  const url = identifier.startsWith("W")
    ? `https://api.openalex.org/works/${identifier}?select=id,title,publication_year,cited_by_count,doi,authorships,primary_location,referenced_works,related_works,abstract_inverted_index&mailto=scholarforge@replit.dev`
    : `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(identifier)}?select=id,title,publication_year,cited_by_count,doi,authorships,primary_location,referenced_works,related_works,abstract_inverted_index&mailto=scholarforge@replit.dev`;

  const res = await safeFetch(url);
  if (!res.ok) return null;
  return res.json() as Promise<OAWork>;
}

async function fetchWorkByTitle(title: string): Promise<OAWork | null> {
  const params = new URLSearchParams({
    search: title,
    "per-page": "1",
    select: "id,title,publication_year,cited_by_count,doi,authorships,primary_location,referenced_works,related_works,abstract_inverted_index",
    mailto: "scholarforge@replit.dev",
  });
  const res = await safeFetch(`https://api.openalex.org/works?${params}`);
  if (!res.ok) return null;
  const json = await res.json() as { results?: OAWork[] };
  return json.results?.[0] ?? null;
}

async function batchFetchWorks(ids: string[]): Promise<OAWork[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25));

  const results: OAWork[] = [];
  for (const chunk of chunks) {
    const filter = chunk.map((id) => `openalex_id:${id}`).join("|");
    const params = new URLSearchParams({
      filter,
      "per-page": "25",
      select: "id,title,publication_year,cited_by_count,doi,authorships,primary_location,abstract_inverted_index",
      mailto: "scholarforge@replit.dev",
    });
    const res = await safeFetch(`https://api.openalex.org/works?${params}`).catch(() => null);
    if (!res?.ok) continue;
    const json = await res.json() as { results?: OAWork[] };
    results.push(...(json.results ?? []));
  }
  return results;
}

function workToNode(w: OAWork, relationship: string) {
  const doi = w.doi?.replace("https://doi.org/", "") ?? null;
  return {
    id: oaId(w.id),
    title: w.title ?? "Untitled",
    authors: (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name ?? "Unknown"),
    year: w.publication_year ?? null,
    citedByCount: w.cited_by_count ?? 0,
    doi,
    url: w.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : ""),
    venue: w.primary_location?.source?.display_name ?? null,
    abstract: reconstructAbstract(w.abstract_inverted_index) || null,
    relationship,
  };
}

// POST /api/papergraph
router.post("/papergraph", async (req, res): Promise<void> => {
  const { doi, title } = req.body as { doi?: string; title?: string };

  if (!doi && !title) {
    res.status(400).json({ error: "doi or title is required" });
    return;
  }

  // 1. Fetch seed paper
  let seed: OAWork | null = null;
  if (doi) {
    seed = await fetchWork(doi.replace("https://doi.org/", "")).catch(() => null);
  }
  if (!seed && title) {
    seed = await fetchWorkByTitle(title).catch(() => null);
  }
  if (!seed) {
    res.status(404).json({ error: "Paper not found in OpenAlex" });
    return;
  }

  const seedId = oaId(seed.id);

  // 2. Collect referenced + related works (up to 30 IDs)
  const refIds = (seed.referenced_works ?? []).map(oaId).slice(0, 20);
  const relIds = (seed.related_works ?? []).map(oaId).slice(0, 10);
  const neighborIds = [...new Set([...refIds, ...relIds])].slice(0, 30);

  // 3. Batch fetch neighbor metadata
  const neighbors = await batchFetchWorks(neighborIds);

  // 4. Build nodes and edges
  const seedNode = workToNode(seed, "seed");
  const neighborNodes = neighbors.map((w) => {
    const id = oaId(w.id);
    const relationship = refIds.includes(id) ? "reference" : "related";
    return workToNode(w, relationship);
  });

  const edges = neighborNodes.map((n) => ({
    source: seedId,
    target: n.id,
    type: refIds.includes(n.id) ? "cites" : "related",
  }));

  // Add co-citation edges (neighbor pairs that both appear in same referenced_works)
  const refSet = new Set(refIds);
  for (let i = 0; i < neighborNodes.length; i++) {
    for (let j = i + 1; j < neighborNodes.length; j++) {
      if (refSet.has(neighborNodes[i].id) && refSet.has(neighborNodes[j].id)) {
        edges.push({
          source: neighborNodes[i].id,
          target: neighborNodes[j].id,
          type: "co-citation",
        });
      }
    }
  }

  res.json({
    seed: seedNode,
    nodes: neighborNodes,
    edges: edges.slice(0, 200),
  });
});

export default router;
