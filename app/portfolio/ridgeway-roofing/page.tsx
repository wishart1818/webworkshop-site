import type { Metadata } from "next";
import { PortfolioDetailPage } from "@/components/PortfolioDetailPage";
import { getPortfolioProjectByRoute } from "@/lib/portfolio";

const project = getPortfolioProjectByRoute("ridgeway-roofing");

export const metadata: Metadata = {
  title: project?.company ?? "Ridgeway Roofing",
  description: project?.summary,
};

export default function RidgewayRoofingPage() {
  return <PortfolioDetailPage project={project} />;
}
