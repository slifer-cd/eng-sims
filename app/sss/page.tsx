import type { Metadata } from "next";
import { SignalView } from "@/components/sss/views/SignalView";

export const metadata: Metadata = {
  title: "Signal · Eng Sims",
  description: "Plot a signal over time, write it piecewise, and shift, scale and reverse it.",
};

export default function SignalPage() {
  return <SignalView />;
}
