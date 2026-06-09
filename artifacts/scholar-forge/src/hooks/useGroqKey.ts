import { useState, useCallback } from "react";
import { getGroqKey, setGroqKey, clearGroqKey } from "@/lib/apiFetch";

export function useGroqKey() {
  const [key, setKey] = useState<string>(() => getGroqKey());

  const save = useCallback((newKey: string) => {
    const trimmed = newKey.trim();
    setGroqKey(trimmed);
    setKey(trimmed);
  }, []);

  const clear = useCallback(() => {
    clearGroqKey();
    setKey("");
  }, []);

  return { key, hasKey: key.length > 0, save, clear };
}
