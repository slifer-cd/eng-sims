import type { Circuit } from "../../model/types";
import { repairCircuit } from "./draft";
import { type ScopeSettings, repairScope } from "./scope";

/*
 * Circuit files: the circuit and the scope's traces as JSON, to download and open again.
 */

const APP = "eng-sims/circuit";

export function exportCircuit(circuit: Circuit, scope: ScopeSettings): string {
  return JSON.stringify({ app: APP, v: 1, circuit, scope }, null, 2);
}

/** A circuit file (or a bare circuit) read back, without the parts it can't read. */
export function importCircuit(text: string): { circuit: Circuit; scope?: ScopeSettings } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "This file isn't valid JSON." };
  }
  const file = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const wrapped = file.app === APP;
  const circuit = repairCircuit(wrapped ? file.circuit : raw);
  if (!circuit) return { error: "This file doesn't hold a circuit." };
  return { circuit, scope: wrapped ? repairScope(file.scope) : undefined };
}
