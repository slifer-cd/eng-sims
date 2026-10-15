"use client"; // Error boundaries must be Client Components.

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { BUTTON_GLASS, BUTTON_RED, StatusPage } from "@/components/site/Glass";

/** Shown when a page throws while rendering. The root layout stays in place. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      icon={TriangleAlert}
      code="Error"
      title="Something went wrong"
      tone="red"
      actions={
        <>
          <Link href="/" className={BUTTON_GLASS}>
            Back home
          </Link>
          <button type="button" onClick={() => retry()} className={BUTTON_RED}>
            <RotateCcw size={16} aria-hidden />
            Try again
          </button>
        </>
      }
    >
      <p>This page hit an unexpected problem. Trying again often fixes it.</p>
      {error.digest && <p className="mt-2 font-mono text-xs">Reference: {error.digest}</p>}
    </StatusPage>
  );
}
