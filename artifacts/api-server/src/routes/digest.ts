import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText } from "../lib/promptSafety";
import { safeFetch } from "../lib/safeFetch";

const router: IRouter = Router();

function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return "";
  const words: Record<number, string> = {};
  for (const [w, positions] of Object.entries(inv))
    for (const p of positions) words[p] = w;
  return Object.keys(words).map(Number).sort((a, b) => a - b).map((k) => words[k]).join(" ");
}

// POST /api/digest
router.post("/digest", async (req, res): Promise<void> => {
  const { topics, discipline } = req.body as {
    topics?: string[];
    discipline?: string;
  };

  if (!topics || !Array.isArray(topics) || topics.length === 0) {
    res.status(400).json({ error: "topics array is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  // Build date filter: last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split("T")[0];

  const query = topics.slice(0, 3).join(" OR ").slice(0, 200);

  const params = new URLSearchParams({
    search: query,
    filter: `from_publication_date:${dateStr},open_access.is_oa:true`,
    "per-page": "10",
    select: "id,title,authorships,publication_year,primary_location,abstract_inverted_index,cited_by_count,doi",
    sort: "cited_by_count:desc",
    mailto: "scholarforge@replit.dev",
  });

  const oaRes = await safeFetch(`https://api.openalex.org/works?${params}`).catch(() => null);
  if (!oaRes?.ok) {
    res.status(502).json({ error: "Could not fetch recent papers from OpenAlex" });
    return;
  }

  const json = await oaRes.json() as {
    results?: Array<{
      id: string;
      title?: string;
      authorships?: Array<{ author?: { display_name?: string } }>;
      publication_year?: number | null;
      primary_location?: { landing_page_url?: string; source?: { display_name?: string } } | null;
      abstract_inverted_index?: Record<string, number[]> | null;
      cited_by_count?: number;
      doi?: string | null;
    }>;
  };

  const papers = (json.results ?? [])
    .map((w) => ({
      id: w.id.split("/").pop() ?? w.id,
      title: w.title ?? "Untitled",
      authors: (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name ?? "Unknown"),
      year: w.publication_year ?? null,
      venue: w.primary_location?.source?.display_name ?? null,
      url: w.primary_location?.landing_page_url ?? (w.doi ? `https://doi.org/${w.doi.replace("https://doi.org/", "")}` : ""),
      doi: w.doi?.replace("https://doi.org/", "") ?? null,
      abstract: reconstructAbstract(w.abstract_inverted_index) || null,
      citedByCount: w.cited_by_count ?? 0,
    }))
    .filter((p) => p.abstract && p.abstract.length > 80)
    .slice(0, 5);

  if (!papers.length) {
    res.json({ papers: [], generatedAt: new Date().toISOString(), query });
    return;
  }

  // Claude 2-sentence summaries for each paper
  const client = new Anthropic({ apiKey });
  const summaryResults = await Promise.allSettled(
    papers.map(async (p) => {
      const safeAbstract = wrapUserText(p.abstract!.slice(0, 1000));
      const msg = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: `Summarize this paper abstract in exactly 2 sentences for a research digest. Be specific about findings.

Abstract: ${safeAbstract}`,
          },
        ],
      });
      return msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    })
  );

  const digested = papers.map((p, i) => ({
    ...p,
    summary:
      summaryResults[i].status === "fulfilled"
        ? summaryResults[i].value
        : p.abstract?.slice(0, 200) ?? "",
  }));

  res.json({
    papers: digested,
    generatedAt: new Date().toISOString(),
    query,
    discipline: discipline ?? null,
  });
});

export default router;
