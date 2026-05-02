import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

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

function buildOrderedSummary(items: IncomingItem[]): string {
  const seenTags = new Set<string>();
  return items
    .map((item) => {
      const label = itemLabel(item);
      const text =
        item.paraphrase?.trim() ||
        item.originalSnippet?.trim() ||
        item.abstract?.trim() ||
        "(no content)";
      const tag = item.tags?.[0] ?? null;
      if (tag && !seenTags.has(tag)) {
        seenTags.add(tag);
        return `[${tag}]: ${label} — ${text}`;
      }
      return `${label} — ${text}`;
    })
    .join("\n\n");
}

const SYSTEM_PROMPT = `You are an expert academic writing tutor helping a university student draft a literature review. You write in formal academic English appropriate for a dissertation. You NEVER fabricate citations or facts not present in the provided snippets. You mark every place needing student input clearly.`;

function buildUserPrompt(
  structure: Structure,
  targetWordCount: number,
  discipline: string,
  thesis: string,
  summary: string
): string {
  const thesisLine = thesis
    ? `The student's thesis is: ${thesis}. Frame the review to build toward this argument.\n\n`
    : "";
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
- Do NOT add sources not in the list above
- Mark any structural suggestion with [SUGGESTION: ...]

Output the literature review text only. No preamble.`;
}

// ─── POST /api/litreview ─────────────────────────────────────────────────────

router.post("/litreview", async (req, res): Promise<void> => {
  const body = req.body as {
    items?: IncomingItem[];
    thesis?: string;
    structure?: string;
    discipline?: string;
    targetWordCount?: number;
  };

  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" });
    return;
  }

  const structure: Structure = VALID_STRUCTURES.includes(body.structure as Structure)
    ? (body.structure as Structure)
    : "thematic";
  const discipline = typeof body.discipline === "string" ? body.discipline.trim() : "general";
  const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";
  const targetWordCount =
    typeof body.targetWordCount === "number"
      ? Math.max(200, Math.min(3000, Math.round(body.targetWordCount)))
      : 800;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "AI writing is not configured. Add ANTHROPIC_API_KEY to enable this feature.",
    });
    return;
  }

  const summary = buildOrderedSummary(body.items);

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(structure, targetWordCount, discipline, thesis, summary),
        },
      ],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

    // Extract inline citations from the generated text (exclude markers)
    const citationPattern = /\[([^\[\]]+\d{4}[^\[\]]*)\]/g;
    const usedSet = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = citationPattern.exec(raw)) !== null) {
      const c = m[1].trim();
      if (!c.startsWith("STUDENT:") && !c.startsWith("SUGGESTION:")) {
        usedSet.add(c);
      }
    }

    const wordCount = raw.split(/\s+/).filter(Boolean).length;

    res.json({
      litreview: raw,
      wordCount,
      citationsUsed: Array.from(usedSet),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Literature review generation failed: ${msg}` });
  }
});

export default router;
