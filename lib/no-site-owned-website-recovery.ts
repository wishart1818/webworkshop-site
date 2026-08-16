import type { Prospect } from "@/lib/prospect-engine";
import {
  discoveryIdentityEvidenceFromSignals,
  discoveryIdentityEvidenceIsFresh,
  isCredibleOwnedWebsiteCandidate,
  normalizedBusinessIdentityName,
  normalizedCompletePhone,
  normalizedStreetAddress,
  type DiscoveryIdentityEvidence,
} from "@/lib/prospect-identity-evidence";
import {
  resolveProviderIdentityCandidates,
  type ProviderIdentityResolution,
} from "@/lib/prospect-identity-resolution";

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
  // This permits a targeted recheck of a persisted manual record; it does not make old evidence current for qualification.
  allowHistoricalLookup?: boolean;
  // A stale no-site refresh must collect current provider observations instead of trusting stored source membership.
  forceCurrentProviderRefresh?: boolean;
};

export type TargetedProviderIdentityLookup = {
  evidence: DiscoveryIdentityEvidence[];
  resolution: ProviderIdentityResolution;
};

export type TargetedOwnedWebsiteLookup = TargetedProviderIdentityLookup & {
  candidates: OwnedWebsiteRecoveryCandidate[];
};

export type OwnedWebsiteCandidateProvenance = "provider_supplied" | "deterministic_guess";

