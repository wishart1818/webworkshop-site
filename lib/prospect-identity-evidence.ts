import type { Prospect } from "@/lib/prospect-engine";

export const discoveryIdentitySources = ["osm", "google", "bing", "yelp", "yellowPages"] as const;
export type DiscoveryIdentitySource = (typeof discoveryIdentitySources)[number];

export type DiscoveryIdentityEvidence = {
  source: DiscoveryIdentitySource;
  businessName: string;
  website: string;
  profileUrl: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
};

export type NoOwnedWebsiteEvidenceDecision = {
  verified: boolean;
  sources: DiscoveryIdentitySource[];
  reasonCode:
    | "verified_provider_social_absence"
    | "stored_verified_absence"
    | "owned_domain_candidate"
    | "identity_ambiguous"
    | "identity_incomplete"
    | "public_presence_incomplete";
  explanation: string;
};

const evidenceSignalPrefix = "discovery_identity_evidence:";
const sameNameAmbiguitySignal = "discovery_identity_conflict:same_name";
const authoritativeIdentitySources = new Set<DiscoveryIdentitySource>(["google", "bing", "yelp"]);
const socialHosts = ["facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com", "youtube.com"];
const genericSocialPath = /^(?:\/?|\/login\/?|\/share(?:r)?\/?|\/sharer(?:\.php)?\/?|\/intent\/?|\/home\.php\/?|\/pages\/?|\/explore\/?|\/accounts\/login\/?|\/company\/?|\/in\/?|\/feed\/?|\/watch\/?|\/channel\/?|\/user\/?)$/i;
const knownDirectoryHosts = [
  "yelp.com",
  "yellowpages.com",
  "bbb.org",
  "angi.com",
  "homeadvisor.com",
  "thumbtack.com",
  "houzz.com",
  "mapquest.com",
  "chamberofcommerce.com",
  "buildzoom.com",
  "bark.com",
  "nextdoor.com",
  "porch.com",
  "google.com",
  "bing.com",
];

function normalizedHost(value: string) {
  try {
    const trimmed = value.trim();
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatches(host: string, candidates: string[]) {
  return candidates.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

export function normalizedBusinessIdentityName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:llc|inc|incorporated|company|co|corp|corporation|services?|office|location|headquarters)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizedCompletePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? national : "";
}

export function normalizedStreetAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/(?:,\s*)?(?:united states(?: of america)?|usa)\s*$/i, " ")
    .replace(/\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|court|ct\.?|suite|ste|unit)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isSpecificBusinessSocialProfileUrl(value: string) {
  try {
    const trimmed = value.trim();
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!hostMatches(host, socialHosts)) return false;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (genericSocialPath.test(path)) return false;
    if (/\/(?:sharer|share|intent|login|accounts\/login)(?:\/|$)/i.test(path)) return false;
    return path.split("/").filter(Boolean).length >= 1;
  } catch {
    return false;
  }
}

function isSpecificGoogleBusinessProfileUrl(value: string) {
  try {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "maps.app.goo.gl" || host.endsWith(".maps.app.goo.gl") || host === "g.page" || host.endsWith(".g.page")) {
      return url.pathname.split("/").filter(Boolean).length >= 1;
    }
    if (!(host === "google.com" || host.endsWith(".google.com"))) return false;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return /\/maps\/(?:place|search|dir)\//i.test(path)
      || /\/maps$/i.test(path) && Boolean(url.searchParams.get("cid") || url.searchParams.get("q") || url.searchParams.get("query_place_id"));
  } catch {
    return false;
  }
}

