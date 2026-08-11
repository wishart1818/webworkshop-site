import type { Prospect } from "@/lib/prospect-engine";
import {
  discoveryIdentityEvidenceFromSignals,
  isCredibleOwnedWebsiteCandidate,
  normalizedBusinessIdentityName,
  normalizedCompletePhone,
  normalizedStreetAddress,
} from "@/lib/prospect-identity-evidence";

type GooglePlaceCandidate = {
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
};

type GooglePlacesSearchResponse = {
  places?: GooglePlaceCandidate[];
};

export type OwnedWebsiteRecoveryDependencies = {
  fetch?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number;
  now?: () => Date;
};

const legalSuffixTokens = new Set([
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "company",
  "co",
  "ltd",
  "limited",
]);

const genericServiceTokens = new Set([
  "service",
  "services",
  "parking",
  "lot",
  "pressure",
  "power",
  "washing",
  "wash",
  "powerwashing",
  "pressurewashing",
  "softwashing",
  "softwash",
  "striping",
  "roofing",
  "roof",
  "plumbing",
  "plumber",
  "electrical",
  "electric",
  "landscaping",
  "landscape",
  "cleaning",
  "clean",
  "painting",
  "paint",
  "concrete",
  "fencing",
  "fence",
  "flooring",
  "floor",
  "remodeling",
  "remodel",
  "tree",
  "trees",
  "hvac",
  "contractor",
  "contracting",
]);

const preferredServiceTokens = [
  "striping",
  "roofing",
  "plumbing",
  "electrical",
  "landscaping",
  "cleaning",
  "painting",
  "concrete",
  "fencing",
  "flooring",
  "remodeling",
  "powerwashing",
  "pressurewashing",
  "softwashing",
  "softwash",
  "hvac",
] as const;

function normalizedHost(value: string) {
  try {
    const url = new URL(value.trim());
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function identityNameKey(value: string) {
  return normalizedBusinessIdentityName(value).replace(/\s+/g, "");
}

function boundedQuery(prospect: Prospect) {
  return [prospect.businessName, prospect.address, prospect.city, prospect.state]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

function knownIdentityBindings(prospect: Prospect) {
  const evidence = discoveryIdentityEvidenceFromSignals(prospect.activitySignals);
  const phones = new Set([
    normalizedCompletePhone(prospect.phone),
    ...evidence.map((item) => normalizedCompletePhone(item.phone)),
  ].filter(Boolean));
  const addresses = new Set([
    normalizedStreetAddress(prospect.address),
    ...evidence.map((item) => normalizedStreetAddress(item.address)),
  ].filter(Boolean));
  return { evidence, phones, addresses };
}

function placeMatchesProspect(
  prospect: Prospect,
  place: GooglePlaceCandidate,
  bindings: ReturnType<typeof knownIdentityBindings>,
) {
  const placeName = identityNameKey(place.displayName?.text ?? "");
  const expectedName = identityNameKey(prospect.businessName);
  if (!placeName || !expectedName || placeName !== expectedName) return false;

  const placePhone = normalizedCompletePhone(place.nationalPhoneNumber ?? "");
  const placeAddress = normalizedStreetAddress(place.formattedAddress ?? "");
  const phoneMatch = Boolean(placePhone && bindings.phones.has(placePhone));
  const addressMatch = Boolean(placeAddress && bindings.addresses.has(placeAddress));
  return phoneMatch || addressMatch;
}

function domainTokens(value: string) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => !legalSuffixTokens.has(token));
}

function safeSlug(value: string) {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact.length < 6 || compact.length > 48 || !/[a-z]/.test(compact)) return "";
  return compact;
}

/**
 * Produce a very small set of plausible .com hosts when a fresh Google listing omitted its
 * website field. These are candidates only. They still pass through the normal website verifier,
 * which must prove first-party identity before any website fit can be accepted.
 */
export function deterministicOwnedWebsiteCandidates(prospect: Prospect) {
  const tokens = domainTokens(prospect.businessName);
  if (!tokens.length) return [];

  const brandTokens = tokens.filter((token) => !genericServiceTokens.has(token));
  if (!brandTokens.length) return [];

  const fullBase = safeSlug(tokens.join(""));
  const brandBase = safeSlug(brandTokens.slice(0, 2).join(""));
  const preferredService = preferredServiceTokens.find((token) => tokens.includes(token)) ?? "";
  const brandServiceBase = safeSlug(`${brandBase}${preferredService}`);
  const state = safeSlug(prospect.state);
  const city = safeSlug(prospect.city);

  const slugs = [
    brandServiceBase && brandServiceBase !== fullBase ? brandServiceBase : "",
    fullBase,
    fullBase && state ? safeSlug(`${fullBase}${state}`) : "",
    fullBase && city ? safeSlug(`${fullBase}${city}`) : "",
    brandServiceBase && state && brandServiceBase !== fullBase ? safeSlug(`${brandServiceBase}${state}`) : "",
  ].filter(Boolean);

  return [...new Set(slugs)].slice(0, 5).map((slug) => `https://${slug}.com/`);
}

/**
 * Bounded recovery for a fresh Google discovery record that arrived without an owned website.
 *
 * An exact Google Places re-query may contribute a website candidate only when the normalized
 * business name matches and either a complete phone number or the full normalized address
 * matches evidence already stored on the prospect. If that exact matching Google record still
 * omits its website, a tiny deterministic .com candidate set is returned for normal first-party
 * verification. Conflicting Google-owned hosts fail closed. Recovery never establishes website
 * ownership by itself.
 */
export async function discoverGoogleOwnedWebsiteCandidates(
  prospect: Prospect,
  dependencies: OwnedWebsiteRecoveryDependencies = {},
) {
  if (prospect.website.trim() || prospect.inactive || prospect.prospectType !== "no_website_social_only") return [];

  const now = dependencies.now?.() ?? new Date();
  const createdAt = Date.parse(prospect.createdAt);
  if (!Number.isFinite(createdAt) || now.getTime() - createdAt > 7 * 24 * 60 * 60 * 1_000) return [];

  const bindings = knownIdentityBindings(prospect);
  const expectedName = identityNameKey(prospect.businessName);
  const hasMatchingGoogleEvidence = bindings.evidence.some((item) => (
    item.source === "google" && identityNameKey(item.businessName) === expectedName
  ));
  if (!hasMatchingGoogleEvidence || (bindings.phones.size === 0 && bindings.addresses.size === 0)) return [];

  const apiKey = (dependencies.apiKey ?? process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) return [];

  const query = boundedQuery(prospect);
  if (!query) return [];
  const fetchImpl = dependencies.fetch ?? fetch;
  const timeoutMs = Math.min(6_000, Math.max(750, dependencies.timeoutMs ?? 5_000));

  try {
    const response = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];

    const payload = await response.json() as GooglePlacesSearchResponse;
    const matchingPlaces = (payload.places ?? []).filter((place) => placeMatchesProspect(prospect, place, bindings));
    const candidates = [...new Set(matchingPlaces
      .map((place) => place.websiteUri?.trim() ?? "")
      .filter((value) => value && isCredibleOwnedWebsiteCandidate(value)))];

    if (candidates.length) {
      const hosts = new Set(candidates.map(normalizedHost).filter(Boolean));
      if (hosts.size !== 1) return [];
      return candidates.slice(0, 3);
    }

    if (!matchingPlaces.length) return [];
    return deterministicOwnedWebsiteCandidates(prospect);
  } catch {
    return [];
  }
}
