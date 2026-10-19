import type { Metadata } from "next";
import { SignedView } from "@/components/calc/views/SignedView";

export const metadata: Metadata = {
  title: "Signed integers · Eng Sims",
  description: "Two's complement, one's complement and sign-magnitude in 4 to 64 bits, both ways, with the working.",
};

export default function SignedPage() {
  return <SignedView />;
}
