import type { Prospect, WebsiteVerificationReport } from "@/lib/prospect-engine";
import {
  discoveryIdentityEvidenceFromSignals,
  discoverySameNameAmbiguityRemains,
  isCredibleOwnedWebsiteCandidate,
  normalizedBusinessIdentityName,
  normalizedCompletePhone,
  normalizedStreetAddress,
} from "@/lib/prospect-identity-evidence";
import {
  latestProviderIdentityResolutionDiagnostic,
} from "@/lib/prospect-identity-resolution";

const authoritativeProviderSources = new Set(["google", "bing", "yelp"]);

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

export function authoritativeProviderBoundWebsiteIdentity(
  prospect: Prospect,
  report: WebsiteVerificationReport | undefined,
) {
  if (!report || report.version !== "website-verification-v2" || report.status !== "usable") return false;
  if (discoverySameNameAmbiguityRemains(prospect.activitySignals)) return false;

  const canonicalHost = normalizedHost(report.canonicalUrl || prospect.website);
  const storedHost = normalizedHost(prospect.website);
  if (!canonicalHost || !storedHost || canonicalHost !== storedHost) return false;

  const currentSignals = new Set(report.identitySignals ?? []);
  if (!currentSignals.has("stored_website_host_match")) return false;
  if (!currentSignals.has("public_phone_match") && !currentSignals.has("business_domain_email_match")) return false;

  const evidence = discoveryIdentityEvidenceFromSignals(prospect.activitySignals);
  const providerWebsiteHosts = new Set(
    evidence
      .filter((item) => isCredibleOwnedWebsiteCandidate(item.website))
      .map((item) => normalizedHost(item.website))
      .filter(Boolean),
  );
  if (providerWebsiteHosts.size !== 1 || !providerWebsiteHosts.has(canonicalHost)) return false;

  const expectedName = normalizedBusinessIdentityName(prospect.businessName);
  const expectedPhone = normalizedCompletePhone(prospect.phone);
  const expectedAddress = normalizedStreetAddress(prospect.address);
  if (!expectedName || (!expectedPhone && !expectedAddress)) return false;

  return evidence.some((item) => {
    if (!authoritativeProviderSources.has(item.source)) return false;
    if (normalizedBusinessIdentityName(item.businessName) !== expectedName) return false;
    if (normalizedHost(item.website) !== canonicalHost) return false;
    const phoneMatches = Boolean(expectedPhone && normalizedCompletePhone(item.phone) === expectedPhone);
    const addressMatches = Boolean(expectedAddress && normalizedStreetAddress(item.address) === expectedAddress);
    return phoneMatches || addressMatches;
  });
}

export function authoritativeProviderBoundBrokenWebsiteIdentity(
  prospect: Prospect,
  report: WebsiteVerificationReport | undefined,
) {
  if (
    !report
    || report.version !== "website-verification-v2"
    || !["confirmed_broken", "confirmed_inactive"].includes(report.status)
  ) return false;
  const diagnostic = latestProviderIdentityResolutionDiagnostic(prospect.activitySignals);
  if (
    !diagnostic?.confidenceSufficient
    || !diagnostic.evidenceCurrentForQualification
    || diagnostic.status !== "strong_match"
    || !authoritativeProviderSources.has(diagnostic.matchedProvider)
    || discoverySameNameAmbiguityRemains(prospect.activitySignals)
  ) return false;
  const storedHost = normalizedHost(prospect.website);
  const providerHost = normalizedHost(diagnostic.websiteCandidate);
  return Boolean(storedHost && providerHost && storedHost === providerHost);
}

export function verifiedCustomerFacingWebsiteStructure(
  prospect: Prospect,
  report: WebsiteVerificationReport | undefined,
) {
  if (!report || report.version !== "website-verification-v2" || report.status !== "usable") return false;
  const signals = new Set(report.usableSignals);
  const hasContactPath = Boolean(
    prospect.contactFormDetected
    || prospect.quoteFormDetected
    || prospect.email
    || prospect.phone,
  );
  const structuralSignals = [
    signals.has("meaningful page title"),
    signals.has("navigation"),
    signals.has("service content"),
    signals.has("mobile viewport"),
    hasContactPath,
    signals.has("business imagery") || signals.has("structured business data"),
  ].filter(Boolean).length;
  return structuralSignals >= 5;
}
