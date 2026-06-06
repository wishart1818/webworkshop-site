const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const siteUrl = (configuredSiteUrl || "https://webworkshop.dev").replace(/\/+$/, "");

export const publicRoutes = [
  "/",
  "/pricing",
  "/faq",
  "/contact",
  "/privacy",
  "/portfolio/ridgeway-roofing",
  "/portfolio/evergreen-yardworks",
  "/portfolio/steadyflow-heating-air",
  "/portfolio/plumbing-preview",
] as const;
