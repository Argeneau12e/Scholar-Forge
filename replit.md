# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Security Implementation

All 10 security items from the spec are implemented:

### Server-side
- **Helmet CSP** (`app.ts`) — `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` headers on all responses
- **Per-IP concurrent request limit** (`middlewares/requestLimit.ts`) — max 3 in-flight requests per IP across all 5 AI routes, 5-minute slot timeout
- **NCBI token bucket rate limiter** (`lib/pubmed.ts`) — 10 req/s with `NCBI_API_KEY`, 3 req/s without; startup warning if key missing; appended to all NCBI URLs
- **External API domain whitelist** (`lib/safeFetch.ts`) — all outbound fetches to 9 approved academic API domains only; used in `pubmed.ts`, `citations.ts`, `semantic.ts`
- **Prompt injection hardening** (`lib/promptSafety.ts`) — `wrapUserText()` wraps user content in `=== USER DOCUMENT START/END ===` delimiters; `validateClaudeResponse()` checks 6 suspicious patterns; applied to all 5 AI routes (paraphrase, gaps, litreview, coach, argmap) with IP+route logged on block
- **Abstract HTML sanitization** (`lib/pubmed.ts`) — `sanitize-html` strips all tags from PubMed abstracts
- **BibTeX injection protection** (`lib/citations.ts`) — `sanitizeBibtex()` strips `\`, `{`, `}`, `@` from field values
- **Docx injection protection** (`lib/citations.ts`, `routes/export.ts`) — `sanitizeDocx()` strips control characters; applied to `docTitle` in litreview exports
- **Academic integrity watermark** (`routes/export.ts`) — first paragraph in all litreview `.docx` exports is a grey italic draft disclaimer

### Frontend
- **Citation verify links** (`CitationDisplay.tsx`) — "Verify source ↗" links to DOI or Google Scholar fallback, with "Always verify before submitting" note
- **Writing Coach disclaimer** (`WritingCoach.tsx`) — italic integrity note in footer
- **Lit review integrity banner** (`LitReviewComposer.tsx`) — non-dismissable amber `border-l-4` banner above the editor in the result step
- **Export citations checkbox** (`ExportModal.tsx`) — "I have independently verified..." checkbox; inline orange warning when unchecked

## Originality Check Feature (`/originality`)

Three-layer plagiarism detection page added to the main navigation.

### Backend (`artifacts/api-server/src/routes/plagiarism.ts`)
`POST /api/plagiarism` — accepts `{ text: string, collectionItems: CollectionItem[] }`

- **Layer 1 (Claude)**: Compares student text semantically against each saved source snippet. Returns per-source `similarityScore` (0–100), `matchedPhrases` (4+ word verbatim matches), `verdict` (`well-paraphrased` | `too-similar` | `direct-quote-detected`), and `overallRisk` (`low` | `medium` | `high`). Also extracts 3 distinctive phrases for Layer 2.
- **Layer 2 (Semantic Scholar)**: Searches Semantic Scholar for each distinctive phrase; returns papers whose abstracts contain the phrase verbatim. Races against an 8-second timeout.
- **Layer 3 (client-side)**: Splits text into paragraphs, extracts sentences ≥6 words, flags sentences appearing in multiple paragraphs as internal repetition.
- Covered by `concurrentRequestLimit` middleware (max 3 in-flight per IP).
- Degrades gracefully: Layer 3 always runs; Layers 1–2 skip if `ANTHROPIC_API_KEY` absent.

### Frontend (`artifacts/scholar-forge/src/components/PlagiarismChecker.tsx`)
- Large textarea (10,000 char limit) with word counter
- Collection chip showing how many saved sources will be compared
- Permanent non-removable disclaimer (what it checks / what it doesn't)
- Overall risk badge (green/amber/red) + "What to do next" guidance text
- Source match cards: expandable, show similarity bar, verdict badge, highlighted matched phrases in student text, "Improve paraphrase in Writing Coach" link for non-passing verdicts
- Web match cards: paper title, authors, year, matched phrase badge, abstract preview, DOI/URL link
- Internal repetition section: lists repeated sentences
- Final reminder about institutional checker
- Route: `/originality` · Nav: "Originality" with ShieldCheck icon
