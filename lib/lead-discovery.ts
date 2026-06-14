import {
  classifyProspectPresence,
  recommendProspectContactMethod,
  tradeCategories,
  type ProspectClassification,
  type ProspectSearchType,
  type ProspectType,
  type RecommendedContactMethod,
  type TradeCategory,
} from "@/lib/prospect-engine";
import { TopProspectStageError } from "@/lib/top-prospect-diagnostics";

export type DiscoveredLead = {
  businessName: string;
  website: string;
  profileUrl: string;
  prospectType: ProspectType;
  classification: ProspectClassification;
  phone: string;
  email: string;
  contactFormUrl: string;
  address: string;
  city: string;
  state: string;
  trade: TradeCategory;
  serviceArea: string;
  sources?: DiscoverySource[];
  sourceConfidence?: number;
  rating?: number;
  reviewCount?: number;
  recentReviewCount?: number;
  activitySignals?: string[];
  recommendedContactMethod: RecommendedContactMethod;
  inactive: boolean;
};

export const discoverySources = ["osm", "google", "bing", "yelp", "yellowPages"] as const;
export type DiscoverySource = (typeof discoverySources)[number];
export type DiscoverySourceCounts = Record<DiscoverySource, number>;

export const discoveryProviders = ["osm", "azureMaps", "googlePlaces", "yelp"] as const;
export type DiscoveryProvider = (typeof discoveryProviders)[number];
export type DiscoveryProviderStatus = "not_recorded" | "not_configured" | "succeeded" | "failed" | "timed_out" | "zero_results";
export type DiscoveryProviderDiagnostic = {
  configured: boolean | null;
  queryExecuted: boolean | null;
  status: DiscoveryProviderStatus;
  returnedCount: number;
  withinRadiusCount: number;
  afterDeduplicationCount: number;
  usableWebsiteCount: number;
};
export type DiscoveryProviderDiagnostics = Record<DiscoveryProvider, DiscoveryProviderDiagnostic>;

export type DiscoveryDiagnostics = {
  rawProviderCount: number;
  afterDistanceFilteringCount: number;
  afterDuplicateFilteringCount: number;
  afterQualificationFilteringCount: number;
  returnedCount: number;
  radiusKm: number;
  categorySignals: string[];
  sourceCounts: DiscoverySourceCounts;
  providerDiagnostics: DiscoveryProviderDiagnostics;
  finalMergedCount: number;
};

export type DiscoveryResult = {
  leads: DiscoveredLead[];
  diagnostics: DiscoveryDiagnostics;
};

export type DiscoveryLogEvent =
  | "provider_queried"
  | "provider_returned_count"
  | "provider_enrichment_failed"
  | "provider_diagnostics"
  | "filtering_started";

export type DiscoveryLogger = (event: DiscoveryLogEvent, metadata: Record<string, boolean | number | string>) => void;

export type DiscoveryCandidate = {
  businessName: string;
  website?: string;
  profileUrl?: string;
  phone?: string;
  email?: string;
  contactFormUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  source: DiscoverySource;
  rating?: number;
  reviewCount?: number;
  recentReviewCount?: number;
  activitySignals?: string[];
  inactive?: boolean;
};

export type OverpassElement = {
  id?: number;
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type TradeDiscoverySignals = {
  exactCrafts: string[];
  namePattern: string;
};

// Keep the public Overpass query bounded. Broad website/operator regex selectors can time out
// before the provider returns any candidates.
const descriptiveTradeTags = ["name"] as const;

const signalsByTrade: Record<TradeCategory, TradeDiscoverySignals> = {
  Roofing: { exactCrafts: ["roofer"], namePattern: "roof|roofing" },
  HVAC: { exactCrafts: ["hvac"], namePattern: "hvac|heating|cooling|air conditioning" },
  Landscaping: { exactCrafts: ["landscaper"], namePattern: "landscap|lawn care|lawn service" },
  Plumbing: { exactCrafts: ["plumber"], namePattern: "plumb" },
  Electrical: { exactCrafts: ["electrician"], namePattern: "electric" },
  "Power Washing": { exactCrafts: [], namePattern: "power wash|pressure wash|soft wash" },
  "General Contractor": { exactCrafts: ["builder"], namePattern: "general contractor|construction|remodel" },
};

const globalDiscovery = globalThis as typeof globalThis & { lastDiscoveryAt?: number };

function validTrade(value: unknown): value is TradeCategory {
  return typeof value === "string" && tradeCategories.includes(value as TradeCategory);
}

function normalizeWebsite(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported website protocol.");
  return url.href;
}

const socialOrProfileHosts = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "g.page",
  "maps.app.goo.gl",
  "google.com",
  "yelp.com",
];

export function isSocialOrBusinessProfileUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(normalizeWebsite(value));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return socialOrProfileHosts.some((profileHost) => host === profileHost || host.endsWith(`.${profileHost}`));
  } catch {
    return false;
  }
}

export function isUsableBusinessWebsite(value: string | undefined) {
  return validWebsite(value) && !isSocialOrBusinessProfileUrl(value);
}

function websiteKey(value: string) {
  return new URL(normalizeWebsite(value)).hostname.replace(/^www\./, "").toLowerCase();
}

function validWebsite(value: string | undefined) {
  if (!value) return false;
  try {
    normalizeWebsite(value);
    return true;
  } catch {
    return false;
  }
}

