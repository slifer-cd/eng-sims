import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { type FaceItem, LED_COLORS, faceLocation } from "@/lib/editor/displays";
import type { FacePlacement } from "@/lib/editor/layout";
import { useSim } from "@/lib/editor/simStore";
import { SEGMENTS } from "@/lib/sim/builtins";
import { SCREEN_SIZE, type ScreenState } from "@/lib/sim/display";
import type { Value } from "@/lib/sim/value";

/*
 * Display faces read the engine themselves rather than through the Canvas, so only
 * a display whose values changed re-renders. Screens and lights stay dark whatever
 * the theme. Colours are inline, not theme tokens, because they're the display's own.
 */

/** Body colour of a display: its bezel on a block, or the whole part on its own. */
export const BEZEL = "#0a0d12";
/** Pin labels on a display part's dark body. */
export const BEZEL_TEXT = "#8b98ad";
const UNLIT = "#1c2230";

const isHigh = (v: Value | undefined) => !!v && v.z === 0 && v.x === 0 && v.v === 1;
const litColor = (props: FaceItem["props"]) => LED_COLORS[String(props.color)] ?? LED_COLORS.red;

interface Props {
  /** Instance path of the placed component ("" on the canvas) and its id. */
  path: string;
  compId: string;
  place: FacePlacement;
}

export const DisplayView = memo(function DisplayView({ path, compId, place }: Props) {
  const at = faceLocation(path, compId, place.item.route);
  const { x, y, item } = place;
  const box = { at, item, w: place.w, h: place.h, bare: !!place.bare };
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {item.kind === "led" && <Led {...box} />}
      {item.kind === "seg7" && <SevenSeg {...box} />}
      {(item.kind === "dotmatrix" || item.kind === "rgbmatrix") && <Screen {...box} />}
    </g>
  );
});

/** A display drawn to fit a w×h box. A bare one is the part's whole body, so it draws no bezel. */
interface BoxProps {
  at: { path: string; compId: string };
  item: FaceItem;
  w: number;
  h: number;
  bare: boolean;
}

function Led({ at, item, w, h, bare }: BoxProps) {
  const on = useSim((s) => isHigh(s.engine?.pinValue(at.path, at.compId, "in")));
  const color = litColor(item.props);
  const r = Math.min(w, h) / 2;
  return (
    <>
      {!bare && <circle cx={w / 2} cy={h / 2} r={r} fill={BEZEL} />}
      <circle
        cx={w / 2}
        cy={h / 2}
        r={r - (bare ? 6 : 3)}
        fill={color}
        opacity={on ? 1 : 0.18}
        style={on ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}
      />
    </>
  );
}

/** Digit size before scaling; the decimal point sits to the right. */
const DIGIT_W = 34, DIGIT_H = 72, T = 7, GAP = 1;
const SLANT = Math.tan((6 * Math.PI) / 180);
/** Width of the slanted digit and its point. */
const DIGIT_SPAN = DIGIT_W + 10 + SLANT * DIGIT_H;

function segmentRects(): Record<string, { x: number; y: number; w: number; h: number }> {
  const across = DIGIT_W - 2 * T - 2 * GAP;
  const down = DIGIT_H / 2 - 1.5 * T - 2 * GAP;
  const upper = T + GAP, lower = DIGIT_H / 2 + T / 2 + GAP;
  return {
    a: { x: T + GAP, y: 0, w: across, h: T },
    b: { x: DIGIT_W - T, y: upper, w: T, h: down },
    c: { x: DIGIT_W - T, y: lower, w: T, h: down },
    d: { x: T + GAP, y: DIGIT_H - T, w: across, h: T },
    e: { x: 0, y: lower, w: T, h: down },
    f: { x: 0, y: upper, w: T, h: down },
    g: { x: T + GAP, y: DIGIT_H / 2 - T / 2, w: across, h: T },
  };
}
const SEGMENT_RECTS = segmentRects();

function SevenSeg({ at, item, w, h, bare }: BoxProps) {
  const lit = useSim(useShallow((s) => SEGMENTS.map((p) => isHigh(s.engine?.pinValue(at.path, at.compId, p)))));
  const color = litColor(item.props);
  const pad = bare ? 12 : 8;
  const k = Math.min((w - 2 * pad) / DIGIT_SPAN, (h - 2 * pad) / DIGIT_H);
  // Centre the digit and its point; the slant pulls the bottom left.
  const ox = (w - DIGIT_SPAN * k) / 2 + SLANT * DIGIT_H * k, oy = (h - DIGIT_H * k) / 2;
  const style = (on: boolean) => ({ fill: color, opacity: on ? 1 : 0.13 });
  return (
    <>
      {!bare && <rect width={w} height={h} rx={4} fill={BEZEL} />}
      <g transform={`translate(${ox} ${oy}) scale(${k}) skewX(-6)`}>
        {SEGMENTS.slice(0, 7).map((s, i) => {
          const r = SEGMENT_RECTS[s];
          return <rect key={s} x={r.x} y={r.y} width={r.w} height={r.h} rx={T / 2} style={style(lit[i])} />;
        })}
        <circle cx={DIGIT_W + 6} cy={DIGIT_H - T / 2} r={T / 2 + 0.5} style={style(lit[7])} />
      </g>
    </>
  );
}

function Screen({ at, item, w, h, bare }: BoxProps) {
  const screen = useSim((s) => (s.engine?.state(at.path, at.compId) as ScreenState | undefined)?.screen);
  const rgb = item.kind === "rgbmatrix";
  const on = litColor(item.props);
  const pad = bare ? 10 : 4;
  const cell = (Math.min(w, h) - 2 * pad) / SCREEN_SIZE;
  const ox = (w - cell * SCREEN_SIZE) / 2, oy = (h - cell * SCREEN_SIZE) / 2;
  const color = (v: number) => (!v ? UNLIT : rgb ? `#${v.toString(16).padStart(3, "0")}` : on);
  return (
    <>
      {!bare && <rect width={w} height={h} rx={4} fill={BEZEL} />}
      {Array.from({ length: SCREEN_SIZE * SCREEN_SIZE }, (_, i) => (
        <rect
          key={i}
          x={ox + (i % SCREEN_SIZE) * cell + 0.5}
          y={oy + Math.floor(i / SCREEN_SIZE) * cell + 0.5}
          width={cell - 1}
          height={cell - 1}
          rx={cell / 5}
          fill={color(screen?.[i] ?? 0)}
        />
      ))}
    </>
  );
}
