/*
 * Tokenizer. Runs of letters are split into known words and single letters, so `tu(t)`
 * reads as t·u(t) and `at` as a·t. Unicode symbols and a little LaTeX are accepted, with
 * offsets that always point into the original text (for error underlines).
 */

import type { Problem } from "./ast";
import { GREEK, KNOWN_WORDS } from "./names";

export type Tok =
  | { t: "num"; v: number; raw: string; from: number; to: number }
  | { t: "word"; w: string; from: number; to: number }
  | { t: "op"; op: "+" | "-" | "*" | "/" | "^"; from: number; to: number }
  | { t: "open"; ch: "(" | "[" | "{"; from: number; to: number }
  | { t: "close"; ch: ")" | "]" | "}"; from: number; to: number }
  | { t: "comma"; from: number; to: number }
  | { t: "bar"; from: number; to: number }
  | { t: "frac"; from: number; to: number }
  | { t: "end"; from: number; to: number };

const UNICODE_WORDS: Record<string, string> = {
  π: "pi",
  δ: "delta",
  ω: "omega",
  τ: "tau",
  α: "alpha",
  β: "beta",
  γ: "gamma",
  σ: "sigma",
  θ: "theta",
  φ: "phi",
  λ: "lambda",
  μ: "mu",
  ζ: "zeta",
  "√": "sqrt",
};
const UNICODE_OPS: Record<string, "+" | "-" | "*" | "/"> = {
  "·": "*",
  "×": "*",
  "∗": "*",
  "⋅": "*",
  "−": "-",
  "–": "-",
  "÷": "/",
};
const SUPERSCRIPTS: Record<string, string> = { "²": "2", "³": "3" };

const LATEX_WORDS: Record<string, string> = { cdot: "*", times: "*" };
const LATEX_SKIP = new Set(["left", "right", "mathrm", "operatorname", "displaystyle", "big", "Big"]);

const WORDS = [...new Set(KNOWN_WORDS)].sort((a, b) => b.length - a.length);
const KNOWN = new Set(KNOWN_WORDS);

/** Split a run of letters into known words, longest match first, else single letters. */
export function splitLetters(run: string): string[] {
  if (KNOWN.has(run)) return [run];
  const out: string[] = [];
  let i = 0;
  while (i < run.length) {
    const w = WORDS.find((word) => run.startsWith(word, i));
    if (w) {
      out.push(w);
      i += w.length;
    } else {
      out.push(run[i]);
      i++;
    }
  }
  return out;
}

export function tokenize(text: string): { ok: true; tokens: Tok[] } | { ok: false; error: Problem } {
  const tokens: Tok[] = [];
  let i = 0;
  const isLetter = (c: string) => /[A-Za-z]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);

  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(text[i + 1] ?? ""))) {
      let j = i;
      while (j < text.length && isDigit(text[j])) j++;
      if (text[j] === "." && isDigit(text[j + 1] ?? "")) {
        j++;
        while (j < text.length && isDigit(text[j])) j++;
      } else if (text[j] === "." && !isLetter(text[j + 1] ?? "")) {
        j++; // "2." is 2
      }
      const raw = text.slice(i, j);
      tokens.push({ t: "num", v: Number(raw), raw, from: i, to: j });
      i = j;
      continue;
    }
    if (isLetter(c)) {
      let j = i;
      while (j < text.length && isLetter(text[j])) j++;
      let k = j;
      while (k < text.length && isDigit(text[k])) k++;
      const parts = splitLetters(text.slice(i, j));
      let pos = i;
      parts.forEach((w, idx) => {
        const last = idx === parts.length - 1;
        // A single unknown letter followed by digits is a subscripted parameter: w0, a1.
        if (last && k > j && w.length === 1 && !KNOWN.has(w)) {
          tokens.push({ t: "word", w: w + text.slice(j, k), from: pos, to: k });
        } else {
          tokens.push({ t: "word", w, from: pos, to: pos + w.length });
        }
        pos += w.length;
      });
      const last = parts[parts.length - 1];
      if (k > j && (last.length > 1 || KNOWN.has(last))) {
        // Digits after a known word are a number: t2 = t·2.
        tokens.push({ t: "num", v: Number(text.slice(j, k)), raw: text.slice(j, k), from: j, to: k });
      }
      i = k;
      continue;
    }
    if (c === "\\") {
      let j = i + 1;
      while (j < text.length && isLetter(text[j])) j++;
      const cmd = text.slice(i + 1, j);
      if (cmd === "") {
        // \, \; \! \  are spacing.
        i = Math.min(text.length, i + 2);
        continue;
      }
      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
        tokens.push({ t: "frac", from: i, to: j });
        i = j;
        continue;
      }
      if (cmd === "operatorname" || cmd === "mathrm") {
        // \operatorname{rect} → the word inside the braces.
        const m = /^\{([A-Za-z]+)\}/.exec(text.slice(j));
        if (m) {
          tokens.push({ t: "word", w: m[1], from: i, to: j + m[0].length });
          i = j + m[0].length;
          continue;
        }
      }
      if (LATEX_SKIP.has(cmd)) {
        i = j;
        continue;
      }
      if (LATEX_WORDS[cmd]) {
        tokens.push({ t: "op", op: "*", from: i, to: j });
        i = j;
        continue;
      }
      if (KNOWN.has(cmd) || GREEK[cmd]) {
        tokens.push({ t: "word", w: cmd, from: i, to: j });
        i = j;
        continue;
      }
      return { ok: false, error: { message: `Unknown command \\${cmd}`, from: i, to: j } };
    }
    if (UNICODE_WORDS[c]) {
      tokens.push({ t: "word", w: UNICODE_WORDS[c], from: i, to: i + 1 });
      i++;
      continue;
    }
    if (UNICODE_OPS[c]) {
      tokens.push({ t: "op", op: UNICODE_OPS[c], from: i, to: i + 1 });
      i++;
      continue;
    }
    if (SUPERSCRIPTS[c]) {
      tokens.push({ t: "op", op: "^", from: i, to: i + 1 });
      tokens.push({ t: "num", v: Number(SUPERSCRIPTS[c]), raw: SUPERSCRIPTS[c], from: i, to: i + 1 });
      i++;
      continue;
    }
    if (c === "*" && text[i + 1] === "*") {
      tokens.push({ t: "op", op: "^", from: i, to: i + 2 });
      i += 2;
      continue;
    }
    if ("+-*/^".includes(c)) {
      tokens.push({ t: "op", op: c as "+" | "-" | "*" | "/" | "^", from: i, to: i + 1 });
      i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      tokens.push({ t: "open", ch: c, from: i, to: i + 1 });
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      tokens.push({ t: "close", ch: c, from: i, to: i + 1 });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ t: "comma", from: i, to: i + 1 });
      i++;
      continue;
    }
    if (c === "|") {
      tokens.push({ t: "bar", from: i, to: i + 1 });
      i++;
      continue;
    }
    return { ok: false, error: { message: `Unexpected character "${c}"`, from: i, to: i + 1 } };
  }
  tokens.push({ t: "end", from: text.length, to: text.length });
  return { ok: true, tokens };
}
