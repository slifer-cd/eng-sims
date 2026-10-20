/*
 * Keyboard shortcuts of the circuit simulator, as a pure mapping from a key press to an action
 * so they can be tested without a DOM.
 */

export type ShortcutAction =
  | "save"
  | "new"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "selectAll"
  | "rotate"
  | "flip"
  | "delete"
  | "cancel"
  | "run"
  | "step";

export type KeyPress = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/**
 * The action for a key press, or null. While `typing` (focus in a text field) only saving and
 * starting a new circuit apply. Alt shortcuts are matched by key code, because Alt+letter
 * types a symbol on macOS.
 */
export function shortcutFor(e: KeyPress, typing: boolean): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const alt = (code: string) => e.altKey && !mod && e.code === code;

  if (mod && key === "s") return "save";
  if (alt("KeyN")) return "new";
  if (typing) return null;
  if (mod && key === "z") return e.shiftKey ? "redo" : "undo";
  if (mod && key === "y") return "redo";
  if (mod && key === "c") return "copy";
  if (mod && key === "v") return "paste";
  if (mod && key === "a") return "selectAll";
  if (alt("KeyR")) return "rotate";
  if (alt("KeyF")) return "flip";
  if (key === "delete" || key === "backspace") return "delete";
  if (key === "escape") return "cancel";
  if (mod && key === "enter") return "run";
  if (mod && key === ".") return "step";
  return null;
}

/** Letters that pick up a part to place, alone and with Shift. */
const PART_KEYS: Record<string, { plain: string; shift?: string }> = {
  r: { plain: "resistor" },
  v: { plain: "vdc", shift: "vac" },
  c: { plain: "capacitor" },
  i: { plain: "inductor" },
  g: { plain: "ground" },
  d: { plain: "diode" },
  z: { plain: "zener" },
  n: { plain: "nmos", shift: "npn" },
  p: { plain: "pmos", shift: "pnp" },
  a: { plain: "opamp" },
  s: { plain: "switch" },
  b: { plain: "button" },
  l: { plain: "netlabel" },
};

/** The letter pressed: the typed one, or the physical key's when the layout types a non-Latin letter. */
function letterOf(e: KeyPress) {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  return /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : "";
}

/**
 * The part a letter key picks up, or null. Shift picks the letter's second part; Caps Lock
 * doesn't count as Shift. Ctrl, ⌘ and Alt combinations belong to the other shortcuts.
 */
export function partShortcut(e: KeyPress, typing: boolean): string | null {
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return null;
  const entry = PART_KEYS[letterOf(e)];
  if (!entry) return null;
  return (e.shiftKey ? entry.shift : entry.plain) ?? null;
}

/** The key that picks up a part, e.g. "R" or "Shift+V", for hints in the palette. */
export function partKeyLabel(partId: string): string | undefined {
  for (const [letter, entry] of Object.entries(PART_KEYS)) {
    if (entry.plain === partId) return letter.toUpperCase();
    if (entry.shift === partId) return `Shift+${letter.toUpperCase()}`;
  }
  return undefined;
}
