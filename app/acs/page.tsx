import type { Metadata } from "next";
import { AcsEditor } from "@/components/acs/AcsEditor";

export const metadata: Metadata = {
  title: "Circuits · Eng Sims",
  description: "Draw an analog circuit and watch its voltages and currents live: sources, R, L, C, diodes, transistors and op-amps.",
};

export default function CircuitsPage() {
  return <AcsEditor />;
}
