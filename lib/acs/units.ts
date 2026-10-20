/*
 * SI prefixes for typed-in part values. Lowercase m is milli and uppercase M is mega;
 * "meg" (any case) is also mega, as in SPICE. "4k7" and "2R2" mean 4.7k and 2.2.
 */

const PREFIX: Record<string, number> = {
  a: -18, f: -15, p: -12, n: -9, u: -6, "µ": -6, "μ": -6, m: -3, "": 0, k: 3, K: 3, M: 6, G: 9, T: 12,
};
const NAMES: Record<number, string> = { [-18]: "a", [-15]: "f", [-12]: "p", [-9]: "n", [-6]: "µ", [-3]: "m", 0: "", 3: "k", 6: "M", 9: "G", 12: "T" };

/** A unit written after the value only labels the number, so it is ignored. */
const UNIT = "(?:Ω|ohms?|F|H|V|A|Hz|s|W|°|deg)?";
const NUMBER = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/;
// Case-sensitive, so F (farad) is a unit while f (femto) is a prefix.
const SUFFIX = new RegExp(`^([mM][eE][gG]|[afpnuµμmkKMGT])?\\s*${UNIT}$`);
const INFIX = new RegExp(`^([+-]?\\d+)([afpnuµμmkKMGTR])(\\d+)\\s*${UNIT}$`);

const exponent = (prefix: string | undefined) =>
  !prefix || prefix === "R" ? 0 : prefix.length === 3 ? 6 : PREFIX[prefix];

/** Read a value such as "4.7k", "10 µF" or "4k7". Returns null if it isn't a number. */
export function parseSI(text: string): number | null {
  const s = text.trim();
  const infix = INFIX.exec(s);
  if (infix) return Number(`${infix[1]}.${infix[3]}`) * 10 ** exponent(infix[2]);
  const m = NUMBER.exec(s);
  const suffix = m && SUFFIX.exec(m[2]);
  if (!m || !suffix) return null;
  const v = Number(m[1]) * 10 ** exponent(suffix[1]);
  return Number.isFinite(v) ? v : null;
}

/** Write a value with an engineering prefix and 3 significant figures (or `digits`): 4700 → "4.7 kΩ". */
export function formatSI(value: number, unit = "", digits = 3): string {
  if (!Number.isFinite(value)) return `${value}${unit ? " " + unit : ""}`;
  const join = (n: number, prefix: string) => (prefix || unit ? `${n} ${prefix}${unit}` : `${n}`);
  if (value === 0) return join(0, "");
  let exp = Math.max(-18, Math.min(12, Math.floor(Math.log10(Math.abs(value)) / 3) * 3));
  const round = (x: number) => {
    const decimals = digits - (Math.floor(Math.log10(Math.abs(x))) + 1);
    return Number(x.toFixed(Math.max(0, Math.min(20, decimals))));
  };
  let n = round(value * 10 ** -exp);
  if (Math.abs(n) >= 1000 && exp < 12) {
    exp += 3;
    n = round(n / 1000);
  }
  return join(n, NAMES[exp]);
}
