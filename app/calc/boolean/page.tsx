import type { Metadata } from "next";
import { BooleanView } from "@/components/calc/views/BooleanView";

export const metadata: Metadata = {
  title: "Truth table · Eng Sims",
  description: "Type a Boolean expression to get its truth table, canonical forms and the simplest equivalent.",
};

export default function BooleanPage() {
  return <BooleanView />;
}
