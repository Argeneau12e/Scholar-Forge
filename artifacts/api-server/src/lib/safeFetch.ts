/**
 * safeFetch — a domain-whitelisted wrapper around fetch.
 * Blocks requests to any domain not in ALLOWED_DOMAINS and to private IP ranges.
 * Adds a default 10-second timeout and a consistent User-Agent header.
 */

const ALLOWED_DOMAINS = new Set([
  "eutils.ncbi.nlm.nih.gov",
  "api.semanticscholar.org",
  "api.crossref.org",
  "api.openalex.org",
  "export.arxiv.org",
  "api.europepmc.org",
  "doaj.org",
  "api.core.ac.uk",
  "api.unpaywall.org",
]);

const PRIVATE_IP_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export async function safeFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`safeFetch: invalid URL — ${url}`);
  }

  if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
    throw new Error(
      `safeFetch: blocked request to unlisted domain "${parsed.hostname}"`
    );
  }

  if (PRIVATE_IP_RE.test(parsed.hostname)) {
    throw new Error(
      `safeFetch: blocked request to private IP range "${parsed.hostname}"`
    );
  }

  return fetch(url, {
    ...options,
    signal: (options.signal as AbortSignal | undefined) ?? AbortSignal.timeout(10_000),
    headers: {
      "User-Agent": "ScholarForge/1.0 (academic research assistant; open source)",
      ...(options.headers ?? {}),
    },
  });
}
