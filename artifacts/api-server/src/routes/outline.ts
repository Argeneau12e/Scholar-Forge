import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText } from "../lib/promptSafety";
import { searchOpenAlex } from "../lib/openalex";
import { searchPubMed } from "../lib/pubmed";

const router: IRouter = Router();

// POST /api/outline/analyze
router.post("/outline/analyze", async (req, res): Promise<void> => {
  const { outline, topic, discipline, wordTarget, supervisorConfig } = req.body as {
    outline?: string;
    topic?: string;
    discipline?: string;
    wordTarget?: number;
    supervisorConfig?: unknown;
  };

  if (!outline || outline.trim().length < 20) {
    res.status(400).json({ error: "outline must be at least 20 characters" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const safeOutline = wrapUserText(outline.slice(0, 3000));
  const safeTopic = wrapUserText((topic ?? "the topic").slice(0, 200));
  const safeDiscipline = discipline?.slice(0, 100) ?? "general academic";
  const target = wordTarget ?? 10000;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are an experienced dissertation supervisor reviewing a student's outline for a ${safeDiscipline} dissertation on ${safeTopic} (target: ${target} words).

Outline:
${safeOutline}

${supervisorConfig ? `Supervisor constraints: ${JSON.stringify(supervisorConfig).slice(0, 300)}` : ""}

Return ONLY valid JSON (no markdown fence):
{
  "overallFeedback": "2-3 constructive sentences",
  "structureScore": 7,
  "issues": [
    {
      "section": "section name",
      "type": "missing_section|wrong_order|too_broad|too_narrow|no_methodology|weak_conclusion|citation_heavy_without_analysis",
      "description": "what is wrong",
      "fix": "specific fix suggestion"
    }
  ],
  "suggestedRevision": "revised outline in same format as input",
  "sectionsNeedingMoreSources": ["section names"],
  "recommendedWordDistribution": {"Introduction": 1500, "Literature Review": 3000},
  "missingEssentialSections": ["section names if any"]
}`,
      },
    ],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    res.status(502).json({ error: "AI response could not be parsed" });
    return;
  }

  res.json(JSON.parse(match[0]));
});

// POST /api/outline/resources
router.post("/outline/resources", async (req, res): Promise<void> => {
  const { outline, topic, discipline } = req.body as {
    outline?: string;
    topic?: string;
    discipline?: string;
  };

  if (!outline || !topic) {
    res.status(400).json({ error: "outline and topic are required" });
    return;
  }

  // Parse sections from outline (lines starting with numbers or bullets)
  const lines = outline.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const sectionLines = lines.filter(
    (l) => /^(\d+\.|\*|-|#+)\s/.test(l) || /^[A-Z]/.test(l)
  );
  const sections = sectionLines
    .map((l) => l.replace(/^[\d.*\-#]+\s*/, "").trim())
    .filter((s) => s.length > 3)
    .slice(0, 8);

  if (!sections.length) {
    res.json({ sections: {} });
    return;
  }

  // Search for papers for each section in parallel
  const results = await Promise.allSettled(
    sections.map(async (section) => {
      const q = `${topic} ${section} ${discipline ?? ""}`.trim();
      const [oa, pm] = await Promise.all([
        searchOpenAlex(q, { yearFrom: 2015 }).catch(() => []),
        searchPubMed(q, { yearFrom: 2015, yearTo: null, phrase: null, page: 1 }).catch(() => []),
      ]);

      const merged = [
        ...oa.slice(0, 3).map((p) => ({
          id: p.id, title: p.title, authors: p.authors,
          year: p.year, venue: p.venue, url: p.url, doi: p.doi,
          citationCount: p.citationCount, source: "openalex",
        })),
        ...pm.slice(0, 2).map((p) => ({
          id: `pmc_${p.pmcid}`, title: p.title, authors: p.authors,
          year: p.year, venue: p.journal, url: p.url, doi: p.doi,
          citationCount: null, source: "pubmed",
        })),
      ];

      return { section, papers: merged };
    })
  );

  const sectionMap: Record<string, unknown[]> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      sectionMap[r.value.section] = r.value.papers;
    }
  }

  res.json({ sections: sectionMap });
});

export default router;
