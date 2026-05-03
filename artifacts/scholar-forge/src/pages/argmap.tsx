import { ArgumentMapper } from "@/components/ArgumentMapper";
import { GitBranch } from "lucide-react";

export default function ArgmapPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <GitBranch className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl text-foreground">Argument Map</h1>
        </div>
        <ArgumentMapper />
      </div>
    </div>
  );
}
