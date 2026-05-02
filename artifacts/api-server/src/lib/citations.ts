// @ts-ignore — citation-js publishes no TypeScript declarations
import { Cite } from "@citation-js/core";
// @ts-ignore
import "@citation-js/plugin-bibtex";
// @ts-ignore
import "@citation-js/plugin-csl";

// ─── Public types ────────────────────────────────────────────────────────────

export type CitationStyle = "apa" | "vancouver" | "harvard" | "mla" | "chicago";
export const ALL_STYLES: CitationStyle[] = ["apa", "vancouver", "harvard", "mla", "chicago"];

export interface CitationMetadata {
  title?: string;
  authors?: string[];
  year?: string | number;
  journal?: string;
  volume?: string | number;
  issue?: string | number;
  pages?: string;
  doi?: string;
  url?: string;
}

export interface AllFormats {
  apa: string;
  vancouver: string;
  harvard: string;
  mla: string;
  chicago: string;
}

// ─── CrossRef cache ──────────────────────────────────────────────────────────

interface CacheEntry { data: CitationMetadata; fetchedAt: number }
const doiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function safe(val: unknown): string {
  if (val == null || val === "") return "";
  return String(val).trim();
}

// ─── Author helpers ──────────────────────────────────────────────────────────

interface ParsedAuthor { family: string; given: string }

function parseAuthors(authors: string[]): ParsedAuthor[] {
  return authors.filter(Boolean).map((name) => {
    const commaIdx = name.indexOf(",");
    if (commaIdx !== -1) {
      return { family: name.slice(0, commaIdx).trim(), given: name.slice(commaIdx + 1).trim() };
    }
    const words = name.trim().split(/\s+/);
    return words.length >= 2
      ? { family: words[words.length - 1], given: words.slice(0, -1).join(" ") }
      : { family: name.trim(), given: "" };
  });
}

function renderAuthorFirst(a: ParsedAuthor): string {
  return a.given ? `${a.family}, ${a.given}` : a.family;
}
function renderAuthorNormal(a: ParsedAuthor): string {
  return a.given ? `${a.given} ${a.family}` : a.family;
}

// ─── CSL-JSON builder ────────────────────────────────────────────────────────

function toCSLData(meta: CitationMetadata): object {
  const parsed = parseAuthors(meta.authors ?? []);
  const year = parseInt(safe(meta.year), 10) || undefined;

  return {
    type: "article-journal",
    title: safe(meta.title) || "Untitled",
    ...(parsed.length > 0 && {
      author: parsed.map((a) => ({ family: a.family, given: a.given })),
    }),
    ...(year && { issued: { "date-parts": [[year]] } }),
    ...(meta.journal && { "container-title": safe(meta.journal) }),
    ...(meta.volume && { volume: safe(meta.volume) }),
    ...(meta.issue && { issue: safe(meta.issue) }),
    ...(meta.pages && { page: safe(meta.pages) }),
    ...(meta.doi && { DOI: safe(meta.doi) }),
    ...(meta.url && { URL: safe(meta.url) }),
  };
}

// ─── Manual MLA / Chicago formatters ────────────────────────────────────────

function formatMLA(meta: CitationMetadata): string {
  const parsed = parseAuthors(meta.authors ?? []);
  const parts: string[] = [];

  if (parsed.length === 1) {
    parts.push(renderAuthorFirst(parsed[0]) + ".");
  } else if (parsed.length === 2) {
    parts.push(`${renderAuthorFirst(parsed[0])}, and ${renderAuthorNormal(parsed[1])}.`);
  } else if (parsed.length > 2) {
    parts.push(`${renderAuthorFirst(parsed[0])}, et al.`);
  }

  if (meta.title) parts.push(`"${safe(meta.title)}."`);

  const journalParts: string[] = [];
  if (meta.journal) journalParts.push(safe(meta.journal));
  if (meta.volume) journalParts.push(`vol. ${safe(meta.volume)}`);
  if (meta.issue) journalParts.push(`no. ${safe(meta.issue)}`);
  if (meta.year) journalParts.push(safe(meta.year));
  if (meta.pages) journalParts.push(`pp. ${safe(meta.pages)}`);
  if (journalParts.length) parts.push(journalParts.join(", ") + ".");

  if (meta.doi) parts.push(`https://doi.org/${safe(meta.doi)}.`);

  return parts.join(" ");
}

