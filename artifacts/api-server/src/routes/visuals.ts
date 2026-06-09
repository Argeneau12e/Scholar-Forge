import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { safeFetch } from "../lib/safeFetch";

const router: IRouter = Router();

type FigureType = "diagram" | "graph" | "table" | "microscopy" | "any";

interface FigureResult {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  sourceUrl: string;
  source: "pmc" | "wikimedia";
  license: string;
}

interface AISuggestion {
  suggestion: string;
  tools: Array<{ name: string; url: string; note: string }>;
}

interface VisualsBody {
  topic?: string;
  discipline?: string;
  figureType?: string;
}

function tryParseJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as T; } catch { return null; }
}

async function searchPMC(topic: string, figureType: FigureType): Promise<FigureResult[]> {
  const typeFilter = figureType !== "any" ? ` AND ${figureType}` : "";
  const query = encodeURIComponent(`${topic}${typeFilter}`);
  const url = `https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?tool=scholarforge&email=scholarforge@replit.dev&format=xml`;
  void url;

  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${query}+AND+open+access[filter]&retmax=5&retmode=json&tool=scholarforge&email=scholarforge@replit.dev`;
    const searchRes = await safeFetch(searchUrl);
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
    const ids = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    const figures: FigureResult[] = [];
    for (const id of ids.slice(0, 3)) {
      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=${id}&retmode=json&tool=scholarforge&email=scholarforge@replit.dev`;
      const summaryRes = await safeFetch(summaryUrl);
      if (!summaryRes.ok) continue;
      const summaryData = await summaryRes.json() as { result?: Record<string, { title?: string; fulljournalname?: string }> };
      const paper = summaryData.result?.[id];
      if (!paper) continue;

      figures.push({
        id: `pmc_${id}`,
        title: paper.title ?? "Figure from PMC",
        caption: `Figure from: ${paper.title ?? "PMC article"} (${paper.fulljournalname ?? "PMC"})`,
        imageUrl: "",
        sourceUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${id}/`,
        source: "pmc",
        license: "Open Access",
      });

      if (figures.length >= 5) break;
    }
    return figures;
  } catch {
    return [];
  }
}

async function searchWikimedia(topic: string): Promise<FigureResult[]> {
  try {
    const query = encodeURIComponent(topic);
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${query}&srnamespace=6&srlimit=5&format=json&origin=*`;
    const res = await safeFetch(url);
    if (!res.ok) return [];
    const data = await res.json() as {
      query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> };
    };
    const results = data.query?.search ?? [];
    const figures: FigureResult[] = [];

    for (const r of results.slice(0, 5)) {
      if (!r.title) continue;
      const fileTitle = encodeURIComponent(r.title);
      const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${fileTitle}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
      const infoRes = await safeFetch(infoUrl);
      if (!infoRes.ok) continue;
      const infoData = await infoRes.json() as {
        query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string; descriptionurl?: string; extmetadata?: { ImageDescription?: { value?: string }; LicenseShortName?: { value?: string } } }> }> };
      };
      const pages = infoData.query?.pages ?? {};
      const page = Object.values(pages)[0];
      const imageInfo = page?.imageinfo?.[0];
      if (!imageInfo?.url) continue;
      const ext = imageInfo.url.split(".").pop()?.toLowerCase() ?? "";
      if (!["jpg", "jpeg", "png", "svg", "gif", "webp"].includes(ext)) continue;

      figures.push({
        id: `wiki_${r.pageid ?? Math.random()}`,
        title: r.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
        caption: imageInfo.extmetadata?.ImageDescription?.value?.replace(/<[^>]*>/g, "").slice(0, 200) ?? r.snippet?.replace(/<[^>]*>/g, "") ?? "",
        imageUrl: imageInfo.url,
        sourceUrl: imageInfo.descriptionurl ?? `https://commons.wikimedia.org/wiki/${fileTitle}`,
        source: "wikimedia",
        license: imageInfo.extmetadata?.LicenseShortName?.value ?? "Wikimedia Commons",
      });

      if (figures.length >= 5) break;
    }
    return figures;
  } catch {
    return [];
  }
}

async function getAISuggestion(topic: string, discipline: string, apiKey: string): Promise<AISuggestion | null> {
  try {
    const client = new Groq({ apiKey });
    const message = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `A student is writing about "${topic}" in ${discipline} and needs a figure. Describe in 2-3 sentences the ideal diagram or figure that would best illustrate this topic for an academic paper. Then suggest 3 free tools to create it.

Return ONLY this JSON:
{
  "suggestion": "2-3 sentence description of the ideal figure",
  "tools": [
    { "name": "Tool name", "url": "https://...", "note": "one sentence on why it's good for this" },
    { "name": "Tool name", "url": "https://...", "note": "one sentence" },
    { "name": "Tool name", "url": "https://...", "note": "one sentence" }
  ]
}`,
      }],
    });
    const raw = message.choices[0]?.message?.content ?? "";
    return tryParseJson<AISuggestion>(raw);
  } catch {
    return null;
  }
}

// POST /api/visuals
router.post("/visuals", async (req, res): Promise<void> => {
  const body = req.body as VisualsBody;

  if (typeof body.topic !== "string" || !body.topic.trim()) {
    res.status(400).json({ error: "topic is required" }); return;
  }

  const topic = body.topic.trim();
  const discipline = typeof body.discipline === "string" ? body.discipline.trim() || "general" : "general";
  const figureType: FigureType =
    ["diagram", "graph", "table", "microscopy"].includes(body.figureType ?? "")
      ? (body.figureType as FigureType) : "any";

  try {
    const [pmcFigures, wikiFigures] = await Promise.all([
      searchPMC(topic, figureType),
      searchWikimedia(topic),
    ]);

    const figures: FigureResult[] = [...pmcFigures, ...wikiFigures];

    let aiSuggestion: AISuggestion | null = null;
    if (figures.length < 3) {
      const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
      if (apiKey) {
        aiSuggestion = await getAISuggestion(topic, discipline, apiKey);
      }
    }

    res.json({ figures, aiSuggestion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Visual sourcing failed: ${msg}` });
  }
});

export default router;
