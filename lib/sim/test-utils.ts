import { derivePins } from "../model/pins";
import type { ChipDef, Circuit, Props } from "../model/types";
import type { ChipLibrary } from "./compile";

type PinRef = [compId: string, pinId: string];

/** Builds circuits in code for tests. Components are placed at increasing y so pin order follows insertion order. */
export class CircuitBuilder {
  readonly circuit: Circuit = { components: [], wires: [] };
  private n = 0;

  add(chipId: string, props: Props = {}, label?: string): string {
    const id = `c${this.n++}`;
    this.circuit.components.push({ id, chipId, x: 0, y: this.n, rotation: 0, label, props });
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

export function makeChip(id: string, name: string, circuit: Circuit): ChipDef {
  return { id, name, pins: derivePins(circuit), color: "#888", circuit, createdAt: 0, updatedAt: 0 };
}

export function library(...chips: ChipDef[]): ChipLibrary {
  const byId = new Map(chips.map((c) => [c.id, c]));
  return { get: (id) => byId.get(id) };
}
