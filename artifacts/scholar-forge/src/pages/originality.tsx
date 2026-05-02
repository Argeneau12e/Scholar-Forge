import { PlagiarismChecker } from "@/components/PlagiarismChecker";

export default function OriginalityPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <PlagiarismChecker />
    </div>
  );
}
