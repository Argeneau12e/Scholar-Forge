import { CollectionWorkspace } from "@/components/CollectionWorkspace";
import { GapFinder } from "@/components/GapFinder";

export default function CollectionPage() {
  return (
    <div className="space-y-10 pb-20">
      <CollectionWorkspace />
      <div className="max-w-4xl mx-auto px-4">
        <div className="border-t border-dashed border-border pt-8">
          <GapFinder />
        </div>
      </div>
    </div>
  );
}
