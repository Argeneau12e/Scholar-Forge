import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGroqKey } from "@/hooks/useGroqKey";

interface GroqKeyGateProps {
  open: boolean;
  onClose: () => void;
  mode?: "setup" | "change";
}

export function GroqKeyGate({ open, onClose, mode = "setup" }: GroqKeyGateProps) {
  const { save, clear } = useGroqKey();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function handleSave() {
    const trimmed = input.trim();
    if (!trimmed.startsWith("gsk_") || trimmed.length < 20) {
      setError("That doesn't look like a valid Groq API key (should start with gsk_).");
      return;
    }
    save(trimmed);
    setInput("");
    setError("");
    onClose();
  }

  function handleClear() {
    clear();
    setInput("");
    setError("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && mode === "change") onClose(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => { if (mode === "setup") e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {mode === "setup" ? "Enter your Groq API Key" : "Change Groq API Key"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            ScholarForge uses the{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              Groq API
            </a>{" "}
            (free tier available) to power all AI features. Your key is stored only in your browser — it is never sent to our servers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <Input
            type="password"
            placeholder="gsk_..."
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            {mode === "change" && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-destructive hover:text-destructive">
                Remove key
              </Button>
            )}
            {mode === "change" && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!input.trim()}>
              Save key
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Get a free key at{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              console.groq.com/keys
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
