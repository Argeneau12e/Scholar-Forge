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
- **Frontend editor**: Tiptap v3 (Writing Studio)
- **Graph viz**: D3 v7 (Connected Papers)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Navigation Structure

The top nav uses grouped Radix UI dropdowns:

| Dropdown | Items |
|---|---|
| **Write** | Writing Studio (`/studio`), Outline Editor (`/outline`) |
| **Search** | Paper Search (`/`), Connected Papers (`/papergraph`), Question Answerer (`/question`) |
| **Collection** | My Collection (`/collection`) |
| **Analyse** | Originality Check (`/originality`) |
| **Tools** | Journal Finder (`/journals`), Supervisors (`/supervisors`) |

Single-page links remain in the nav bar: Supervisors, Originality, My Collection.

## Feature Modules (A–H)

### A — Research Question Answerer (`/question`)

**Backend** `POST /api/question` — Fans out to OpenAlex + Semantic Scholar, classifies each paper's stance
(`support` / `contradict` / `neutral`) using Claude. Returns structured verdict with counts and evidence list.

**Frontend** `src/pages/question.tsx` — Query input, discipline selector, evidence cards colour-coded by stance,
summary verdict badge (Supported / Contested / Insufficient Evidence / Contradicted).

### B — Connected Papers Graph (`/papergraph`)

**Backend** `POST /api/papergraph` — Looks up seed paper via OpenAlex, fetches cited works + citing works,
returns `{ seed, nodes, edges }` D3-ready graph data. No Claude needed.

**Frontend** `src/pages/papergraph.tsx` — Force-directed D3 graph, year-range slider filter, node size = citation count,
node colour = decade, right panel shows selected paper details + "Save to Collection" button. Auto-fetches from `?doi=` or `?title=` URL params
(deep-linked from SnippetCard "Connected Papers" button).

### C — Citation Context (`/citecontext` dialog)

**Backend** `POST /api/citecontext` — Given DOI + citing paper details, uses Claude to explain how/why
the paper is cited in context. Returns `{ explanation, citationType, confidence }`.

**Frontend** `src/components/SnippetCard.tsx` — "How cited?" button opens `CiteContextDialog` inline modal.
Lazy-fetches on open; shows citation type badge + explanation paragraph.

### D — Outline Editor (`/outline`)

**Backend**
- `POST /api/outline/analyze` — Claude reviews outline structure, returns `{ structureScore, issues[], missingEssentialSections, overallFeedback, suggestions[] }`
- `POST /api/outline/resources` — Fans out to OpenAlex for each section heading; returns `{ sections: { [heading]: Paper[] } }`

**Frontend** `src/pages/outline.tsx` — Three-panel layout: left = outline textarea, centre = AI feedback + missing
sections, right = Methodology Advisor tab (fetches `POST /api/methodology`) + Resources tab.

### E — Writing Studio (`/studio`)

**Backend** — No dedicated route; uses existing paraphrase/coach routes.

**Frontend** `src/pages/studio.tsx` — Tiptap v3 rich-text editor with:
- Word count, sentence count, reading-time live stats
- Document structure panel (heading outline)
- Toolbar: Bold, Italic, Code, H1/H2, Bullet list
- Citation inserter: picks from saved collection items, inserts formatted APA/Vancouver/Harvard inline citation
- Export to `.txt` download

### F — Journal Finder (`/journals`)

**Backend** `POST /api/journals/recommend` — Claude recommends 5 open-access journals by discipline + abstract;
DOAJ API enriches results with ISSN, publisher, APC, and submission URL.

**Frontend** `src/pages/journals.tsx` — Abstract textarea, discipline picker, journal cards with fit-score badge,
APC chip, review-time chip, open-access badge, "Submit here ↗" link.

### G — Daily Digest

**Backend** `POST /api/digest` — Accepts `{ topics[], discipline }`, fans out to OpenAlex for each topic,
returns top papers from the past 30 days sorted by citation count. No Claude needed.

**Frontend** `src/components/DigestBanner.tsx` — Shown on home page when supervisor has `focusAreas` set.
Collapsible banner with today's date, topic chips, and paper cards with DOI links. Auto-fetches on mount.

### H — Methodology Advisor (tab in Outline Editor)

**Backend** `POST /api/methodology` — Claude recommends 3–5 research methodologies for the topic/question,
with suitability rating, justification, key papers, and limitations.

