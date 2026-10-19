import type { Metadata } from "next";
import { KmapView } from "@/components/calc/views/KmapView";

export const metadata: Metadata = {
  title: "K-map minimiser · Eng Sims",
  description: "Minimise a Boolean function on a Karnaugh map, with Quine–McCluskey working, in sum-of-products and product-of-sums form.",
};

export default function KmapPage() {
  return <KmapView />;
}
