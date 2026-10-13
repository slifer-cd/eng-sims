"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GRID, projectOntoPolyline, snap, snapPoint } from "@/lib/editor/layout";
import { type MovePreview, buildScene, sceneComp } from "@/lib/editor/scene";
import { useSim } from "@/lib/editor/simStore";
import { useEditor } from "@/lib/editor/store";
import type { Endpoint, Point } from "@/lib/model/types";
import type { Engine } from "@/lib/sim/engine";
import { ChipView } from "./ChipView";
import { WirePreview, WireView } from "./WireView";

type Gesture =
  | { kind: "pan"; startX: number; startY: number; vx: number; vy: number }
  | {
      kind: "move";
      start: Point;
      compIds: string[];
      wireIds: string[];
      /** Input Pin bit to toggle if the press ends without dragging. */
      toggle?: { compId: string; bit: number; width: number };
    }
  | { kind: "box"; start: Point; additive: boolean };

interface Hit {
  kind: "comp" | "pin" | "wire";
  compId?: string;
  pinId?: string;
  wireId?: string;
  bit?: number;
}

function hitTest(target: EventTarget | null): Hit | null {
  const el = (target as Element | null)?.closest?.("[data-hit]") as HTMLElement | SVGElement | null;
  if (!el) return null;
  const d = el.dataset;
  return {
    kind: d.hit as Hit["kind"],
    compId: d.comp,
    pinId: d.pin,
    wireId: d.wire,
    bit: d.bit === undefined ? undefined : Number(d.bit),
  };
}

const sameEndpoint = (a: Endpoint, b: Endpoint) =>
  a.kind === "pin" && b.kind === "pin" && a.compId === b.compId && a.pinId === b.pinId;

