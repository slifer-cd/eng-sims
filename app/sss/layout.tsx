import "katex/dist/katex.min.css";
import { SssShell } from "@/components/sss/SssShell";

export default function SssLayout({ children }: LayoutProps<"/sss">) {
  return <SssShell>{children}</SssShell>;
}
