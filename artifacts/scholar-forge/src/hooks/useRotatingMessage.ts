import { useState, useEffect } from "react";

export function useRotatingMessage(messages: string[], intervalMs = 2000): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    setIndex(0);
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [messages.length, intervalMs]);

  return messages[index] ?? messages[0] ?? "";
}
