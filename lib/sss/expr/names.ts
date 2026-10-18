/*
 * Every name the expression language knows: functions, constants, and the Greek words
 * accepted as parameter names. The keypad, the syntax help and the parser all read this
 * table, so a function is added in one place.
 */

export type Variable = "t" | "s" | "n" | "z";

export interface FnInfo {
  name: string;
  /** Other spellings accepted when typed. */
  aliases?: string[];
  /** Number of arguments. */
  arity: number;
  /** One-line description for the help. */
  help: string;
  /** Definition in LaTeX, shown in tooltips and the syntax help. */
  definition?: string;
  /** Only evaluated numerically: no closed-form transforms. */
  numericOnly?: boolean;
  group: "signal" | "function" | "numeric";
}

export const FUNCTIONS: FnInfo[] = [
  {
    name: "u",
    aliases: ["step", "heaviside"],
    arity: 1,
    group: "signal",
    help: "Unit step",
    definition: "u(t)=\\begin{cases}1,& t\\ge 0\\\\0,& t<0\\end{cases}",
  },
  {
    name: "delta",
    aliases: ["dirac", "impulse"],
    arity: 1,
    group: "signal",
    help: "Unit impulse (Dirac delta); Kronecker delta in discrete time",
    definition: "\\delta(t)=0\\ (t\\ne0),\\quad\\int_{-\\infty}^{\\infty}\\delta(t)\\,dt=1",
  },
  {
    name: "rect",
    arity: 1,
    group: "signal",
    help: "Rectangular pulse of width 1",
    definition: "\\operatorname{rect}(t)=\\begin{cases}1,& |t|<\\tfrac12\\\\0,& |t|>\\tfrac12\\end{cases}",
  },
  {
    name: "tri",
    arity: 1,
    group: "signal",
    help: "Triangular pulse of half-width 1",
    definition: "\\operatorname{tri}(t)=\\begin{cases}1-|t|,& |t|<1\\\\0,& |t|\\ge1\\end{cases}",
  },
  {
    name: "sinc",
    arity: 1,
    group: "signal",
    help: "Normalized sinc",
    definition: "\\operatorname{sinc}(t)=\\frac{\\sin(\\pi t)}{\\pi t},\\quad \\operatorname{sinc}(0)=1",
  },
  {
    name: "sgn",
    aliases: ["sign"],
    arity: 1,
    group: "signal",
    help: "Sign function",
    definition: "\\operatorname{sgn}(t)=\\begin{cases}1,& t>0\\\\0,& t=0\\\\-1,& t<0\\end{cases}",
  },
  {
    name: "ramp",
    arity: 1,
    group: "signal",
    help: "Unit ramp; r(t) also works",
    definition: "r(t)=t\\,u(t)",
  },
  { name: "sin", arity: 1, group: "function", help: "Sine" },
  { name: "cos", arity: 1, group: "function", help: "Cosine" },
  { name: "tan", arity: 1, group: "function", help: "Tangent" },
  { name: "sinh", arity: 1, group: "function", help: "Hyperbolic sine" },
  { name: "cosh", arity: 1, group: "function", help: "Hyperbolic cosine" },
  { name: "tanh", arity: 1, group: "function", help: "Hyperbolic tangent", numericOnly: true },
  { name: "asin", aliases: ["arcsin"], arity: 1, group: "function", help: "Inverse sine", numericOnly: true },
  { name: "acos", aliases: ["arccos"], arity: 1, group: "function", help: "Inverse cosine", numericOnly: true },
  { name: "atan", aliases: ["arctan"], arity: 1, group: "function", help: "Inverse tangent", numericOnly: true },
  { name: "exp", arity: 1, group: "function", help: "Exponential", definition: "\\exp(x)=e^{x}" },
  { name: "ln", arity: 1, group: "function", help: "Natural logarithm", numericOnly: true },
  { name: "log", arity: 1, group: "function", help: "Base-10 logarithm", numericOnly: true },
  { name: "sqrt", arity: 1, group: "function", help: "Square root" },
  { name: "abs", arity: 1, group: "function", help: "Absolute value; |x| also works" },
  { name: "floor", arity: 1, group: "numeric", help: "Round down", numericOnly: true },
  { name: "ceil", arity: 1, group: "numeric", help: "Round up", numericOnly: true },
  {
    name: "mod",
    arity: 2,
    group: "numeric",
    help: "Remainder, always ≥ 0: mod(t, 2) repeats every 2",
    numericOnly: true,
  },
  { name: "min", arity: 2, group: "numeric", help: "Smaller of two values", numericOnly: true },
  { name: "max", arity: 2, group: "numeric", help: "Larger of two values", numericOnly: true },
];

const BY_NAME = new Map<string, FnInfo>();
for (const f of FUNCTIONS) {
  BY_NAME.set(f.name, f);
  for (const a of f.aliases ?? []) BY_NAME.set(a, f);
}

