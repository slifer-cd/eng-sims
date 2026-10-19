import type { Metadata } from "next";
import { FloatView } from "@/components/calc/views/FloatView";

export const metadata: Metadata = {
  title: "Floating point · Eng Sims",
  description: "See how a number is stored in IEEE-754 float32 or float64: sign, exponent, fraction and the exact stored value.",
};

export default function FloatPage() {
  return <FloatView />;
}
