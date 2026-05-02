import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const supervisorsTable = pgTable("supervisors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
  focusAreas: jsonb("focus_areas").$type<string[]>().notNull().default([]),
  excludeKeywords: jsonb("exclude_keywords").$type<string[]>().notNull().default([]),
  minYear: integer("min_year"),
  maxYear: integer("max_year"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSupervisorSchema = createInsertSchema(supervisorsTable).omit({ id: true, createdAt: true });
export type InsertSupervisor = z.infer<typeof insertSupervisorSchema>;
export type Supervisor = typeof supervisorsTable.$inferSelect;
