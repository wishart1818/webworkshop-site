import type { Prospect } from "@/lib/prospect-engine";
import {
  discoveryIdentityEvidenceFromSignals,
  isCredibleOwnedWebsiteCandidate,
  normalizedBusinessIdentityName,
  normalizedCompletePhone,
  normalizedStreetAddress,
  type DiscoveryIdentityEvidence,
} from "@/lib/prospect-identity-evidence";

type GooglePlaceCandidate = {
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
};

type GooglePlacesSearchResponse = {
  places?: GooglePlaceCandidate[];
};

type AzurePoiCandidate = {
  poi?: { name?: string; phone?: string; url?: string };
  position?: { lat?: number; lon?: number };
  address?: {
    freeformAddress?: string;
    streetNumber?: string;
    streetName?: string;
    localName?: string;
    municipality?: string;
    countrySubdivisionCode?: string;
    postalCode?: string;
  };
};

type AzureMapsSearchResponse = {
  results?: AzurePoiCandidate[];
};

export type OwnedWebsiteRecoveryDependencies = {
  fetch?: typeof fetch;
  apiKey?: string;
  googlePlacesApiKey?: string;
  azureMapsApiKey?: string;
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

function evidenceMatchesProspect(
  prospect: Prospect,
  evidence: DiscoveryIdentityEvidence,
  bindings: ReturnType<typeof knownIdentityBindings>,
) {
  if (identityNameKey(evidence.businessName) !== identityNameKey(prospect.businessName)) return false;
  const phone = normalizedCompletePhone(evidence.phone);
  const address = normalizedStreetAddress(evidence.address);
  return Boolean(
    (phone && bindings.phones.has(phone))
    || (address && bindings.addresses.has(address)),
  );
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function googlePlaceEvidence(place: GooglePlaceCandidate): DiscoveryIdentityEvidence | null {
  const businessName = place.displayName?.text?.trim() ?? "";
  if (!businessName) return null;
  const city = place.addressComponents?.find((component) => component.types?.includes("locality"))?.longText?.trim() ?? "";
  const state = place.addressComponents?.find((component) => component.types?.includes("administrative_area_level_1"))?.shortText?.trim() ?? "";
  return {
    source: "google",
    businessName,
    website: place.websiteUri?.trim() ?? "",
    profileUrl: place.googleMapsUri?.trim() ?? "",
    phone: place.nationalPhoneNumber?.trim() ?? "",
    address: place.formattedAddress?.trim() ?? "",
    city,
    state,
    latitude: finiteNumber(place.location?.latitude),
    longitude: finiteNumber(place.location?.longitude),
  };
}

function azurePlaceEvidence(place: AzurePoiCandidate): DiscoveryIdentityEvidence | null {
  const businessName = place.poi?.name?.trim() ?? "";
  if (!businessName) return null;
  const city = place.address?.localName?.trim() || place.address?.municipality?.trim() || "";
  const state = place.address?.countrySubdivisionCode?.trim() ?? "";
  const address = place.address?.freeformAddress?.trim()
    || [
      place.address?.streetNumber,
      place.address?.streetName,
      city,
      state,
      place.address?.postalCode,
    ].map((value) => value?.trim()).filter(Boolean).join(" ");
  return {
    source: "bing",
    businessName,
    website: place.poi?.url?.trim() ?? "",
    profileUrl: "",
    phone: place.poi?.phone?.trim() ?? "",
    address,
    city,
    state,
    latitude: finiteNumber(place.position?.lat),
    longitude: finiteNumber(place.position?.lon),
  };
}

function uniqueExactEvidence(
  prospect: Prospect,
  candidates: DiscoveryIdentityEvidence[],
  bindings: ReturnType<typeof knownIdentityBindings>,
) {
  const matching = candidates.filter((candidate) => evidenceMatchesProspect(prospect, candidate, bindings));
  const distinct = new Map<string, DiscoveryIdentityEvidence>();
  for (const candidate of matching) {
    const key = [
      identityNameKey(candidate.businessName),
      normalizedCompletePhone(candidate.phone),
      normalizedStreetAddress(candidate.address),
      normalizedHost(candidate.website),
    ].join("|");
    distinct.set(key, candidate);
  }
  if (distinct.size !== 1) return [];
  return [...distinct.values()];
}

function domainTokens(value: string) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => !legalSuffixTokens.has(token));
}

function compactSlug(value: string) {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact || compact.length > 48 || !/[a-z]/.test(compact)) return "";
  return compact;
}

