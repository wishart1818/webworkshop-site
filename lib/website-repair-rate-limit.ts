import { enforceRateLimit } from "@/lib/operational-controls";

export const websiteRepairApplyRateLimit = Object.freeze({
  action: "website_record_repair",
  subject: "operator",
  limit: 12,
  windowMs: 60 * 60 * 1000,
});

export async function enforceWebsiteRepairApplyRateLimit(
  enforce: typeof enforceRateLimit = enforceRateLimit,
) {
  return enforce(websiteRepairApplyRateLimit);
}
