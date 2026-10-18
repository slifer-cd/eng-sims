import { LoaderCircle } from "lucide-react";

/** The simulator's frame (input, plots, result) while a page loads. */
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-hover";
  return (
    <div role="status" aria-label="Loading the signals and systems simulator" className="flex flex-col gap-5">
      <span className={`${bar} h-7 w-56`} />
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <span className={`${bar} h-10 w-full`} />
        <span className={`${bar} h-8 w-2/3`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="grid h-72 place-items-center rounded-xl border border-line bg-panel">
          <div className="flex items-center gap-3 text-muted">
            <LoaderCircle size={18} className="animate-spin text-accent" aria-hidden />
            Loading…
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`${bar} h-6`} />
          ))}
        </div>
      </div>
    </div>
  );
}
