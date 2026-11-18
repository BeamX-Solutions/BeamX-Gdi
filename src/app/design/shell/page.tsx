import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShellDemo } from "@/components/workspace/shell-demo";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Workspace shell · BeamX design system",
  robots: { index: false, follow: false },
};

export default function ShellDemoPage() {
  if (!env.ENABLE_DESIGN_PAGE) notFound();
  return <ShellDemo />;
}
