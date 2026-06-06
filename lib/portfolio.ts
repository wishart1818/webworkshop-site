import { portfolioProjects } from "./content";
import type { PortfolioProject } from "./content";
import { portfolioDetailRoutes } from "./portfolio-routes";

export function getPortfolioProjectByRoute(route: string) {
  const match = portfolioDetailRoutes.find((item) => item.route === route);

  return portfolioProjects.find(
    (project) => project.slug === (match?.projectSlug ?? route),
  );
}

export type { PortfolioProject };
