import type { Circuit, PinDef } from "./types";

/**
 * Derive a custom chip's external pins from the Input/Output Pin components in its
 * circuit. Inputs go on the left and outputs on the right, each ordered top to bottom.
 */
export function derivePins(circuit: Circuit): PinDef[] {
  const pins: PinDef[] = [];
  for (const dir of ["in", "out"] as const) {
    const chipId = dir === "in" ? "input" : "output";
    const comps = circuit.components
      .filter((c) => c.chipId === chipId)
      .sort((a, b) => a.y - b.y);
    comps.forEach((c, order) => {
      pins.push({
        id: c.id,
        name: c.label ?? `${dir}${order}`,
        dir,
        width: Number(c.props.width ?? 1),
        side: dir === "in" ? "left" : "right",
        order,
      });
    });
  }
  return pins;
}
