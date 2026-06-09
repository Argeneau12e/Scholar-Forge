import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";

const router: IRouter = Router();

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
  nodes: Array<{ id: string; label: string; cluster: string; centrality: number }>;
  edges: Array<{ source: string; target: string; relationship: "supports" | "contradicts" | "extends" | "replicates" | "challenges"; strength: number; note: string }>;
  thesisNode: { label: string; bestPosition: string; positioning: string };
}

function itemLabel(item: IncomingItem): string {
  const authors = (item.authors ?? []).slice(0, 2);
  const authorStr =
    authors.length === 0 ? "Unknown"
    : authors.length === 1 ? authors[0].split(",")[0].trim()
    : `${authors[0].split(",")[0].trim()} & ${authors[1].split(",")[0].trim()}`;
  return `${authorStr} et al., ${item.year ?? "n.d."}`;
}

function itemSnippet(item: IncomingItem): string {
  const text = item.paraphrase?.trim() || item.originalSnippet?.trim() || item.abstract?.trim() || "(no content)";
  return text.slice(0, 300) + (text.length > 300 ? "…" : "");
}

const SYSTEM_PROMPT = `You are an expert research analyst helping students understand intellectual relationships between academic papers. Return ONLY valid JSON.`;

function buildUserPrompt(items: IncomingItem[], thesis: string): string {
  const paperLines = items.map((item) => `[${item.id ?? "unknown"}]: ${itemLabel(item)} — ${itemSnippet(item)}`).join("\n\n");
  const thesisLine = thesis.trim() ? `\nStudent's thesis: ${thesis.trim()}` : "";
  return `Analyze these papers and identify how they relate to each other and to the student's thesis.

Papers:
${paperLines}
${thesisLine}

Return ONLY this JSON:
{
  "nodes": [{"id": "string","label": "Author et al., Year","cluster": "thematic group 1-3 words","centrality": 0.7}],
  "edges": [{"source": "item id","target": "item id","relationship": "supports","strength": 0.8,"note": "one sentence explaining the relationship"}],
  "thesisNode": {"label": "Your thesis","bestPosition": "item id","positioning": "2 sentences on where thesis fits"}
}
Relationship types: supports | contradicts | extends | replicates | challenges
Centrality: 0-1. Strength: 0-1. Quality over quantity for edges.`;
}

function tryParseArgMap(raw: string): ArgMapResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as ArgMapResult; } catch { return null; }
}

router.post("/argmap", async (req, res): Promise<void> => {
  const body = req.body as { items?: IncomingItem[]; thesis?: string };

  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" }); return;
  }

  const thesis = typeof body.thesis === "string" ? wrapUserText(body.thesis.trim()) : "";

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const client = new Groq({ apiKey });
  let result: ArgMapResult | null = null;

  try {
    const message = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 3000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body.items, thesis) },
      ],
    });
    const raw = message.choices[0]?.message?.content ?? "";
    const argValidation = validateClaudeResponse(raw);
    if (!argValidation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/argmap", reason: argValidation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed." }); return;
    }
    result = tryParseArgMap(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "API error";
    res.status(500).json({ error: `Argument map generation failed: ${msg}` }); return;
  }

  if (!result) {
    try {
      const items = body.items;
      const miniPrompt = `Map relationships between ${items.length} papers. Return JSON: {"nodes":[{"id":"<item_id>","label":"Author, Year","cluster":"topic","centrality":0.5}],"edges":[{"source":"<id>","target":"<id>","relationship":"supports","strength":0.7,"note":"brief note"}],"thesisNode":{"label":"Your thesis","bestPosition":"<id>","positioning":"fits here because..."}}

Papers: ${items.map((i) => `[${i.id ?? "x"}]: ${itemLabel(i)}`).join("; ")}`;
      const msg2 = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        messages: [{ role: "user", content: miniPrompt }],
      });
      result = tryParseArgMap(msg2.choices[0]?.message?.content ?? "");
    } catch {
      // fall through
    }
  }

  if (!result) { res.status(500).json({ error: "Could not generate argument map." }); return; }
  res.json(result);
});

export default router;
