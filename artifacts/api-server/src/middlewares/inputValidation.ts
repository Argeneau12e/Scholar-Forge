/**
 * Input validation middleware helpers.
 * Applied in route handlers for critical user-supplied fields.
 */

/** Strip null bytes and control characters that can cause parsing issues */
export function sanitizeString(input: unknown, maxLength = 10000): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, maxLength)
    .trim();
}

/** Validate a string is a plausible email (coarse check) */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Ensure a number is within a safe integer range */
export function clampInt(value: unknown, min: number, max: number, defaultVal: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Validate a URL is http/https and not an internal address */
const PRIVATE_IP_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (PRIVATE_IP_RE.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Strip HTML tags from user content that may be displayed */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ");
}
