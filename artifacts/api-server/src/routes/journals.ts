import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
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

async function enrichFromDOAJ(journalName: string): Promise<Partial<JournalRecommendation>> {
  const q = encodeURIComponent(journalName);
  const res = await safeFetch(
    `https://doaj.org/api/search/journals/${q}?pageSize=1`
  ).catch(() => null);
  if (!res?.ok) return {};

  const json = await res.json() as {
    results?: Array<{
      bibjson?: {
        title?: string;
        publisher?: { name?: string };
        identifier?: Array<{ type: string; id: string }>;
        apc?: { has_apc?: boolean; max?: Array<{ price?: number; currency?: string }> };
        editorial?: { review_process?: string[] };
        subject?: Array<{ term?: string }>;
        link?: Array<{ type?: string; url?: string }>;
      };
    }>;
  };

  const hit = json.results?.[0]?.bibjson;
  if (!hit) return {};

  const issn = hit.identifier?.find((id) => id.type === "eissn" || id.type === "pissn")?.id ?? null;
  const apcUsd =
    hit.apc?.has_apc
      ? (hit.apc.max?.find((m) => m.currency === "USD")?.price ?? null)
      : 0;
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
    res.status(400).json({ error: "abstract must be at least 50 characters" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const safeAbstract = wrapUserText(abstract.slice(0, 2000));
  const safeDiscipline = (discipline ?? "general academic").slice(0, 100);

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are an academic publishing expert. Recommend the 5 most suitable open-access journals for this ${safeDiscipline} paper.

Abstract: ${safeAbstract}
${topic ? `Topic: ${wrapUserText(topic.slice(0, 150))}` : ""}

Return ONLY valid JSON array (no markdown):
[
  {
    "name": "full journal name",
    "fitScore": 85,
    "rationale": "2 sentences explaining why this journal fits",
    "citationStyle": "APA|Vancouver|Chicago|Harvard|IEEE|AMA",
    "averageReviewWeeks": 12,
    "submissionUrl": "https://... or null",
    "issn": "xxxx-xxxx or null",
    "publisher": "publisher name",
    "openAccess": true,
    "apcUsd": 1500
  }
]
Recommend ONLY real open-access journals. Order by fitScore descending.`,
      },
    ],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    res.status(502).json({ error: "Could not parse AI response" });
    return;
  }

  const aiJournals = JSON.parse(match[0]) as Partial<JournalRecommendation>[];

  // Enrich with DOAJ data in parallel (best effort)
  const enriched = await Promise.allSettled(
    aiJournals.slice(0, 5).map(async (j) => {
      const doajData = j.name ? await enrichFromDOAJ(j.name).catch(() => ({})) : {};
      return { ...j, ...doajData } as JournalRecommendation;
    })
  );

  const recommendations = enriched
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  res.json({ recommendations });
});

export default router;
