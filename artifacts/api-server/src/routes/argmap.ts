import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomingItem {
  id?: string;
  title?: string;
  authors?: string[];
  year?: number | null;
  abstract?: string | null;
  originalSnippet?: string | null;
  paraphrase?: string | null;
}

interface ArgMapResult {
  nodes: Array<{
    id: string;
    label: string;
    cluster: string;
    centrality: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: "supports" | "contradicts" | "extends" | "replicates" | "challenges";
    strength: number;
    note: string;
  }>;
  thesisNode: {
    label: string;
    bestPosition: string;
    positioning: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemLabel(item: IncomingItem): string {
  const authors = (item.authors ?? []).slice(0, 2);
  const authorStr =
    authors.length === 0
      ? "Unknown"
      : authors.length === 1
      ? authors[0].split(",")[0].trim()
      : `${authors[0].split(",")[0].trim()} & ${authors[1].split(",")[0].trim()}`;
  return `${authorStr} et al., ${item.year ?? "n.d."}`;
}

function itemSnippet(item: IncomingItem): string {
  const text =
    item.paraphrase?.trim() ||
    item.originalSnippet?.trim() ||
    item.abstract?.trim() ||
    "(no content)";
  return text.slice(0, 300) + (text.length > 300 ? "…" : "");
}

function tryParseArgMap(raw: string): ArgMapResult | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ArgMapResult;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are a research analyst mapping the intellectual relationships between academic papers. Return ONLY valid JSON, no preamble.`;

function buildUserPrompt(items: IncomingItem[], thesis: string): string {
  const paperLines = items
    .map((item) => `[${item.id ?? "unknown"}]: ${itemLabel(item)} — ${itemSnippet(item)}`)
    .join("\n\n");

  const thesisLine = thesis.trim() ? `\nStudent's thesis: ${thesis.trim()}` : "";

  return `Analyze these papers and identify how they relate to each other and to the student's thesis.

Papers:
${paperLines}
${thesisLine}

Return ONLY this JSON:
{
  "nodes": [
    {
      "id": "string (match item id)",
      "label": "string (Author et al., Year)",
      "cluster": "string (thematic group name, 1-3 words)",
      "centrality": 0.7
    }
  ],
  "edges": [
    {
      "source": "string (item id)",
      "target": "string (item id)",
      "relationship": "supports",
      "strength": 0.8,
      "note": "one sentence explaining the relationship"
    }
  ],
  "thesisNode": {
    "label": "Your thesis",
    "bestPosition": "string (item id of paper thesis most relates to)",
    "positioning": "2 sentences on where thesis fits in the debate"
  }
}

Relationship types: supports | contradicts | extends | replicates | challenges
Centrality: 0-1 float (how central to the debate)
Strength: 0-1 float (how strong the relationship is)
Produce edges only where a clear intellectual relationship exists — quality over quantity.`;
}

// ─── POST /api/argmap ────────────────────────────────────────────────────────

router.post("/argmap", async (req, res): Promise<void> => {
  const body = req.body as {
    items?: IncomingItem[];
    thesis?: string;
  };

  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" });
    return;
  }

  const thesis = typeof body.thesis === "string" ? wrapUserText(body.thesis.trim()) : "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "AI analysis is not configured. Add ANTHROPIC_API_KEY to enable this feature.",
    });
    return;
  }

  const client = new Anthropic({ apiKey });
  let result: ArgMapResult | null = null;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(body.items, thesis) }],
    });
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const argValidation = validateClaudeResponse(raw);
    if (!argValidation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/argmap", reason: argValidation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed. Please try again." });
      return;
    }
    result = tryParseArgMap(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "API error";
    res.status(500).json({ error: `Argument map generation failed: ${msg}` });
    return;
  }

  if (!result) {
    // Retry with minimal prompt
    try {
      const items = body.items;
      const miniPrompt = `Map relationships between ${items.length} papers. Return JSON: {"nodes":[{"id":"<item_id>","label":"Author, Year","cluster":"topic","centrality":0.5}],"edges":[{"source":"<id>","target":"<id>","relationship":"supports","strength":0.7,"note":"brief note"}],"thesisNode":{"label":"Your thesis","bestPosition":"<id>","positioning":"fits here because..."}}

Papers: ${items.map((i) => `[${i.id ?? "x"}]: ${itemLabel(i)}`).join("; ")}`;

      const msg2 = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: miniPrompt }],
      });
      const raw2 = msg2.content[0]?.type === "text" ? msg2.content[0].text : "";
      result = tryParseArgMap(raw2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      res.status(500).json({ error: `Argument map generation failed: ${msg}` });
      return;
    }
  }

  if (!result) {
    res.status(500).json({ error: "Could not parse AI response. Please try again." });
    return;
  }

  res.json(result);
});

export default router;
