import "katex/dist/katex.min.css";
import { CalcShell } from "@/components/calc/CalcShell";

export default function CalcLayout({ children }: LayoutProps<"/calc">) {
  return <CalcShell>{children}</CalcShell>;
}
