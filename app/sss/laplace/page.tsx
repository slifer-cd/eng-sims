import type { Metadata } from "next";
import { LaplaceView } from "@/components/sss/views/LaplaceView";

export const metadata: Metadata = {
  title: "Laplace transform · Eng Sims",
  description: "Laplace transforms with their region of convergence, poles and zeros, and inverse transforms by partial fractions.",
};

export default function LaplacePage() {
  return <LaplaceView />;
}
