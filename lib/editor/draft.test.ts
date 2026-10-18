import { describe, expect, it, vi } from "vitest";
import { CircuitBuilder } from "../sim/test-utils";
import { memoryRepository } from "../storage/repository";
import { SCRATCH_KEY } from "../storage/localKeys";
import { restoreSession } from "./draft";
import { useEditor } from "./store";

describe("restoreSession", () => {
  it("restores the draft once, so returning to the editor keeps undo history", () => {
    const b = new CircuitBuilder();
    b.add("input");
    const stored = new Map([[SCRATCH_KEY, JSON.stringify({ circuit: b.circuit, chipId: null })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null });

    restoreSession(memoryRepository);
    expect(useEditor.getState().circuit.components).toHaveLength(1);

    useEditor.getState().addComponent("not", { x: 0, y: 0 });
    const { circuit } = useEditor.getState();
    expect(useEditor.getState().past).toHaveLength(1);

    // The editor's effects run again when /dls is shown after a navigation.
    restoreSession(memoryRepository);
    expect(useEditor.getState().circuit).toBe(circuit);
    expect(useEditor.getState().past).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
