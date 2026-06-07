import type { Metadata } from "next";
import { ProspectEngine } from "@/components/ProspectEngine";

export const metadata: Metadata = {
  title: "Prospect Engine",
  description: "WebWorkshop contractor prospect discovery, analysis, outreach, and pipeline workspace.",
  robots: { index: false, follow: false },
};

export default function ProspectEnginePage() {
  return <ProspectEngine />;
}
