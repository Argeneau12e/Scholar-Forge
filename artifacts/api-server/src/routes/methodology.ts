import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
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
    res.status(400).json({ error: "topic and researchQuestion are required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const safeTopic = wrapUserText(topic.slice(0, 200));
  const safeQuestion = wrapUserText(researchQuestion.slice(0, 300));
  const safeDiscipline = (discipline ?? "general academic").slice(0, 100);

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    messages: [
      {
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
      },
    ],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    res.status(502).json({ error: "Could not parse AI response" });
    return;
  }

  const parsed = JSON.parse(match[0]) as Partial<MethodologyResponse> & {
    recommended?: Array<MethodologyItem & { keyPapers: unknown[] }>;
  };

  // Search for real methodology papers for each recommended method
  const enriched = await Promise.allSettled(
    (parsed.recommended ?? []).slice(0, 4).map(async (method) => {
      const queries = method.keyPapers ?? [];
      const searchQuery = Array.isArray(queries) && queries.length > 0
        ? `${queries[0]} ${method.name} methodology`.slice(0, 150)
        : `${method.name} research methodology ${topic}`;

      const papers = await searchOpenAlex(searchQuery, { yearFrom: 2010 }).catch(() => []);
      const keyPapers = papers.slice(0, 3).map((p) => ({
        title: p.title,
        url: p.url,
        year: p.year,
        authors: p.authors.slice(0, 2),
      }));

      return { ...method, keyPapers };
    })
  );

  const response: MethodologyResponse = {
    recommended: enriched
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value as MethodologyItem),
    notRecommended: parsed.notRecommended ?? [],
    ethicsConsiderations: parsed.ethicsConsiderations ?? [],
    dataCollectionSuggestions: parsed.dataCollectionSuggestions ?? [],
  };

  res.json(response);
});

export default router;
