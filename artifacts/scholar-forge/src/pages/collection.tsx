import { Suspense, lazy } from "react";
import { CollectionWorkspace } from "@/components/CollectionWorkspace";
import { GapFinder } from "@/components/GapFinder";
import { LitReviewComposer } from "@/components/LitReviewComposer";

const ArgumentMapper = lazy(() =>
  import("@/components/ArgumentMapper").then((m) => ({ default: m.ArgumentMapper }))
);

function MapperFallback() {
  return (
    <div className="rounded-2xl border bg-card p-8 flex flex-col items-center gap-3 text-muted-foreground">
      <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-sm">Loading Argument Mapper…</p>
    </div>
  );
}

export default function CollectionPage() {
  return (
    <div className="space-y-10 pb-24">
      <CollectionWorkspace />

      <div className="max-w-4xl mx-auto px-4 space-y-10">
        <div className="border-t border-dashed border-border pt-8">
          <GapFinder />
        </div>

        <div className="border-t border-dashed border-border pt-8">
          <LitReviewComposer />
        </div>

        <div className="border-t border-dashed border-border pt-8">
          <Suspense fallback={<MapperFallback />}>
            <ArgumentMapper />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
