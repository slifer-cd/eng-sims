import type { Metadata } from "next";
import { DtftView } from "@/components/sss/views/DtftView";

export const metadata: Metadata = {
  title: "DTFT · Eng Sims",
  description: "The discrete-time Fourier transform of a sequence, with its spectrum and the unit-circle view.",
};

export default function DtftPage() {
  return <DtftView />;
}
