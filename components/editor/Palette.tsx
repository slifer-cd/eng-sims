"use client";

import { useEditor } from "@/lib/editor/store";
import { getBuiltin } from "@/lib/sim/builtins";

const GROUPS: { title: string; ids: string[] }[] = [
  { title: "Inputs & outputs", ids: ["input", "output", "clock", "vdd", "gnd"] },
  { title: "Gates", ids: ["not", "and", "or", "nand", "nor", "xor", "xnor"] },
  { title: "Wiring", ids: ["tristate", "splitter", "merger"] },
];

export function Palette() {
  const placing = useEditor((s) => s.placing);
  const setPlacing = useEditor((s) => s.setPlacing);

  return (
    <aside className="w-48 shrink-0 overflow-y-auto border-r border-line bg-panel p-3 text-sm">
      {GROUPS.map((g) => (
        <section key={g.title} className="mb-4">
          <h2 className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">{g.title}</h2>
          <div className="grid gap-1">
            {g.ids.map((id) => {
              const spec = getBuiltin(id)!;
              const active = placing?.chipId === id;
              return (
                <button
                  key={id}
                  type="button"
                  title="Click, then click on the canvas, or drag onto the canvas. Shift-click places several."
                  className={`rounded-md px-2 py-1.5 text-left select-none ${active ? "bg-accent text-white" : "hover:bg-hover"}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setPlacing({ chipId: id, props: {}, fromDrag: true });
                  }}
                  // Released on the palette itself: switch to click-to-place.
                  onPointerUp={() => setPlacing({ chipId: id, props: {}, fromDrag: false })}
                >
                  {spec.name}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
}