function safeSlug(value: string) {
  const compact = compactSlug(value);
  if (compact.length < 6) return "";
  return compact;
}

function locationSuffix(value: string) {
  const compact = compactSlug(value);
  if (compact.length < 2 || compact.length > 24) return "";
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
  const brandBase = compactSlug(brandTokens.slice(0, 2).join(""));
  const preferredService = preferredServiceTokens.find((token) => tokens.includes(token)) ?? "";
  const brandServiceBase = preferredService ? safeSlug(`${brandBase}${preferredService}`) : "";
  const state = locationSuffix(prospect.state);
  const city = locationSuffix(prospect.city);

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
 * For a fresh no-site candidate that only has one provider identity, query one missing
 * authoritative provider by exact business identity. This does not relax the two-provider rule:
 * it only contributes a second provider signal when the normalized business name and a complete
 * phone or exact street address agree with evidence already stored on the prospect.
 *
 * Any website returned by the corroborating provider is preserved in the evidence so the normal
 * owned-site recovery and verification path can block a false no-site conclusion.
 */
export async function discoverIndependentNoSiteIdentityEvidence(
  prospect: Prospect,
  dependencies: OwnedWebsiteRecoveryDependencies = {},
): Promise<DiscoveryIdentityEvidence[]> {
  if (prospect.website.trim() || prospect.inactive || prospect.prospectType !== "no_website_social_only") return [];
  if (prospect.activitySignals.includes("discovery_identity_conflict:same_name")) return [];

  const now = dependencies.now?.() ?? new Date();
  const createdAt = Date.parse(prospect.createdAt);
  if (!Number.isFinite(createdAt) || now.getTime() - createdAt > 7 * 24 * 60 * 60 * 1_000) return [];

  const bindings = knownIdentityBindings(prospect);
  const sources = new Set(bindings.evidence.map((item) => item.source));
  if (sources.size === 0 || sources.size >= 2 || (bindings.phones.size === 0 && bindings.addresses.size === 0)) return [];
  if (bindings.evidence.some((item) => isCredibleOwnedWebsiteCandidate(item.website))) return [];

  const query = boundedQuery(prospect);
  if (!query) return [];
  const fetchImpl = dependencies.fetch ?? fetch;
  const timeoutMs = Math.min(6_000, Math.max(750, dependencies.timeoutMs ?? 5_000));

  const azureMapsKey = (dependencies.azureMapsApiKey ?? process.env.AZURE_MAPS_API_KEY ?? "").trim();
  if (!sources.has("bing") && azureMapsKey) {
    try {
      const url = new URL(process.env.AZURE_MAPS_POI_API_URL?.trim() || "https://atlas.microsoft.com/search/poi/json");
      url.searchParams.set("api-version", "1.0");
      url.searchParams.set("subscription-key", azureMapsKey);
      url.searchParams.set("query", query);
      url.searchParams.set("limit", "5");
      const anchor = bindings.evidence.find((item) => item.latitude !== null && item.longitude !== null);
      if (anchor?.latitude !== null && anchor?.longitude !== null) {
        url.searchParams.set("lat", String(anchor.latitude));
        url.searchParams.set("lon", String(anchor.longitude));
        url.searchParams.set("radius", "10000");
      }
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json", "User-Agent": "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const payload = await response.json() as AzureMapsSearchResponse;
        const evidence = uniqueExactEvidence(
          prospect,
          (payload.results ?? []).map(azurePlaceEvidence).filter((item): item is DiscoveryIdentityEvidence => Boolean(item)),
          bindings,
        );
        if (evidence.length) return evidence;
      }
    } catch {
      // Corroboration is optional and fails closed.
    }
  }

  const googlePlacesApiKey = (
    dependencies.googlePlacesApiKey
    ?? dependencies.apiKey
    ?? process.env.GOOGLE_PLACES_API_KEY
    ?? ""
  ).trim();
  if (!sources.has("google") && googlePlacesApiKey) {
    try {
      const response = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googlePlacesApiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.location,places.addressComponents",
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const payload = await response.json() as GooglePlacesSearchResponse;
        return uniqueExactEvidence(
          prospect,
          (payload.places ?? []).map(googlePlaceEvidence).filter((item): item is DiscoveryIdentityEvidence => Boolean(item)),
          bindings,
        );
      }
    } catch {
      // Corroboration is optional and fails closed.
    }
  }

  return [];
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

  const apiKey = (
    dependencies.googlePlacesApiKey
    ?? dependencies.apiKey
    ?? process.env.GOOGLE_PLACES_API_KEY
    ?? ""
  ).trim();
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
