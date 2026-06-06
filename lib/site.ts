export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
