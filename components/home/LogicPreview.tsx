"use client";

import { useState } from "react";
import { halfAdder } from "@/lib/site/previews";
import { HalfAdderArt } from "./HalfAdderArt";
import { useAutoplay } from "./useAutoplay";

/**
 * The half adder from the logic simulator. It counts through the four input pairs by itself
 * until the visitor flips an input.
 */
export function LogicPreview() {
  const [inputs, setInputs] = useState({ a: true, b: true });
  const stop = useAutoplay(() => {
    setInputs(({ a, b }) => ({ a: a !== b, b: !b }));
  }, 1800);
  const { sum, carry } = halfAdder(inputs.a, inputs.b);
  return (
    <div>
      <HalfAdderArt
        {...inputs}
        onToggle={(input) => {
          stop();
          setInputs((s) => ({ ...s, [input]: !s[input] }));
        }}
      />
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>Click A or B to flip an input.</span>
        <output className="font-mono" aria-live="polite">
          {+inputs.a} + {+inputs.b} = {+carry}
          {+sum}
        </output>
      </div>
    </div>
  );
}
