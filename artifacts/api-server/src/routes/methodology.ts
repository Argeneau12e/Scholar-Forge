import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText } from "../lib/promptSafety";
import { searchOpenAlex } from "../lib/openalex";

const router: IRouter = Router();

interface MethodologyItem {
  name: string;
  type: "quantitative" | "qualitative" | "mixed";
  suitability: "high" | "medium" | "low";
  rationale: string;
  commonPitfalls: string[];
  keyPapers: Array<{ title: string; url: string; year: number | null; authors: string[] }>;
}

interface MethodologyResponse {
  recommended: MethodologyItem[];
  notRecommended: Array<{ name: string; reason: string }>;
  ethicsConsiderations: string[];
  dataCollectionSuggestions: string[];
}

// POST /api/methodology
router.post("/methodology", async (req, res): Promise<void> => {
  const { topic, researchQuestion, discipline } = req.body as {
    topic?: string;
    researchQuestion?: string;
    discipline?: string;
  };

  if (!topic || !researchQuestion) {
    res.status(400).json({ error: "topic and researchQuestion are required" }); return;
  }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const safeTopic = wrapUserText(topic.slice(0, 200));
  const safeQuestion = wrapUserText(researchQuestion.slice(0, 300));
  const safeDiscipline = (discipline ?? "general academic").slice(0, 100);

  const client = new Groq({ apiKey });
  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `A student in ${safeDiscipline} is researching '${safeTopic}' with the research question: '${safeQuestion}'.

Recommend appropriate research methodologies. Return ONLY valid JSON (no markdown):
{
  "recommended": [
    {
      "name": "methodology name",
      "type": "quantitative|qualitative|mixed",
      "suitability": "high|medium|low",
      "rationale": "2 clear sentences",
      "commonPitfalls": ["pitfall 1", "pitfall 2"],
      "keyPapers": ["search query to find methodology papers"]
    }
  ],
  "notRecommended": [{"name": "methodology", "reason": "why not suitable"}],
  "ethicsConsiderations": ["consideration 1"],
  "dataCollectionSuggestions": ["suggestion 1"]
}
Recommend 2-4 methodologies. keyPapers should be search query strings.`,
    }],
  });

  const text = msg.choices[0]?.message?.content ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }

  let parsed: MethodologyResponse;
  try {
    parsed = JSON.parse(match[0]) as MethodologyResponse;
  } catch {
    res.status(502).json({ error: "Invalid JSON from AI" }); return;
  }

  // Enrich with real papers from OpenAlex
  const enriched = await Promise.all(
    (parsed.recommended ?? []).map(async (item) => {
      const queries = (item.keyPapers as unknown[]).filter((q): q is string => typeof q === "string").slice(0, 2);
      const paperResults = await Promise.allSettled(
        queries.map((q) => searchOpenAlex(`${q} ${safeDiscipline}`))
      );
      const papers = paperResults.flatMap((r) => r.status === "fulfilled" ? r.value.slice(0, 2) : []);
      return {
        ...item,
        keyPapers: papers.map((p) => ({
          title: p.title,
          url: p.url,
          year: p.year,
          authors: p.authors.slice(0, 2),
        })),
      };
    })
  );

  res.json({ ...parsed, recommended: enriched });
});

export default router;
