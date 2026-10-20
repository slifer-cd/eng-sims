import { describe, expect, it } from "vitest";
import type { Circuit, ComponentInst, Wire } from "../../model/types";
import { dotSpeed, wireFlows } from "./currents";
import { buildScene } from "./scene";

const part = (id: string, chipId: string, x: number, y: number, rotation: 0 | 90 = 0): ComponentInst => ({
  id,
  chipId,
  x,
  y,
  rotation,
  props: {},
});
const pin = (compId: string, pinId: string) => ({ kind: "pin" as const, compId, pinId });

/** r1 feeds r2 along w1; r3 hangs off the middle of w1 through w2. */
function tee(): Circuit {
  const wires: Wire[] = [
    { id: "w1", a: pin("r1", "b"), b: pin("r2", "a"), points: [] },
    { id: "w2", a: pin("r3", "a"), b: { kind: "wire", wireId: "w1", x: 100, y: 0 }, points: [] },
  ];
  return { components: [part("r1", "resistor", 0, 0), part("r2", "resistor", 200, 0), part("r3", "resistor", 100, 100, 90)], wires };
}

describe("wireFlows", () => {
  it("splits a wire where a junction joins it and follows KCL along each piece", () => {
    // 3 A comes out of r1, 2 A goes into r2 and 1 A into r3.
    const into: Record<string, number> = { "r1.b": -3, "r2.a": 2, "r3.a": 1 };
    const flows = wireFlows(buildScene(tee()), (c, p) => into[`${c}.${p}`] ?? 0);
    const w1 = flows.filter((f) => f.wireId === "w1");
    expect(w1.map((f) => ({ points: f.points, current: f.current }))).toEqual([
      { points: [{ x: 30, y: 0 }, { x: 100, y: 0 }], current: expect.closeTo(3, 12) },
      { points: [{ x: 100, y: 0 }, { x: 170, y: 0 }], current: expect.closeTo(2, 12) },
    ]);
    const w2 = flows.find((f) => f.wireId === "w2")!;
    // w2 runs from r3 to the junction, but the current flows into r3.
    expect(w2.current).toBeCloseTo(-1, 12);
  });

  it("splits at bends too, keeping the bends in each piece", () => {
    const c = tee();
    c.wires[0].points = [{ x: 30, y: -40 }, { x: 170, y: -40 }];
    c.wires[1].b = { kind: "wire", wireId: "w1", x: 100, y: -40 };
    const into: Record<string, number> = { "r1.b": -3, "r2.a": 2, "r3.a": 1 };
    const w1 = wireFlows(buildScene(c), (cid, p) => into[`${cid}.${p}`] ?? 0).filter((f) => f.wireId === "w1");
    expect(w1[0].points).toEqual([{ x: 30, y: 0 }, { x: 30, y: -40 }, { x: 100, y: -40 }]);
    expect(w1[1].points).toEqual([{ x: 100, y: -40 }, { x: 170, y: -40 }, { x: 170, y: 0 }]);
  });

  it("sends what doesn't balance into ground or a net label", () => {
    const c: Circuit = {
      components: [part("r1", "resistor", 0, 0), part("g", "ground", 100, 10)],
      wires: [{ id: "w1", a: pin("r1", "b"), b: pin("g", "g"), points: [{ x: 100, y: 0 }] }],
    };
    const [flow] = wireFlows(buildScene(c), (cid) => (cid === "r1" ? -0.5 : undefined));
    expect(flow.current).toBeCloseTo(0.5, 12);
  });

  it("treats terminals on the same point as one", () => {
    // r1 and r2 touch at (30, 0); a wire goes from there to ground. r1 sends 3 A in, r2 takes
    // 1 A straight from the shared point, so 2 A run down the wire.
    const c: Circuit = {
      components: [part("r1", "resistor", 0, 0), part("r2", "resistor", 60, 0), part("g", "ground", 30, 40)],
      wires: [{ id: "w1", a: pin("r2", "a"), b: pin("g", "g"), points: [] }],
    };
    const into: Record<string, number> = { "r1.b": -3, "r2.a": 1 };
    const [flow] = wireFlows(buildScene(c), (cid, p) => (cid === "g" ? undefined : (into[`${cid}.${p}`] ?? 0)));
    expect(flow.current).toBeCloseTo(2, 12);
  });

  it("carries nothing round a loop of wire with nothing on it", () => {
    const c = tee();
    c.wires.push({ id: "w3", a: pin("r1", "b"), b: pin("r2", "a"), points: [{ x: 30, y: 40 }, { x: 170, y: 40 }] });
    const into: Record<string, number> = { "r1.b": -3, "r2.a": 2, "r3.a": 1 };
    const flows = wireFlows(buildScene(c), (cid, p) => into[`${cid}.${p}`] ?? 0);
    // Each terminal's current is still delivered, whichever way round the loop it goes.
    const at = (x: number, y: number) =>
      flows.reduce((sum, f) => {
        const first = f.points[0], last = f.points[f.points.length - 1];
        if (first.x === x && first.y === y) sum -= f.current;
        if (last.x === x && last.y === y) sum += f.current;
        return sum;
      }, 0);
    expect(at(30, 0)).toBeCloseTo(-3, 12);
    expect(at(170, 0)).toBeCloseTo(2, 12);
  });
});

describe("dotSpeed", () => {
  it("is faster for larger currents, signed by direction, and still for tiny ones", () => {
    expect(dotSpeed(1e-3)).toBeGreaterThan(dotSpeed(1e-6));
    expect(dotSpeed(-1e-3)).toBe(-dotSpeed(1e-3));
    expect(dotSpeed(1e-9)).toBe(0);
    expect(dotSpeed(1e3)).toBeLessThanOrEqual(240);
  });
});