export type OwnedWebsiteRecoveryCandidate = {
  url: string;
  provenance: OwnedWebsiteCandidateProvenance;
  provider: DiscoveryIdentityEvidence["source"] | "";
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

function identityLookupIsAllowed(
  prospect: Prospect,
  dependencies: OwnedWebsiteRecoveryDependencies,
) {
  if (dependencies.allowHistoricalLookup || dependencies.forceCurrentProviderRefresh) return true;
  const now = dependencies.now?.() ?? new Date();
  return discoveryIdentityEvidenceFromSignals(prospect.activitySignals)
    .some((evidence) => discoveryIdentityEvidenceIsFresh(evidence, now));
}

function corroborationQueries(
  prospect: Prospect,
  bindings: ReturnType<typeof knownIdentityBindings>,
) {
  const compact = (parts: string[]) => parts
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
  const phone = [...bindings.phones][0] ?? "";
  return [...new Set([
    boundedQuery(prospect),
    compact([prospect.businessName, prospect.city, prospect.state]),
    phone ? compact([prospect.businessName, phone]) : "",
  ].filter(Boolean))].slice(0, 3);
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function googlePlaceEvidence(place: GooglePlaceCandidate, observedAt: string): DiscoveryIdentityEvidence | null {
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
    observedAt,
  };
}

function azurePlaceEvidence(place: AzurePoiCandidate, observedAt: string): DiscoveryIdentityEvidence | null {
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
    observedAt,
  };
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
 * Retrieval uses a tiny bounded set of identity-preserving queries so a provider does not have to
 * index the exact same address-heavy search string as the first provider. Every returned result
 * still has to pass the same exact name + phone/address binding, and multiple distinct exact
 * matches fail closed.
 *
 * Any website returned by the corroborating provider is preserved in the evidence so the normal
 * owned-site recovery and verification path can block a false no-site conclusion.
 */
export async function discoverIndependentNoSiteIdentityEvidence(
  prospect: Prospect,
  dependencies: OwnedWebsiteRecoveryDependencies = {},
): Promise<DiscoveryIdentityEvidence[]> {
  return (await discoverIndependentNoSiteIdentityResolution(prospect, dependencies))?.evidence ?? [];
}

export async function discoverIndependentNoSiteIdentityResolution(
  prospect: Prospect,
  dependencies: OwnedWebsiteRecoveryDependencies = {},
): Promise<TargetedProviderIdentityLookup | null> {
  if (prospect.website.trim() || prospect.inactive || prospect.prospectType !== "no_website_social_only") return null;

  if (!identityLookupIsAllowed(prospect, dependencies)) return null;

  const bindings = knownIdentityBindings(prospect);
  const sources = new Set(bindings.evidence.map((item) => item.source));
  const forceCurrentRefresh = dependencies.forceCurrentProviderRefresh === true;
  if (
    (!forceCurrentRefresh && (sources.size === 0 || sources.size >= 2))
    || (bindings.phones.size === 0 && bindings.addresses.size === 0)
  ) return null;
  if (!forceCurrentRefresh && bindings.evidence.some((item) => isCredibleOwnedWebsiteCandidate(item.website))) return null;

  const queries = corroborationQueries(prospect, bindings);
  if (!queries.length) return null;
  const fetchImpl = dependencies.fetch ?? fetch;
  const timeoutMs = Math.min(6_000, Math.max(750, dependencies.timeoutMs ?? 5_000));
  const observedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const resolutionProspect = forceCurrentRefresh
    ? {
        ...prospect,
        activitySignals: prospect.activitySignals.filter((signal) => !signal.startsWith("discovery_identity_evidence:")),
      }
    : prospect;
  const resolutions: ProviderIdentityResolution[] = [];
  const currentEvidence: DiscoveryIdentityEvidence[] = [];
  let currentProviderResponseAvailable = false;

  const azureMapsKey = (dependencies.azureMapsApiKey ?? process.env.AZURE_MAPS_API_KEY ?? "").trim();
  if ((forceCurrentRefresh || !sources.has("bing")) && azureMapsKey) {
    const anchor = bindings.evidence.find((item) => item.latitude !== null && item.longitude !== null);
    const batches = await Promise.all(queries.map(async (query): Promise<DiscoveryIdentityEvidence[]> => {
      try {
        const url = new URL(process.env.AZURE_MAPS_POI_API_URL?.trim() || "https://atlas.microsoft.com/search/poi/json");
        url.searchParams.set("api-version", "1.0");
        url.searchParams.set("subscription-key", azureMapsKey);
        url.searchParams.set("query", query);
        url.searchParams.set("limit", "5");
        if (anchor && anchor.latitude !== null && anchor.longitude !== null) {
          url.searchParams.set("lat", String(anchor.latitude));
          url.searchParams.set("lon", String(anchor.longitude));
          url.searchParams.set("radius", "10000");
        }
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json", "User-Agent": "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return [];
        currentProviderResponseAvailable = true;
        const payload = await response.json() as AzureMapsSearchResponse;
        return (payload.results ?? [])
          .map((place) => azurePlaceEvidence(place, observedAt))
          .filter((item): item is DiscoveryIdentityEvidence => Boolean(item));
      } catch {
        return [];
      }
    }));
    const resolution = resolveProviderIdentityCandidates(resolutionProspect, batches.flat());
    resolutions.push(resolution);
    if (resolution.matchedEvidence) currentEvidence.push(resolution.matchedEvidence);
  }

  const googlePlacesApiKey = (
    dependencies.googlePlacesApiKey
    ?? dependencies.apiKey
    ?? process.env.GOOGLE_PLACES_API_KEY
    ?? ""
  ).trim();
  if ((forceCurrentRefresh || !sources.has("google")) && googlePlacesApiKey) {
    const batches = await Promise.all(queries.map(async (query): Promise<DiscoveryIdentityEvidence[]> => {
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
        if (!response.ok) return [];
        currentProviderResponseAvailable = true;
        const payload = await response.json() as GooglePlacesSearchResponse;
        return (payload.places ?? [])
          .map((place) => googlePlaceEvidence(place, observedAt))
          .filter((item): item is DiscoveryIdentityEvidence => Boolean(item));
      } catch {
        return [];
      }
    }));
    const resolution = resolveProviderIdentityCandidates(resolutionProspect, batches.flat());
    resolutions.push(resolution);
    if (resolution.matchedEvidence) currentEvidence.push(resolution.matchedEvidence);
  }

  if (!resolutions.length || (forceCurrentRefresh && !currentProviderResponseAvailable)) return null;
  const unsafeResolution = resolutions.find((resolution) => resolution.status === "ambiguous");
  if (unsafeResolution) return { evidence: [], resolution: unsafeResolution };
  const strongResolutions = resolutions.filter((resolution) => resolution.status === "strong_match");
  const first = strongResolutions[0] ?? resolutions[0]!;
  if (!strongResolutions.length) return { evidence: [], resolution: first };
  return {
    evidence: currentEvidence,
    resolution: {
      ...first,
      matchedSignals: [...new Set(strongResolutions.flatMap((resolution) => resolution.matchedSignals))],
      plausibleCandidateCount: strongResolutions.reduce((sum, resolution) => sum + resolution.plausibleCandidateCount, 0),
      reason: currentEvidence.length > 1
        ? `Current ${currentEvidence.map((item) => item.source).join(" and ")} provider records independently matched the stored business identity.`
        : first.reason,
    },
  };
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
  return (await discoverGoogleOwnedWebsiteResolution(prospect, dependencies))?.candidates.map((candidate) => candidate.url) ?? [];
}