**Frontend** Embedded in `src/pages/outline.tsx` right-panel "Methodology" tab. Cards show methodology name,
suitability badge, pros/cons chips, 3 key papers list.

## Security Implementation

All 10 security items from the spec are implemented:

### Server-side
- **Helmet CSP** (`app.ts`) — `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` headers on all responses
- **Per-IP concurrent request limit** (`middlewares/requestLimit.ts`) — max 3 in-flight requests per IP across all AI routes, 5-minute slot timeout
- **NCBI token bucket rate limiter** (`lib/pubmed.ts`) — 10 req/s with `NCBI_API_KEY`, 3 req/s without; startup warning if key missing
- **External API domain whitelist** (`lib/safeFetch.ts`) — all outbound fetches to approved academic API domains only
- **Prompt injection hardening** (`lib/promptSafety.ts`) — `wrapUserText()` delimiters; `validateClaudeResponse()` checks suspicious patterns
- **Abstract HTML sanitization** (`lib/pubmed.ts`) — `sanitize-html` strips all tags from PubMed abstracts
- **BibTeX injection protection** (`lib/citations.ts`) — `sanitizeBibtex()` strips `\`, `{`, `}`, `@` from field values
- **Docx injection protection** (`lib/citations.ts`, `routes/export.ts`) — `sanitizeDocx()` strips control characters
- **Academic integrity watermark** (`routes/export.ts`) — first paragraph in all litreview `.docx` exports is a grey italic draft disclaimer

### Frontend
- **Citation verify links** (`CitationDisplay.tsx`) — "Verify source ↗" links to DOI or Google Scholar fallback
- **Writing Coach disclaimer** (`WritingCoach.tsx`) — italic integrity note in footer
- **Lit review integrity banner** (`LitReviewComposer.tsx`) — non-dismissable amber banner above editor
- **Export citations checkbox** (`ExportModal.tsx`) — "I have independently verified..." checkbox

## Multi-Source Search (8 Academic Databases)

The search backend fans out to 8 sources simultaneously:

| File | Source | API | Key needed |
|---|---|---|---|
| `openalex.ts` | OpenAlex | `api.openalex.org` | No |
| `europepmc.ts` | Europe PMC | `www.ebi.ac.uk/europepmc` | No |
| `core.ts` | CORE | `api.core.ac.uk/v3` | Yes (`CORE_API_KEY`) |
| `arxiv.ts` | arXiv | `export.arxiv.org/api` | No |
| `unpaywall.ts` | Unpaywall | `api.unpaywall.org/v2` | No |
| `doaj.ts` | DOAJ | `doaj.org/api` | No |
| `base.ts` | BASE | `api.base-search.net` | No |
| `pubmed.ts` | PubMed | `eutils.ncbi.nlm.nih.gov` | Optional (`NCBI_API_KEY`) |
| `semantic.ts` | Semantic Scholar | `api.semanticscholar.org` | No |

## Originality Check Feature (`/originality`)

Three-layer plagiarism detection:
- **Layer 1 (Claude)**: Semantic comparison against saved sources → `similarityScore`, `matchedPhrases`, `verdict`, `overallRisk`
- **Layer 2 (Semantic Scholar)**: Phrase-level web search for distinctive phrases
- **Layer 3 (client-side)**: Internal repetition detection across paragraphs

## Known Pre-existing TypeScript Errors

These errors exist in the original codebase and are not introduced by recent work:
- `Cannot find module '@workspace/api-client-react/src/generated/api.schemas'` — affects `CitationDisplay.tsx`, `CollectionWorkspace.tsx`, `ParaphrasePanel.tsx`, `SnippetCard.tsx`, `useCollection.ts`, `home.tsx`, `supervisors.tsx`
- `ArgumentMapper.tsx` — implicit any in tooltip state setter
- `home.tsx` — `queryKey` missing in `useGetWorkspaceAnalysis` call
- `useCollection.ts` — duplicate `tags`/`order` keys in object spread

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (AI features) | Claude claude-sonnet-4-5 for all AI routes |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `SESSION_SECRET` | Yes | Express session signing |
| `NCBI_API_KEY` | Optional | PubMed 10 req/s (3 req/s without) |
| `CORE_API_KEY` | Optional | CORE academic search |
