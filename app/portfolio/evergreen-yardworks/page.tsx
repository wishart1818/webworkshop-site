import type { Metadata } from "next";
import { PortfolioDetailPage } from "@/components/PortfolioDetailPage";
import { getPortfolioProjectByRoute } from "@/lib/portfolio";

const project = getPortfolioProjectByRoute("evergreen-yardworks");

export const metadata: Metadata = {
  title: project?.company ?? "Evergreen Yardworks",
  description: project?.summary,
};

export default function EvergreenYardworksPage() {
  return <PortfolioDetailPage project={project} />;
}
