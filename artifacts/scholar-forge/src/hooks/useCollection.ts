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
      if (!rawText.trim()) return { added: false, total: items.length };
      const current = readCollection();
      const id = `paste_${Date.now()}`;
      const item: CollectionItem = {
        id,
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
    [items.length]
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

  return { items, addFromPaper, addRawSnippet, isInCollection, remove };
}
