# ScholarForge — Free Academic Research Assistant

> AI-powered research toolbox built by a student, for every student. Free and open source.

---

## What it does

ScholarForge gives you a complete dissertation research workflow in one place:

| Feature | What it does |
|---|---|
| **Paper Search** | Searches PubMed Central + Semantic Scholar simultaneously, filtered by your supervisor's year range and citation style |
| **Snippet Collection** | Save paper excerpts with one click; paste raw snippets manually; import by DOI |
| **AI Paraphraser** | Rewrites snippets in your voice with the correct inline citation already attached |
| **Originality Check** | Side-by-side diff of your draft vs the source — highlights what changed |
| **Citation Formatter** | Generates APA 7th, Vancouver, Harvard, MLA, Chicago citations from a DOI |
| **Research Gap Finder** | Claude reads your collection and identifies 5 unexplored research angles; saves the strongest as your thesis statement |
| **Literature Review Composer** | AI drafts a structured lit review from your saved papers; contenteditable with Bold/Italic/Undo; exports to .docx |
| **Argument Mapper** | D3 force-directed graph showing how papers support, contradict, extend, and replicate each other |
| **Writing Coach** | Paragraph-level feedback: scores (clarity, structure, academic register, citations), issue cards with fixes, plain-English rewrites, structure check, jargon simplifier |
| **Visual Sourcer** | Finds open-access figures from PubMed Central and Wikimedia Commons; AI suggests ideal diagram when none found |
| **Bibliography Export** | Exports your full collection as .docx, .bib, or .txt |

---

## Quick start

```bash
# Clone
git clone https://github.com/your-username/scholarforge.git
cd scholarforge

# Install dependencies (pnpm workspace)
pnpm install

# Set environment variables
cp .env.example .env
# Add: ANTHROPIC_API_KEY=sk-ant-...
# Add: DATABASE_URL=postgresql://...

# Run database migrations
pnpm --filter @workspace/api-server run db:migrate

# Start development servers (both run concurrently)
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/scholar-forge run dev
```

Then open `http://localhost:5173` (or the port shown in the terminal).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript, esbuild |
| Database | PostgreSQL (Drizzle ORM) |
| AI | Anthropic Claude (claude-sonnet-4-5) |
| Search | PubMed E-utilities API, Semantic Scholar API |
| Figures | PubMed Central OA, Wikimedia Commons API |
| Graphs | D3.js (force-directed, zoom/pan) |
| Export | docx (Word), BibTeX, plain text |
| Monorepo | pnpm workspaces |

---

## Adding citation styles

Citation styles are defined in `artifacts/api-server/src/routes/cite.ts`.

1. Add the new style to the `STYLE_MAP` object
2. Write the formatter function following the existing APA/Vancouver patterns
3. Add it to `CITATION_STYLES` in `artifacts/scholar-forge/src/hooks/useSupervisor.ts`
4. Restart the API server

---

## Adding search backends

Search backends live in `artifacts/api-server/src/routes/search.ts`.

Each backend is a function with the signature:
```typescript
async function searchBackend(params: SearchParams): Promise<Paper[]>
```

Add your function and include it in the `Promise.allSettled([...])` call in the route handler.

---

## University deployment guide

ScholarForge is designed to run behind any reverse proxy. For a university deployment:

1. **Set `ANTHROPIC_API_KEY`** — required for all AI features
2. **Set `DATABASE_URL`** — PostgreSQL 14+ recommended
3. **Set `SESSION_SECRET`** — a random 32-byte hex string
4. **Configure `ALLOWED_ORIGINS`** — your university domain
5. **Run behind nginx/Caddy** — the app binds to `PORT` (default 8080 for API, 3000 for frontend)
6. Consider rate-limiting the `/api/paraphrase`, `/api/gaps`, `/api/litreview`, `/api/argmap`, `/api/coach` routes per user session to manage AI costs

### Docker (example)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install
RUN pnpm --filter @workspace/api-server run build
EXPOSE 8080
CMD ["node", "artifacts/api-server/dist/index.mjs"]
```

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow the existing TypeScript patterns — no `any`, explicit return types on route handlers
3. All API routes must handle missing `ANTHROPIC_API_KEY` with a 503 and informative message
4. Add routes to `artifacts/api-server/src/routes/index.ts`
5. Open a pull request — keep it focused (one feature per PR)

---

## License

MIT — free to use, modify, and deploy. A link back to this repo is appreciated but not required.

---

*ScholarForge is not affiliated with any university, publisher, or research institution.*
