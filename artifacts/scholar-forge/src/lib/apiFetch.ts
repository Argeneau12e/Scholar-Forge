export const GROQ_KEY_STORAGE = "sf_groq_key";

export function getGroqKey(): string {
  try {
    return localStorage.getItem(GROQ_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setGroqKey(key: string): void {
  try {
    localStorage.setItem(GROQ_KEY_STORAGE, key.trim());
  } catch {
    // ignore
  }
}

export function clearGroqKey(): void {
  try {
    localStorage.removeItem(GROQ_KEY_STORAGE);
  } catch {
    // ignore
  }
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const key = getGroqKey();
  const existingHeaders = options.headers instanceof Headers
    ? Object.fromEntries(options.headers.entries())
    : (options.headers ?? {}) as Record<string, string>;

  return fetch(url, {
    ...options,
    headers: {
      ...existingHeaders,
      ...(key ? { "x-groq-api-key": key } : {}),
    },
  });
}
