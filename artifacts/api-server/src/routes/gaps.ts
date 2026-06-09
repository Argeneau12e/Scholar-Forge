import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";

const router: IRouter = Router();

interface IncomingItem {
  title?: string;
  authors?: string[];
  year?: number | null;
  abstract?: string | null;
  originalSnippet?: string | null;
  paraphrase?: string | null;
  tags?: string[];
}

interface GapResult {
  gaps: Array<{
    title: string;
    description: string;
    suggestedRQ: string;
    methodSuggestion: string;
    priorityScore: number;
  }>;
  overarchingTheme: string;
  dataNeeds: string[];
  methodologicalWeaknesses: string[];
}

function itemSummary(item: IncomingItem): string {
  const authors = (item.authors ?? []).slice(0, 2).map((a) => a.split(",")[0].trim()).join(" & ");
  const year = item.year ?? "n.d.";
  const text = item.paraphrase?.trim() || item.originalSnippet?.trim() || item.abstract?.trim() || "(no content)";
  return `${authors || "Unknown"} et al., ${year}: ${text.slice(0, 400)}`;
}

const SYSTEM_PROMPT = `You are an expert research methodologist helping a student identify genuine gaps in the academic literature based on papers they have collected. You provide evidence-based, specific gap analysis. Return ONLY valid JSON.`;

function buildGapPrompt(items: IncomingItem[], topic: string, discipline: string): string {
  const summaries = items.map((item) => itemSummary(item)).join("\n\n");
  const topicLine = topic ? `Research topic: ${topic}\n` : "";
  return `${topicLine}Discipline: ${discipline}

Based on these ${items.length} papers in the student's collection, identify genuine research gaps.

Papers:
${summaries}

Return ONLY this JSON:
{
  "gaps": [
    {
      "title": "gap title (5-8 words)",
      "description": "2-3 sentence description of what is missing and why it matters",
      "suggestedRQ": "a specific research question that addresses this gap",
      "methodSuggestion": "brief methodology suggestion (1 sentence)",
      "priorityScore": 8
    }
  ],
  "overarchingTheme": "one sentence: the most significant overall gap in this collection",
  "dataNeeds": ["type of data that is missing from existing studies"],
  "methodologicalWeaknesses": ["methodological limitation common across multiple papers"]
}
Identify 3-5 genuine, specific gaps. priorityScore 1-10.`;
}

router.post("/gaps", async (req, res): Promise<void> => {
  const { items, topic, discipline } = req.body as {
    items?: IncomingItem[];
    topic?: string;
    discipline?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" }); return;
  }
  if (items.length > 30) {
    res.status(400).json({ error: "Maximum 30 items allowed" }); return;
  }

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const safeTopic = topic ? wrapUserText(topic.slice(0, 200)) : "";
  const safeDiscipline = (discipline ?? "general academic").slice(0, 100);

  try {
    const client = new Groq({ apiKey });
    const message = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildGapPrompt(items, safeTopic, safeDiscipline) },
      ],
    });

    const raw = message.choices[0]?.message?.content ?? "";
    const validation = validateClaudeResponse(raw);
    if (!validation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/gaps", reason: validation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed." }); return;
    }

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      // Retry with simplified prompt
      const retry = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Identify 3 research gaps from these ${items.length} papers on "${safeTopic}". Return JSON: {"gaps":[{"title":"gap","description":"description","suggestedRQ":"RQ","methodSuggestion":"method","priorityScore":7}],"overarchingTheme":"theme","dataNeeds":["need"],"methodologicalWeaknesses":["weakness"]}\n\nPapers: ${items.slice(0, 5).map(itemSummary).join(" | ")}`,
        }],
      });
      const raw2 = retry.choices[0]?.message?.content ?? "";
      const match2 = raw2.match(/\{[\s\S]*\}/);
      if (!match2) { res.status(502).json({ error: "Could not parse AI response" }); return; }
      res.json(JSON.parse(match2[0])); return;
    }

    res.json(JSON.parse(match[0]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Gap analysis failed: ${msg}` });
  }
});

export default router;
