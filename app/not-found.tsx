import { ArrowRight, Unplug } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BUTTON_PRIMARY, BUTTON_GLASS, StatusPage } from "@/components/site/Glass";

export const metadata: Metadata = {
  title: "Page not found · Eng Sims",
};

/** Shown for any URL that doesn't match a page, and wherever `notFound()` is called. */
export default function NotFound() {
  return (
    <StatusPage
      icon={Unplug}
      code="404"
      title="This wire leads nowhere"
      actions={
        <>
          <Link href="/" className={BUTTON_GLASS}>
            Back home
          </Link>
          <Link href="/dls" className={BUTTON_PRIMARY}>
            Open the logic simulator
            <ArrowRight size={17} aria-hidden />
          </Link>
        </>
      }
    >
      The page you asked for doesn&apos;t exist. It may have moved: the logic simulator now lives at{" "}
      <code className="font-mono text-foreground">/dls</code>.
    </StatusPage>
  );
}
