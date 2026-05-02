import { CollectionWorkspace } from "@/components/CollectionWorkspace";
import { GapFinder } from "@/components/GapFinder";
import { LitReviewComposer } from "@/components/LitReviewComposer";

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
      </div>
    </div>
  );
}
