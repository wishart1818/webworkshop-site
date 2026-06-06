import type { Metadata } from "next";
import { PortfolioDetailPage } from "@/components/PortfolioDetailPage";
import { getPortfolioProjectByRoute } from "@/lib/portfolio";

const project = getPortfolioProjectByRoute("steadyflow-heating-air");

export const metadata: Metadata = {
  title: project?.company ?? "SteadyFlow Heating & Air",
  description: project?.summary,
};

export default function SteadyflowHeatingAirPage() {
  return <PortfolioDetailPage project={project} />;
}
