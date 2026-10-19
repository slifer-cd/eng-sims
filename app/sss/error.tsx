"use client"; // Error boundaries must be Client Components.

import { Eraser, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { BUTTON_OUTLINE, BUTTON_RED } from "@/components/site/Bench";
import { SSS_KEY } from "@/lib/storage/localKeys";

/**
 * The simulator crashed. If saved inputs trigger it every time, resetting them to the
 * examples gets the user going again.
 */
export default function SimulatorError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  function resetInputs() {
    if (!confirm("Reset every input on the signals & systems pages to its example?")) return;
    try {
      localStorage.removeItem(SSS_KEY);
    } catch {
      // Blocked storage: the reload below starts from the examples anyway.
    }
    // A full reload, so the in-memory copy of the inputs goes too.
    location.reload();
  }

  // Shown inside the simulator's frame, so the tool list stays usable.
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-line bg-panel p-6 text-center sm:p-8">
      <span className="mx-auto grid size-12 place-items-center rounded-md border border-red-600/30 bg-red-600/10 text-red-600 dark:text-red-400">
        <TriangleAlert size={24} aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance">This page crashed</h1>
      <p className="mt-2 text-pretty text-muted">
        Try again first. If it crashes again as soon as it opens, one of the saved expressions may be the cause: resetting the
        inputs brings back the examples.
      </p>
      {error.message && <p className="mt-3 font-mono text-xs break-words text-muted">{error.message}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className={BUTTON_OUTLINE}>
          Back home
        </Link>
        <button type="button" onClick={resetInputs} className={BUTTON_OUTLINE}>
          <Eraser size={16} aria-hidden />
          Reset inputs
        </button>
        <button type="button" onClick={() => retry()} className={BUTTON_RED}>
          <RotateCcw size={16} aria-hidden />
          Try again
        </button>
      </div>
    </div>
  );
}
