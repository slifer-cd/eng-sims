import type { Metadata } from "next";
import { SeriesView } from "@/components/sss/views/SeriesView";

export const metadata: Metadata = {
  title: "Fourier series · Eng Sims",
  description: "Fourier series coefficients of a periodic signal, with partial sums, the line spectrum and rotating phasors.",
};

export default function SeriesPage() {
  return <SeriesView />;
}
