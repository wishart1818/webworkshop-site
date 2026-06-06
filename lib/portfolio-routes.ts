export const portfolioDetailRoutes = [
  { route: "ridgeway-roofing", projectSlug: "ridgeway-roofing" },
  { route: "evergreen-yardworks", projectSlug: "evergreen-yardworks" },
  { route: "steadyflow-heating-air", projectSlug: "steadyflow-hvac" },
  { route: "plumbing-preview", projectSlug: "clearline-plumbing" },
] as const;

const pathByProjectSlug = portfolioDetailRoutes.reduce<Record<string, string>>(
  (paths, item) => {
    paths[item.projectSlug] = `/portfolio/${item.route}`;
    return paths;
  },
  {},
);

export function getPortfolioPath(projectSlug: string) {
  return pathByProjectSlug[projectSlug] ?? `/portfolio/${projectSlug}`;
}
