"use client"; // Error boundaries must be Client Components.

import { Eraser, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { BUTTON_OUTLINE, BUTTON_RED, StatusPage } from "@/components/site/Bench";
import { ACS_KEY } from "@/lib/storage/localKeys";

/**
 * The circuit simulator crashed. The usual cause is an autosaved circuit it can't read,
 * so besides retrying, the user can clear that draft.
 */
export default function CircuitsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  function clearDraft() {
    if (!confirm("Clear the circuit on the canvas and the simulator settings?")) return;
    try {
      localStorage.removeItem(ACS_KEY);
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
      title="The circuit simulator crashed"
      tone="red"
      actions={
        <>
          <Link href="/" className={BUTTON_OUTLINE}>
            Back home
          </Link>
          <button type="button" onClick={clearDraft} className={BUTTON_OUTLINE}>
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
        Try again first. If it keeps crashing as soon as it opens, the circuit autosaved on the canvas may be damaged:
        clearing it starts you with an empty canvas.
      </p>
      {error.message && <p className="mt-3 font-mono text-xs break-words">{error.message}</p>}
    </StatusPage>
  );
}
