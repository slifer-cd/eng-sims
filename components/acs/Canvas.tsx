"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { voltColor } from "@/lib/acs/editor/colors";
import { type MovePreview, type PartItem, buildScene, partItem } from "@/lib/acs/editor/scene";
import { useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";
import type { Engine } from "@/lib/acs/sim/engine";
import { formatSI } from "@/lib/acs/units";
import { GRID, projectOntoPolyline, snap, snapPoint } from "@/lib/editor/layout";
import type { Endpoint, Point } from "@/lib/model/types";
import { wireKey } from "@/lib/sim/compile";
import { PartView } from "./PartView";
import { WirePreview, WireView } from "./WireView";

type Gesture =
  | { kind: "pan"; startX: number; startY: number; vx: number; vy: number }
  | {
      kind: "move";
      start: Point;
      compIds: string[];
      wireIds: string[];
      /** Switch to flip if the press ends without dragging. */
      toggle?: string;
    }
  | { kind: "box"; start: Point; additive: boolean };

interface Hit {
  kind: "comp" | "pin" | "wire";
  compId?: string;
  pinId?: string;
  wireId?: string;
}

function hitTest(target: EventTarget | null): Hit | null {
  const el = (target as Element | null)?.closest?.("[data-hit]") as HTMLElement | SVGElement | null;
  if (!el) return null;
  const d = el.dataset;
  return { kind: d.hit as Hit["kind"], compId: d.comp, pinId: d.pin, wireId: d.wire };
}

const sameEndpoint = (a: Endpoint, b: Endpoint) =>
  a.kind === "pin" && b.kind === "pin" && a.compId === b.compId && a.pinId === b.pinId;

const isTyping = () => document.activeElement?.matches("input, textarea, select") ?? false;

/** Live values a part draws: lead colours, switch position, probe reading. */
function liveLook(engine: Engine | null, item: PartItem, range: number) {
  const { comp, spec } = item;
  if (!engine || !spec) return {};
  const leads: Record<string, string> = {};
  for (const t of spec.terminals) leads[t.id] = voltColor(engine.pinVoltage(comp.id, t.id), range);
  const v = spec.id === "probe" || spec.id === "netlabel" ? engine.pinVoltage(comp.id, "in") : undefined;
  return {
    leads,
    switchValue: engine.switchValue(comp.id),
    reading: v === undefined ? undefined : formatSI(v, "V"),
  };
}

function tooltipLines(engine: Engine, item: PartItem | undefined, hit: Hit): string[] {
  if (hit.kind === "wire") {
    const v = engine.voltage(engine.netlist.nodeByKey.get(wireKey("", hit.wireId!)));
    return v === undefined ? [] : [formatSI(v, "V")];
  }
  if (!item?.spec) return [];
  const name = item.comp.label || item.spec.name;
  if (hit.kind === "pin") {
    const t = item.spec.terminals.find((x) => x.id === hit.pinId);
    const v = engine.pinVoltage(item.comp.id, hit.pinId!);
    return t && v !== undefined ? [`${name} · ${t.name}`, formatSI(v, "V")] : [];
  }
  const r = engine.readout(item.comp.id);
  if (!r) {
    const v = item.spec.terminals.length === 1 ? engine.pinVoltage(item.comp.id, item.spec.terminals[0].id) : undefined;
    return v === undefined ? [name] : [name, formatSI(v, "V")];
  }
  return [
    name,
    ...(r.v !== undefined ? [`V ${formatSI(r.v, "V")}`] : []),
    ...(r.i !== undefined ? [`I ${formatSI(r.i, "A")}`] : []),
    ...(r.p !== undefined ? [`P ${formatSI(r.p, "W")}`] : []),
  ];
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const circuit = useAcsEditor((s) => s.circuit);
  const selection = useAcsEditor((s) => s.selection);
  const viewport = useAcsEditor((s) => s.viewport);
  const placing = useAcsEditor((s) => s.placing);
  const drawing = useAcsEditor((s) => s.drawing);
  const engine = useAcsSim((s) => s.engine);
  // Re-render when simulated values change.
  useAcsSim((s) => s.version);

  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useRef(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [move, setMove] = useState<MovePreview | null>(null);
  const [box, setBox] = useState<{ a: Point; b: Point } | null>(null);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<{ hit: Hit; x: number; y: number } | null>(null);

  const scene = useMemo(() => buildScene(circuit, move ?? undefined), [circuit, move]);
  const selComps = useMemo(() => new Set(selection.comps), [selection.comps]);
  const selWires = useMemo(() => new Set(selection.wires), [selection.wires]);
  const wired = useMemo(() => {
    const keys = new Set<string>();
    for (const w of circuit.wires) for (const e of [w.a, w.b]) if (e.kind === "pin") keys.add(`${e.compId}.${e.pinId}`);
    return keys;
  }, [circuit.wires]);
  const openPins = (item: PartItem) =>
    item.spec?.terminals
      .filter((t) => !wired.has(`${item.comp.id}.${t.id}`))
      .map((t) => t.id)
      .join(",");
  const errorComps = new Set(engine?.error?.compIds ?? []);
  const range = Math.max(engine?.maxVoltage() ?? 0, 1e-6);

  // Track canvas size (for fit / zoom buttons) and fit the circuit on first layout.
  useEffect(() => {
    const svg = svgRef.current!;
    let first = true;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const s = useAcsEditor.getState();
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
      useAcsEditor.getState().zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Holding space turns left-drag into panning.
  useEffect(() => {
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
    const v = useAcsEditor.getState().viewport;
    return { x: (e.clientX - rect.left - v.x) / v.zoom, y: (e.clientY - rect.top - v.y) / v.zoom };
  };

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const s = useAcsEditor.getState();
    const world = toWorld(e);
    const at = snapPoint(world);
    setHover(null);

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
      s.addComponent(s.placing.partId, at);
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
      const start = scene.comps.get(hit.compId!)!.terminals.get(hit.pinId!)!;
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
      const sel = useAcsEditor.getState().selection;
      const toggle = scene.comps.get(id)?.spec?.interactive === "toggle" ? id : undefined;
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
    if (!g) {
      const hit = hitTest(e.target);
      const rect = svgRef.current!.getBoundingClientRect();
      setHover(hit && !placing && !drawing ? { hit, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      return;
    }
    if (g.kind === "pan") {
      const v = useAcsEditor.getState().viewport;
      useAcsEditor.getState().setViewport({ ...v, x: g.vx + e.clientX - g.startX, y: g.vy + e.clientY - g.startY });
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
    const s = useAcsEditor.getState();
    const g = gesture.current;
    gesture.current = null;

    if (g?.kind === "pan") setPanning(false);
    if (g?.kind === "move") {
      const dragged = !!move && (move.dx !== 0 || move.dy !== 0);
      if (dragged) s.moveSelection(g.compIds, g.wireIds, move.dx, move.dy);
      else if (g.toggle) useAcsSim.getState().toggleSwitch(g.toggle);
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
      s.addComponent(s.placing.partId, snapPoint(toWorld(e)));
      s.setPlacing(null);
    }
  }

  const ghost = useMemo(() => {
    if (!placing || !cursor) return null;
    return partItem({ id: "ghost", chipId: placing.partId, x: cursor.x, y: cursor.y, rotation: 0, props: {} });
  }, [placing, cursor]);

  const gridStep = 2 * GRID * viewport.zoom;
  const boxRect = box && {
    x: Math.min(box.a.x, box.b.x),
    y: Math.min(box.a.y, box.b.y),
    w: Math.abs(box.b.x - box.a.x),
    h: Math.abs(box.b.y - box.a.y),
  };
  const tip = hover && engine ? tooltipLines(engine, scene.comps.get(hover.hit.compId ?? ""), hover.hit) : [];

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        className={`block h-full w-full touch-none bg-canvas bg-[radial-gradient(ellipse_at_top,var(--canvas-glow),var(--canvas)_70%)] ${panning ? "cursor-grabbing" : drawing || placing ? "cursor-crosshair" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCursor(null);
          setHover(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern
            id="acs-grid"
            width={gridStep}
            height={gridStep}
            x={viewport.x}
            y={viewport.y}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={0.75} cy={0.75} r={0.75} className="fill-grid" />
          </pattern>
        </defs>
        {gridStep >= 8 && <rect width="100%" height="100%" fill="url(#acs-grid)" pointerEvents="none" />}

        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {[...scene.wires.values()].map((w) => (
            <WireView
              key={w.wire.id}
              item={w}
              selected={selWires.has(w.wire.id)}
              color={voltColor(engine?.voltage(engine.netlist.nodeByKey.get(wireKey("", w.wire.id))), range)}
            />
          ))}
          {[...scene.comps.values()].map((c) => (
            <PartView
              key={c.comp.id}
              item={c}
              style="ansi"
              selected={selComps.has(c.comp.id)}
              error={errorComps.has(c.comp.id)}
              openPins={openPins(c)}
              {...liveLook(engine, c, range)}
            />
          ))}
          {drawing && <WirePreview points={[drawing.start, ...drawing.points, ...(cursor ? [cursor] : [])]} />}
          {ghost && <PartView item={ghost} style="ansi" openPins={openPins(ghost)} ghost />}
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
      {hover && tip.length > 0 && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs shadow-sm"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {tip.map((line, i) => (
            <div key={i} className={i === 0 && tip.length > 1 ? "font-sans font-medium" : ""}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
