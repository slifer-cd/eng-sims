import { create } from "zustand";

/** Simulated seconds per real second while running. */
export const SPEEDS = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1];
export const MIN_DT = 1e-9;
export const MAX_DT = 0.1;

export interface AcsSettings {
  /** Simulation time step, in seconds. */
  dt: number;
  speed: number;
  /** Integration for capacitors and inductors: trapezoidal or backward Euler. */
  method: "trap" | "be";
}

export const DEFAULT_SETTINGS: AcsSettings = { dt: 5e-6, speed: 1e-2, method: "trap" };

/** Settings from a draft, each bad or missing field replaced by its default. */
export function repairSettings(raw: unknown): AcsSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const inRange = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && v >= lo && v <= hi;
  return {
    dt: inRange(r.dt, MIN_DT, MAX_DT) ? r.dt : DEFAULT_SETTINGS.dt,
    speed: inRange(r.speed, SPEEDS[0], SPEEDS[SPEEDS.length - 1]) ? r.speed : DEFAULT_SETTINGS.speed,
    method: r.method === "trap" || r.method === "be" ? r.method : DEFAULT_SETTINGS.method,
  };
}

interface SettingsState extends AcsSettings {
  update(patch: Partial<AcsSettings>): void;
}

export const useAcsSettings = create<SettingsState>()((set) => ({
  ...DEFAULT_SETTINGS,
  update: (patch) => set(patch),
}));

/** The settings as plain data, for saving. */
export function currentSettings(): AcsSettings {
  const s = useAcsSettings.getState();
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, s[k as keyof AcsSettings]])) as unknown as AcsSettings;
}
