import { BookOpen, Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background/80 mt-auto py-6 px-6">
      <div className="max-w-5xl mx-auto space-y-3 text-center">
        <div className="flex items-center justify-center gap-2 text-primary">
          <BookOpen className="h-4 w-4" />
          <span className="font-serif font-semibold text-sm">ScholarForge</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Built for students, by students</span>
          <span className="opacity-30">·</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Github className="h-3 w-3" />
            Open Source
          </a>
          <span className="opacity-30">·</span>
          <span>MIT License</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Powered by</span>
          <a href="https://www.anthropic.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">Claude (Anthropic)</a>
          <span className="opacity-30">·</span>
          <a href="https://www.ncbi.nlm.nih.gov/pmc/" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">PubMed Central</a>
          <span className="opacity-30">·</span>
          <a href="https://www.semanticscholar.org" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">Semantic Scholar</a>
        </div>

        <p className="text-[11px] text-muted-foreground/50">
          ScholarForge is not affiliated with any university. Always verify AI-generated content.
        </p>
      </div>
    </footer>
  );
}