function providerUrl(value: string | undefined, fallback?: string) {
  try {
    return new URL(value?.trim() || fallback || "");
  } catch {
    return null;
  }
}

function nameKey(value: string) {
  return value.toLowerCase().replace(/\b(llc|inc|company|co|corp|corporation|services?)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function phoneKey(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

function emptySourceCounts(): DiscoverySourceCounts {
  return { osm: 0, google: 0, bing: 0, yelp: 0, yellowPages: 0 };
}

function providerDiagnostic(
  configured: boolean | null,
  queryExecuted: boolean | null,
  status: DiscoveryProviderStatus,
  returnedCount = 0,
): DiscoveryProviderDiagnostic {
  return {
    configured,
    queryExecuted,
    status,
    returnedCount,
    withinRadiusCount: 0,
    afterDeduplicationCount: 0,
    usableWebsiteCount: 0,
  };
}

function emptyProviderDiagnostics(): DiscoveryProviderDiagnostics {
  return {
    osm: providerDiagnostic(true, false, "zero_results"),
    azureMaps: providerDiagnostic(false, false, "not_configured"),
    googlePlaces: providerDiagnostic(false, false, "not_configured"),
    yelp: providerDiagnostic(false, false, "not_configured"),
  };
}

function inferredProviderDiagnostics(sourceCounts: DiscoverySourceCounts): DiscoveryProviderDiagnostics {
  const inferred = emptyProviderDiagnostics();
  inferred.osm = providerDiagnostic(true, null, sourceCounts.osm ? "succeeded" : "zero_results", sourceCounts.osm);
  inferred.azureMaps = providerDiagnostic(null, null, "not_recorded", sourceCounts.bing);
  inferred.googlePlaces = providerDiagnostic(null, null, "not_recorded", sourceCounts.google);
  inferred.yelp = providerDiagnostic(null, null, "not_recorded", sourceCounts.yelp);
  return inferred;
}

function normalizeProviderDiagnostics(value: unknown, sourceCounts: DiscoverySourceCounts): DiscoveryProviderDiagnostics {
  const fallback = inferredProviderDiagnostics(sourceCounts);
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<DiscoveryProvider, Partial<DiscoveryProviderDiagnostic>>>
    : {};
  return Object.fromEntries(discoveryProviders.map((provider) => {
    const item = candidate[provider];
    const validStatus = item?.status && ["not_recorded", "not_configured", "succeeded", "failed", "timed_out", "zero_results"].includes(item.status)
      ? item.status as DiscoveryProviderStatus
      : fallback[provider].status;
    return [provider, {
      configured: typeof item?.configured === "boolean" || item?.configured === null ? item.configured : fallback[provider].configured,
      queryExecuted: typeof item?.queryExecuted === "boolean" || item?.queryExecuted === null ? item.queryExecuted : fallback[provider].queryExecuted,
      status: validStatus,
      returnedCount: finiteNumber(item?.returnedCount) ?? fallback[provider].returnedCount,
      withinRadiusCount: finiteNumber(item?.withinRadiusCount) ?? fallback[provider].withinRadiusCount,
      afterDeduplicationCount: finiteNumber(item?.afterDeduplicationCount) ?? fallback[provider].afterDeduplicationCount,
      usableWebsiteCount: finiteNumber(item?.usableWebsiteCount) ?? fallback[provider].usableWebsiteCount,
    }];
  })) as DiscoveryProviderDiagnostics;
}

const providerSources: Record<DiscoveryProvider, DiscoverySource> = {
  osm: "osm",
  azureMaps: "bing",
  googlePlaces: "google",
  yelp: "yelp",
};

function normalizeSourceCounts(value: unknown): DiscoverySourceCounts {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DiscoverySourceCounts> : {};
  return {
    osm: finiteNumber(candidate.osm) ?? 0,
    google: finiteNumber(candidate.google) ?? 0,
    bing: finiteNumber(candidate.bing) ?? 0,
    yelp: finiteNumber(candidate.yelp) ?? 0,
    yellowPages: finiteNumber(candidate.yellowPages) ?? 0,
  };
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sourceConfidence(candidate: {
  sources: DiscoverySource[];
  website?: string;
  phone?: string;
  email?: string;
  reviewCount?: number;
  recentReviewCount?: number;
}) {
  const sourceWeight: Record<DiscoverySource, number> = {
    osm: 18,
    google: 30,
    bing: 24,
    yelp: 22,
    yellowPages: 18,
  };
  const sourceScore = candidate.sources.reduce((score, source) => score + sourceWeight[source], 0);
  return Math.min(100, sourceScore
    + (candidate.website ? 18 : 0)
    + (candidate.phone ? 12 : 0)
    + (candidate.email ? 8 : 0)
    + Math.min(8, Math.floor((candidate.reviewCount ?? 0) / 10))
    + Math.min(10, (candidate.recentReviewCount ?? 0) * 2));
}

function elementCoordinates(element: OverpassElement) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;
}

export function distanceKm(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function discoveryCategorySignals(trade: TradeCategory) {
  const signals = signalsByTrade[trade];
  return [
    ...signals.exactCrafts.map((craft) => `craft=${craft}`),
    ...descriptiveTradeTags.map((tag) => `${tag}~${signals.namePattern}`),
  ];
}

export function buildTradeDiscoveryQueries(trade: TradeCategory, radiusMeters: number, latitude: number, longitude: number) {
  const signals = signalsByTrade[trade];
  const exactSelectors = signals.exactCrafts.map((craft) => `nwr["craft"="${craft}"](around:${radiusMeters},${latitude},${longitude});`);
  const enrichmentSelectors = descriptiveTradeTags.map((tag) => `nwr["${tag}"~"${signals.namePattern}",i](around:${radiusMeters},${latitude},${longitude});`);
  const query = (selectors: string[], timeout: number) => `[out:json][timeout:${timeout}];(${selectors.join("")});out tags center;`;
  return {
    primary: exactSelectors.length ? query(exactSelectors, 20) : query(enrichmentSelectors, 20),
    enrichment: exactSelectors.length ? query(enrichmentSelectors, 8) : null,
  };
}

export function inactivePublicRecord(tags: Record<string, string>) {
  return Boolean(
    tags.disused
    || tags.abandoned
    || tags["disused:craft"]
    || tags["abandoned:craft"]
    || tags["was:craft"]
    || tags.end_date
    || /^(closed|permanently closed)$/i.test(tags.opening_hours?.trim() ?? ""),
  );
}

function overpassCandidates(elements: OverpassElement[]): DiscoveryCandidate[] {
  return elements.flatMap((element) => {
    const tags = element.tags ?? {};
    const businessName = tags.name?.trim();
    if (!businessName) return [];
    const coordinates = elementCoordinates(element);
    return [{
      businessName,
      website: tags.website || tags["contact:website"],
      profileUrl: tags.facebook || tags.instagram || tags["contact:facebook"] || tags["contact:instagram"],
      phone: tags.phone || tags["contact:phone"],
      email: tags.email || tags["contact:email"],
      contactFormUrl: tags["contact:form"],
      address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:state"]].filter(Boolean).join(" "),
      city: tags["addr:city"],
      state: tags["addr:state"],
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      source: "osm" as const,
      inactive: inactivePublicRecord(tags),
      activitySignals: tags.opening_hours ? ["public_hours"] : undefined,
    }];
  });
}

export function mergeDiscoveryCandidates(input: {
  candidates: DiscoveryCandidate[];
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit: number;
  prospectType?: ProspectSearchType;
  sourceCounts?: DiscoverySourceCounts;
  providerDiagnostics?: DiscoveryProviderDiagnostics;
  logger?: DiscoveryLogger;
}): DiscoveryResult {
  let withinRadius: DiscoveryCandidate[];
  try {
    withinRadius = input.candidates.filter((candidate) => {
      if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude)) return true;
      return distanceKm(input.latitude, input.longitude, Number(candidate.latitude), Number(candidate.longitude)) <= input.radiusKm;
    });
  } catch (error) {
    throw new TopProspectStageError(
      "radius_filter_error",
      "The returned business records could not be filtered by the requested radius.",
      { cause: error },
    );
  }

  const merged: Array<DiscoveryCandidate & { sources: DiscoverySource[] }> = [];
  for (const candidate of withinRadius) {
    if (candidate.inactive || !candidate.businessName.trim()) continue;
    let domain = "";
    try {
      if (candidate.website) domain = websiteKey(candidate.website);
    } catch {
      // Malformed websites can still enrich a matching record by name or phone.
    }
    const normalizedName = nameKey(candidate.businessName);
    const normalizedPhone = phoneKey(candidate.phone ?? "");
    const existing = merged.find((record) => {
      let recordDomain = "";
      try {
        if (record.website) recordDomain = websiteKey(record.website);
      } catch {
        // Ignore malformed website matches.
      }
      return Boolean(domain && recordDomain === domain)
        || Boolean(normalizedPhone && normalizedPhone === phoneKey(record.phone ?? ""))
        || Boolean(normalizedName && normalizedName === nameKey(record.businessName));
    });
    if (!existing) {
      merged.push({ ...candidate, sources: [candidate.source] });
      continue;
    }
    if (!existing.sources.includes(candidate.source)) existing.sources.push(candidate.source);
    if (!isUsableBusinessWebsite(existing.website) && isUsableBusinessWebsite(candidate.website)) existing.website = candidate.website;
    existing.profileUrl ||= candidate.profileUrl || (isSocialOrBusinessProfileUrl(candidate.website) ? candidate.website : undefined);
    existing.phone ||= candidate.phone;
    existing.email ||= candidate.email;
    existing.contactFormUrl ||= candidate.contactFormUrl;
    existing.address ||= candidate.address;
    existing.city ||= candidate.city;
    existing.state ||= candidate.state;
    existing.latitude ??= candidate.latitude;
    existing.longitude ??= candidate.longitude;
    existing.rating = Math.max(existing.rating ?? 0, candidate.rating ?? 0) || undefined;
    existing.reviewCount = Math.max(existing.reviewCount ?? 0, candidate.reviewCount ?? 0) || undefined;
    existing.recentReviewCount = Math.max(existing.recentReviewCount ?? 0, candidate.recentReviewCount ?? 0) || undefined;
    existing.activitySignals = [...new Set([...(existing.activitySignals ?? []), ...(candidate.activitySignals ?? [])])];
    existing.inactive ||= candidate.inactive;
  }

  const qualified = merged.flatMap((candidate): DiscoveredLead[] => {
    const requestedType = input.prospectType ?? "redesign";
    const ownedWebsite = isUsableBusinessWebsite(candidate.website) ? candidate.website : "";
    const profileUrl = candidate.profileUrl || (isSocialOrBusinessProfileUrl(candidate.website) ? candidate.website : "");
    const prospectType: ProspectType = ownedWebsite ? "redesign" : "no_website_social_only";
    const activitySignals = [
      ...(candidate.activitySignals ?? []),
      ...((candidate.reviewCount ?? 0) > 0 ? ["public_reviews"] : []),
      ...((candidate.recentReviewCount ?? 0) > 0 ? ["recent_reviews"] : []),
      ...((candidate.rating ?? 0) > 0 ? ["public_rating"] : []),
      ...(profileUrl ? ["public_profile"] : []),
      ...(candidate.sources.length > 1 ? ["multiple_public_sources"] : []),
    ];
    const hasActivity = (candidate.reviewCount ?? 0) > 0
      || (candidate.recentReviewCount ?? 0) > 0
      || (candidate.rating ?? 0) > 0
      || Boolean(profileUrl)
      || candidate.sources.length > 1
      || activitySignals.length > 0;
    if (requestedType === "redesign" && prospectType !== "redesign") return [];
    if (requestedType === "no_website_social_only" && prospectType !== "no_website_social_only") return [];
    if (prospectType === "no_website_social_only" && !hasActivity) return [];
    try {
      const website = ownedWebsite ? normalizeWebsite(ownedWebsite) : "";
      const normalizedProfileUrl = profileUrl && validWebsite(profileUrl) ? normalizeWebsite(profileUrl) : "";
      const taggedState = candidate.state?.trim() ?? "";
      const classification = candidate.inactive
        ? "duplicate_bad_fit" as const
        : classifyProspectPresence({
            website,
            profileUrl: normalizedProfileUrl,
            phone: candidate.phone ?? "",
            email: candidate.email ?? "",
            contactFormUrl: candidate.contactFormUrl ?? "",
          });
      const recommendedContactMethod = recommendProspectContactMethod({
        classification,
        profileUrl: normalizedProfileUrl,
        phone: candidate.phone ?? "",
        email: candidate.email ?? "",
        contactFormUrl: candidate.contactFormUrl ?? "",
        inactive: candidate.inactive ?? false,
      });
      return [{
        businessName: candidate.businessName.trim(),
        website,
        profileUrl: normalizedProfileUrl,
        prospectType,
        classification,
        phone: candidate.phone ?? "",
        email: candidate.email ?? "",
        contactFormUrl: candidate.contactFormUrl ?? "",
        address: candidate.address ?? "",
        city: candidate.city?.trim() || input.city.trim(),
        state: (/^[A-Za-z]{2}$/.test(taggedState) ? taggedState : input.state).toUpperCase(),
        trade: input.trade,
        serviceArea: `${input.city.trim()} and nearby communities`,
        sources: candidate.sources,
        sourceConfidence: sourceConfidence(candidate),
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        recentReviewCount: candidate.recentReviewCount,
        activitySignals: [...new Set(activitySignals)],
        recommendedContactMethod,
        inactive: candidate.inactive ?? false,
      }];
    } catch {
      return [];
    }
  }).sort((a, b) => (b.sourceConfidence ?? 0) - (a.sourceConfidence ?? 0)
    || Number(Boolean(b.email)) - Number(Boolean(a.email))
    || Number(Boolean(b.contactFormUrl)) - Number(Boolean(a.contactFormUrl))
    || Number(Boolean(b.phone)) - Number(Boolean(a.phone))
    || (b.recentReviewCount ?? 0) - (a.recentReviewCount ?? 0)
    || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));

  const providerDiagnostics = normalizeProviderDiagnostics(
    input.providerDiagnostics ?? inferredProviderDiagnostics(input.sourceCounts ?? emptySourceCounts()),
    input.sourceCounts ?? emptySourceCounts(),
  );
  for (const provider of discoveryProviders) {
    const diagnostic = providerDiagnostics[provider];
    if (diagnostic.status !== "not_configured") {
      const source = providerSources[provider];
      diagnostic.withinRadiusCount = withinRadius.filter((candidate) => candidate.source === source).length;
      diagnostic.afterDeduplicationCount = merged.filter((candidate) => candidate.sources.includes(source)).length;
      diagnostic.usableWebsiteCount = qualified.filter((lead) => lead.website && lead.sources?.includes(source)).length;
    }
    input.logger?.("provider_diagnostics", {
      provider,
      configured: diagnostic.configured ?? "not_recorded",
      queryExecuted: diagnostic.queryExecuted ?? "not_recorded",
      status: diagnostic.status,
      rawRecordsReturned: diagnostic.returnedCount,
      withinRadiusCount: diagnostic.withinRadiusCount,
      afterDeduplicationCount: diagnostic.afterDeduplicationCount,
      usableWebsiteCount: diagnostic.usableWebsiteCount,
    });
  }

  const leads = qualified.slice(0, input.limit);
  return {
    leads,
    diagnostics: {
      rawProviderCount: input.candidates.length,
      afterDistanceFilteringCount: withinRadius.length,
      afterDuplicateFilteringCount: merged.length,
      afterQualificationFilteringCount: qualified.length,
      returnedCount: leads.length,
      radiusKm: input.radiusKm,
      categorySignals: discoveryCategorySignals(input.trade),
      sourceCounts: input.sourceCounts ?? emptySourceCounts(),
      providerDiagnostics,
      finalMergedCount: merged.length,
    },
  };
}

export function processDiscoveryElements(input: {
  elements: OverpassElement[];
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit: number;
}): DiscoveryResult {
  const sourceCounts = emptySourceCounts();
  sourceCounts.osm = input.elements.length;
  return mergeDiscoveryCandidates({
    ...input,
    candidates: overpassCandidates(input.elements),
    sourceCounts,
    providerDiagnostics: inferredProviderDiagnostics(sourceCounts),
  });
}

export function discoveryLeadsFromJson(value: unknown): DiscoveredLead[] {
  if (Array.isArray(value)) return value as DiscoveredLead[];
  if (!value || typeof value !== "object" || !("leads" in value)) return [];
  return Array.isArray(value.leads) ? value.leads as DiscoveredLead[] : [];
}

export function discoveryDiagnosticsFromJson(value: unknown): DiscoveryDiagnostics | null {
  if (!value || Array.isArray(value) || typeof value !== "object" || !("diagnostics" in value)) return null;
  const diagnostics = value.diagnostics;
  if (!diagnostics || Array.isArray(diagnostics) || typeof diagnostics !== "object") return null;
  const candidate = diagnostics as Partial<DiscoveryDiagnostics>;
  return typeof candidate.rawProviderCount === "number"
    && typeof candidate.afterDistanceFilteringCount === "number"
    && typeof candidate.afterDuplicateFilteringCount === "number"
    && typeof candidate.afterQualificationFilteringCount === "number"
    && typeof candidate.returnedCount === "number"
    && typeof candidate.radiusKm === "number"
    && Array.isArray(candidate.categorySignals)
    ? {
        ...candidate,
        sourceCounts: normalizeSourceCounts(candidate.sourceCounts),
        providerDiagnostics: normalizeProviderDiagnostics(candidate.providerDiagnostics, normalizeSourceCounts(candidate.sourceCounts)),
        finalMergedCount: candidate.finalMergedCount ?? candidate.afterDuplicateFilteringCount,
      } as DiscoveryDiagnostics
    : null;
}

function recentGoogleReviews(reviews: Array<{ publishTime?: string }> | undefined) {
  const cutoff = Date.now() - 18 * 30 * 24 * 60 * 60 * 1000;
  return reviews?.filter((review) => Date.parse(review.publishTime ?? "") >= cutoff).length ?? 0;
}

function parseGooglePlaces(value: unknown): DiscoveryCandidate[] {
  const payload = value as { places?: Array<{
    displayName?: { text?: string };
    websiteUri?: string;
    googleMapsUri?: string;
    nationalPhoneNumber?: string;
    formattedAddress?: string;
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
    reviews?: Array<{ publishTime?: string }>;
  }> };
  return (payload.places ?? []).flatMap((place) => {
    const businessName = place.displayName?.text?.trim();
    if (!businessName) return [];
    const city = place.addressComponents?.find((component) => component.types?.includes("locality"))?.longText;
    const state = place.addressComponents?.find((component) => component.types?.includes("administrative_area_level_1"))?.shortText;
    return [{
      businessName,
      website: place.websiteUri,
      profileUrl: place.googleMapsUri,
      phone: place.nationalPhoneNumber,
      address: place.formattedAddress,
      city,
      state,
      latitude: finiteNumber(place.location?.latitude),
      longitude: finiteNumber(place.location?.longitude),
      rating: finiteNumber(place.rating),
      reviewCount: finiteNumber(place.userRatingCount),
      recentReviewCount: recentGoogleReviews(place.reviews),
      activitySignals: (place.userRatingCount ?? 0) > 0 ? ["google_places_reviews"] : ["google_places_listing"],
      source: "google" as const,
    }];
  });
}

function parseBingLocal(value: unknown): DiscoveryCandidate[] {
  const payload = value as {
    resourceSets?: Array<{ resources?: Array<{
    name?: string;
    Website?: string;
    website?: string;
    PhoneNumber?: string;
    phoneNumber?: string;
    point?: { coordinates?: number[] };
    Address?: { locality?: string; adminDistrict?: string };
    address?: { locality?: string; adminDistrict?: string };
  }> }>;
    results?: Array<{
      poi?: { name?: string; phone?: string; url?: string };
      position?: { lat?: number; lon?: number };
      address?: { municipality?: string; countrySubdivisionCode?: string };
    }>;
  };
  const bing = (payload.resourceSets ?? []).flatMap((set) => set.resources ?? []).flatMap((record) => {
    if (!record.name?.trim()) return [];
    const address = record.Address ?? record.address;
    return [{
      businessName: record.name.trim(),
      website: record.Website ?? record.website,
      phone: record.PhoneNumber ?? record.phoneNumber,
      address: [address?.locality, address?.adminDistrict].filter(Boolean).join(", "),
      city: address?.locality,
      state: address?.adminDistrict,
      latitude: finiteNumber(record.point?.coordinates?.[0]),
      longitude: finiteNumber(record.point?.coordinates?.[1]),
      source: "bing" as const,
    }];
  });
  const azure = (payload.results ?? []).flatMap((record) => record.poi?.name?.trim() ? [{
    businessName: record.poi.name.trim(),
    website: record.poi.url,
      phone: record.poi.phone,
      address: [record.address?.municipality, record.address?.countrySubdivisionCode].filter(Boolean).join(", "),
    city: record.address?.municipality,
    state: record.address?.countrySubdivisionCode,
    latitude: finiteNumber(record.position?.lat),
    longitude: finiteNumber(record.position?.lon),
    source: "bing" as const,
  }] : []);
  return [...bing, ...azure];
}

function parseYelp(value: unknown): DiscoveryCandidate[] {
  const payload = value as { businesses?: Array<{
    name?: string;
    phone?: string;
    display_phone?: string;
    rating?: number;
    review_count?: number;
    url?: string;
    is_closed?: boolean;
    coordinates?: { latitude?: number; longitude?: number };
    location?: { city?: string; state?: string };
  }> };
  return (payload.businesses ?? []).flatMap((record) => record.name?.trim() ? [{
    businessName: record.name.trim(),
    phone: record.display_phone ?? record.phone,
    profileUrl: record.url,
    address: [record.location?.city, record.location?.state].filter(Boolean).join(", "),
    city: record.location?.city,
    state: record.location?.state,
    latitude: finiteNumber(record.coordinates?.latitude),
    longitude: finiteNumber(record.coordinates?.longitude),
    rating: finiteNumber(record.rating),
    reviewCount: finiteNumber(record.review_count),
    activitySignals: (record.review_count ?? 0) > 0 ? ["yelp_reviews"] : ["yelp_listing"],
    inactive: record.is_closed,
    source: "yelp" as const,
  }] : []);
}

function parseLicensedDirectory(value: unknown): DiscoveryCandidate[] {
  const payload = value as { businesses?: unknown[]; results?: unknown[]; records?: unknown[] };
  const records = payload.businesses ?? payload.results ?? payload.records ?? (Array.isArray(value) ? value : []);
  return records.flatMap((item) => {
    const record = item as Record<string, unknown>;
    const businessName = String(record.businessName ?? record.name ?? "").trim();
    if (!businessName) return [];
    return [{
      businessName,
      website: String(record.website ?? record.websiteUrl ?? "") || undefined,
      profileUrl: String(record.profileUrl ?? record.listingUrl ?? record.url ?? "") || undefined,
      phone: String(record.phone ?? record.phoneNumber ?? "") || undefined,
      email: String(record.email ?? record.publicEmail ?? "") || undefined,
      contactFormUrl: String(record.contactFormUrl ?? record.contactUrl ?? "") || undefined,
      address: String(record.address ?? record.formattedAddress ?? "") || undefined,
      city: String(record.city ?? "") || undefined,
      state: String(record.state ?? "") || undefined,
      latitude: finiteNumber(record.latitude ?? record.lat),
      longitude: finiteNumber(record.longitude ?? record.lon),
      rating: finiteNumber(record.rating),
      reviewCount: finiteNumber(record.reviewCount),
      recentReviewCount: finiteNumber(record.recentReviewCount),
      activitySignals: Array.isArray(record.activitySignals)
        ? record.activitySignals.filter((signal): signal is string => typeof signal === "string")
        : undefined,
      source: "yellowPages" as const,
    }];
  });
}

async function optionalProviderCandidates(input: {
  source: Exclude<DiscoverySource, "osm">;
  configured: boolean;
  url: string;
  init?: RequestInit;
  parse: (value: unknown) => DiscoveryCandidate[];
  returnedCount?: (value: unknown) => number;
  logger?: DiscoveryLogger;
  radiusKm: number;
}): Promise<{ candidates: DiscoveryCandidate[]; diagnostic: DiscoveryProviderDiagnostic }> {
  if (!input.configured) return { candidates: [], diagnostic: providerDiagnostic(false, false, "not_configured") };
  input.logger?.("provider_queried", { queryKind: input.source, radiusKm: input.radiusKm });
  try {
    const response = await fetch(input.url, { ...input.init, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) {
      input.logger?.("provider_enrichment_failed", { queryKind: input.source, status: response.status });
      return { candidates: [], diagnostic: providerDiagnostic(true, true, "failed") };
    }
    const payload = await response.json();
    const candidates = input.parse(payload);
    const returnedCount = input.returnedCount?.(payload) ?? candidates.length;
    input.logger?.("provider_returned_count", { queryKind: input.source, rawProviderCount: returnedCount });
    return {
      candidates,
      diagnostic: providerDiagnostic(true, true, returnedCount ? "succeeded" : "zero_results", returnedCount),
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    input.logger?.("provider_enrichment_failed", { queryKind: input.source, reason: timedOut ? "timed_out" : "request_failed" });
    return { candidates: [], diagnostic: providerDiagnostic(true, true, timedOut ? "timed_out" : "failed") };
  }
}

export async function discoverContractorsWithDiagnostics(input: {
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit?: number;
  prospectType?: ProspectSearchType;
  logger?: DiscoveryLogger;
}): Promise<DiscoveryResult> {
  if (!validTrade(input.trade)) throw new Error("Trade category is not supported.");
  if (!input.city.trim() || !/^[A-Za-z .'-]{2,100}$/.test(input.city.trim())) throw new Error("Enter a valid city.");
  if (!/^[A-Za-z]{2}$/.test(input.state.trim())) throw new Error("Enter a two-letter state code.");
  if (![10, 25, 50].includes(input.radiusKm)) throw new Error("Discovery radius is not supported.");
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 25)));

  const now = Date.now();
  if (globalDiscovery.lastDiscoveryAt && now - globalDiscovery.lastDiscoveryAt < 5_000) {
    throw new TopProspectStageError(
      "discovery_provider_error",
      "Discovery is temporarily rate-limited. Retry after a few seconds.",
    );
  }
  globalDiscovery.lastDiscoveryAt = now;

  const nominatimUrl = process.env.NOMINATIM_API_URL?.trim() || "https://nominatim.openstreetmap.org/search";
  const overpassUrl = process.env.OVERPASS_API_URL?.trim() || "https://overpass-api.de/api/interpreter";
  const headers = {
    "User-Agent": "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)",
    Accept: "application/json",
  };

  const geocodeUrl = new URL(nominatimUrl);
  geocodeUrl.searchParams.set("q", `${input.city}, ${input.state}, USA`);
  geocodeUrl.searchParams.set("format", "jsonv2");
  geocodeUrl.searchParams.set("limit", "1");
  geocodeUrl.searchParams.set("countrycodes", "us");
  let geocodeResponse: Response;
  try {
    geocodeResponse = await fetch(geocodeUrl, { headers, signal: AbortSignal.timeout(12_000) });
  } catch (error) {
    throw new TopProspectStageError(
      "geocoding_error",
      error instanceof DOMException && error.name === "TimeoutError"
        ? "The location lookup timed out before the requested city and state could be resolved."
        : "The location provider could not complete the city and state lookup.",
      { cause: error },
    );
  }
  if (!geocodeResponse.ok) {
    throw new TopProspectStageError(
      "geocoding_error",
      `The location provider returned HTTP ${geocodeResponse.status} before discovery began.`,
    );
  }
  let locations: Array<{ lat?: string; lon?: string }>;
  try {
    locations = (await geocodeResponse.json()) as Array<{ lat?: string; lon?: string }>;
  } catch (error) {
    throw new TopProspectStageError("geocoding_error", "The location provider returned an unreadable response.", { cause: error });
  }
  const latitude = Number(locations[0]?.lat);
  const longitude = Number(locations[0]?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new TopProspectStageError("geocoding_error", "The requested city and state could not be resolved to a location.");
  }

  const radiusMeters = input.radiusKm * 1_000;
  const queries = buildTradeDiscoveryQueries(input.trade, radiusMeters, latitude, longitude);
  async function providerElements(query: string, queryKind: "primary" | "enrichment", required: boolean) {
    input.logger?.("provider_queried", { queryKind, radiusKm: input.radiusKm });
    let discoveryResponse: Response;
    try {
      discoveryResponse = await fetch(overpassUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(required ? 22_000 : 10_000),
      });
    } catch (error) {
      if (!required) {
        input.logger?.("provider_enrichment_failed", { queryKind, reason: "request_failed" });
        return [];
      }
      throw new TopProspectStageError(
        "discovery_provider_error",
        error instanceof DOMException && error.name === "TimeoutError"
          ? "The public business discovery provider timed out before returning candidates."
          : "The public business discovery provider could not be reached.",
        { cause: error },
      );
    }
    if (!discoveryResponse.ok) {
      if (!required) {
        input.logger?.("provider_enrichment_failed", { queryKind, status: discoveryResponse.status });
        return [];
      }
      throw new TopProspectStageError(
        "discovery_provider_error",
        `The public business discovery provider returned HTTP ${discoveryResponse.status}.`,
      );
    }
    try {
      const payload = (await discoveryResponse.json()) as { elements?: OverpassElement[] };
      const elements = payload.elements ?? [];
      input.logger?.("provider_returned_count", { queryKind, rawProviderCount: elements.length });
      return elements;
    } catch (error) {
      if (!required) {
        input.logger?.("provider_enrichment_failed", { queryKind, reason: "unreadable_response" });
        return [];
      }
      throw new TopProspectStageError(
        "discovery_provider_error",
        "The public business discovery provider returned an unreadable response.",
        { cause: error },
      );
    }
  }

  const primaryElements = await providerElements(queries.primary, "primary", true);
  const googleKey = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
  const azureMapsKey = process.env.AZURE_MAPS_API_KEY?.trim() ?? "";
  const bingKey = process.env.BING_MAPS_API_KEY?.trim() ?? "";
  const yelpKey = process.env.YELP_API_KEY?.trim() ?? "";
  const yellowPagesUrl = process.env.YELLOW_PAGES_API_URL?.trim() ?? "";
  const yellowPagesKey = process.env.YELLOW_PAGES_API_KEY?.trim() ?? "";
  const yellowUrl = yellowPagesUrl ? providerUrl(yellowPagesUrl) : null;
  yellowUrl?.searchParams.set("trade", input.trade);
  yellowUrl?.searchParams.set("city", input.city);
  yellowUrl?.searchParams.set("state", input.state);
  yellowUrl?.searchParams.set("radiusKm", String(input.radiusKm));
  yellowUrl?.searchParams.set("limit", String(limit));

  const googleUrl = process.env.GOOGLE_PLACES_API_URL?.trim() || "https://places.googleapis.com/v1/places:searchText";
  const bingUrl = azureMapsKey
    ? providerUrl(process.env.AZURE_MAPS_POI_API_URL, "https://atlas.microsoft.com/search/poi/json")
    : providerUrl(process.env.BING_LOCAL_API_URL, "https://dev.virtualearth.net/REST/v1/LocalSearch/");
  bingUrl?.searchParams.set("query", `${input.trade} near ${input.city}, ${input.state}`);
  if (azureMapsKey) {
    bingUrl?.searchParams.set("api-version", "1.0");
    bingUrl?.searchParams.set("subscription-key", azureMapsKey);
    bingUrl?.searchParams.set("lat", String(latitude));
    bingUrl?.searchParams.set("lon", String(longitude));
    bingUrl?.searchParams.set("radius", String(radiusMeters));
    bingUrl?.searchParams.set("limit", String(Math.min(100, limit)));
  } else {
    bingUrl?.searchParams.set("userCircularMapView", `${latitude},${longitude},${radiusMeters}`);
    bingUrl?.searchParams.set("maxResults", String(Math.min(25, limit)));
    if (bingKey) bingUrl?.searchParams.set("key", bingKey);
  }
  const yelpUrl = providerUrl(process.env.YELP_API_URL, "https://api.yelp.com/v3/businesses/search");
  yelpUrl?.searchParams.set("term", input.trade);
  yelpUrl?.searchParams.set("latitude", String(latitude));
  yelpUrl?.searchParams.set("longitude", String(longitude));
  yelpUrl?.searchParams.set("radius", String(Math.min(40_000, radiusMeters)));
  yelpUrl?.searchParams.set("limit", String(Math.min(50, limit)));

  const [enrichmentElements, googleResult, bingResult, yelpResult, yellowPagesResult] = await Promise.all([
    queries.enrichment ? providerElements(queries.enrichment, "enrichment", false) : Promise.resolve([]),
    optionalProviderCandidates({
      source: "google",
      configured: Boolean(googleKey),
      url: googleUrl,
      init: {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleKey,
          "X-Goog-FieldMask": "places.displayName,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.formattedAddress,places.addressComponents,places.location,places.rating,places.userRatingCount,places.reviews.publishTime",
        },
        body: JSON.stringify({
          textQuery: `${input.trade} near ${input.city}, ${input.state}`,
          pageSize: Math.min(20, limit),
          includePureServiceAreaBusinesses: true,
          locationBias: { circle: { center: { latitude, longitude }, radius: Math.min(50_000, radiusMeters) } },
        }),
      },
      parse: parseGooglePlaces,
      returnedCount: (value) => Array.isArray((value as { places?: unknown[] }).places) ? (value as { places: unknown[] }).places.length : 0,
      logger: input.logger,
      radiusKm: input.radiusKm,
    }),
    optionalProviderCandidates({
      source: "bing",
      configured: Boolean(azureMapsKey || bingKey),
      url: bingUrl?.href ?? "https://invalid.local",
      init: { headers },
      parse: parseBingLocal,
      returnedCount: (value) => {
        const payload = value as { resourceSets?: Array<{ resources?: unknown[] }>; results?: unknown[] };
        return (payload.resourceSets ?? []).reduce((count, set) => count + (set.resources?.length ?? 0), 0)
          + (payload.results?.length ?? 0);
      },
      logger: input.logger,
      radiusKm: input.radiusKm,
    }),
    optionalProviderCandidates({
      source: "yelp",
      configured: Boolean(yelpKey),
      url: yelpUrl?.href ?? "https://invalid.local",
      init: { headers: { ...headers, Authorization: `Bearer ${yelpKey}` } },
      parse: parseYelp,
      returnedCount: (value) => Array.isArray((value as { businesses?: unknown[] }).businesses) ? (value as { businesses: unknown[] }).businesses.length : 0,
      logger: input.logger,
      radiusKm: input.radiusKm,
    }),
    optionalProviderCandidates({
      source: "yellowPages",
      configured: Boolean(yellowUrl),
      url: yellowUrl?.href ?? "https://invalid.local",
      init: { headers: { ...headers, ...(yellowPagesKey ? { Authorization: `Bearer ${yellowPagesKey}` } : {}) } },
      parse: parseLicensedDirectory,
      logger: input.logger,
      radiusKm: input.radiusKm,
    }),
  ]);
  const google = googleResult.candidates;
  const bing = bingResult.candidates;
  const yelp = yelpResult.candidates;
  const yellowPages = yellowPagesResult.candidates;
  const elements = [...primaryElements, ...enrichmentElements];
  const osm = overpassCandidates(elements);
  const candidates = [...osm, ...google, ...bing, ...yelp, ...yellowPages];
  const sourceCounts = emptySourceCounts();
  sourceCounts.osm = osm.length;
  sourceCounts.google = google.length;
  sourceCounts.bing = bing.length;
  sourceCounts.yelp = yelp.length;
  sourceCounts.yellowPages = yellowPages.length;
  const providerDiagnostics: DiscoveryProviderDiagnostics = {
    osm: providerDiagnostic(true, true, elements.length ? "succeeded" : "zero_results", elements.length),
    azureMaps: azureMapsKey
      ? bingResult.diagnostic
      : providerDiagnostic(false, false, "not_configured"),
    googlePlaces: googleResult.diagnostic,
    yelp: yelpResult.diagnostic,
  };
  input.logger?.("filtering_started", { rawProviderCount: candidates.length, radiusKm: input.radiusKm });

  return mergeDiscoveryCandidates({
    candidates,
    latitude,
    longitude,
    city: input.city,
    state: input.state,
    trade: input.trade,
    radiusKm: input.radiusKm,
    limit,
    prospectType: input.prospectType,
    sourceCounts,
    providerDiagnostics,
    logger: input.logger,
  });
}

export async function discoverContractors(input: {
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit?: number;
  prospectType?: ProspectSearchType;
}): Promise<DiscoveredLead[]> {
  return (await discoverContractorsWithDiagnostics(input)).leads;
}

export function resetDiscoveryThrottleForTests() {
  globalDiscovery.lastDiscoveryAt = undefined;
}
