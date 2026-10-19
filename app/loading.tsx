import { LoaderCircle } from "lucide-react";
import { GraphPaper, PANEL } from "@/components/site/Bench";

/** Shown while a page streams in. */
export default function Loading() {
  return (
    <div className="relative isolate grid min-h-dvh flex-1 place-items-center overflow-hidden">
      <GraphPaper />
      <div role="status" className={`${PANEL} flex items-center gap-3 px-6 py-4`}>
        <LoaderCircle size={20} className="animate-spin text-accent" aria-hidden />
        <span className="font-medium">Loading…</span>
      </div>
    </div>
  );
}
