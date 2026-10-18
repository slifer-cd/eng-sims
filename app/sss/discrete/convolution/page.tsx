import type { Metadata } from "next";
import { DConvView } from "@/components/sss/views/DConvView";

export const metadata: Metadata = {
  title: "Discrete convolution · Eng Sims",
  description: "Convolve two sequences: the flip-and-slide animation and the closed form through the Z-transform.",
};

export default function DiscreteConvolutionPage() {
  return <DConvView />;
}
