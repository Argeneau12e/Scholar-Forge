import { useState, useCallback } from "react";
import type { Paper, PaperSnippet } from "@workspace/api-client-react/src/generated/api.schemas";

const STORAGE_KEY = "sf_collection";

export interface CollectionItem {
  id: string;
  title: string;
  authors: string[];
  year?: number | null;
  journal?: string | null;
  doi?: string | null;
  url?: string | null;
  abstract?: string | null;
  openAccess?: boolean | null;
  source?: string | null;
  snippets?: PaperSnippet[];
  originalSnippet?: string | null;
  paraphrase?: string | null;
  citationInline?: string | null;
  citation?: {
    apa?: string;
    vancouver?: string;
    harvard?: string;
    mla?: string;
    chicago?: string;
  };
  tags: string[];
  supervisorCompliant?: boolean;
  kind: "paper" | "paste" | "paraphrase";
  addedAt: string;
  savedAt?: string;
  order: number;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function readCollection(): CollectionItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as CollectionItem[];
    // Migrate older items that are missing new fields
    return items.map((item, idx) => ({
      paraphrase: "",
      ...item,
      tags: item.tags ?? [],
      order: item.order ?? idx,
      addedAt: item.addedAt ?? item.savedAt ?? new Date().toISOString(),
      kind: item.kind ?? "paper",
    }));
  } catch {
    return [];
  }
}

