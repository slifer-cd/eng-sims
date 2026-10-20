import { type CreateCtx, type Element, vAt } from "../element";

export function resistor(c: CreateCtx, r: number): Element {
  const [a, b] = c.nodes;
  const g = 1 / r;
  return {
    compId: c.compId,
    nodes: c.nodes,
    stampStatic: (s) => s.conductance(a, b, g),
    readout(x) {
      const v = vAt(x, a) - vAt(x, b);
      return { v, i: v * g, p: v * v * g };
    },
  };
}