/** The function a typed name refers to (aliases resolved), if any. */
export const lookupFunction = (name: string): FnInfo | undefined => BY_NAME.get(name);

export const CONSTANTS: Record<string, "pi" | "e" | "j"> = { pi: "pi", e: "e", j: "j", i: "j" };

/** Greek words accepted as parameter names, with their LaTeX. */
export const GREEK: Record<string, string> = {
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  lambda: "\\lambda",
  mu: "\\mu",
  omega: "\\omega",
  phi: "\\phi",
  sigma: "\\sigma",
  tau: "\\tau",
  theta: "\\theta",
  zeta: "\\zeta",
};

/** All words the tokenizer can match inside a longer run of letters. */
export const KNOWN_WORDS = [...BY_NAME.keys(), ...Object.keys(CONSTANTS), ...Object.keys(GREEK), "t", "s", "n", "z"];

/** LaTeX for a parameter name: a1 → a_{1}, w0 → \omega_{0}, alpha → \alpha. */
export function paramTex(name: string): string {
  const m = /^([A-Za-z]+)(\d*)$/.exec(name);
  if (!m) return name;
  const [, letters, digits] = m;
  let base = GREEK[letters] ?? letters;
  if (letters === "w") base = "\\omega";
  return digits ? `${base}_{${digits}}` : base;
}

/** Plain-text label for a parameter (sliders, tables). */
export function paramText(name: string): string {
  const greek: Record<string, string> = {
    alpha: "α",
    beta: "β",
    gamma: "γ",
    lambda: "λ",
    mu: "μ",
    omega: "ω",
    phi: "φ",
    sigma: "σ",
    tau: "τ",
    theta: "θ",
    zeta: "ζ",
    w: "ω",
  };
  const m = /^([A-Za-z]+)(\d*)$/.exec(name);
  if (!m) return name;
  const sub = m[2].replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
  return (greek[m[1]] ?? m[1]) + sub;
}

export interface KeypadKey {
  /** LaTeX shown on the key. */
  label: string;
  /** Text inserted; "|" marks where the caret goes (selection is wrapped there). */
  insert: string;
  /** Tooltip. */
  title: string;
  /** Definition shown in the tooltip, LaTeX. */
  definition?: string;
}

export interface KeypadGroup {
  name: string;
  keys: KeypadKey[];
}

const fnDef = (name: string) => lookupFunction(name)?.definition;

/** Keypad for a given variable (t, s or n). */
export function keypad(variable: Variable): KeypadGroup[] {
  const v = variable;
  const call = (name: string) => `${name}(|)`;
  const signals: KeypadKey[] =
    v === "s"
      ? []
      : [
          { label: `u(${v})`, insert: call("u"), title: "Unit step", definition: fnDef("u") },
          { label: `\\delta(${v})`, insert: call("delta"), title: "Impulse", definition: fnDef("delta") },
          ...(v === "t"
            ? [
                { label: "r(t)", insert: call("ramp"), title: "Ramp", definition: fnDef("ramp") },
                { label: "\\operatorname{rect}", insert: call("rect"), title: "Rectangular pulse", definition: fnDef("rect") },
                { label: "\\operatorname{tri}", insert: call("tri"), title: "Triangular pulse", definition: fnDef("tri") },
                { label: "\\operatorname{sinc}", insert: call("sinc"), title: "Sinc", definition: fnDef("sinc") },
                { label: "\\operatorname{sgn}", insert: call("sgn"), title: "Sign", definition: fnDef("sgn") },
              ]
            : []),
        ];
  return [
    ...(signals.length ? [{ name: "Signals", keys: signals }] : []),
    {
      name: "Functions",
      keys: [
        { label: "e^{x}", insert: "e^(|)", title: "Exponential" },
        { label: "\\sin", insert: call("sin"), title: "Sine" },
        { label: "\\cos", insert: call("cos"), title: "Cosine" },
        { label: "\\sinh", insert: call("sinh"), title: "Hyperbolic sine" },
        { label: "\\cosh", insert: call("cosh"), title: "Hyperbolic cosine" },
        { label: "\\sqrt{x}", insert: call("sqrt"), title: "Square root" },
        { label: "|x|", insert: "abs(|)", title: "Absolute value" },
      ],
    },
    {
      name: "Symbols",
      keys: [
        { label: "\\pi", insert: "pi", title: "π" },
        { label: "e", insert: "e", title: "Euler's number" },
        { label: "j", insert: "j", title: "Imaginary unit, j² = −1" },
        { label: "\\omega_0", insert: "w0", title: "A parameter named ω₀ (gets a slider)" },
        { label: "x^{n}", insert: "^(|)", title: "Power" },
        { label: "\\frac{a}{b}", insert: "(|)/()", title: "Fraction" },
        { label: "(\\,)", insert: "(|)", title: "Parentheses" },
      ],
    },
  ];
}
