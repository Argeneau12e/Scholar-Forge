import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, supervisorsTable } from "@workspace/db";
import {
  CreateSupervisorBody,
  UpdateSupervisorBody,
  GetSupervisorParams,
  UpdateSupervisorParams,
  DeleteSupervisorParams,
  ActivateSupervisorParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/supervisors", async (_req, res): Promise<void> => {
  const supervisors = await db.select().from(supervisorsTable).orderBy(supervisorsTable.createdAt);
  res.json(supervisors.map(s => ({
    ...s,
    constraints: s.constraints ?? [],
    focusAreas: s.focusAreas ?? [],
    excludeKeywords: s.excludeKeywords ?? [],
    createdAt: s.createdAt.toISOString(),
  })));
});

router.get("/supervisors/active", async (_req, res): Promise<void> => {
  const [supervisor] = await db.select().from(supervisorsTable).where(eq(supervisorsTable.isActive, true));
  res.json({
    supervisor: supervisor
      ? {
          ...supervisor,
          constraints: supervisor.constraints ?? [],
          focusAreas: supervisor.focusAreas ?? [],
          excludeKeywords: supervisor.excludeKeywords ?? [],
          createdAt: supervisor.createdAt.toISOString(),
        }
      : null,
  });
});

router.get("/supervisors/:id", async (req, res): Promise<void> => {
  const params = GetSupervisorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [supervisor] = await db.select().from(supervisorsTable).where(eq(supervisorsTable.id, params.data.id));
  if (!supervisor) {
    res.status(404).json({ error: "Supervisor not found" });
    return;
  }
  res.json({
    ...supervisor,
    constraints: supervisor.constraints ?? [],
    focusAreas: supervisor.focusAreas ?? [],
    excludeKeywords: supervisor.excludeKeywords ?? [],
    createdAt: supervisor.createdAt.toISOString(),
  });
});

router.post("/supervisors", async (req, res): Promise<void> => {
  const parsed = CreateSupervisorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, constraints, focusAreas, excludeKeywords, minYear, maxYear } = parsed.data;
  const [supervisor] = await db.insert(supervisorsTable).values({
    name,
    description: description ?? null,
    constraints: constraints ?? [],
    focusAreas: focusAreas ?? [],
    excludeKeywords: excludeKeywords ?? [],
    minYear: minYear ?? null,
    maxYear: maxYear ?? null,
    isActive: false,
  }).returning();
  res.status(201).json({
    ...supervisor,
    constraints: supervisor.constraints ?? [],
    focusAreas: supervisor.focusAreas ?? [],
    excludeKeywords: supervisor.excludeKeywords ?? [],
    createdAt: supervisor.createdAt.toISOString(),
  });
});

router.patch("/supervisors/:id", async (req, res): Promise<void> => {
  const params = UpdateSupervisorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSupervisorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.constraints !== undefined) updates.constraints = parsed.data.constraints;
  if (parsed.data.focusAreas !== undefined) updates.focusAreas = parsed.data.focusAreas;
  if (parsed.data.excludeKeywords !== undefined) updates.excludeKeywords = parsed.data.excludeKeywords;
  if (parsed.data.minYear !== undefined) updates.minYear = parsed.data.minYear;
  if (parsed.data.maxYear !== undefined) updates.maxYear = parsed.data.maxYear;

  const [supervisor] = await db.update(supervisorsTable).set(updates).where(eq(supervisorsTable.id, params.data.id)).returning();
  if (!supervisor) {
    res.status(404).json({ error: "Supervisor not found" });
    return;
  }
  res.json({
    ...supervisor,
    constraints: supervisor.constraints ?? [],
    focusAreas: supervisor.focusAreas ?? [],
    excludeKeywords: supervisor.excludeKeywords ?? [],
    createdAt: supervisor.createdAt.toISOString(),
  });
});

router.delete("/supervisors/:id", async (req, res): Promise<void> => {
  const params = DeleteSupervisorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(supervisorsTable).where(eq(supervisorsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Supervisor not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/supervisors/:id/activate", async (req, res): Promise<void> => {
  const params = ActivateSupervisorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.update(supervisorsTable).set({ isActive: false });
  const [supervisor] = await db.update(supervisorsTable).set({ isActive: true }).where(eq(supervisorsTable.id, params.data.id)).returning();
  if (!supervisor) {
    res.status(404).json({ error: "Supervisor not found" });
    return;
  }
  res.json({
    ...supervisor,
    constraints: supervisor.constraints ?? [],
    focusAreas: supervisor.focusAreas ?? [],
    excludeKeywords: supervisor.excludeKeywords ?? [],
    createdAt: supervisor.createdAt.toISOString(),
  });
});

export default router;
