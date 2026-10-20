"use client";

import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { WIRE_IDLE } from "@/lib/acs/editor/colors";
import { useAcsEditor } from "@/lib/acs/editor/store";
import { GROUP_TITLES, PARTS, type PartGroup, type PartSpec, partProps } from "@/lib/acs/parts";
import { PartSymbol } from "./symbols";

const PLACE_HINT = "Click, then click on the canvas, or drag onto the canvas. Shift-click places several.";

const matches = (spec: PartSpec, query: string) =>
  [spec.name, spec.id, ...(spec.keywords ?? [])].some((w) => w.toLowerCase().includes(query));

export function Palette() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = (Object.keys(GROUP_TITLES) as PartGroup[])
    .map((g) => ({ id: g, parts: [...PARTS.values()].filter((p) => p.group === g && (!q || matches(p, q))) }))
    .filter((g) => g.parts.length > 0);

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-panel text-sm">
      <label className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search size={14} className="text-muted" aria-hidden />
        <input
          type="search"
          placeholder="Find a part"
          aria-label="Find a part"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {groups.map((g) => (
          // Re-keyed while searching, so a list closed earlier opens to show its matches.
          <Group key={`${g.id}${q ? "-q" : ""}`} title={GROUP_TITLES[g.id]}>
            {g.parts.map((spec) => (
              <PlaceButton key={spec.id} spec={spec} />
            ))}
          </Group>
        ))}
        {groups.length === 0 && <p className="text-xs text-muted">No part matches “{query}”.</p>}
      </div>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <section className="mb-4">
      <h2 className="mb-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          title={open ? `Collapse ${title}` : `Expand ${title}`}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-xs font-semibold tracking-wide text-accent uppercase hover:bg-hover"
        >
          {title}
          <Chevron size={14} aria-hidden />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="grid gap-0.5">
          {children}
        </div>
      )}
    </section>
  );
}

/** The part's symbol, scaled to fit an icon. */
function PartIcon({ spec }: { spec: PartSpec }) {
  const xs = [...spec.terminals.map((t) => t.x), -spec.bounds.w / 2, spec.bounds.w / 2];
  const ys = [...spec.terminals.map((t) => t.y), -spec.bounds.h / 2, spec.bounds.h / 2];
  const x0 = Math.min(...xs) - 3, y0 = Math.min(...ys) - 3;
  const w = Math.max(...xs) + 3 - x0, h = Math.max(...ys) + 3 - y0;
  const side = Math.max(w, h);
  return (
    <svg
      viewBox={`${x0 - (side - w) / 2} ${y0 - (side - h) / 2} ${side} ${side}`}
      className="size-6 shrink-0"
      aria-hidden
    >
      <PartSymbol
        partId={spec.id}
        props={partProps(spec, {})}
        style="ansi"
        lead={() => WIRE_IDLE}
        uid={`icon-${spec.id}`}
        upright=""
      />
    </svg>
  );
}

function PlaceButton({ spec }: { spec: PartSpec }) {
  const active = useAcsEditor((s) => s.placing?.partId === spec.id);
  const setPlacing = useAcsEditor((s) => s.setPlacing);
  return (
    <button
      type="button"
      title={PLACE_HINT}
      className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left select-none ${
        active ? "bg-accent text-white" : "hover:bg-hover"
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        setPlacing({ partId: spec.id, fromDrag: true });
      }}
      // Released on the palette itself: switch to click-to-place.
      onPointerUp={() => setPlacing({ partId: spec.id, fromDrag: false })}
    >
      <PartIcon spec={spec} />
      <span className="truncate">{spec.name}</span>
    </button>
  );
}
