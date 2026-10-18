import type { Metadata } from "next";
import { ConvolutionView } from "@/components/sss/views/ConvolutionView";

export const metadata: Metadata = {
  title: "Convolution · Eng Sims",
  description: "Convolve two signals: the flip-and-slide animation, and the exact result interval by interval with each integral set up.",
};

export default function ConvolutionPage() {
  return <ConvolutionView />;
}
