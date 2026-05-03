import { GapFinder } from "@/components/GapFinder";
import { Lightbulb } from "lucide-react";

export default function GapsPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl text-foreground">Gap Finder</h1>
        </div>
        <GapFinder />
      </div>
    </div>
  );
}
