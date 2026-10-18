import type { Metadata } from "next";
import { SystemView } from "@/components/sss/views/SystemView";

export const metadata: Metadata = {
  title: "LTI system · Eng Sims",
  description: "Impulse and step responses, stability, Bode plots and outputs of a system given by its transfer function H(s).",
};

export default function SystemPage() {
  return <SystemView />;
}
