import type { Circuit, Props } from "../model/types";

type PinRef = [compId: string, pinId: string];

/**
 * Builds circuits in code for the circuit simulator's tests. Parts sit far apart, so no two
 * terminals land on the same point (which would connect them) unless a test says so.
 */
export class CircuitBuilder {
  readonly circuit: Circuit = { components: [], wires: [] };
  private n = 0;

  add(chipId: string, props: Props = {}, label?: string, at?: { x: number; y: number }): string {
    const id = `c${this.n}`;
    const x = at?.x ?? 1000 * this.n, y = at?.y ?? 0;
    this.n++;
    this.circuit.components.push({ id, chipId, x, y, rotation: 0, label, props });
    return id;
  }

  wire(from: PinRef, to: PinRef): string {
    const id = `w${this.circuit.wires.length}`;
    this.circuit.wires.push({
      id,
      a: { kind: "pin", compId: from[0], pinId: from[1] },
      b: { kind: "pin", compId: to[0], pinId: to[1] },
      points: [],
    });
    return id;
  }

  /** Attach a wire from a pin to the middle of an existing wire. */
  junction(wireId: string, to: PinRef) {
    this.circuit.wires.push({
      id: `w${this.circuit.wires.length}`,
      a: { kind: "wire", wireId, x: 0, y: 0 },
      b: { kind: "pin", compId: to[0], pinId: to[1] },
      points: [],
    });
  }
}
