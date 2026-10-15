"use client"; // Error boundaries must be Client Components.

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { BUTTON_GLASS, BUTTON_RED, StatusPage } from "@/components/site/Glass";
// This page replaces the root layout, so it brings its own styles.
import "./globals.css";

/** Shown when the root layout itself fails. It renders the whole document. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong · Eng Sims</title>
        <StatusPage
          icon={TriangleAlert}
          code="Error"
          title="Eng Sims couldn't load"
          tone="red"
          actions={
            <>
              {/* A full page load rather than <Link>: the app's router may be what failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className={BUTTON_GLASS}>
                Back home
              </a>
              <button type="button" onClick={() => retry()} className={BUTTON_RED}>
                <RotateCcw size={16} aria-hidden />
                Try again
              </button>
            </>
          }
        >
          <p>Something failed before the page could start. Trying again often fixes it.</p>
          {error.digest && <p className="mt-2 font-mono text-xs">Reference: {error.digest}</p>}
        </StatusPage>
      </body>
    </html>
  );
}
