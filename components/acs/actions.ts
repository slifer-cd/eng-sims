import type { Example } from "@/lib/acs/editor/examples";
import { exportCircuit, importCircuit } from "@/lib/acs/editor/io";
import { type ScopeSettings, useAcsScope } from "@/lib/acs/editor/scope";
import { DEFAULT_SETTINGS, useAcsSettings } from "@/lib/acs/editor/settings";
import { useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";
import type { Circuit } from "@/lib/model/types";

/*
 * User actions that may need to ask first. Browser prompts stay out of the stores.
 */

/** Put `circuit` on the canvas as one undoable edit and start the simulation from time 0. */
function replaceCircuit(circuit: Circuit, scope?: ScopeSettings) {
  useAcsEditor.getState().edit((c) => {
    c.components = structuredClone(circuit.components);
    c.wires = structuredClone(circuit.wires);
  });
  if (scope) useAcsScope.getState().load(scope);
  const sim = useAcsSim.getState();
  sim.reset(useAcsEditor.getState().circuit);
  sim.setRunning(true);
  // After the scope panel has taken its new height.
  requestAnimationFrame(() => requestAnimationFrame(() => useAcsEditor.getState().fitView()));
}

const okToReplace = (what: string) =>
  useAcsEditor.getState().circuit.components.length === 0 ||
  confirm(`Replace the circuit on the canvas with ${what}? You can undo this.`);

/** Clear the canvas, after asking if there is anything on it. */
export function newCircuit() {
  const { circuit } = useAcsEditor.getState();
  if (circuit.components.length > 0 && !confirm("Clear the canvas and start a new circuit? You can undo this.")) return;
  replaceCircuit({ components: [], wires: [] }, { traces: [], window: "auto" });
}

export function loadExample(example: Example) {
  if (!okToReplace(`the “${example.name}” example`)) return;
  useAcsSettings.getState().update({
    dt: example.settings?.dt ?? DEFAULT_SETTINGS.dt,
    speed: example.settings?.speed ?? DEFAULT_SETTINGS.speed,
  });
  replaceCircuit(example.circuit, example.scope ?? { traces: [], window: "auto" });
}

/** Download the circuit and its scope traces as a JSON file. */
export function downloadCircuit() {
  const { traces, window } = useAcsScope.getState();
  const blob = new Blob([exportCircuit(useAcsEditor.getState().circuit, { traces, window })], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "circuit.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Open a circuit file chosen by the user. */
export async function openCircuitFile(file: File) {
  const result = importCircuit(await file.text());
  if ("error" in result) {
    alert(`Couldn't open ${file.name}: ${result.error}`);
    return;
  }
  if (!okToReplace(file.name)) return;
  replaceCircuit(result.circuit, result.scope);
}
