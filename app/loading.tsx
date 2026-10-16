import { LoaderCircle } from "lucide-react";
import { Backdrop, GLASS } from "@/components/site/Glass";

/** Shown while a page streams in. */
export default function Loading() {
  return (
    <div className="relative isolate grid min-h-dvh flex-1 place-items-center overflow-hidden">
      <Backdrop />
      <div role="status" className={`${GLASS} flex items-center gap-3 px-6 py-4`}>
        <LoaderCircle size={20} className="animate-spin text-blue-600 dark:text-sky-400" aria-hidden />
        <span className="font-medium">Loading…</span>
      </div>
    </div>
  );
}
