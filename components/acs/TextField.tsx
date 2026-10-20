"use client";

import { useState } from "react";

/**
 * A text input that commits on Enter or blur, so typing makes one undo step. With `parse`,
 * text it rejects is marked and not committed.
 */
export function TextField(props: {
  label: string;
  value: string;
  help?: string;
  parse?: (raw: string) => number | null;
  onCommit: (raw: string, parsed?: number) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  const [bad, setBad] = useState(false);
  // Follow the value when it changes elsewhere, or comes back formatted after a commit.
  const [shown, setShown] = useState(props.value);
  if (shown !== props.value) {
    setShown(props.value);
    setDraft(props.value);
    setBad(false);
  }
  const commit = () => {
    if (draft === props.value) return;
    if (!props.parse) return props.onCommit(draft);
    const n = props.parse(draft);
    if (n === null) setBad(true);
    else props.onCommit(draft, n);
  };
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted">{props.label}</span>
      <input
        className={`rounded-md border bg-canvas px-2 py-1 font-mono outline-none ${bad ? "border-sig-x" : "border-line focus:border-accent"}`}
        aria-invalid={bad}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(props.value);
            setBad(false);
            e.currentTarget.blur();
          }
        }}
      />
      {bad ? (
        <span className="text-xs text-sig-x">Not a valid value</span>
      ) : (
        props.help && <span className="text-xs text-muted">{props.help}</span>
      )}
    </label>
  );
}
