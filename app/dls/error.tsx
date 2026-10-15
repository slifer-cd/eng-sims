"use client"; // Error boundaries must be Client Components.

import { Eraser, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { BUTTON_GLASS, BUTTON_RED, StatusPage } from "@/components/site/Glass";
import { SCRATCH_KEY } from "@/lib/storage/localKeys";

/**
 * The simulator crashed. The usual cause is an autosaved canvas draft it can't read,
 * so besides retrying, the user can clear that draft. Saved blocks are in IndexedDB
 * and are never touched.
 */
export default function SimulatorError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  function clearDraft() {
    if (!confirm("Clear the design on the canvas? Your saved blocks are kept.")) return;
    try {
      localStorage.removeItem(SCRATCH_KEY);
    } catch {
      // Blocked storage: the reload below starts empty anyway.
    }
    // A full reload, so the editor's in-memory copy of the draft goes too. The editor has
    // already unmounted, so its save-on-leave handler can't write the draft back.
    location.reload();
  }

  return (
    <StatusPage
      icon={TriangleAlert}
      code="Simulator error"
      title="The logic simulator crashed"
      tone="red"
      actions={
        <>
          <Link href="/" className={BUTTON_GLASS}>
            Back home
          </Link>
          <button type="button" onClick={clearDraft} className={BUTTON_GLASS}>
            <Eraser size={16} aria-hidden />
            Clear canvas draft
          </button>
          <button type="button" onClick={() => retry()} className={BUTTON_RED}>
            <RotateCcw size={16} aria-hidden />
            Try again
          </button>
        </>
      }
    >
      <p>
        Try again first. If it keeps crashing as soon as it opens, the design autosaved on the canvas may be
        damaged: clearing it starts you with an empty canvas. Your saved blocks are kept either way.
      </p>
      {error.message && <p className="mt-3 font-mono text-xs break-words">{error.message}</p>}
    </StatusPage>
  );
}
