import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workspacePapersTable = pgTable("workspace_papers", {
  id: serial("id").primaryKey(),
  paperId: text("paper_id").notNull().unique(),
  title: text("title").notNull(),
  authors: jsonb("authors").$type<string[]>().notNull().default([]),
  abstract: text("abstract"),
  year: integer("year"),
  venue: text("venue"),
  url: text("url"),
  citationCount: integer("citation_count"),
  notes: text("notes"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertWorkspacePaperSchema = createInsertSchema(workspacePapersTable).omit({ id: true, addedAt: true });
export type InsertWorkspacePaper = z.infer<typeof insertWorkspacePaperSchema>;
export type WorkspacePaper = typeof workspacePapersTable.$inferSelect;
