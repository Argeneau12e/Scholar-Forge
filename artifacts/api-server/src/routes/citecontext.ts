import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText } from "../lib/promptSafety";
import { safeFetch } from "../lib/safeFetch";

const router: IRouter = Router();

interface CitingPaper {
  id: string;
  title: string;
  year: number | null;
  abstract: string | null;
  url: string;
  context: string;
  contextType: "supporting" | "contrasting" | "mentioning";
}

async function getOpenAlexId(doi: string): Promise<string | null> {
  const res = await safeFetch(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?select=id&mailto=scholarforge@replit.dev`
  );
  if (!res.ok) return null;
  const json = await res.json() as { id?: string };
  return json.id ? json.id.split("/").pop() ?? null : null;
}

async function classifyContext(
  client: Groq,
  citedTitle: string,
  citingAbstract: string
): Promise<{ context: string; contextType: "supporting" | "contrasting" | "mentioning" }> {
  const safeTitle = wrapUserText(citedTitle.slice(0, 150));
  const safeAbstract = wrapUserText(citingAbstract.slice(0, 1200));

  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `In this abstract, how is "${safeTitle}" cited? Return ONLY valid JSON:
{"context":"one sentence describing how it is cited (max 20 words)","contextType":"supporting"|"contrasting"|"mentioning"}

Abstract: ${safeAbstract}`,
    }],
  });

  const text = msg.choices[0]?.message?.content ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { context: "Mentioned in passing.", contextType: "mentioning" };
  const parsed = JSON.parse(match[0]) as Partial<{ context: string; contextType: string }>;
  return {
    context: (parsed.context ?? "Mentioned.").slice(0, 200),
    contextType: (["supporting", "contrasting", "mentioning"].includes(parsed.contextType ?? "")
      ? parsed.contextType
      : "mentioning") as "supporting" | "contrasting" | "mentioning",
  };
}

// POST /api/citecontext
router.post("/citecontext", async (req, res): Promise<void> => {
  const { doi, title } = req.body as { doi?: string; title?: string };

  if (!doi) { res.status(400).json({ error: "doi is required" }); return; }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const oaId = await getOpenAlexId(doi).catch(() => null);
  if (!oaId) {
    res.status(404).json({ error: "Paper not found in OpenAlex — citation context requires a DOI" }); return;
  }

  const params = new URLSearchParams({
    filter: `cites:${oaId}`,
    "per-page": "20",
    select: "id,title,publication_year,primary_location,abstract_inverted_index",
    mailto: "scholarforge@replit.dev",
  });
  const res2 = await safeFetch(`https://api.openalex.org/works?${params}`).catch(() => null);
  if (!res2?.ok) { res.status(502).json({ error: "Could not fetch citing papers from OpenAlex" }); return; }

  const json = await res2.json() as {
    meta?: { count?: number };
    results?: Array<{
      id: string;
      title?: string;
      publication_year?: number | null;
      primary_location?: { landing_page_url?: string } | null;
      abstract_inverted_index?: Record<string, number[]> | null;
    }>;
  };

  const total = json.meta?.count ?? 0;
  const papers = json.results ?? [];

  function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string {
    if (!inv) return "";
    const words: Record<number, string> = {};
    for (const [w, positions] of Object.entries(inv))
      for (const p of positions) words[p] = w;
    return Object.keys(words).map(Number).sort((a, b) => a - b).map((k) => words[k]).join(" ");
  }

  const withAbstract = papers
    .map((p) => ({ ...p, abstract: reconstructAbstract(p.abstract_inverted_index) }))
    .filter((p) => p.abstract.length > 80);

  const client = new Groq({ apiKey });

  const classified = await Promise.allSettled(
    withAbstract.map((p) =>
      classifyContext(client, title ?? "the cited paper", p.abstract).catch(() => ({
        context: "Mentioned in the literature.",
        contextType: "mentioning" as const,
      }))
    )
  );

  const contexts: CitingPaper[] = withAbstract.map((p, i) => {
    const cls =
      classified[i].status === "fulfilled"
        ? classified[i].value
        : { context: "Mentioned.", contextType: "mentioning" as const };
    return {
      id: p.id.split("/").pop() ?? p.id,
      title: p.title ?? "Untitled",
      year: p.publication_year ?? null,
      abstract: p.abstract,
      url: p.primary_location?.landing_page_url ?? "",
      context: cls.context,
      contextType: cls.contextType,
    };
  });

  res.json({ total, contexts, doi, title: title ?? "" });
});

export default router;