function isSpecificYelpBusinessProfileUrl(value: string) {
  try {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "yelp.com" || host.endsWith(".yelp.com"))
      && /^\/biz\/[A-Za-z0-9_-]+/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isSpecificProviderBusinessProfileEvidence(evidence: DiscoveryIdentityEvidence) {
  if (isSpecificBusinessSocialProfileUrl(evidence.profileUrl)) return true;
  if (evidence.source === "google" && isSpecificGoogleBusinessProfileUrl(evidence.profileUrl)) return true;
  if (evidence.source === "yelp" && isSpecificYelpBusinessProfileUrl(evidence.profileUrl)) return true;
  return false;
}

export function isCredibleOwnedWebsiteCandidate(value: string) {
  const host = normalizedHost(value);
  return Boolean(host && !hostMatches(host, [...socialHosts, ...knownDirectoryHosts]));
}

export function discoveryIdentityEvidenceSignal(evidence: DiscoveryIdentityEvidence) {
  const bounded: DiscoveryIdentityEvidence = {
    source: evidence.source,
    businessName: evidence.businessName.trim().slice(0, 180),
    website: evidence.website.trim().slice(0, 500),
    profileUrl: evidence.profileUrl.trim().slice(0, 500),
    phone: evidence.phone.trim().slice(0, 60),
    address: evidence.address.trim().slice(0, 300),
    city: evidence.city.trim().slice(0, 100),
    state: evidence.state.trim().slice(0, 10),
    latitude: Number.isFinite(evidence.latitude) ? evidence.latitude : null,
    longitude: Number.isFinite(evidence.longitude) ? evidence.longitude : null,
  };
  return `${evidenceSignalPrefix}${Buffer.from(JSON.stringify(bounded)).toString("base64url")}`;
}

export function discoverySameNameAmbiguitySignal() {
  return sameNameAmbiguitySignal;
}

export function discoveryIdentityEvidenceFromSignals(signals: string[]) {
  return signals.flatMap((signal): DiscoveryIdentityEvidence[] => {
    if (!signal.startsWith(evidenceSignalPrefix) || signal.length > 4_000) return [];
    try {
      const value = JSON.parse(Buffer.from(signal.slice(evidenceSignalPrefix.length), "base64url").toString("utf8")) as Partial<DiscoveryIdentityEvidence>;
      if (
        !discoveryIdentitySources.includes(value.source as DiscoveryIdentitySource)
        || typeof value.businessName !== "string"
        || typeof value.website !== "string"
        || typeof value.profileUrl !== "string"
        || typeof value.phone !== "string"
        || typeof value.address !== "string"
        || typeof value.city !== "string"
        || typeof value.state !== "string"
      ) return [];
      return [{
        source: value.source as DiscoveryIdentitySource,
        businessName: value.businessName,
        website: value.website,
        profileUrl: value.profileUrl,
        phone: value.phone,
        address: value.address,
        city: value.city,
        state: value.state,
        latitude: typeof value.latitude === "number" && Number.isFinite(value.latitude) ? value.latitude : null,
        longitude: typeof value.longitude === "number" && Number.isFinite(value.longitude) ? value.longitude : null,
      }];
    } catch {
      return [];
    }
  });
}

function coordinateKey(evidence: DiscoveryIdentityEvidence) {
  if (evidence.latitude === null || evidence.longitude === null) return "";
  return `${evidence.latitude.toFixed(3)},${evidence.longitude.toFixed(3)}`;
}

function valuesSharedByIndependentSources(
  evidence: DiscoveryIdentityEvidence[],
  valueFor: (item: DiscoveryIdentityEvidence) => string,
) {
  const sourcesByValue = new Map<string, Set<DiscoveryIdentitySource>>();
  for (const item of evidence) {
    const value = valueFor(item);
    if (!value) continue;
    const sources = sourcesByValue.get(value) ?? new Set<DiscoveryIdentitySource>();
    sources.add(item.source);
    sourcesByValue.set(value, sources);
  }
  return [...sourcesByValue.values()].some((sources) => sources.size >= 2);
}

export function affirmativeFirstPartyIdentity(signals: string[] | undefined) {
  const values = new Set(signals ?? []);
  return values.has("prominent_business_name")
    && values.has("stored_website_host_match")
    && values.has("canonical_root_business_identity")
    && values.has("first_party_site_structure")
    && (values.has("public_phone_match") || values.has("business_domain_email_match"));
}

export function authoritativeNoOwnedWebsiteEvidence(prospect: Prospect, now = new Date()): NoOwnedWebsiteEvidenceDecision {
  const prior = prospect.websiteVerification;
  const priorCheckedAt = Date.parse(prior?.checkedAt ?? "");
  const freshStructuredAbsence = Number.isFinite(priorCheckedAt)
    && now.getTime() - priorCheckedAt <= 7 * 24 * 60 * 60 * 1_000;
  if (
    prior?.version === "website-verification-v2"
    && prior.status === "no_owned_website"
    && prior.confidence === "high"
    && prior.ownershipDecision === "not_owned"
    && prior.fit?.disposition === "no_owned_website"
    && freshStructuredAbsence
  ) {
    return {
      verified: true,
      sources: [],
      reasonCode: "stored_verified_absence",
      explanation: "A current structured verification already established that no owned website was found.",
    };
  }
  if (prospect.website.trim() || prospect.prospectType !== "no_website_social_only" || prospect.inactive) {
    return { verified: false, sources: [], reasonCode: "owned_domain_candidate", explanation: "The record is not an active no-owned-website candidate." };
  }
  const evidence = discoveryIdentityEvidenceFromSignals(prospect.activitySignals);
  const prospectCreatedAt = Date.parse(prospect.createdAt);
  if (!Number.isFinite(prospectCreatedAt) || now.getTime() - prospectCreatedAt > 7 * 24 * 60 * 60 * 1_000) {
    return {
      verified: false,
      sources: [...new Set(evidence.map((item) => item.source))],
      reasonCode: "identity_incomplete",
      explanation: "The provider identity evidence is stale and must be refreshed before concluding that no owned website exists.",
    };
  }
  const sources = [...new Set(evidence.map((item) => item.source))];
  if (prospect.activitySignals.includes(sameNameAmbiguitySignal)) {
    return { verified: false, sources, reasonCode: "identity_ambiguous", explanation: "Another provider record has the same normalized name, so identity is ambiguous." };
  }
  if (evidence.some((item) => isCredibleOwnedWebsiteCandidate(item.website))) {
    return { verified: false, sources, reasonCode: "owned_domain_candidate", explanation: "A credible provider website candidate must be verified before concluding that no owned website exists." };
  }
  const expectedName = normalizedBusinessIdentityName(prospect.businessName);
  const consistent = evidence.filter((item) => normalizedBusinessIdentityName(item.businessName) === expectedName);
  const independentSources = new Set(consistent.map((item) => item.source));
  const authoritativeSourcePresent = [...independentSources].some((source) => authoritativeIdentitySources.has(source));
  const completeIdentityBinding = valuesSharedByIndependentSources(consistent, (item) => normalizedCompletePhone(item.phone))
    || valuesSharedByIndependentSources(consistent, (item) => normalizedStreetAddress(item.address))
    || valuesSharedByIndependentSources(consistent, coordinateKey);
  if (independentSources.size < 2 || !authoritativeSourcePresent || !completeIdentityBinding) {
    return {
      verified: false,
      sources,
      reasonCode: "identity_incomplete",
      explanation: "No-site evidence needs two independent provider identities, including an authoritative source, tied by a complete phone, exact address, or close location.",
    };
  }
  const publicProfileEvidence = consistent.filter(isSpecificProviderBusinessProfileEvidence);
  if (publicProfileEvidence.length === 0) {
    return {
      verified: false,
      sources,
      reasonCode: "public_presence_incomplete",
      explanation: "The provider identities do not include a specific provider-attested public business profile, so owned-site absence remains inconclusive.",
    };
  }
  return {
    verified: true,
    sources: [...independentSources].sort(),
    reasonCode: "verified_provider_social_absence",
    explanation: "Independent provider identities agree on the business and show a specific provider-attested public business profile, with no credible owned-domain candidate.",
  };
}

export function providerOwnedWebsiteCandidates(prospect: Prospect) {
  return [...new Set(discoveryIdentityEvidenceFromSignals(prospect.activitySignals)
    .map((item) => item.website)
    .filter(isCredibleOwnedWebsiteCandidate))];
}
