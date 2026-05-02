import { parseStringPromise } from "xml2js";
import { logger } from "./logger";

export interface PaperSnippet {
  text: string;
  section: string;
  matchScore: number;
}

export interface PubMedPaper {
  pmcid: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
  snippets: PaperSnippet[];
  openAccess: true;
  url: string;
}

const ESEARCH_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const BATCH_SIZE = 5;

function scorePhrase(phrase: string, text: string): number {
  if (!phrase || !text) return 0;
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  const lowerText = text.toLowerCase();
  return words.filter((w) => lowerText.includes(w)).length;
}

function pickText(obj: unknown): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(pickText).join(" ");
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (o["_"]) return String(o["_"]);
    return Object.values(o).map(pickText).join(" ");
  }
  return "";
}

function extractSections(
  articleXml: Record<string, unknown>
): { text: string; section: string }[] {
  const sections: { text: string; section: string }[] = [];

  try {
    const article = (articleXml["pmc-articleset"] as Record<string, unknown>)
      ?.["article"]?.[0] as Record<string, unknown> | undefined;
    if (!article) return sections;

    const front = (article["front"] as Record<string, unknown>[])?.[0];
    const articleMeta = (front?.["article-meta"] as Record<string, unknown>[])?.[0];

    // Abstract
    const abstractEl = (articleMeta?.["abstract"] as Record<string, unknown>[])?.[0];
    if (abstractEl) {
      const abstractText = pickText(abstractEl).trim();
      if (abstractText) sections.push({ text: abstractText, section: "abstract" });
    }

    // Body sections
    const body = (article["body"] as Record<string, unknown>[])?.[0];
    if (body) {
      const secs = (body["sec"] as Record<string, unknown>[]) ?? [];
      for (const sec of secs.slice(0, 5)) {
        const title = pickText((sec["title"] as unknown[])?.[0]).trim().toLowerCase();
        const isIntro = title.includes("intro") || title === "";
        const isResults = title.includes("result") || title.includes("finding");
        if (isIntro || isResults) {
          const label = isIntro ? "introduction" : "results";
          const paras = (sec["p"] as unknown[]) ?? [];
          const text = paras
            .slice(0, isIntro ? 1 : 4)
            .map(pickText)
            .join(" ")
            .trim();
          if (text) sections.push({ text, section: label });
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "pubmed: section extraction error");
  }

  return sections;
}

async function fetchArticle(pmcid: string): Promise<Record<string, unknown> | null> {
  try {
    const url = `${EFETCH_BASE}?db=pmc&id=${pmcid}&rettype=xml&retmode=xml`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const xml = await res.text();
    return (await parseStringPromise(xml, { explicitArray: true })) as Record<
      string,
      unknown
    >;
  } catch (err) {
    logger.warn({ pmcid, err }, "pubmed: efetch failed");
    return null;
  }
}

function extractMeta(
  parsed: Record<string, unknown>
): {
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
} {
  try {
    const article = (parsed["pmc-articleset"] as Record<string, unknown>)
      ?.["article"]?.[0] as Record<string, unknown> | undefined;
    if (!article) return { title: "", authors: [], year: null, journal: null, doi: null, abstract: null };

    const front = (article["front"] as Record<string, unknown>[])?.[0];
    const articleMeta = (front?.["article-meta"] as Record<string, unknown>[])?.[0];
    const journalMeta = (front?.["journal-meta"] as Record<string, unknown>[])?.[0];

    // Title
    const titleGroup = (articleMeta?.["title-group"] as Record<string, unknown>[])?.[0];
    const title = pickText(
      (titleGroup?.["article-title"] as unknown[])?.[0]
    ).trim();

    // Authors
    const contribGroup = (articleMeta?.["contrib-group"] as Record<string, unknown>[])?.[0];
    const contribs = (contribGroup?.["contrib"] as Record<string, unknown>[]) ?? [];
    const authorNames = contribs
      .filter((c) => (c as Record<string, unknown>)["$"]?.["contrib-type"] === "author")
      .map((c) => {
        const name = (c["name"] as Record<string, unknown>[])?.[0];
        const surname = pickText((name?.["surname"] as unknown[])?.[0]);
        return surname || pickText(c["string-name"]?.[0]);
      })
      .filter(Boolean);
    const authors =
      authorNames.length > 3
        ? [...authorNames.slice(0, 3), "et al."]
        : authorNames;

    // Year
    const pubDate = (articleMeta?.["pub-date"] as Record<string, unknown>[])?.[0];
    const yearStr = pickText((pubDate?.["year"] as unknown[])?.[0]);
    const year = yearStr ? parseInt(yearStr, 10) : null;

    // Journal
    const journal = pickText(
      (journalMeta?.["journal-title-group"] as Record<string, unknown>[])?.[0]
        ?.["journal-title"]?.[0]
    ).trim() || null;

    // DOI
    const articleIds = (articleMeta?.["article-id"] as Record<string, unknown>[]) ?? [];
    const doiEl = articleIds.find(
      (a) => (a["$"] as Record<string, string>)?.["pub-id-type"] === "doi"
    );
    const doi = doiEl ? pickText(doiEl).trim() : null;

    // Abstract
    const abstractEl = (articleMeta?.["abstract"] as Record<string, unknown>[])?.[0];
    const abstract = abstractEl
      ? pickText(abstractEl).trim().slice(0, 300) || null
      : null;

    return { title, authors, year, journal, doi, abstract };
  } catch {
    return { title: "", authors: [], year: null, journal: null, doi: null, abstract: null };
  }
}

async function processBatch(
  pmcids: string[],
  phrase: string | null
): Promise<PubMedPaper[]> {
  const results = await Promise.all(
    pmcids.map(async (pmcid): Promise<PubMedPaper | null> => {
      const parsed = await fetchArticle(pmcid);
      if (!parsed) return null;

      const meta = extractMeta(parsed);
      const sections = extractSections(parsed);

      let snippets: PaperSnippet[] = sections.map((s) => ({
        text: s.text.slice(0, 400),
        section: s.section,
        matchScore: phrase ? scorePhrase(phrase, s.text) : 0,
      }));

      if (phrase) {
        snippets = snippets
          .filter((s) => s.matchScore > 0)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 3);
      } else {
        snippets = snippets.slice(0, 2);
      }

      return {
        pmcid,
        title: meta.title || `PMC${pmcid}`,
        authors: meta.authors,
        year: meta.year,
        journal: meta.journal,
        doi: meta.doi,
        abstract: meta.abstract,
        snippets,
        openAccess: true,
        url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`,
      };
    })
  );

  return results.filter((r): r is PubMedPaper => r !== null);
}

export async function searchPubMed(
  topic: string,
  opts: {
    yearFrom?: number | null;
    yearTo?: number | null;
    phrase?: string | null;
    page?: number;
  } = {}
): Promise<PubMedPaper[]> {
  const { yearFrom, yearTo, phrase, page = 1 } = opts;

  let term = topic;
  if (yearFrom || yearTo) {
    const from = yearFrom ?? 1900;
    const to = yearTo ?? new Date().getFullYear();
    term += ` AND ${from}:${to}[pdat]`;
  }
  term += ' AND "open access"[filter]';

  const retstart = (page - 1) * 20;
  const url =
    `${ESEARCH_BASE}?db=pmc&term=${encodeURIComponent(term)}` +
    `&retmax=20&retstart=${retstart}&retmode=json`;

  let pmcids: string[] = [];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ status: res.status }, "pubmed: esearch failed");
      return [];
    }
    const data = (await res.json()) as {
      esearchresult?: { idlist?: string[] };
    };
    pmcids = data.esearchresult?.idlist ?? [];
  } catch (err) {
    logger.warn({ err }, "pubmed: esearch network error");
    return [];
  }

  if (pmcids.length === 0) return [];

  // Batch efetch — max BATCH_SIZE at a time
  const papers: PubMedPaper[] = [];
  for (let i = 0; i < pmcids.length; i += BATCH_SIZE) {
    const batch = pmcids.slice(i, i + BATCH_SIZE);
    const batchResults = await processBatch(batch, phrase ?? null);
    papers.push(...batchResults);
  }

  return papers;
}
