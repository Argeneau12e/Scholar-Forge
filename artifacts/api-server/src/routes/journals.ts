import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText } from "../lib/promptSafety";
import { safeFetch } from "../lib/safeFetch";

const router: IRouter = Router();

interface JournalRecommendation {
  name: string;
  issn: string | null;
  publisher: string | null;
  openAccess: boolean;
  apcUsd: number | null;
  subjectArea: string | null;
  fitScore: number;
  rationale: string;
  submissionUrl: string | null;
  averageReviewWeeks: number | null;
  citationStyle: string | null;
}

async function enrichFromDOAJ(journalName: string): Promise<Partial<Pick<JournalRecommendation, "issn" | "publisher" | "openAccess" | "apcUsd" | "subjectArea" | "submissionUrl">>> {
  const q = encodeURIComponent(journalName);
  const res = await safeFetch(`https://doaj.org/api/search/journals/${q}?pageSize=1`).catch(() => null);
  if (!res?.ok) return {};

  const json = await res.json() as {
    results?: Array<{
      bibjson?: {
        title?: string;
        publisher?: { name?: string };
        identifier?: Array<{ type: string; id: string }>;
        apc?: { has_apc?: boolean; max?: Array<{ price?: number; currency?: string }> };
        subject?: Array<{ term?: string }>;
        link?: Array<{ type?: string; url?: string }>;
      };
    }>;
  };

  const hit = json.results?.[0]?.bibjson;
  if (!hit) return {};

  const issn = hit.identifier?.find((id) => id.type === "eissn" || id.type === "pissn")?.id ?? null;
  const apcUsd = hit.apc?.has_apc
    ? (hit.apc.max?.find((m) => m.currency === "USD")?.price ?? null) : 0;
  const subjectArea = hit.subject?.[0]?.term ?? null;
  const submissionUrl =
    hit.link?.find((l) => l.type === "aims_scope")?.url ??
    hit.link?.find((l) => l.type === "author_instructions")?.url ?? null;

  return {
    issn,
    publisher: hit.publisher?.name ?? null,
    openAccess: true,
    apcUsd,
    subjectArea,
    submissionUrl,
  };
}

// POST /api/journals/recommend
router.post("/journals/recommend", async (req, res): Promise<void> => {
  const { abstract, topic, discipline } = req.body as {
    abstract?: string;
    topic?: string;
    discipline?: string;
  };

  if (!abstract || abstract.trim().length < 50) {
    res.status(400).json({ error: "abstract must be at least 50 characters" }); return;
  }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const safeAbstract = wrapUserText(abstract.slice(0, 2000));
  const safeTopic = topic ? wrapUserText(topic.slice(0, 200)) : "the research topic";
  const safeDiscipline = (discipline ?? "general").slice(0, 100);

  const client = new Groq({ apiKey });
  const msg = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are an expert academic publishing advisor. Based on this research abstract, recommend 5 suitable journals for submission.

Abstract: ${safeAbstract}
Topic: ${safeTopic}
Discipline: ${safeDiscipline}

Return ONLY valid JSON (no markdown):
{
  "recommendations": [
    {
      "name": "full journal name",
      "fitScore": 8,
      "rationale": "2 sentences: why this journal fits this paper",
      "openAccess": true,
      "apcUsd": 1500,
      "averageReviewWeeks": 12,
      "citationStyle": "APA",
      "submissionUrl": "https://..."
    }
  ],
  "generalAdvice": "1-2 sentences of general submission advice for this paper"
}
fitScore 1-10. Recommend a mix of reach, target, and safe journals. Use real journal names.`,
    }],
  });

  const raw = msg.choices[0]?.message?.content ?? "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) { res.status(502).json({ error: "Could not parse AI response" }); return; }

  let parsed: { recommendations?: JournalRecommendation[]; generalAdvice?: string };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    res.status(502).json({ error: "Invalid JSON from AI" }); return;
  }

  // Enrich with DOAJ data
  const enriched = await Promise.all(
    (parsed.recommendations ?? []).slice(0, 5).map(async (rec) => {
      const doajData = await enrichFromDOAJ(rec.name).catch(() => ({ issn: null, publisher: null, openAccess: false as boolean, apcUsd: null as number | null, subjectArea: null, submissionUrl: null }));
      return {
        ...rec,
        issn: rec.issn ?? doajData.issn ?? null,
        publisher: rec.publisher ?? doajData.publisher ?? null,
        openAccess: doajData.openAccess ?? rec.openAccess ?? false,
        apcUsd: doajData.apcUsd !== undefined ? doajData.apcUsd : rec.apcUsd ?? null,
        subjectArea: rec.subjectArea ?? doajData.subjectArea ?? null,
        submissionUrl: rec.submissionUrl ?? doajData.submissionUrl ?? null,
      };
    })
  );

  res.json({ recommendations: enriched, generalAdvice: parsed.generalAdvice ?? "" });
});

export default router;
