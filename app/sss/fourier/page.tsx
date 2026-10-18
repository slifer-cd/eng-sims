import type { Metadata } from "next";
import { FourierView } from "@/components/sss/views/FourierView";

export const metadata: Metadata = {
  title: "Fourier transform · Eng Sims",
  description: "The Fourier transform of a signal, with the working, its spectrum and animations of what the integral does.",
};

export default function FourierPage() {
  return <FourierView />;
}
