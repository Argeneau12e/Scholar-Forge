# ScholarForge

A full-stack AI-powered academic research assistant for students and researchers. Combines multi-source paper search with AI-driven tools for writing, analysis, and literature review.

## Features

- **Paper Search** — 9 academic databases (OpenAlex, Semantic Scholar, PubMed, arXiv, CORE, Europe PMC, DOAJ, BASE, Unpaywall)
- **Writing Studio** — Tiptap v3 rich editor with AI rewrite, summarise, and continue actions
- **Lit Review Composer** — Structured or thematic literature review generator
- **Gap Finder** — Identifies research gaps in your paper collection
- **Argument Mapper** — D3 visualisation of paper relationships
- **Citation Context** — Shows how a paper is cited across the literature
- **Writing Coach** — Paragraph-level feedback on clarity, structure, and academic register
- **Originality Checker** — Phrase-level similarity detection against your sources
- **Paraphrase Tool** — Three intensity levels with inline citation
- **PDF Library** — Upload PDFs, extract text, chat with papers via SSE streaming
- **Reading List** — Kanban board with analytics dashboard
- **Outline Editor** — AI structure feedback + per-section resource recommendations
- **Writing Schedule** — AI-enhanced deadline-aware schedule generator
- **Language Support** — ESL writing check, academic translation, plain-language simplification
- **Poster Builder** — Generate + export academic conference posters as PNG
- **Abstract Generator** — Structured or unstructured abstracts up to 600 words
- **Peer Feedback** — Threaded comment sessions with export/import
- **Journal Finder** — DOAJ-enriched journal recommendations
- **Methodology Advisor** — Research methodology recommendations with real papers
- **Question Answering** — Stance classification (supports/contradicts/neutral) per paper

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Routing | Wouter |
| State | TanStack Query |
| Editor | Tiptap v3 |
| Graph | D3 v7 |
| PDF | pdfjs-dist |
| Backend | Express 5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| AI | Groq API (`llama-3.3-70b-versatile`) — supplied per request via header |
| Validation | Zod v4 + drizzle-zod |
| API codegen | Orval (OpenAPI → React Query hooks) |
| Monorepo | pnpm workspaces |

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL database

### Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Fill in DATABASE_URL and SESSION_SECRET

# Push database schema
pnpm --filter @workspace/db run push

# Start development servers
pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/scholar-forge run dev # Frontend on :5173
```

### Groq API Key

ScholarForge uses [Groq](https://console.groq.com/keys) (free tier available) to power all AI features. The key is **never stored on the server** — it is entered once in the browser UI, stored in `localStorage`, and sent as an `x-groq-api-key` request header with every AI request.

On first load, the app prompts you to enter your key. You can change it any time via the **key icon** in the top navigation bar.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session signing secret |
| `NCBI_API_KEY` | Optional | PubMed 10 req/s (3 req/s without) |
| `CORE_API_KEY` | Optional | CORE academic search |
| `ALLOWED_ORIGINS` | Production | Comma-separated CORS origins (e.g. `https://myapp.vercel.app`) |

## Deployment

### Vercel

```bash
npm i -g vercel
vercel
```

The included `vercel.json` configures:
- **Build**: `pnpm install && pnpm --filter @workspace/scholar-forge run build`
- **Output**: `artifacts/scholar-forge/dist`
- **API**: all `/api/*` requests → `api/index.ts` (Express serverless wrapper)
- **SPA routing**: all non-API paths serve `index.html`

Set `ALLOWED_ORIGINS=https://your-app.vercel.app` in Vercel environment variables.

### Replit

Runs natively. CORS is automatically restricted to your Replit domain via the `REPLIT_DOMAINS` environment variable (set automatically by the platform).

## Project Structure

```
artifacts/
  api-server/          # Express 5 API
    src/
      routes/          # 22 route modules (one per feature)
      lib/             # Search adapters, safety utils
      middlewares/
  scholar-forge/       # React + Vite frontend
    src/
      pages/           # 21 page components
      components/      # Feature components
      hooks/
      lib/
lib/
  db/                  # Drizzle ORM schema + migrations
  api-spec/            # OpenAPI spec + Orval codegen
  api-client-react/    # Generated React Query hooks
  api-zod/             # Generated Zod schemas
api/
  index.ts             # Vercel serverless handler
```

## Security

- CORS restricted to listed origins in production
- Helmet CSP, no inline scripts
- Body size limit: 1 MB
- Global rate limit: 60 AI req/hour per IP
- Per-route limits on high-volume endpoints
- Max 3 concurrent AI requests per IP
- Outbound fetches restricted to approved academic API allowlist (`safeFetch.ts`)
- Prompt injection protection via `wrapUserText()` delimiters
- Input sanitization middleware
- Abstract content sanitized with `sanitize-html`

## License

MIT
