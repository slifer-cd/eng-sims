import type { Metadata } from "next";
import { BasesView } from "@/components/calc/views/BasesView";

export const metadata: Metadata = {
  title: "Number bases · Eng Sims",
  description: "Convert whole numbers between binary, octal, decimal and hexadecimal, with the working.",
};

export default function BasesPage() {
  return <BasesView />;
}
