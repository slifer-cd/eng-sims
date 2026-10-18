import type { Metadata } from "next";
import { ZView } from "@/components/sss/views/ZView";

export const metadata: Metadata = {
  title: "Z-transform · Eng Sims",
  description: "Z-transforms with their region of convergence, poles and zeros, and inverse Z-transforms by partial fractions.",
};

export default function ZPage() {
  return <ZView />;
}
