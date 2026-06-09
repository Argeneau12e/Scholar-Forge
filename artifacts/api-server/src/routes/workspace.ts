import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, workspacePapersTable, supervisorsTable } from "@workspace/db";
import Groq from "groq-sdk";
import { AddToWorkspaceBody, RemoveFromWorkspaceParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/workspace", async (_req, res): Promise<void> => {
  const papers = await db.select().from(workspacePapersTable).orderBy(desc(workspacePapersTable.addedAt));
  res.json(papers.map(p => ({
    ...p,
    authors: p.authors ?? [],
    addedAt: p.addedAt.toISOString(),
  })));
});

router.post("/workspace", async (req, res): Promise<void> => {
  const parsed = AddToWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message }); return;
  }
  const existing = await db.select().from(workspacePapersTable).where(eq(workspacePapersTable.paperId, parsed.data.paperId));
  if (existing.length > 0) {
    res.status(409).json({ error: "Paper already in workspace" }); return;
  }
  const [paper] = await db.insert(workspacePapersTable).values({
    paperId: parsed.data.paperId,
    title: parsed.data.title,
    authors: parsed.data.authors,
    abstract: parsed.data.abstract ?? null,
    year: parsed.data.year ?? null,
    venue: parsed.data.venue ?? null,
    url: parsed.data.url ?? null,
    citationCount: parsed.data.citationCount ?? null,
    notes: parsed.data.notes ?? null,
  }).returning();
  res.status(201).json({
    ...paper,
    authors: paper.authors ?? [],
    addedAt: paper.addedAt.toISOString(),
  });
});

router.delete("/workspace/:id", async (req, res): Promise<void> => {
  const params = RemoveFromWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message }); return;
  }
  const [deleted] = await db.delete(workspacePapersTable).where(eq(workspacePapersTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Paper not found in workspace" }); return;
  }
  res.sendStatus(204);
});

router.get("/workspace/analysis", async (req, res): Promise<void> => {
  const papers = await db.select().from(workspacePapersTable).orderBy(desc(workspacePapersTable.addedAt));
  if (papers.length === 0) {
    res.json({
      summary: "Your workspace is empty. Add papers to get an AI-powered analysis of your research collection.",
      themes: [],
      gaps: [],
      recommendations: [],
      paperCount: 0,
    }); return;
  }

  // Graceful fallback — workspace analysis works without a Groq key
  const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.json({
      summary: `You have ${papers.length} paper(s) in your workspace. Configure your Groq API key to enable AI analysis.`,
      themes: papers.map(p => p.venue).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5) as string[],
      gaps: [],
      recommendations: ["Add your Groq API key to enable AI-powered analysis."],
      paperCount: papers.length,
    }); return;
  }

  const client = new Groq({ apiKey });
  const paperList = papers.map(p =>
    `Title: ${p.title}\nAuthors: ${(p.authors ?? []).join(", ")}\nYear: ${p.year ?? "unknown"}\nVenue: ${p.venue ?? "unknown"}\nAbstract: ${p.abstract ?? "N/A"}`
  ).join("\n\n---\n\n");

  try {
    const message = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a research advisor analyzing a collection of academic papers. Analyze these ${papers.length} papers and provide:
1. A brief summary of the research collection (2-3 sentences)
2. Key themes (3-5 themes as short phrases)
3. Research gaps (2-4 gaps as short phrases)
4. Recommendations for future reading (2-4 recommendations as short phrases)

Papers:
${paperList}

Respond in JSON:
{"summary":"...","themes":["..."],"gaps":["..."],"recommendations":["..."]}`,
      }],
    });

    const content = message.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Could not parse AI response" }); return; }
    const analysis = JSON.parse(jsonMatch[0]);
    res.json({ ...analysis, paperCount: papers.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Analysis failed: ${msg}` });
  }
});

router.get("/workspace/stats", async (_req, res): Promise<void> => {
  const papers = await db.select().from(workspacePapersTable).orderBy(desc(workspacePapersTable.addedAt));
  const years = papers.map(p => p.year).filter(Boolean) as number[];
  const venueCounts: Record<string, number> = {};
  for (const p of papers) {
    if (p.venue) venueCounts[p.venue] = (venueCounts[p.venue] ?? 0) + 1;
  }
  const topVenues = Object.entries(venueCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([venue, count]) => ({ venue, count }));
  res.json({
    totalPapers: papers.length,
    yearRange: {
      min: years.length > 0 ? Math.min(...years) : null,
      max: years.length > 0 ? Math.max(...years) : null,
    },
    topVenues,
    recentlyAdded: papers.slice(0, 5).map(p => ({
      ...p,
      authors: p.authors ?? [],
      addedAt: p.addedAt.toISOString(),
    })),
  });
});

router.get("/supervisors", async (_req, res): Promise<void> => {
  try {
    const supervisors = await db.select().from(supervisorsTable);
    res.json(supervisors);
  } catch {
    res.json([]);
  }
});

export default router;
