import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
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
    res.status(400).json({ error: "outline must be at least 20 characters" }); return;
  }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const safeOutline = wrapUserText(outline.slice(0, 3000));
  const safeTopic = wrapUserText((topic ?? "the topic").slice(0, 200));
  const safeDiscipline = discipline?.slice(0, 100) ?? "general academic";
  const target = wordTarget ?? 10000;

  const client = new Groq({ apiKey });
  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 2048,
    messages: [{
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
    }],
  });

  const text = msg.choices[0]?.message?.content ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "AI response could not be parsed" }); return; }
  res.json(JSON.parse(match[0]));
});

// POST /api/outline/resources
router.post("/outline/resources", async (req, res): Promise<void> => {
  const { section, topic, discipline } = req.body as {
    section?: string;
    topic?: string;
    discipline?: string;
  };

  if (!section || !topic) {
    res.status(400).json({ error: "section and topic are required" }); return;
  }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const safeSection = wrapUserText(section.slice(0, 200));
  const safeTopic = wrapUserText(topic.slice(0, 200));
  const safeDiscipline = (discipline ?? "general").slice(0, 100);

  const client = new Groq({ apiKey });

  // Get AI search queries for this section
  const queryMsg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `A student is writing the "${safeSection}" section of a ${safeDiscipline} dissertation on "${safeTopic}".
Generate 3 specific academic search queries to find relevant papers for this section.
Return ONLY a JSON array: ["query 1", "query 2", "query 3"]`,
    }],
  });

  const queryText = queryMsg.choices[0]?.message?.content ?? "[]";
  const queryMatch = queryText.match(/\[[\s\S]*\]/);
  const queries: string[] = queryMatch ? (JSON.parse(queryMatch[0]) as string[]).slice(0, 3) : [`${topic} ${section}`];

  // Fetch papers in parallel
  const oaSearches = await Promise.allSettled(queries.map((q) => searchOpenAlex(q)));
  const pmSearches = await Promise.allSettled(
    queries.map((q) => searchPubMed(q, { yearFrom: 2015, yearTo: null, phrase: null, page: 1 }))
  );

  const seen = new Set<string>();
  const papers: Array<{ title: string; url: string; year: number | null; authors: string[]; doi?: string | null }> = [];
  for (const r of [...oaSearches, ...pmSearches]) {
    if (r.status !== "fulfilled") continue;
    for (const p of r.value) {
      const key = ("doi" in p && p.doi ? p.doi : null) ?? p.title.toLowerCase().slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      papers.push({ title: p.title, url: p.url, year: p.year, authors: p.authors, doi: "doi" in p ? p.doi : null });
    }
  }
  papers.splice(10);

  res.json({ papers, section: safeSection, queries });
});

export default router;