/** The value an Input/Output Pin or Clock shows on its body. */
function displayedValue(engine: Engine, chipId: string, compId: string) {
  if (chipId === "output") return engine.outputValue(compId);
  if (chipId === "input" || chipId === "clock") return engine.pinValue("", compId, "out");
  return undefined;
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const circuit = useEditor((s) => s.circuit);
  const library = useEditor((s) => s.library);
  const selection = useEditor((s) => s.selection);
  const viewport = useEditor((s) => s.viewport);
  const placing = useEditor((s) => s.placing);
  const drawing = useEditor((s) => s.drawing);
  const engine = useSim((s) => s.engine);
  // Re-render when simulated values change.
  useSim((s) => s.version);

  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useRef(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [move, setMove] = useState<MovePreview | null>(null);
  const [box, setBox] = useState<{ a: Point; b: Point } | null>(null);
  const [panning, setPanning] = useState(false);

  const scene = useMemo(() => buildScene(circuit, library, move ?? undefined), [circuit, library, move]);
  const selComps = useMemo(() => new Set(selection.comps), [selection.comps]);
  const selWires = useMemo(() => new Set(selection.wires), [selection.wires]);

  // Track canvas size (for fit / zoom buttons) and centre the origin on first layout.
  useEffect(() => {
    const svg = svgRef.current!;
    let first = true;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const s = useEditor.getState();
      s.setCanvasSize(width, height);
      if (first) {
        first = false;
        s.fitView();
      }
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // Wheel zooms around the cursor. Registered by hand because React's wheel listener is passive.
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      useEditor.getState().zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Holding space turns left-drag into panning.
  useEffect(() => {
    const isTyping = () =>
      useEditor.getState().saveDialogOpen || (document.activeElement?.matches("input, textarea, select") ?? false);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping()) {
        spaceHeld.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const v = useEditor.getState().viewport;
    return { x: (e.clientX - rect.left - v.x) / v.zoom, y: (e.clientY - rect.top - v.y) / v.zoom };
  };

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const s = useEditor.getState();
    const world = toWorld(e);
    const at = snapPoint(world);

    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      e.preventDefault();
      gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, vx: s.viewport.x, vy: s.viewport.y };
      setPanning(true);
      svgRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 2) {
      s.cancel();
      return;
    }
    if (e.button !== 0) return;

    if (s.placing) {
      s.addComponent(s.placing.chipId, at, s.placing.props);
      if (!e.shiftKey) s.setPlacing(null);
      return;
    }

    const hit = hitTest(e.target);

    if (s.drawing) {
      const d = s.drawing;
      if (hit?.kind === "pin") {
        const end: Endpoint = { kind: "pin", compId: hit.compId!, pinId: hit.pinId! };
        if (!sameEndpoint(d.from, end)) {
          s.addWire(d.from, end, d.points);
          s.setDrawing(null);
        }
      } else if (hit?.kind === "wire") {
        const target = scene.wires.get(hit.wireId!);
        const p = snapPoint(projectOntoPolyline(world, target!.points));
        s.addWire(d.from, { kind: "wire", wireId: hit.wireId!, x: p.x, y: p.y }, d.points);
        s.setDrawing(null);
      } else {
        s.setDrawing({ ...d, points: [...d.points, at] });
      }
      return;
    }

    if (hit?.kind === "pin") {
      const start = scene.comps.get(hit.compId!)!.pins.get(hit.pinId!)!;
      s.setDrawing({ from: { kind: "pin", compId: hit.compId!, pinId: hit.pinId! }, start, points: [] });
      return;
    }

    if (hit?.kind === "comp") {
      const id = hit.compId!;
      if (e.shiftKey) {
        s.toggleSelected("comps", id);
        return;
      }
      if (!s.selection.comps.includes(id)) s.select({ comps: [id], wires: [] });
      const sel = useEditor.getState().selection;
      const item = scene.comps.get(id)!;
      let toggle;
      if (item.comp.chipId === "input") {
        const width = item.look.pins[0].width;
        const bit = hit.bit ?? (width === 1 ? 0 : undefined);
        if (bit !== undefined) toggle = { compId: id, bit, width };
      }
      gesture.current = { kind: "move", start: world, compIds: sel.comps, wireIds: sel.wires, toggle };
      svgRef.current!.setPointerCapture(e.pointerId);
      return;
    }

    if (hit?.kind === "wire") {
      if (e.shiftKey) s.toggleSelected("wires", hit.wireId!);
      else s.select({ comps: [], wires: [hit.wireId!] });
      return;
    }

    gesture.current = { kind: "box", start: world, additive: e.shiftKey };
    if (!e.shiftKey) s.clearSelection();
    svgRef.current!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const world = toWorld(e);
    setCursor(snapPoint(world));
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      const v = useEditor.getState().viewport;
      useEditor.getState().setViewport({ ...v, x: g.vx + e.clientX - g.startX, y: g.vy + e.clientY - g.startY });
    } else if (g.kind === "move") {
      const dx = snap(world.x - g.start.x), dy = snap(world.y - g.start.y);
      if (dx !== move?.dx || dy !== move?.dy) {
        setMove({ compIds: new Set(g.compIds), wireIds: new Set(g.wireIds), dx, dy });
      }
    } else {
      setBox({ a: g.start, b: world });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const s = useEditor.getState();
    const g = gesture.current;
    gesture.current = null;

    if (g?.kind === "pan") setPanning(false);
    if (g?.kind === "move") {
      const dragged = !!move && (move.dx !== 0 || move.dy !== 0);
      if (dragged) s.moveSelection(g.compIds, g.wireIds, move.dx, move.dy);
      else if (g.toggle) useSim.getState().toggleInput(g.toggle.compId, g.toggle.bit, g.toggle.width);
      setMove(null);
    }
    if (g?.kind === "box" && box) {
      const x0 = Math.min(box.a.x, box.b.x), x1 = Math.max(box.a.x, box.b.x);
      const y0 = Math.min(box.a.y, box.b.y), y1 = Math.max(box.a.y, box.b.y);
      const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
      const comps = [...scene.comps.values()].filter((c) => inside(c.comp)).map((c) => c.comp.id);
      const wires = [...scene.wires.values()].filter((w) => w.points.every(inside)).map((w) => w.wire.id);
      s.select({ comps, wires }, g.additive);
      setBox(null);
    }
    // Dropping a part dragged from the palette.
    if (!g && s.placing?.fromDrag && e.button === 0) {
      s.addComponent(s.placing.chipId, snapPoint(toWorld(e)), s.placing.props);
      s.setPlacing(null);
    }
  }

  const ghost = useMemo(() => {
    if (!placing || !cursor) return null;
    return sceneComp(
      { id: "ghost", chipId: placing.chipId, x: cursor.x, y: cursor.y, rotation: 0, props: placing.props },
      library,
    );
  }, [placing, cursor, library]);

  const gridStep = 2 * GRID * viewport.zoom;
  const boxRect = box && {
    x: Math.min(box.a.x, box.b.x),
    y: Math.min(box.a.y, box.b.y),
    w: Math.abs(box.b.x - box.a.x),
    h: Math.abs(box.b.y - box.a.y),
  };

  return (
    <svg
      ref={svgRef}
      className={`block h-full w-full touch-none bg-canvas ${panning ? "cursor-grabbing" : drawing || placing ? "cursor-crosshair" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setCursor(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern
          id="grid"
          width={gridStep}
          height={gridStep}
          x={viewport.x}
          y={viewport.y}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={0.75} cy={0.75} r={0.75} className="fill-grid" />
        </pattern>
      </defs>
      {gridStep >= 8 && <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />}

      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
        {[...scene.wires.values()].map((w) => (
          <WireView
            key={w.wire.id}
            item={w}
            selected={selWires.has(w.wire.id)}
            value={engine?.wireValue(w.wire.id)}
          />
        ))}
        {[...scene.comps.values()].map((c) => (
          <ChipView
            key={c.comp.id}
            item={c}
            selected={selComps.has(c.comp.id)}
            value={engine ? displayedValue(engine, c.comp.chipId, c.comp.id) : undefined}
          />
        ))}
        {drawing && <WirePreview points={[drawing.start, ...drawing.points, ...(cursor ? [cursor] : [])]} />}
        {ghost && <ChipView item={ghost} ghost />}
        {boxRect && (
          <rect
            x={boxRect.x}
            y={boxRect.y}
            width={boxRect.w}
            height={boxRect.h}
            className="fill-accent/10 stroke-accent"
            strokeWidth={1 / viewport.zoom}
            pointerEvents="none"
          />
        )}
      </g>
    </svg>
  );
}
