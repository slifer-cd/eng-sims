"use client";

import { Binary, Diff, Grid2x2Check, Hash, type LucideIcon, Sigma, SquareFunction } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCalcPersistence } from "@/lib/calc/store";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Pages listed in the left bar. */
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Numbers",
    items: [
      { href: "/calc", label: "Number bases", icon: Hash },
      { href: "/calc/signed", label: "Signed integers", icon: Diff },
      { href: "/calc/float", label: "Floating point", icon: Sigma },
    ],
  },
  {
    group: "Logic",
    items: [
      { href: "/calc/boolean", label: "Truth table", icon: SquareFunction },
      { href: "/calc/kmap", label: "K-map minimiser", icon: Grid2x2Check },
    ],
  },
];

function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Bits & Logic pages" className="flex gap-1 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
      {NAV.map((g) => (
        <div key={g.group} className="flex shrink-0 gap-1 md:flex-col">
          <h2 className="hidden px-2 pb-1 text-xs font-medium text-muted md:block">{g.group}</h2>
          {g.items.map((item) => {
            const active = path === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap ${
                  active ? "bg-accent/12 font-medium text-accent" : "hover:bg-hover"
                }`}
              >
                <Icon size={16} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** The Bits & Logic frame: top bar, page list and the scrolling page. */
export function CalcShell({ children }: { children: ReactNode }) {
  useCalcPersistence();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-40 flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel bg-linear-to-r from-accent/15 via-panel to-panel px-3">
        <Link href="/" title="Back to the home page" className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-hover">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-white shadow-sm">
            <Binary size={14} aria-hidden />
          </span>
          Eng Sims
        </Link>
        <span className="mx-1 text-muted" aria-hidden>
          /
        </span>
        <span className="text-sm font-semibold">Bits &amp; Logic</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-line bg-panel px-2 py-2 md:sticky md:top-11 md:h-[calc(100dvh-2.75rem)] md:w-52 md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-4">
          <Nav />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[88rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
