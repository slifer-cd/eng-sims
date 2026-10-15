import { LoaderCircle } from "lucide-react";

/** The editor's frame (toolbar, side bars, canvas) while the simulator loads. */
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-hover";
  return (
    <div className="flex h-dvh flex-col" role="status" aria-label="Loading the logic simulator">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <span className="size-6 rounded-md bg-accent" />
        <span className={`${bar} h-3 w-20`} />
        <span className={`${bar} h-3 w-28`} />
        <span className={`${bar} ml-6 h-5 w-48`} />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="grid w-48 shrink-0 content-start gap-2.5 border-r border-line bg-panel p-3">
          <span className={`${bar} mb-1 h-3 w-24`} />
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`${bar} h-6`} />
          ))}
          <span className={`${bar} mt-3 mb-1 h-3 w-16`} />
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className={`${bar} h-6`} />
          ))}
        </aside>
        <main className="grid min-w-0 flex-1 place-items-center bg-canvas bg-[radial-gradient(ellipse_at_top,var(--canvas-glow),var(--canvas)_70%)]">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-5 py-3 shadow-sm">
            <LoaderCircle size={18} className="animate-spin text-accent" aria-hidden />
            <span className="font-medium">Loading the logic simulator…</span>
          </div>
        </main>
        <aside className="hidden w-64 shrink-0 border-l border-line bg-panel p-3 md:grid md:content-start md:gap-2.5">
          <span className={`${bar} h-3 w-24`} />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`${bar} h-8`} />
          ))}
        </aside>
      </div>
    </div>
  );
}
