import { describe, expect, it } from "vitest";
import { PARTS } from "../parts";
import { type KeyPress, partKeyLabel, partShortcut, shortcutFor } from "./shortcuts";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcutFor", () => {
  it("rotates with Alt+R and flips with Alt+F", () => {
    expect(shortcutFor(press("r", { altKey: true }), false)).toBe("rotate");
    expect(shortcutFor(press("f", { altKey: true }), false)).toBe("flip");
  });

  it("leaves plain R and F alone", () => {
    expect(shortcutFor(press("r"), false)).toBeNull();
    expect(shortcutFor(press("f"), false)).toBeNull();
    expect(shortcutFor(press("R", { shiftKey: true }), false)).toBeNull();
  });

  it("matches Alt+R and Alt+F by key code, as macOS types a symbol for them", () => {
    expect(shortcutFor({ ...press("r", { altKey: true }), key: "®" }, false)).toBe("rotate");
    expect(shortcutFor({ ...press("f", { altKey: true }), key: "ƒ" }, false)).toBe("flip");
  });

  it("doesn't rotate or flip with Ctrl or ⌘ held too, or while typing", () => {
    expect(shortcutFor(press("r", { altKey: true, ctrlKey: true }), false)).toBeNull();
    expect(shortcutFor(press("f", { altKey: true, metaKey: true }), false)).toBeNull();
    expect(shortcutFor(press("r", { altKey: true }), true)).toBeNull();
  });

  it("keeps the other shortcuts", () => {
    expect(shortcutFor(press("z", { ctrlKey: true }), false)).toBe("undo");
    expect(shortcutFor(press("z", { metaKey: true, shiftKey: true }), false)).toBe("redo");
    expect(shortcutFor(press("y", { ctrlKey: true }), false)).toBe("redo");
    expect(shortcutFor(press("c", { ctrlKey: true }), false)).toBe("copy");
    expect(shortcutFor(press("v", { ctrlKey: true }), false)).toBe("paste");
    expect(shortcutFor(press("a", { ctrlKey: true }), false)).toBe("selectAll");
    expect(shortcutFor(press("Delete"), false)).toBe("delete");
    expect(shortcutFor(press("Backspace"), false)).toBe("delete");
    expect(shortcutFor(press("Escape"), false)).toBe("cancel");
    expect(shortcutFor(press("Enter", { ctrlKey: true }), false)).toBe("run");
    expect(shortcutFor(press(".", { ctrlKey: true }), false)).toBe("step");
  });

  it("saves and starts a new circuit even from a text field, but nothing else", () => {
    expect(shortcutFor(press("s", { ctrlKey: true }), true)).toBe("save");
    expect(shortcutFor(press("n", { altKey: true }), true)).toBe("new");
    expect(shortcutFor(press("z", { ctrlKey: true }), true)).toBeNull();
    expect(shortcutFor(press("Delete"), true)).toBeNull();
  });
});

describe("partShortcut", () => {
  it.each([
    ["r", "resistor"],
    ["v", "vdc"],
    ["c", "capacitor"],
    ["i", "inductor"],
    ["g", "ground"],
    ["d", "diode"],
    ["z", "zener"],
    ["n", "nmos"],
    ["p", "pmos"],
    ["a", "opamp"],
    ["s", "switch"],
    ["b", "button"],
    ["l", "netlabel"],
  ])("picks up a part with %s", (key, part) => {
    expect(partShortcut(press(key), false)).toBe(part);
  });

  it.each([
    ["V", "vac"],
    ["N", "npn"],
    ["P", "pnp"],
  ])("picks up the other kind with Shift+%s", (key, part) => {
    expect(partShortcut(press(key, { shiftKey: true }), false)).toBe(part);
  });

  it("goes by Shift, not by the letter's case, so Caps Lock doesn't change the part", () => {
    expect(partShortcut(press("V"), false)).toBe("vdc");
    expect(partShortcut(press("v", { shiftKey: true }), false)).toBe("vac");
  });

  it("uses the physical key when the layout types a non-Latin letter", () => {
    expect(partShortcut({ ...press("r"), key: "ق" }, false)).toBe("resistor");
    expect(partShortcut({ ...press("v", { shiftKey: true }), key: "ر" }, false)).toBe("vac");
  });

  it("does nothing for Shift with a letter that has no second part, or for other letters", () => {
    expect(partShortcut(press("R", { shiftKey: true }), false)).toBeNull();
    expect(partShortcut(press("x"), false)).toBeNull();
    expect(partShortcut(press("1"), false)).toBeNull();
  });

  it("leaves Ctrl, ⌘ and Alt combinations to the other shortcuts, and does nothing while typing", () => {
    expect(partShortcut(press("v", { ctrlKey: true }), false)).toBeNull();
    expect(partShortcut(press("c", { metaKey: true }), false)).toBeNull();
    expect(partShortcut(press("r", { altKey: true }), false)).toBeNull();
    expect(partShortcut(press("r"), true)).toBeNull();
  });

  it("only names parts that exist", () => {
    for (const key of "rvcigdznpasbl") {
      for (const shiftKey of [false, true]) {
        const part = partShortcut(press(key, { shiftKey }), false);
        if (part) expect(PARTS.has(part), part).toBe(true);
      }
    }
  });
});

describe("partKeyLabel", () => {
  it("names the key for a part, if it has one", () => {
    expect(partKeyLabel("resistor")).toBe("R");
    expect(partKeyLabel("vac")).toBe("Shift+V");
    expect(partKeyLabel("npn")).toBe("Shift+N");
    expect(partKeyLabel("probe")).toBeUndefined();
  });
});
