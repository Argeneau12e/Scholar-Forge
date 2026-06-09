import { Router, type IRouter } from "express";
import Groq from "groq-sdk";
import { wrapUserText, validateClaudeResponse } from "../lib/promptSafety";

const router: IRouter = Router();

type Structure = "thematic" | "chronological" | "methodological";

interface IncomingItem {
  title?: string;
  authors?: string[];
  year?: number | null;
  journal?: string | null;
  tags?: string[];
  paraphrase?: string | null;
  originalSnippet?: string | null;
  abstract?: string | null;
}

const VALID_STRUCTURES: Structure[] = ["thematic", "chronological", "methodological"];

function itemLabel(item: IncomingItem): string {
  const authors = (item.authors ?? []).slice(0, 2);
  const authorStr =
    authors.length === 0 ? "Unknown"
    : authors.length === 1 ? authors[0].split(",")[0].trim()
    : `${authors[0].split(",")[0].trim()} & ${authors[1].split(",")[0].trim()}`;
  return `${authorStr} et al., ${item.year ?? "n.d."}`;
}

function buildOrderedSummary(items: IncomingItem[]): string {
  const seenTags = new Set<string>();
  return items.map((item) => {
    const label = itemLabel(item);
    const text = item.paraphrase?.trim() || item.originalSnippet?.trim() || item.abstract?.trim() || "(no content)";
    const tag = item.tags?.[0] ?? null;
    if (tag && !seenTags.has(tag)) {
      seenTags.add(tag);
      return `[${tag}]: ${label} — ${text}`;
    }
    return `${label} — ${text}`;
  }).join("\n\n");
}

const SYSTEM_PROMPT = `You are an expert academic writing tutor helping a university student draft a literature review. You write in formal academic English appropriate for a dissertation. You NEVER fabricate citations or facts not present in the provided snippets. You mark every place needing student input clearly.`;

function buildUserPrompt(structure: Structure, targetWordCount: number, discipline: string, thesis: string, summary: string): string {
  const thesisLine = thesis ? `The student's thesis is: ${thesis}. Frame the review to build toward this argument.\n\n` : "";
  return `Write a ${structure} literature review of approximately ${targetWordCount} words using ONLY the following sources. Discipline: ${discipline}.

${thesisLine}Sources (in the order the student wants them used):
${summary}

Requirements:
- Open with a framing paragraph introducing the topic
- Group sources according to their tags if provided
- Write smooth transitions between sources
- After each source reference, add [STUDENT: add your critical analysis here]
- End with a synthesis paragraph identifying what the literature collectively shows
- Use [Author et al., Year] inline citations throughout
- Do NOT invent page numbers, volume numbers, or facts not in the snippets
- Mark gaps with [STUDENT: verify this claim] when you must infer`;
}

// POST /api/litreview
router.post("/litreview", async (req, res): Promise<void> => {
  const body = req.body as {
    items?: IncomingItem[];
    structure?: string;
    targetWordCount?: number;
    discipline?: string;
    thesis?: string;
  };

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" }); return;
  }

  const structure: Structure = VALID_STRUCTURES.includes(body.structure as Structure)
    ? (body.structure as Structure) : "thematic";
  const discipline = typeof body.discipline === "string" ? body.discipline.trim() : "general";
  const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";
  const targetWordCount = typeof body.targetWordCount === "number"
    ? Math.max(200, Math.min(3000, Math.round(body.targetWordCount))) : 800;

  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "GROQ_API_KEY_REQUIRED", message: "Please provide your Groq API key to use AI features." }); return;
  }

  const summary = wrapUserText(buildOrderedSummary(body.items));
  const safeThesis = thesis ? wrapUserText(thesis) : "";

  try {
    const client = new Groq({ apiKey });
    const message = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(structure, targetWordCount, discipline, safeThesis, summary) },
      ],
    });

    const raw = (message.choices[0]?.message?.content ?? "").trim();
    const validation = validateClaudeResponse(raw);
    if (!validation.safe) {
      req.log.warn({ ip: req.ip, route: "/api/litreview", reason: validation.reason }, "promptSafety: suspicious response blocked");
      res.status(500).json({ error: "Response validation failed. Please try again." }); return;
    }

    const citationPattern = /\[([^\[\]]+\d{4}[^\[\]]*)\]/g;
    const usedSet = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = citationPattern.exec(raw)) !== null) {
      const c = m[1].trim();
      if (!c.startsWith("STUDENT:") && !c.startsWith("SUGGESTION:")) usedSet.add(c);
    }

    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    res.json({ litreview: raw, wordCount, citationsUsed: Array.from(usedSet) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Literature review generation failed: ${msg}` });
  }
});

export default router;
