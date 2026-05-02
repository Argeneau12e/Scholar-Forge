import { useState, useCallback } from "react";
import type { Paper, PaperSnippet } from "@workspace/api-client-react/src/generated/api.schemas";

const STORAGE_KEY = "sf_collection";

export interface CollectionItem {
  id: string;
  title: string;
  authors: string[];
  year?: number | null;
  venue?: string | null;
  url?: string | null;
  abstract?: string | null;
  doi?: string | null;
  openAccess?: boolean | null;
  source?: string | null;
  snippets?: PaperSnippet[];
  rawText?: string;
  paraphrasedText?: string;
  citationInline?: string;
  kind?: "paper" | "paste" | "paraphrase";
  savedAt: string;
}

function readCollection(): CollectionItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CollectionItem[]) : [];
  } catch {
    return [];
  }
}

function writeCollection(items: CollectionItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useCollection() {
  const [items, setItems] = useState<CollectionItem[]>(() => readCollection());

  const addFromPaper = useCallback(
    (paper: Paper): { added: boolean; total: number } => {
      const current = readCollection();
      const alreadyIn = current.some((c) => c.id === paper.id);
      if (alreadyIn) return { added: false, total: current.length };

      const item: CollectionItem = {
        id: paper.id,
        kind: "paper",
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        venue: paper.venue,
        url: paper.url,
        abstract: paper.abstract,
        doi: paper.doi,
        openAccess: paper.openAccess,
        source: paper.source,
        snippets: paper.snippets,
        savedAt: new Date().toISOString(),
      };

      const next = [item, ...current];
      writeCollection(next);
      setItems(next);
      return { added: true, total: next.length };
    },
    []
  );

  const addRawSnippet = useCallback(
    (rawText: string, doi: string): { added: boolean; total: number } => {
      if (!rawText.trim()) return { added: false, total: readCollection().length };
      const current = readCollection();
      const id = `paste_${Date.now()}`;
      const item: CollectionItem = {
        id,
        kind: "paste",
        title: doi.trim() ? `DOI: ${doi.trim()}` : "Pasted snippet",
        authors: [],
        doi: doi.trim() || null,
        rawText: rawText.trim(),
        savedAt: new Date().toISOString(),
      };
      const next = [item, ...current];
      writeCollection(next);
      setItems(next);
      return { added: true, total: next.length };
    },
    []
  );

  const addParaphrase = useCallback(
    (
      paraphrasedText: string,
      citationInline: string,
      paper: Paper
    ): { added: boolean; total: number } => {
      if (!paraphrasedText.trim()) return { added: false, total: readCollection().length };
      const current = readCollection();
      const id = `paraphrase_${paper.id}_${Date.now()}`;
      const item: CollectionItem = {
        id,
        kind: "paraphrase",
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        venue: paper.venue,
        url: paper.url,
        doi: paper.doi,
        paraphrasedText: paraphrasedText.trim(),
        citationInline,
        savedAt: new Date().toISOString(),
      };
      const next = [item, ...current];
      writeCollection(next);
      setItems(next);
      return { added: true, total: next.length };
    },
    []
  );

  const isInCollection = useCallback(
    (id: string): boolean => readCollection().some((c) => c.id === id),
    []
  );

  const remove = useCallback((id: string) => {
    const current = readCollection().filter((c) => c.id !== id);
    writeCollection(current);
    setItems(current);
  }, []);

  return { items, addFromPaper, addRawSnippet, addParaphrase, isInCollection, remove };
}
