import type { Metadata } from "next";
import { SequenceView } from "@/components/sss/views/SequenceView";

export const metadata: Metadata = {
  title: "Sequence · Eng Sims",
  description: "A discrete-time sequence x[n] as a stem plot, written piecewise, with its energy.",
};

export default function SequencePage() {
  return <SequenceView />;
}
