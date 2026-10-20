import type { Circuit, ComponentInst, Endpoint, Point, Rotation, Wire } from "../../model/types";
import { ACS_KEY } from "../../storage/localKeys";
import { type ScopeSettings, repairScope, useAcsScope } from "./scope";
import { type AcsSettings, currentSettings, repairSettings, useAcsSettings } from "./settings";
import { useAcsEditor } from "./store";

/*
 * The circuit on the canvas and the simulator settings are autosaved to localStorage,
 * which can be written synchronously when the page goes away.
 */

export interface AcsDraft {
  v: 1;
  circuit: Circuit;
  settings: AcsSettings;
  scope: ScopeSettings;
}

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (v: unknown): v is Point => isObject(v) && isNumber(v.x) && isNumber(v.y);
const ROTATIONS: readonly number[] = [0, 90, 180, 270];

function repairComponent(raw: unknown): ComponentInst | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.chipId !== "string") return null;
  if (!isNumber(raw.x) || !isNumber(raw.y)) return null;
  const comp: ComponentInst = {
    id: raw.id,
    chipId: raw.chipId,
    x: raw.x,
    y: raw.y,
    rotation: (ROTATIONS.includes(raw.rotation as number) ? raw.rotation : 0) as Rotation,
    props: isObject(raw.props) ? (raw.props as ComponentInst["props"]) : {},
  };
  if (raw.flip === true) comp.flip = true;
  if (typeof raw.label === "string") comp.label = raw.label;
  return comp;
}

function repairEndpoint(raw: unknown): Endpoint | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "pin" && typeof raw.compId === "string" && typeof raw.pinId === "string") {
    return { kind: "pin", compId: raw.compId, pinId: raw.pinId };
  }
  if (raw.kind === "wire" && typeof raw.wireId === "string" && isNumber(raw.x) && isNumber(raw.y)) {
    return { kind: "wire", wireId: raw.wireId, x: raw.x, y: raw.y };
  }
  return null;
}

function repairWire(raw: unknown): Wire | null {
  if (!isObject(raw) || typeof raw.id !== "string") return null;
  const a = repairEndpoint(raw.a), b = repairEndpoint(raw.b);
  if (!a || !b) return null;
  const points = Array.isArray(raw.points) ? raw.points.filter(isPoint).map((p) => ({ x: p.x, y: p.y })) : [];
  return { id: raw.id, a, b, points };
}

/** A circuit read from storage or a file, without the parts and wires that can't be read. */
export function repairCircuit(raw: unknown): Circuit | null {
  if (!isObject(raw) || !Array.isArray(raw.components) || !Array.isArray(raw.wires)) return null;
  return {
    components: raw.components.map(repairComponent).filter((c): c is ComponentInst => c !== null),
    wires: raw.wires.map(repairWire).filter((w): w is Wire => w !== null),
  };
}

export function parseDraft(raw: unknown): Omit<AcsDraft, "v"> | null {
  if (!isObject(raw) || raw.v !== 1) return null;
  const circuit = repairCircuit(raw.circuit);
  return circuit && { circuit, settings: repairSettings(raw.settings), scope: repairScope(raw.scope) };
}

let restored = false;

/**
 * Restore the draft. Runs once per page load: with `cacheComponents`, leaving /acs hides the
 * editor instead of unmounting it and its effects run again on return, while the stores
 * still hold the session. Restoring again would only wipe undo history.
 */
export function restoreAcsSession() {
  if (restored) return;
  restored = true;
  try {
    const draft = parseDraft(JSON.parse(localStorage.getItem(ACS_KEY) ?? "null"));
    if (!draft) return;
    useAcsSettings.getState().update(draft.settings);
    useAcsScope.getState().load(draft.scope);
    useAcsEditor.getState().load(draft.circuit);
    useAcsEditor.getState().fitView();
  } catch {
    // Unreadable or blocked storage: start empty.
  }
}

export function saveAcsDraft() {
  try {
    const { traces, window } = useAcsScope.getState();
    const draft: AcsDraft = { v: 1, circuit: useAcsEditor.getState().circuit, settings: currentSettings(), scope: { traces, window } };
    localStorage.setItem(ACS_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked; nothing to do.
  }
}
