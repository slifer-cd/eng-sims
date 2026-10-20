import { useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";

/*
 * User actions that may need to ask first. Browser prompts stay out of the stores.
 */

/** Clear the canvas, after asking if there is anything on it. */
export function newCircuit() {
  const { circuit } = useAcsEditor.getState();
  if (circuit.components.length > 0 && !confirm("Clear the canvas and start a new circuit? You can undo this.")) return;
  // An edit rather than a load, so it can be undone.
  useAcsEditor.getState().edit((c) => {
    c.components = [];
    c.wires = [];
  });
  // A new circuit starts at time 0.
  useAcsSim.getState().reset(useAcsEditor.getState().circuit);
}
