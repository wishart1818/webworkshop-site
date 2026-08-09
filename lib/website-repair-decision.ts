import type { Prospect, WebsiteFitDisposition } from "@/lib/prospect-engine";
import { normalizeWebsiteFitDisposition } from "@/lib/prospect-qualification";

export const websiteRepairDecisionReasonCodes = [
  "safe_verified_exclusion",
  "protected",
  "no_website_mutation",
  "not_an_exclusion",
  "crawler_blocked",
  "temporarily_unavailable",
  "insufficient_website_evidence",
  "insufficient_identity",
  "cross_domain_mismatch",
  "suspicious_third_party",
  "ambiguous_same_name",
  "other_manual_review",
] as const;

export type WebsiteRepairDecisionReasonCode = (typeof websiteRepairDecisionReasonCodes)[number];

export type SafeWebsiteExclusionDecision = {
  eligible: boolean;
  reasonCode: WebsiteRepairDecisionReasonCode;
  disposition: WebsiteFitDisposition;
  identitySafe: boolean;
  evidenceSafe: boolean;
  canonicalWebsite: string;
  identitySummary: string;
};

const thirdPartyWebsiteHosts = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "yelp.com",
  "yellowpages.com",
  "angi.com",
  "homeadvisor.com",
  "thumbtack.com",
  "houzz.com",
  "bbb.org",
  "mapquest.com",
  "chamberofcommerce.com",
  "buildzoom.com",
  "bark.com",
  "nextdoor.com",
  "porch.com",
  "voxservices.net",
];

function normalizedHost(value: string) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol)
      || url.username
      || url.password
      || (url.port && !["80", "443"].includes(url.port))
    ) return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function suspiciousThirdPartyHost(host: string) {
  return thirdPartyWebsiteHosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function manualReasonForStatus(status: Prospect["websiteStatus"]): WebsiteRepairDecisionReasonCode {
  if (status === "crawler_blocked") return "crawler_blocked";
  if (status === "temporarily_unavailable") return "temporarily_unavailable";
  return "insufficient_website_evidence";
}

export function safeHighConfidenceWebsiteExclusion(input: {
  before: Prospect;
  verified: Prospect;
  protectedReason: string;
  websiteMutationRequired: boolean;
  websiteEvidenceSufficient: boolean;
}): SafeWebsiteExclusionDecision {
  const disposition = normalizeWebsiteFitDisposition(input.verified);
  const report = input.verified.websiteVerification;
  const canonicalWebsite = report?.canonicalUrl ?? "";
  const canonicalHost = normalizedHost(canonicalWebsite);
  const storedHost = normalizedHost(input.before.website);
  const signals = new Set(report?.identitySignals ?? []);
  const identitySafe = Boolean(
    report?.ownershipDecision === "owned"
    && signals.has("prominent_business_name")
    && signals.has("stored_website_host_match")
    && (signals.has("market_location_match") || signals.has("public_phone_match")),
  );
  const evidenceSafe = Boolean(
    report?.version === "website-verification-v2"
    && report.status === "usable"
    && report.confidence === "high"
    && input.websiteEvidenceSufficient
    && report.fit?.disposition === disposition
    && report.fit.confidence === "high"
    && report.usableSignals.length >= 2,
  );

  if (input.protectedReason) {
    return { eligible: false, reasonCode: "protected", disposition, identitySafe, evidenceSafe, canonicalWebsite, identitySummary: "Protected contact or queue history prevents repair." };
  }
  if (report?.status === "crawler_blocked" || report?.status === "temporarily_unavailable") {
    return { eligible: false, reasonCode: manualReasonForStatus(report.status), disposition, identitySafe, evidenceSafe: false, canonicalWebsite, identitySummary: "External verification was blocked or temporarily unavailable, so ownership and fit require manual review." };
  }
  if (!["adequate_existing_website", "strong_existing_website"].includes(disposition)) {
    return { eligible: false, reasonCode: "not_an_exclusion", disposition, identitySafe, evidenceSafe, canonicalWebsite, identitySummary: "Current website fit is not an adequate or strong owned-site exclusion." };
  }
  if (!canonicalHost || suspiciousThirdPartyHost(canonicalHost)) {
    return { eligible: false, reasonCode: "suspicious_third_party", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "The canonical URL is not a credible first-party business website." };
  }
  if (!storedHost || canonicalHost !== storedHost) {
    return { eligible: false, reasonCode: "cross_domain_mismatch", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "The verified canonical host does not match the stored owned-website host." };
  }
  if (!report || report.version !== "website-verification-v2" || report.status !== "usable") {
    return { eligible: false, reasonCode: manualReasonForStatus(report?.status ?? input.verified.websiteStatus), disposition, identitySafe, evidenceSafe: false, canonicalWebsite, identitySummary: "Current authoritative usable-site evidence is incomplete." };
  }
  if (!signals.has("prominent_business_name") || !signals.has("stored_website_host_match")) {
    return { eligible: false, reasonCode: "insufficient_identity", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "Business-name and first-party host evidence do not both match the prospect." };
  }
  if (!signals.has("market_location_match") && !signals.has("public_phone_match")) {
    return { eligible: false, reasonCode: "ambiguous_same_name", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "The site is not bound to the exact stored market or business phone." };
  }
  if (!evidenceSafe) {
    return { eligible: false, reasonCode: "insufficient_website_evidence", disposition, identitySafe, evidenceSafe: false, canonicalWebsite, identitySummary: "Website status, fit, or confidence evidence is incomplete." };
  }
  if (!input.websiteMutationRequired) {
    return { eligible: false, reasonCode: "no_website_mutation", disposition, identitySafe, evidenceSafe, canonicalWebsite, identitySummary: "The authoritative website exclusion is already current." };
  }
  return {
    eligible: true,
    reasonCode: "safe_verified_exclusion",
    disposition,
    identitySafe: true,
    evidenceSafe: true,
    canonicalWebsite,
    identitySummary: signals.has("public_phone_match")
      ? "Business name, first-party host, and published phone match the exact prospect."
      : "Business name, first-party host, and stored market match the exact prospect.",
  };
}