function writeCollection(items: CollectionItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useCollection() {
  const [items, setItems] = useState<CollectionItem[]>(() => readCollection());

  // ── add from search result ─────────────────────────────────────────────────
  const addFromPaper = useCallback(
    (paper: Paper): { added: boolean; total: number; duplicate?: CollectionItem } => {
      const current = readCollection();

      // Exact ID match → silently already-saved
      if (current.some((c) => c.id === paper.id)) {
        return { added: false, total: current.length };
      }

      // DOI or title match (different ID) → duplicate modal trigger
      const dup = current.find(
        (c) =>
          (paper.doi && c.doi && c.doi === paper.doi) ||
          c.title.trim().toLowerCase() === paper.title.trim().toLowerCase()
      );
      if (dup) return { added: false, total: current.length, duplicate: dup };

      const item: CollectionItem = {
        id: paper.id || generateId(),
        kind: "paper",
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        journal: paper.venue,
        url: paper.url,
        abstract: paper.abstract,
        doi: paper.doi,
        openAccess: paper.openAccess,
        source: paper.source,
        snippets: paper.snippets,
        originalSnippet: paper.snippets?.[0]?.text ?? paper.abstract ?? "",
        paraphrase: "",
        tags: [],
        addedAt: new Date().toISOString(),
        order: 0,
      };

      const next = [item, ...current.map((c) => ({ ...c, order: c.order + 1 }))];
      writeCollection(next);
      setItems(next);
      return { added: true, total: next.length };
    },
    []
  );

  // ── force-add (used after user confirms duplicate modal) ──────────────────
  const addFromPaperForce = useCallback(
    (paper: Paper): { added: boolean; total: number } => {
      const current = readCollection();
      const item: CollectionItem = {
        id: `${paper.id}_${Date.now()}`,
        kind: "paper",
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        journal: paper.venue,
        url: paper.url,
        abstract: paper.abstract,
        doi: paper.doi,
        openAccess: paper.openAccess,
        source: paper.source,
        snippets: paper.snippets,
        originalSnippet: paper.snippets?.[0]?.text ?? paper.abstract ?? "",
        paraphrase: "",
        tags: [],
        addedAt: new Date().toISOString(),
        order: 0,
      };
      const next = [item, ...current.map((c) => ({ ...c, order: c.order + 1 }))];
      writeCollection(next);
      setItems(next);
      return { added: true, total: next.length };
    },
    []
  );

  // ── paste raw snippet ─────────────────────────────────────────────────────
  const addRawSnippet = useCallback(
    (rawText: string, doi: string): { added: boolean; total: number } => {
      if (!rawText.trim()) return { added: false, total: readCollection().length };
      const current = readCollection();
      const item: CollectionItem = {
        id: generateId(),
        kind: "paste",
        title: doi.trim() ? `DOI: ${doi.trim()}` : "Pasted snippet",
        authors: [],
        doi: doi.trim() || null,
        originalSnippet: rawText.trim(),
        paraphrase: "",
        tags: [],
        addedAt: new Date().toISOString(),
        order: 0,
      };
      const next = [item, ...current.map((c) => ({ ...c, order: c.order + 1 }))];
      writeCollection(next);
      setItems(next);
      return { added: true, total: next.length };
    },
    []
  );

  // ── save paraphrase ───────────────────────────────────────────────────────
  const addParaphrase = useCallback(
    (
      paraphrasedText: string,
      citationInline: string,
      paper: Paper
    ): { added: boolean; total: number } => {
      if (!paraphrasedText.trim()) return { added: false, total: readCollection().length };
      const current = readCollection();
      const item: CollectionItem = {
        id: `paraphrase_${paper.id}_${Date.now()}`,
        kind: "paraphrase",
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        journal: paper.venue,
        url: paper.url,
        doi: paper.doi,
        originalSnippet: paper.snippets?.[0]?.text ?? paper.abstract ?? "",
        paraphrase: paraphrasedText.trim(),
        citationInline,
        tags: [],
        addedAt: new Date().toISOString(),
        order: 0,
      };
      const next = [item, ...current.map((c) => ({ ...c, order: c.order + 1 }))];
      writeCollection(next);
      setItems(next);
      return { added: true, total: next.length };
    },
    []
  );

  // ── update arbitrary fields on an item ────────────────────────────────────
  const updateItem = useCallback((id: string, changes: Partial<CollectionItem>) => {
    const current = readCollection();
    const next = current.map((c) => (c.id === id ? { ...c, ...changes } : c));
    writeCollection(next);
    setItems(next);
  }, []);

  // ── persist a new ordering ────────────────────────────────────────────────
  const reorder = useCallback((orderedIds: string[]) => {
    const current = readCollection();
    const byId = new Map(current.map((c) => [c.id, c]));
    const next = orderedIds
      .map((id, idx) => {
        const item = byId.get(id);
        return item ? { ...item, order: idx } : null;
      })
      .filter(Boolean) as CollectionItem[];
    // append any orphaned items (shouldn't happen, but defensive)
    current.forEach((c) => {
      if (!orderedIds.includes(c.id)) next.push(c);
    });
    writeCollection(next);
    setItems(next);
  }, []);

  // ── check presence by id ──────────────────────────────────────────────────
  const isInCollection = useCallback(
    (id: string): boolean => readCollection().some((c) => c.id === id),
    []
  );

  // ── remove ────────────────────────────────────────────────────────────────
  const remove = useCallback((id: string) => {
    const next = readCollection().filter((c) => c.id !== id);
    writeCollection(next);
    setItems(next);
  }, []);

  // ── restore (undo remove) ─────────────────────────────────────────────────
  const restoreItem = useCallback((item: CollectionItem) => {
    const current = readCollection();
    if (current.some((c) => c.id === item.id)) return; // already back
    const next = [item, ...current.map((c) => ({ ...c, order: c.order + 1 }))];
    writeCollection(next);
    setItems(next);
  }, []);

  // ── all tags used across the collection ────────────────────────────────────
  const getAllTags = useCallback((): string[] => {
    const set = new Set<string>();
    readCollection().forEach((item) => (item.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, []);

  return {
    items,
    addFromPaper,
    addFromPaperForce,
    addRawSnippet,
    addParaphrase,
    updateItem,
    reorder,
    isInCollection,
    remove,
    restoreItem,
    getAllTags,
  };
}
