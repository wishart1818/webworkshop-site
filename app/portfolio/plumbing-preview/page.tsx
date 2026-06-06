import type { Metadata } from "next";
import { PortfolioDetailPage } from "@/components/PortfolioDetailPage";
import { getPortfolioProjectByRoute } from "@/lib/portfolio";

const project = getPortfolioProjectByRoute("plumbing-preview");

export const metadata: Metadata = {
  title: project?.company ?? "Plumbing Preview",
  description: project?.summary,
};

export default function PlumbingPreviewPage() {
  return <PortfolioDetailPage project={project} />;
}
