/*
 * localStorage keys. The canvas draft lives here rather than in IndexedDB because it
 * must be written synchronously when the page goes away; blocks are in IndexedDB.
 */

/** The design on the canvas: `{ circuit, chipId }`. */
export const SCRATCH_KEY = "eng-sims:scratch";
/** The left bar's lists, as arranged in the Ctrl+L menu. */
export const PALETTE_KEY = "eng-sims:palette";
/** The signals & systems simulator's inputs (`/sss`): `{ v: 1, inputs }`. */
export const SSS_KEY = "eng-sims:sss";
/** The Bits & Logic inputs (`/calc`): `{ v: 1, inputs }`. */
export const CALC_KEY = "eng-sims:calc";
/** The circuit simulator's canvas and settings (`/acs`): `{ v: 1, circuit, settings }`. */
export const ACS_KEY = "eng-sims:acs";
