# ScholarForge Workspace

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
- **Frontend editor**: Tiptap v3 (Writing Studio — Highlight, Typography, Underline, TextAlign, Color, CharacterCount extensions)
- **Graph viz**: D3 v7 (Connected Papers)
- **PDF processing**: pdfjs-dist (PDF Library — worker from CDN)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Navigation Structure (Two-Tier)

Tier 1: section toggles. Tier 2: animated sub-nav with all items per section.

| Section | Items |
|---|---|
| **Write** | Studio (`/studio`), Outline (`/outline`), Schedule (`/schedule`), Peer Feedback (`/feedback`), Language Support (`/language`) |
| **Search** | Papers (`/`), Question Answering (`/question`), Connected Papers (`/papergraph`) |
| **Collection** | My Collection (`/collection`), Reading List (`/reading-list`), PDF Library (`/pdf-library`) |
| **Analyse** | Gap Finder (`/gaps`), Argument Map (`/argmap`), Citation Context (`/citecontext-page`) |
| **Tools** | Writing Coach (`/coach`), Originality (`/originality`), Journal Finder (`/journals`), Methodology (`/outline`), Poster Builder (`/poster`), Abstract Generator (`/abstract`) |

## All Routes (21 pages)

`/`, `/supervisors`, `/collection`, `/coach`, `/visuals`, `/originality`, `/question`, `/papergraph`, `/studio`, `/outline`, `/journals`, `/schedule`, `/reading-list`, `/pdf-library`, `/gaps`, `/argmap`, `/citecontext-page`, `/poster`, `/abstract`, `/feedback`, `/language`

## Feature Modules — ALL COMPLETE

### Module 1 — Nav Restructure
Two-tier nav with 5 sections. `sectionForPath()` maps all 21 routes to section IDs. Mobile bottom-sheet. Dark-mode toggle. Collection count badge.

### Module 2 — Reading Gap
- **PDF Library** (`/pdf-library`): pdfjs-dist upload, text extraction, chat with PDF via `POST /api/pdf/chat` (SSE streaming)
- **Reading List** (`/reading-list`): Kanban board (To Read / Reading / Done) + analytics dashboard
- **Concept Explainer**: sliding panel on any paper card, `POST /api/concept`
- **ReadingDashboard**: streaks, heatmap, completion stats

### Module 3 — Writing Studio Expansion
Tiptap v3 with Highlight, Typography, Underline, TextAlign, Color, CharacterCount extensions. Full formatting toolbar. Floating AI action bar (rewrite, summarise, suggest, continue). 3-panel layout with version history (diff viewer). Word count live stats.

### Module 4 — Outline + Schedule
- **Outline Editor** (`/outline`): 3-panel layout; `POST /api/outline/analyze` (structure score, issues, missing sections); `POST /api/outline/resources` (OpenAlex per section); Methodology Advisor tab
- **Schedule** (`/schedule`): Phase-based writing schedule generator; Claude motivational tips; progress tracker; `POST /api/schedule`