export async function discoverGoogleOwnedWebsiteResolution(
  prospect: Prospect,
  dependencies: OwnedWebsiteRecoveryDependencies = {},
): Promise<TargetedOwnedWebsiteLookup | null> {
  if (prospect.website.trim() || prospect.inactive || prospect.prospectType !== "no_website_social_only") return null;

  if (!identityLookupIsAllowed(prospect, dependencies)) return null;

  const bindings = knownIdentityBindings(prospect);
  const expectedName = identityNameKey(prospect.businessName);
  const hasMatchingGoogleEvidence = bindings.evidence.some((item) => (
    item.source === "google" && identityNameKey(item.businessName) === expectedName
  ));
  if (!hasMatchingGoogleEvidence || (bindings.phones.size === 0 && bindings.addresses.size === 0)) return null;

  const apiKey = (
    dependencies.googlePlacesApiKey
    ?? dependencies.apiKey
    ?? process.env.GOOGLE_PLACES_API_KEY
    ?? ""
  ).trim();
  if (!apiKey) return null;

  const query = boundedQuery(prospect);
  if (!query) return null;
  const fetchImpl = dependencies.fetch ?? fetch;
  const timeoutMs = Math.min(6_000, Math.max(750, dependencies.timeoutMs ?? 5_000));
  const observedAt = (dependencies.now?.() ?? new Date()).toISOString();

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
    if (!response.ok) return null;

    const payload = await response.json() as GooglePlacesSearchResponse;
    const evidence = (payload.places ?? [])
      .map((place) => googlePlaceEvidence(place, observedAt))
      .filter((item): item is DiscoveryIdentityEvidence => Boolean(item));
    const resolution = resolveProviderIdentityCandidates(prospect, evidence);
    const matched = resolution.matchedEvidence;
    const candidates = matched && isCredibleOwnedWebsiteCandidate(matched.website)
      ? [matched.website]
      : [];

    if (candidates.length) {
      const hosts = new Set(candidates.map(normalizedHost).filter(Boolean));
      if (hosts.size !== 1) return { evidence: [], resolution: { ...resolution, status: "ambiguous", confidenceSufficient: false }, candidates: [] };
      return {
        evidence: matched ? [matched] : [],
        resolution,
        candidates: candidates.slice(0, 3).map((url) => ({ url, provenance: "provider_supplied" as const, provider: "google" as const })),
      };
    }

    if (!matched) return { evidence: [], resolution, candidates: [] };
    return {
      evidence: [matched],
      resolution,
      candidates: deterministicOwnedWebsiteCandidates(prospect).map((url) => ({
        url,
        provenance: "deterministic_guess" as const,
        provider: "" as const,
      })),
    };
  } catch {
    return null;
  }
}
