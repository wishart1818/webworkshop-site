import type { Prospect, WebsiteFitDisposition } from "@/lib/prospect-engine";
import { normalizeWebsiteFitDisposition } from "@/lib/prospect-qualification";
import {
  authoritativeProviderBoundWebsiteIdentity,
  verifiedCustomerFacingWebsiteStructure,
} from "@/lib/provider-bound-website-exclusion";

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
  const hasIndependentBusinessBinding = signals.has("public_phone_match")
    || signals.has("business_domain_email_match");
  const strictFirstPartyIdentity = Boolean(
    report?.ownershipDecision === "owned"
    && signals.has("prominent_business_name")
    && signals.has("stored_website_host_match")
    && signals.has("canonical_root_business_identity")
    && signals.has("first_party_site_structure")
    && hasIndependentBusinessBinding,
  );
  const providerBoundIdentity = Boolean(
    report?.ownershipDecision === "owned"
    && authoritativeProviderBoundWebsiteIdentity(input.verified, report)
    && verifiedCustomerFacingWebsiteStructure(input.verified, report),
  );
  const identitySafe = strictFirstPartyIdentity || providerBoundIdentity;
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
  if (!identitySafe) {
    if (!signals.has("prominent_business_name") || !signals.has("stored_website_host_match")) {
      return { eligible: false, reasonCode: "insufficient_identity", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "Business-name and first-party host evidence do not both match the prospect, and no authoritative provider binding closed the gap." };
    }
    if (!signals.has("canonical_root_business_identity") || !signals.has("first_party_site_structure")) {
      return { eligible: false, reasonCode: "insufficient_identity", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "The canonical root does not provide enough affirmative first-party business identity and site-structure evidence, and no authoritative provider binding closed the gap." };
    }
    if (!hasIndependentBusinessBinding) {
      return { eligible: false, reasonCode: "ambiguous_same_name", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "A city mention alone cannot bind the site to this prospect; a complete published business phone or business-domain email is required." };
    }
    return { eligible: false, reasonCode: "insufficient_identity", disposition, identitySafe: false, evidenceSafe, canonicalWebsite, identitySummary: "Current first-party identity evidence remains incomplete." };
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
    identitySummary: providerBoundIdentity
      ? "A current complete customer-facing site is bound to the prospect by the stored host, a current published phone or domain email, and matching authoritative provider website identity evidence."
      : signals.has("public_phone_match")
        ? "The branded first-party root, site structure, stored host, and complete published phone match the prospect."
        : "The branded first-party root, site structure, stored host, and business-domain email match the prospect.",
  };
}
