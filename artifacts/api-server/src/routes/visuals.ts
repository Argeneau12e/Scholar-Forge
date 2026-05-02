import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

type FigureType = "diagram" | "graph" | "table" | "microscopy" | "any";

interface VisualsBody {
  topic?: string;
  discipline?: string;
  figureType?: string;
}

interface FigureResult {
  url: string;
  caption: string;
  attribution: string;
  source: "pmc" | "wikimedia";
}

interface AISuggestionTool {
  name: string;
  url: string;
  note: string;
}

interface AISuggestion {
  suggestion: string;
  tools: AISuggestionTool[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tryParseJson<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

// ─── PMC Search ───────────────────────────────────────────────────────────────

async function searchPMC(topic: string, figureType: string): Promise<FigureResult[]> {
  const figures: FigureResult[] = [];

  try {
    const typeFilter = figureType !== "any" ? ` AND ${figureType}[tiab]` : "";
    const searchTerm = encodeURIComponent(`${topic}${typeFilter} AND has_figure[filter]`);
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${searchTerm}&retmax=8&retmode=json`;

    const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchResp.ok) return [];

    const searchData = (await searchResp.json()) as { esearchresult?: { idlist?: string[] } };
    const ids: string[] = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    // Fetch article summaries for metadata
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=${ids.slice(0, 6).join(",")}&retmode=json`;
    const summaryResp = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    const summaryData = (await summaryResp.json()) as {
      result?: Record<string, {
        title?: string;
        authors?: { name: string }[];
        pubdate?: string;
        source?: string;
        uid?: string;
      }>;
    };
    const summaryResult = summaryData.result ?? {};

    // Fetch XML for each article to extract figures (limit to 4 articles)
    const articlesToFetch = ids.slice(0, 4);
    const xmlFetches = articlesToFetch.map(async (pmcid) => {
      try {
        const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&rettype=xml&retmode=xml`;
        const efetchResp = await fetch(efetchUrl, { signal: AbortSignal.timeout(10000) });
        if (!efetchResp.ok) return;
        const xml = await efetchResp.text();

        // Extract article meta from summary
        const meta = summaryResult[pmcid];
        const firstAuthor = meta?.authors?.[0]?.name ?? "Unknown";
        const lastName = firstAuthor.split(" ")[0];
        const year = (meta?.pubdate ?? "").slice(0, 4) || "n.d.";
        const journal = meta?.source ?? "Journal";

        // Extract <fig> blocks
        const figRegex = /<fig\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/fig>/g;
        let figMatch: RegExpExecArray | null;
        let figCount = 0;

        while ((figMatch = figRegex.exec(xml)) !== null && figCount < 2) {
          const figId = figMatch[1];
          const figXml = figMatch[2];

          // Extract caption text
          const captionMatch = figXml.match(/<caption>([\s\S]*?)<\/caption>/);
          const caption = captionMatch ? stripTags(captionMatch[1]).slice(0, 400) : figId;

          // Extract graphic href (image filename)
          const graphicMatch = figXml.match(/xlink:href="([^"]+)"/);
          if (!graphicMatch) continue;
          const href = graphicMatch[1];

          // PMC Open Access image URL
          const imageUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcid}/bin/${href}.jpg`;
          const attribution = `Source: ${lastName} et al., ${year}. ${journal}. PMC${pmcid}. Open access.`;

          figures.push({ url: imageUrl, caption, attribution, source: "pmc" });
          figCount++;
        }
      } catch {
        // silently skip failed article fetches
      }
    });

    await Promise.allSettled(xmlFetches);
  } catch {
    // silently fail
  }

  return figures;
}

// ─── Wikimedia Commons Search ─────────────────────────────────────────────────

async function searchWikimedia(topic: string): Promise<FigureResult[]> {
  const figures: FigureResult[] = [];

  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: topic,
      gsrnamespace: "6",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      gsrlimit: "6",
      format: "json",
      origin: "*",
    });
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
    const wikiResp = await fetch(wikiUrl, { signal: AbortSignal.timeout(8000) });
    if (!wikiResp.ok) return [];

    const wikiData = (await wikiResp.json()) as {
      query?: {
        pages?: Record<string, {
          title?: string;
          imageinfo?: [{
            url?: string;
            extmetadata?: {
              ImageDescription?: { value: string };
              LicenseShortName?: { value: string };
              Artist?: { value: string };
            };
          }];
        }>;
      };
    };

    const pages = wikiData.query?.pages ?? {};

    for (const page of Object.values(pages)) {
      const imageinfo = page.imageinfo?.[0];
      if (!imageinfo?.url) continue;

      // Skip non-image files
      const url = imageinfo.url.toLowerCase();
      if (!url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) continue;

      // Skip SVG diagrams that are vector only (optional — include them)
      const extmeta = imageinfo.extmetadata;
      const rawDesc = extmeta?.ImageDescription?.value ?? page.title ?? "";
      const caption = (stripTags(rawDesc).slice(0, 400) || page.title) ?? "Wikimedia figure";
      const license = extmeta?.LicenseShortName?.value ?? "Open license";
      const rawArtist = extmeta?.Artist?.value ?? "";
      const artist = stripTags(rawArtist) || "Wikimedia contributor";

      figures.push({
        url: imageinfo.url,
        caption,
        attribution: `${artist}. ${license}. Wikimedia Commons.`,
        source: "wikimedia",
      });

      if (figures.length >= 5) break;
    }
  } catch {
    // silently fail
  }

  return figures;
}

// ─── AI Figure Suggestion ─────────────────────────────────────────────────────

async function getAISuggestion(
  topic: string,
  discipline: string,
  apiKey: string
): Promise<AISuggestion | null> {
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `A student is writing about "${topic}" in ${discipline} and needs a figure. Describe in 2-3 sentences the ideal diagram or figure that would best illustrate this topic for an academic paper. Then suggest 3 free tools to create it.

Return ONLY this JSON:
{
  "suggestion": "2-3 sentence description of the ideal figure",
  "tools": [
    { "name": "Tool name", "url": "https://...", "note": "one sentence on why it's good for this" },
    { "name": "Tool name", "url": "https://...", "note": "one sentence on why it's good for this" },
    { "name": "Tool name", "url": "https://...", "note": "one sentence on why it's good for this" }
  ]
}`,
      }],
    });
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    return tryParseJson<AISuggestion>(raw);
  } catch {
    return null;
  }
}

// ─── POST /api/visuals ────────────────────────────────────────────────────────

router.post("/visuals", async (req, res): Promise<void> => {
  const body = req.body as VisualsBody;

  if (typeof body.topic !== "string" || !body.topic.trim()) {
    res.status(400).json({ error: "topic is required" });
    return;
  }

  const topic = body.topic.trim();
  const discipline = typeof body.discipline === "string" ? body.discipline.trim() || "general" : "general";
  const figureType: FigureType =
    ["diagram", "graph", "table", "microscopy"].includes(body.figureType ?? "")
      ? (body.figureType as FigureType)
      : "any";

  try {
    // Fetch from both sources in parallel
    const [pmcFigures, wikiFigures] = await Promise.all([
      searchPMC(topic, figureType),
      searchWikimedia(topic),
    ]);

    const figures: FigureResult[] = [...pmcFigures, ...wikiFigures];

    // AI suggestion if fewer than 3 results
    let aiSuggestion: AISuggestion | null = null;
    if (figures.length < 3) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
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