### Module 5 — Collaboration
**Peer Feedback** (`/feedback`):
- Review sessions stored in localStorage (`sf2_feedback_sessions`)
- Comment threads with quoted text, reviewer name, role (supervisor/peer/student), priority (critical/major/minor/suggestion), status (open/resolved/won't fix)
- Reply threads on each comment
- Progress bar (% resolved)
- Export as plain text `.txt` report
- Import from exported JSON
- Share code (base64 session summary)

### Module 6 — Language Support
**Language** (`/language`) — three tools:
- **ESL Writing Check** (`POST /api/language/check`): scores (overall/grammar/register/clarity), issues with suggested rewrites, positives, vocabulary gaps, L1 interference notes, suggested rewrite
- **Translate** (`POST /api/language/translate`): 18 languages, academic register preserved, technical term glossary
- **Simplify** (`POST /api/language/simplify`): plain English + optional translation, key terms defined

### Module 7 — Output Generators
- **Poster Builder** (`/poster`): `POST /api/poster/content` generates structured academic poster (title, authors, intro, methods, findings, conclusions, limitations). In-browser editable via `contentEditable`. PNG export via `html2canvas`.
- **Abstract Generator** (`/abstract`): `POST /api/abstract` generates structured or unstructured abstracts up to 600 words. Discipline-aware. Keyword integration. Word count enforced.

### Module 8 — Security Audit (COMPLETE)

#### Hardening applied
| Layer | Measure |
|---|---|
| CORS | Restricted to `REPLIT_DOMAINS` in production; open in dev |
| Helmet CSP | `defaultSrc 'self'`, no inline scripts, no frames, no objects |
| Body size limit | `express.json({ limit: "1mb" })` — prevents large payload attacks |
| Global Claude rate limiter | 60 req/hour per IP across all 20 AI routes (app.ts) |
| Per-route rate limiters | Additional 40–50 req/hour limits on `language`, `pdfchat`, `concept` |
| Concurrent request limit | Max 3 in-flight per IP for heavy AI routes |
| Domain whitelist | `safeFetch.ts` — all outbound fetches to 11 approved academic APIs only |
| Prompt injection | `wrapUserText()` delimiters; `validateClaudeResponse()` suspicious-pattern check |
| XSS audit | `LitReviewComposer` uses `escHtml()` before innerHTML — confirmed safe; no `eval` or unescaped innerHTML in user paths |
| Input validation middleware | `middlewares/inputValidation.ts` — `sanitizeString`, `clampInt`, `isSafeUrl`, `stripHtml` helpers |
| Abstract sanitization | `sanitize-html` strips tags from PubMed/Semantic Scholar abstracts |
| API key guard | All Claude routes check `ANTHROPIC_API_KEY` and return 503 if missing |

## AI Routes Summary

| Route | Method | Rate limit | Purpose |
|---|---|---|---|
| `/api/question` | POST | 60/hr global | Research question answering |
| `/api/gaps` | POST | 60/hr global | Literature gap finder |
| `/api/litreview` | POST | 60/hr global | Lit review generation |
| `/api/coach` | POST | 60/hr global | Writing coach feedback |
| `/api/argmap` | POST | 60/hr global | Argument mapper |
| `/api/plagiarism` | POST | 60/hr global | Originality check |
| `/api/similarity` | POST | 60/hr global | Semantic similarity |
| `/api/citecontext` | POST | 60/hr global | Citation context |
| `/api/paraphrase` | POST | 60/hr global | AI paraphrase |
| `/api/outline/analyze` | POST | 60/hr global | Outline feedback |
| `/api/outline/resources` | POST | 60/hr global | Section resources |
| `/api/methodology` | POST | 60/hr global | Methodology advisor |
| `/api/schedule` | POST | 60/hr global | Writing schedule + tips |
| `/api/poster/content` | POST | 60/hr global | Poster content generation |
| `/api/abstract` | POST | 60/hr global | Abstract generation |
| `/api/pdf/chat` | POST | 50/hr + global | PDF chat (SSE streaming) |
| `/api/concept` | POST | 50/hr + global | Concept explainer |
| `/api/language/check` | POST | 40/hr + global | ESL writing check |
| `/api/language/translate` | POST | 40/hr + global | Academic translation |
| `/api/language/simplify` | POST | 40/hr + global | Plain language + translate |
| `/api/journals/recommend` | POST | 60/hr global | Journal recommender |
| `/api/workspace/analyze` | POST | 60/hr global | Workspace AI analysis |

## Multi-Source Search (9 Academic Databases)

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

## localStorage Keys

| Prefix | Used for |
|---|---|
| `sf_` | Existing keys (theme, collection, etc.) |
| `sf2_` | New module keys (pdf_*, reading_*, concept_*, feedback_sessions) |

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (AI features) | Claude claude-haiku-4-5 for all AI routes |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `SESSION_SECRET` | Yes | Express session signing |
| `NCBI_API_KEY` | Optional | PubMed 10 req/s (3 req/s without) |
| `CORE_API_KEY` | Optional | CORE academic search |
| `REPLIT_DOMAINS` | Auto-set | CORS restriction in production |

## Known Pre-existing TypeScript Errors

These errors exist in the original codebase and are not introduced by recent work:
- `Cannot find module '@workspace/api-client-react/src/generated/api.schemas'` — affects `CitationDisplay.tsx`, `CollectionWorkspace.tsx`, `ParaphrasePanel.tsx`, `SnippetCard.tsx`, `useCollection.ts`, `home.tsx`, `supervisors.tsx`
- `ArgumentMapper.tsx` — implicit any in tooltip state setter
- `home.tsx` — `queryKey` missing in `useGetWorkspaceAnalysis` call
- `useCollection.ts` — duplicate `tags`/`order` keys in object spread