function formatChicago(meta: CitationMetadata): string {
  const parsed = parseAuthors(meta.authors ?? []);
  const parts: string[] = [];

  if (parsed.length === 1) {
    parts.push(renderAuthorFirst(parsed[0]) + ".");
  } else if (parsed.length === 2) {
    parts.push(`${renderAuthorFirst(parsed[0])}, and ${renderAuthorNormal(parsed[1])}.`);
  } else if (parsed.length === 3) {
    parts.push(
      `${renderAuthorFirst(parsed[0])}, ${renderAuthorNormal(parsed[1])}, and ${renderAuthorNormal(parsed[2])}.`
    );
  } else if (parsed.length > 3) {
    parts.push(`${renderAuthorFirst(parsed[0])}, et al.`);
  }

  if (meta.year) parts.push(safe(meta.year) + ".");
  if (meta.title) parts.push(`"${safe(meta.title)}."`);

  let journalPart = meta.journal ? safe(meta.journal) : "";
  if (meta.volume) journalPart += ` ${safe(meta.volume)}`;
  if (meta.issue) journalPart += ` (${safe(meta.issue)})`;
  if (meta.pages) journalPart += `: ${safe(meta.pages)}`;
  if (journalPart) parts.push(journalPart + ".");

  if (meta.doi) parts.push(`https://doi.org/${safe(meta.doi)}.`);

  return parts.join(" ");
}

// ─── Exported formatting functions ──────────────────────────────────────────

/** Format a single citation in one style. Never throws — missing fields produce clean output. */
export function formatCitation(meta: CitationMetadata, style: CitationStyle): string {
  try {
    if (style === "mla") return formatMLA(meta);
    if (style === "chicago") return formatChicago(meta);

    const templateMap: Record<string, string> = {
      apa: "apa",
      vancouver: "vancouver",
      harvard: "harvard1",
    };

    const cite = new Cite(toCSLData(meta));
    const raw: string = cite.format("bibliography", {
      format: "text",
      template: templateMap[style] ?? "apa",
      lang: "en-US",
    });
    // citation-js may add HTML entities in text mode — strip them
    return raw
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .trim();
  } catch {
    return formatMLA(meta); // safe fallback
  }
}

/** Format a single citation in all five styles at once. */
export function formatAll(meta: CitationMetadata): AllFormats {
  return {
    apa: formatCitation(meta, "apa"),
    vancouver: formatCitation(meta, "vancouver"),
    harvard: formatCitation(meta, "harvard"),
    mla: formatCitation(meta, "mla"),
    chicago: formatCitation(meta, "chicago"),
  };
}

/** Format an array of papers in one style. */
export function formatBibliography(metadataArray: CitationMetadata[], style: CitationStyle): string[] {
  return metadataArray.map((m) => formatCitation(m, style));
}

/** Export one or more papers as a .bib string. */
export function exportBibtex(metadataArray: CitationMetadata[]): string {
  return metadataArray
    .map((meta) => {
      try {
        const cite = new Cite(toCSLData(meta));
        return (cite.format("bibtex") as string).trim();
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Fetch and normalize metadata from CrossRef, with a 24-hour in-memory cache. */
export async function fetchMetadataFromDOI(doi: string): Promise<CitationMetadata> {
  const normalized = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();

  const cached = doiCache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://api.crossref.org/works/${encodeURIComponent(normalized)}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "ScholarForge/1.0 (mailto:support@scholarforge.example.com)",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`CrossRef returned ${resp.status} for DOI "${normalized}"`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await resp.json()) as { message: any };
  const w = json.message;

  const dateParts =
    w.issued?.["date-parts"]?.[0] ??
    w.published?.["date-parts"]?.[0] ??
    w["published-online"]?.["date-parts"]?.[0] ??
    w["published-print"]?.["date-parts"]?.[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authors = ((w.author as any[]) ?? []).map((a: any) => {
    if (a.family && a.given) return `${a.family}, ${a.given}`;
    if (a.family) return a.family;
    if (a.name) return a.name;
    return "";
  }).filter(Boolean);

  const meta: CitationMetadata = {
    title: w.title?.[0] ?? w["original-title"]?.[0] ?? "Untitled",
    authors,
    year: dateParts?.[0] ? String(dateParts[0]) : undefined,
    journal: w["container-title"]?.[0] ?? w["short-container-title"]?.[0],
    volume: w.volume,
    issue: w.issue,
    pages: w.page,
    doi: normalized,
    url: w.URL,
  };

  doiCache.set(normalized, { data: meta, fetchedAt: Date.now() });
  return meta;
}
