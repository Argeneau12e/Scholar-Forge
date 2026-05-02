import { Router, type IRouter } from "express";
import {
  fetchMetadataFromDOI,
  formatAll,
  formatBibliography,
  exportBibtex,
  type CitationMetadata,
  type CitationStyle,
  ALL_STYLES,
} from "../lib/citations";

const router: IRouter = Router();

const VALID_STYLES = new Set<string>(ALL_STYLES);

function pickStyle(raw: unknown): CitationStyle {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  return VALID_STYLES.has(s) ? (s as CitationStyle) : "apa";
}

// ─── POST /api/cite ──────────────────────────────────────────────────────────
// Body: { doi?: string } | { metadata?: CitationMetadata }
// Query: ?style=apa (ignored — all styles returned)
// Returns: { formatted, bibtex, metadata }

router.post("/cite", async (req, res): Promise<void> => {
  const body = req.body as { doi?: string; metadata?: CitationMetadata };

  let meta: CitationMetadata;

  if (body.doi && typeof body.doi === "string" && body.doi.trim()) {
    try {
      meta = await fetchMetadataFromDOI(body.doi.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: `CrossRef lookup failed: ${msg}` });
      return;
    }
  } else if (body.metadata && typeof body.metadata === "object") {
    meta = body.metadata;
  } else {
    res.status(400).json({ error: "Provide either a doi or a metadata object" });
    return;
  }

  const formatted = formatAll(meta);
  const bibtex = exportBibtex([meta]);

  res.json({ formatted, bibtex, metadata: meta });
});

// ─── GET /api/cite/batch ─────────────────────────────────────────────────────
// Query: ?dois[]=xxx&dois[]=yyy  OR  ?dois=xxx,yyy
//        &style=apa
// Returns: { citations: string[], bibtex: string }

router.get("/cite/batch", async (req, res): Promise<void> => {
  const style = pickStyle(req.query.style);

  // Accept ?dois[]=a&dois[]=b or ?dois=a,b or ?dois=a&dois=b
  let dois: string[] = [];
  const rawDois = req.query.dois;
  if (Array.isArray(rawDois)) {
    dois = (rawDois as string[]).flatMap((d) => d.split(",")).map((d) => d.trim()).filter(Boolean);
  } else if (typeof rawDois === "string") {
    dois = rawDois.split(",").map((d) => d.trim()).filter(Boolean);
  }

  if (dois.length === 0) {
    res.status(400).json({ error: "Provide at least one DOI via ?dois[]=" });
    return;
  }
  if (dois.length > 50) {
    res.status(400).json({ error: "Maximum 50 DOIs per batch request" });
    return;
  }

  const results = await Promise.allSettled(dois.map((doi) => fetchMetadataFromDOI(doi)));

  const metadataList: CitationMetadata[] = [];
  const errors: string[] = [];

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      metadataList.push(r.value);
    } else {
      errors.push(`DOI[${i}] ${dois[i]}: ${r.reason instanceof Error ? r.reason.message : "failed"}`);
      metadataList.push({ doi: dois[i] }); // placeholder
    }
  });

  const citations = formatBibliography(metadataList, style);
  const bibtex = exportBibtex(metadataList);

  res.json({
    citations,
    bibtex,
    ...(errors.length > 0 && { errors }),
  });
});

export default router;
