---
name: Groq migration pattern
description: How ScholarForge AI routes work after Anthropic→Groq migration
---

## Key pattern

Every AI route reads the key from the request header:
```typescript
const apiKey = (req.headers["x-groq-api-key"] as string | undefined)?.trim();
if (!apiKey) { res.status(401).json({ error: "GROQ_API_KEY_REQUIRED" }); return; }
const client = new Groq({ apiKey });
```

Model: `llama-3.3-70b-versatile`

**Why:** Key is user-supplied per request (stored in localStorage, sent as header). Never stored server-side.

**Exceptions:** `workspace.ts`, `search.ts`, `schedule.ts`, `visuals.ts` — these use Groq optionally (graceful fallback, no 401).

## Frontend

- `apiFetch.ts` at `@/lib/apiFetch` — wraps fetch, injects `x-groq-api-key` header automatically
- `useGroqKey.ts` / `GroqKeyGate.tsx` — prompts user to enter key on first load; key icon in top-nav to change it
- Key stored in `localStorage` under `sf_groq_key`

## Type gotchas fixed

- `searchSemantic()` returns `SemanticResult` (object with `.papers: SemanticPaper[]` and `.rateLimited: boolean`), NOT an array — always access `.papers`
- `searchOpenAlex(query, opts)` — opts does NOT accept `limit` param (only `yearFrom`, `yearTo`, `page`)
- `enrichFromDOAJ` catch fallback must return a typed object (not `{}`) to avoid TS2339 on property access

**Why:** These were silent runtime mismatches that became compile errors after the migration touched those files.
