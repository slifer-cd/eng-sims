"use client";

import { keypad, type Variable } from "@/lib/sss/expr/names";
import { Tex } from "./Tex";

/** Symbol buttons that insert templates at the caret, with definitions on hover. */
export function Keypad(props: { variable: Variable; onInsert: (template: string) => void }) {
  const groups = keypad(props.variable);
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border border-line bg-canvas/60 p-3">
      {groups.map((g) => (
        <div key={g.name} className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">{g.name}</span>
          <div className="flex flex-wrap gap-1">
            {g.keys.map((k) => (
              <span key={k.insert + k.label} className="group relative">
                <button
                  type="button"
                  // Keep the caret in the input: don't take focus on mousedown.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => props.onInsert(k.insert)}
                  aria-label={`Insert ${k.title}`}
                  className="flex h-8 min-w-9 items-center justify-center rounded-md border border-line bg-panel px-2 text-[0.95rem] hover:border-accent/50 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Tex tex={k.label} />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-72 -translate-x-1/2 rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-lg group-hover:visible group-focus-within:visible"
                >
                  <span className="block font-medium">{k.title}</span>
                  {k.definition && <Tex tex={k.definition} className="mt-1 block text-[0.95rem]" />}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
