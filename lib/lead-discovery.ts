import {
  classifyProspectPresence,
  displayStateCode,
  recommendProspectContactMethod,
  normalizeTradeCategory,
  titleCaseLocation,
  type ProspectClassification,
  type ProspectSearchType,
  type ProspectType,
  type RecommendedContactMethod,
  type TradeCategory,
} from "@/lib/prospect-engine";
import {
  hasClearLocalServiceIntent,
  isThirdPartyDirectoryUrl,
  likelyInstitutionalOrNonBusiness,
  likelySupplierOrDistributor,
  websiteBusinessMismatch,
} from "@/lib/top-prospects";
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
  originCity?: string;
  matchedCities?: string[];
  lastFoundAt?: string;
  lastFoundRunId?: string;
  recommendedContactMethod: RecommendedContactMethod;
  inactive: boolean;
};

export const discoverySources = ["osm", "google", "bing", "yelp", "yellowPages"] as const;
export type DiscoverySource = (typeof discoverySources)[number];
export type DiscoverySourceCounts = Record<DiscoverySource, number>;

export const discoveryProviders = ["osm", "azureMaps", "googlePlaces", "yelp"] as const;
export type DiscoveryProvider = (typeof discoveryProviders)[number];
export type DiscoveryProviderStatus = "not_recorded" | "not_configured" | "succeeded" | "failed" | "timed_out" | "zero_results" | "rate_limited";
export type DiscoveryProviderFailureType = "none" | "not_configured" | "timeout" | "rate_limit" | "auth_failure" | "network_error" | "http_error" | "parse_error" | "query_error";
export type DiscoveryProviderDiagnostic = {
  configured: boolean | null;
  queryExecuted: boolean | null;
  status: DiscoveryProviderStatus;
  returnedCount: number;
  withinRadiusCount: number;
  afterDeduplicationCount: number;
  usableWebsiteCount: number;
  retryCount?: number;
  httpStatus?: number;
  envVarName?: string;
  envVarPresent?: boolean | null;
  canRunWithoutApiKey?: boolean;
  query?: string;
  attemptedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  failureType?: DiscoveryProviderFailureType;
  safeErrorMessage?: string;
};
export type DiscoveryProviderDiagnostics = Record<DiscoveryProvider, DiscoveryProviderDiagnostic>;
export type DiscoveryProviderHealth = {
  provider: DiscoveryProvider;
  label: string;
  enabled: boolean;
  requiredEnvVarName: string;
  envVarPresent: boolean | null;
  canRunWithoutApiKey: boolean;
  lastAttemptedQuery: string;
  lastStatus: DiscoveryProviderStatus | "not_run";
  lastHttpStatus: string;
  lastSafeErrorMessage: string;
  failureType: DiscoveryProviderFailureType | "none";
};
export type DiscoveryProviderCoverageStatus = {
  level: "strong" | "good" | "limited" | "broken";
  label: string;
  summary: string;
  recommendation: string;
  googleConfigured: boolean;
  yelpConfigured: boolean;
  azureOrBingConfigured: boolean;
};
export type TradeDiscoveryDiagnostic = {
  trade: TradeCategory;
  status?: "completed" | "partial" | "skipped";
  rawProviderCount: number;
  withinRadiusCount: number;
  afterDeduplicationCount: number;
  usableWebsiteCount: number;
  returnedCount: number;
  providerDiagnostics: DiscoveryProviderDiagnostics;
  rateLimitedProviders?: string[];
  retryCount?: number;
  skippedReason?: string;
};

export type CityDiscoveryDiagnostic = {
  city: string;
  state: string;
  label: string;
  status: "completed" | "partial" | "failed";
  requestedCount: number;
  rawProviderCount: number;
  withinRadiusCount: number;
  afterDeduplicationCount: number;
  usableWebsiteCount: number;
  returnedCount: number;
  providerDiagnostics: DiscoveryProviderDiagnostics;
  providersAttempted?: string[];
  skippedCount?: number;
  qualifiedCount?: number;
  mainSkipReasons?: string[];
  safeReason?: string;
};

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
  tradeDiagnostics?: TradeDiscoveryDiagnostic[];
  cityDiagnostics?: CityDiscoveryDiagnostic[];
  cityTargets?: Array<{ city: string; state: string; label: string }>;
  excludePreviouslyReviewed?: boolean;
  nextRunRecommendations?: string[];
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
  Plumbing: { exactCrafts: ["plumber"], namePattern: "plumb" },
  Electrical: { exactCrafts: ["electrician"], namePattern: "electric" },
  Landscaping: { exactCrafts: ["landscaper"], namePattern: "landscap|lawn care|lawn service" },
  "Pressure Washing": { exactCrafts: [], namePattern: "power wash|pressure wash|soft wash" },
  Painting: { exactCrafts: ["painter"], namePattern: "paint|painting" },
  Concrete: { exactCrafts: [], namePattern: "concrete|masonry|flatwork|driveway" },
  Cleaning: { exactCrafts: ["cleaner"], namePattern: "cleaning|cleaner|maid|janitorial" },
  "Tree Service": { exactCrafts: [], namePattern: "tree service|tree care|arborist|tree removal|tree trimming" },
  Fencing: { exactCrafts: [], namePattern: "fence|fencing" },
  Flooring: { exactCrafts: [], namePattern: "flooring|floor installation|hardwood floor" },
  Remodeling: { exactCrafts: [], namePattern: "remodel|remodeling|renovation|bathroom|kitchen" },
  "General Contractor": { exactCrafts: ["builder"], namePattern: "general contractor|construction|remodel" },
};

const globalDiscovery = globalThis as typeof globalThis & { lastDiscoveryAt?: number };

const discoveryProviderDefinitions: Record<DiscoveryProvider, {
  label: string;
  envVarName: string;
  envVarNames: string[];
  canRunWithoutApiKey: boolean;
}> = {
  osm: {
    label: "OpenStreetMap",
    envVarName: "Not required",
    envVarNames: [],
    canRunWithoutApiKey: true,
  },
  azureMaps: {
    label: "Azure Maps",
    envVarName: "AZURE_MAPS_API_KEY or BING_MAPS_API_KEY",
    envVarNames: ["AZURE_MAPS_API_KEY", "BING_MAPS_API_KEY"],
    canRunWithoutApiKey: false,
  },
  googlePlaces: {
    label: "Google Places",
    envVarName: "GOOGLE_PLACES_API_KEY",
    envVarNames: ["GOOGLE_PLACES_API_KEY"],
    canRunWithoutApiKey: false,
  },
  yelp: {
    label: "Yelp",
    envVarName: "YELP_API_KEY",
    envVarNames: ["YELP_API_KEY"],
    canRunWithoutApiKey: false,
  },
};

function providerEnvPresent(provider: DiscoveryProvider, env: NodeJS.ProcessEnv = process.env) {
  const definition = discoveryProviderDefinitions[provider];
  if (definition.canRunWithoutApiKey) return null;
  return definition.envVarNames.some((name) => Boolean(env[name]?.trim()));
}

export function discoveryProviderHealth(
  diagnostics?: Partial<DiscoveryProviderDiagnostics> | null,
  env: NodeJS.ProcessEnv = process.env,
): DiscoveryProviderHealth[] {
  return discoveryProviders.map((provider) => {
    const definition = discoveryProviderDefinitions[provider];
    const diagnostic = diagnostics?.[provider];
    const envVarPresent = diagnostic?.envVarPresent ?? providerEnvPresent(provider, env);
    const enabled = definition.canRunWithoutApiKey || envVarPresent === true || diagnostic?.configured === true;
    return {
      provider,
      label: definition.label,
      enabled,
      requiredEnvVarName: definition.envVarName,
      envVarPresent,
      canRunWithoutApiKey: definition.canRunWithoutApiKey,
      lastAttemptedQuery: diagnostic?.query ?? "Not run",
      lastStatus: diagnostic?.status ?? "not_run",
      lastHttpStatus: diagnostic?.httpStatus ? String(diagnostic.httpStatus) : diagnostic?.failureType === "timeout" ? "timeout" : diagnostic?.failureType === "network_error" ? "network error" : "None",
      lastSafeErrorMessage: diagnostic?.safeErrorMessage ?? "No provider attempt recorded yet.",
      failureType: diagnostic?.failureType ?? "none",
    };
  });
}

export function discoveryProviderCoverageStatus(
  diagnostics?: Partial<DiscoveryProviderDiagnostics> | null,
  env: NodeJS.ProcessEnv = process.env,
): DiscoveryProviderCoverageStatus {
  const health = discoveryProviderHealth(diagnostics, env);
  const byProvider = Object.fromEntries(health.map((provider) => [provider.provider, provider])) as Record<DiscoveryProvider, DiscoveryProviderHealth>;
  const googleDiagnostic = diagnostics?.googlePlaces;
  const yelpDiagnostic = diagnostics?.yelp;
  const googleConfigured = Boolean(byProvider.googlePlaces.enabled);
  const yelpConfigured = Boolean(byProvider.yelp.enabled);
  const azureOrBingConfigured = Boolean(byProvider.azureMaps.enabled);
  const googleSucceeded = googleConfigured && googleDiagnostic?.status === "succeeded";
  const googleRecords = googleDiagnostic?.returnedCount ?? 0;
  const yelpRecords = yelpDiagnostic?.returnedCount ?? 0;
  const anyWorking = Object.values(diagnostics ?? {}).some((provider) => provider?.status === "succeeded" && (provider.returnedCount ?? 0) > 0);
  const attemptedDiagnostics = Object.values(diagnostics ?? {}).filter((provider) => provider?.queryExecuted);
  const allAttemptedFailed = attemptedDiagnostics.length > 0
    && attemptedDiagnostics.every((provider) => ["failed", "timed_out", "rate_limited"].includes(provider.status));

  if (allAttemptedFailed) {
    return {
      level: "broken",
      label: "Broken provider setup",
      summary: "Provider requests were attempted, but no provider completed successfully.",
      recommendation: "Check provider configuration, environment variables, HTTP status, and rate limits before running more searches.",
      googleConfigured,
      yelpConfigured,
      azureOrBingConfigured,
    };
  }

  if (googleSucceeded) {
    return {
      level: "strong",
      label: "Strong provider setup",
      summary: "Google Places is configured and the latest provider check succeeded.",
      recommendation: "Run normal focused Top Prospects searches.",
      googleConfigured,
      yelpConfigured,
      azureOrBingConfigured,
    };
  }
  if ((googleConfigured && googleRecords >= 3) || (yelpConfigured && yelpRecords >= 3)) {
    return {
      level: "good",
      label: "Good provider setup",
      summary: "Google Places or Yelp is configured and returning at least 3 records.",
      recommendation: "Run focused searches, then add the other provider when you want broader coverage.",
      googleConfigured,
      yelpConfigured,
      azureOrBingConfigured,
    };
  }
  if (googleConfigured || yelpConfigured) {
    return {
      level: anyWorking ? "good" : "limited",
      label: anyWorking ? "Good provider setup" : "Limited provider setup",
      summary: anyWorking
        ? "At least one premium local provider is configured, but recent results were thin."
        : "Google Places or Yelp is configured, but the latest provider check did not return usable records.",
      recommendation: "Run Provider Smoke Test again and review HTTP status, rate limits, and query results before increasing scan count.",
      googleConfigured,
      yelpConfigured,
      azureOrBingConfigured,
    };
  }
  if (azureOrBingConfigured || byProvider.osm.enabled) {
    return {
      level: "limited",
      label: "Limited provider setup",
      summary: "Only Azure Maps/Bing and OpenStreetMap-style coverage are available.",
      recommendation: "Provider coverage is limited. For better local business discovery, configure Google Places and/or Yelp.",
      googleConfigured,
      yelpConfigured,
      azureOrBingConfigured,
    };
  }
  return {
    level: "broken",
    label: "Broken provider setup",
    summary: "No discovery provider appears to be working.",
    recommendation: "Check provider configuration, environment variables, and provider health before running more searches.",
    googleConfigured,
    yelpConfigured,
    azureOrBingConfigured,
  };
}

function providerDelayMs() {
  const configured = Number(process.env.DISCOVERY_PROVIDER_DELAY_MS);
  return Number.isFinite(configured) && configured >= 0 ? Math.min(2_000, configured) : 250;
}

function retryAfterMs(response: Response, fallbackMs: number) {
  const header = response.headers.get("retry-after");
  if (!header) return fallbackMs;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(5_000, Math.max(fallbackMs, seconds * 1_000));
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.min(5_000, Math.max(fallbackMs, dateMs - Date.now())) : fallbackMs;
}

async function delayProviderRequest(multiplier = 1) {
  const delayMs = providerDelayMs() * multiplier;
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchWithBackoff(
  input: string | URL,
  init: RequestInit,
  logger: DiscoveryLogger | undefined,
  metadata: Record<string, boolean | number | string>,
) {
  let retryCount = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delayProviderRequest(attempt);
    const response = await fetch(input, init);
    if (response.status !== 429 || attempt === 2) return { response, retryCount };
    retryCount += 1;
    logger?.("provider_enrichment_failed", { ...metadata, status: 429, reason: "rate_limited", retryCount });
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response, providerDelayMs() * (attempt + 2))));
  }
  throw new Error("unreachable");
}

function providerFailureTypeFromStatus(status: number): DiscoveryProviderFailureType {
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth_failure";
  return "http_error";
}

function safeProviderHttpMessage(status: number) {
  if (status === 401 || status === 403) return `Provider authentication failed with HTTP ${status}. Check the configured API key and provider permissions.`;
  if (status === 429) return "Provider rate limit reached with HTTP 429. Wait before retrying or reduce request load.";
  return `Provider returned HTTP ${status}.`;
}

function providerAttemptTiming(startedAt: number) {
  const finishedAt = Date.now();
  return {
    attemptedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
  };
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
  return validWebsite(value) && !isSocialOrBusinessProfileUrl(value) && !isThirdPartyDirectoryUrl(value);
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
  extra: Partial<Pick<DiscoveryProviderDiagnostic, "retryCount" | "httpStatus" | "envVarName" | "envVarPresent" | "canRunWithoutApiKey" | "query" | "attemptedAt" | "finishedAt" | "durationMs" | "failureType" | "safeErrorMessage">> = {},
): DiscoveryProviderDiagnostic {
  return {
    configured,
    queryExecuted,
    status,
    returnedCount,
    withinRadiusCount: 0,
    afterDeduplicationCount: 0,
    usableWebsiteCount: 0,
    ...(extra.retryCount ? { retryCount: extra.retryCount } : {}),
    ...(extra.httpStatus ? { httpStatus: extra.httpStatus } : {}),
    ...(extra.envVarName ? { envVarName: extra.envVarName } : {}),
    ...(typeof extra.envVarPresent === "boolean" || extra.envVarPresent === null ? { envVarPresent: extra.envVarPresent } : {}),
    ...(typeof extra.canRunWithoutApiKey === "boolean" ? { canRunWithoutApiKey: extra.canRunWithoutApiKey } : {}),
    ...(extra.query ? { query: extra.query } : {}),
    ...(extra.attemptedAt ? { attemptedAt: extra.attemptedAt } : {}),
    ...(extra.finishedAt ? { finishedAt: extra.finishedAt } : {}),
    ...(finiteNumber(extra.durationMs) ? { durationMs: finiteNumber(extra.durationMs) } : {}),
    ...(extra.failureType && extra.failureType !== "none" ? { failureType: extra.failureType } : {}),
    ...(extra.safeErrorMessage ? { safeErrorMessage: extra.safeErrorMessage } : {}),
  };
}

function emptyProviderDiagnostics(): DiscoveryProviderDiagnostics {
  return {
    osm: providerDiagnostic(true, false, "zero_results", 0, providerStaticDiagnostic("osm")),
    azureMaps: providerDiagnostic(false, false, "not_configured", 0, providerStaticDiagnostic("azureMaps")),
    googlePlaces: providerDiagnostic(false, false, "not_configured", 0, providerStaticDiagnostic("googlePlaces")),
    yelp: providerDiagnostic(false, false, "not_configured", 0, providerStaticDiagnostic("yelp")),
  };
}

function providerStaticDiagnostic(provider: DiscoveryProvider): Pick<DiscoveryProviderDiagnostic, "envVarName" | "envVarPresent" | "canRunWithoutApiKey"> {
  const definition = discoveryProviderDefinitions[provider];
  return {
    envVarName: definition.envVarName,
    envVarPresent: providerEnvPresent(provider),
    canRunWithoutApiKey: definition.canRunWithoutApiKey,
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
    const validStatus = item?.status && ["not_recorded", "not_configured", "succeeded", "failed", "timed_out", "zero_results", "rate_limited"].includes(item.status)
      ? item.status as DiscoveryProviderStatus
      : fallback[provider].status;
    const staticDiagnostic = providerStaticDiagnostic(provider);
    return [provider, {
      configured: typeof item?.configured === "boolean" || item?.configured === null ? item.configured : fallback[provider].configured,
      queryExecuted: typeof item?.queryExecuted === "boolean" || item?.queryExecuted === null ? item.queryExecuted : fallback[provider].queryExecuted,
      status: validStatus,
      returnedCount: finiteNumber(item?.returnedCount) ?? fallback[provider].returnedCount,
      withinRadiusCount: finiteNumber(item?.withinRadiusCount) ?? fallback[provider].withinRadiusCount,
      afterDeduplicationCount: finiteNumber(item?.afterDeduplicationCount) ?? fallback[provider].afterDeduplicationCount,
      usableWebsiteCount: finiteNumber(item?.usableWebsiteCount) ?? fallback[provider].usableWebsiteCount,
      ...(finiteNumber(item?.retryCount) ? { retryCount: finiteNumber(item?.retryCount) } : {}),
      ...(finiteNumber(item?.httpStatus) ? { httpStatus: finiteNumber(item?.httpStatus) } : {}),
      envVarName: typeof item?.envVarName === "string" && item.envVarName ? item.envVarName : staticDiagnostic.envVarName,
      envVarPresent: typeof item?.envVarPresent === "boolean" || item?.envVarPresent === null ? item.envVarPresent : staticDiagnostic.envVarPresent,
      canRunWithoutApiKey: typeof item?.canRunWithoutApiKey === "boolean" ? item.canRunWithoutApiKey : staticDiagnostic.canRunWithoutApiKey,
      ...(typeof item?.query === "string" && item.query ? { query: item.query } : {}),
      ...(typeof item?.attemptedAt === "string" && item.attemptedAt ? { attemptedAt: item.attemptedAt } : {}),
      ...(typeof item?.finishedAt === "string" && item.finishedAt ? { finishedAt: item.finishedAt } : {}),
      ...(finiteNumber(item?.durationMs) ? { durationMs: finiteNumber(item?.durationMs) } : {}),
      ...(item?.failureType && ["not_configured", "timeout", "rate_limit", "auth_failure", "network_error", "http_error", "parse_error", "query_error"].includes(item.failureType)
        ? { failureType: item.failureType as DiscoveryProviderFailureType }
        : {}),
      ...(typeof item?.safeErrorMessage === "string" && item.safeErrorMessage ? { safeErrorMessage: item.safeErrorMessage } : {}),
    }];
  })) as DiscoveryProviderDiagnostics;
}

function normalizeTradeDiagnostics(value: unknown): TradeDiscoveryDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TradeDiscoveryDiagnostic[] => {
    if (!item || Array.isArray(item) || typeof item !== "object") return [];
    const candidate = item as Partial<TradeDiscoveryDiagnostic>;
    const trade = normalizeTradeCategory(candidate.trade);
    if (!trade) return [];
    const sourceCounts = emptySourceCounts();
    const status = candidate.status && ["completed", "partial", "skipped"].includes(candidate.status) ? candidate.status : undefined;
    return [{
      trade,
      ...(status ? { status } : {}),
      rawProviderCount: finiteNumber(candidate.rawProviderCount) ?? 0,
      withinRadiusCount: finiteNumber(candidate.withinRadiusCount) ?? 0,
      afterDeduplicationCount: finiteNumber(candidate.afterDeduplicationCount) ?? 0,
      usableWebsiteCount: finiteNumber(candidate.usableWebsiteCount) ?? 0,
      returnedCount: finiteNumber(candidate.returnedCount) ?? 0,
      providerDiagnostics: normalizeProviderDiagnostics(candidate.providerDiagnostics, sourceCounts),
      ...(Array.isArray(candidate.rateLimitedProviders)
        ? { rateLimitedProviders: candidate.rateLimitedProviders.filter((provider): provider is string => typeof provider === "string") }
        : {}),
      ...(finiteNumber(candidate.retryCount) ? { retryCount: finiteNumber(candidate.retryCount) } : {}),
      ...(typeof candidate.skippedReason === "string" ? { skippedReason: candidate.skippedReason } : {}),
    }];
  });
}

function normalizeCityDiagnostics(value: unknown): CityDiscoveryDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CityDiscoveryDiagnostic[] => {
    if (!item || Array.isArray(item) || typeof item !== "object") return [];
    const candidate = item as Partial<CityDiscoveryDiagnostic>;
    const city = typeof candidate.city === "string" ? titleCaseLocation(candidate.city) : "";
    const state = typeof candidate.state === "string" ? displayStateCode(candidate.state) : "";
    if (!city || !/^[A-Z]{2}$/.test(state)) return [];
    const status = candidate.status && ["completed", "partial", "failed"].includes(candidate.status) ? candidate.status : "completed";
    const sourceCounts = emptySourceCounts();
    return [{
      city,
      state,
      label: typeof candidate.label === "string" ? candidate.label : `${city}, ${state}`,
      status,
      requestedCount: finiteNumber(candidate.requestedCount) ?? 0,
      rawProviderCount: finiteNumber(candidate.rawProviderCount) ?? 0,
      withinRadiusCount: finiteNumber(candidate.withinRadiusCount) ?? 0,
      afterDeduplicationCount: finiteNumber(candidate.afterDeduplicationCount) ?? 0,
      usableWebsiteCount: finiteNumber(candidate.usableWebsiteCount) ?? 0,
      returnedCount: finiteNumber(candidate.returnedCount) ?? 0,
      providerDiagnostics: normalizeProviderDiagnostics(candidate.providerDiagnostics, sourceCounts),
      ...(typeof candidate.safeReason === "string" ? { safeReason: candidate.safeReason } : {}),
    }];
  });
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
    existing.profileUrl ||= candidate.profileUrl || (isSocialOrBusinessProfileUrl(candidate.website) || isThirdPartyDirectoryUrl(candidate.website) ? candidate.website : undefined);
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
    const trade = normalizeTradeCategory(input.trade) ?? input.trade;
    const ownedWebsite = isUsableBusinessWebsite(candidate.website) ? candidate.website : "";
    const profileUrl = candidate.profileUrl || (isSocialOrBusinessProfileUrl(candidate.website) || isThirdPartyDirectoryUrl(candidate.website) ? candidate.website : "");
    const prospectType: ProspectType = ownedWebsite ? "redesign" : "no_website_social_only";
    const activitySignals = [
      ...(candidate.activitySignals ?? []),
      ...((candidate.reviewCount ?? 0) > 0 ? ["public_reviews"] : []),
      ...((candidate.recentReviewCount ?? 0) > 0 ? ["recent_reviews"] : []),
      ...((candidate.rating ?? 0) > 0 ? ["public_rating"] : []),
      ...(profileUrl ? ["public_profile"] : []),
      ...(isThirdPartyDirectoryUrl(candidate.website) || isThirdPartyDirectoryUrl(profileUrl) ? ["third_party_listing_only"] : []),
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
      const fitProbe = { businessName: candidate.businessName, website, trade };
      const badFit = likelyInstitutionalOrNonBusiness(fitProbe)
        || likelySupplierOrDistributor(fitProbe)
        || websiteBusinessMismatch(fitProbe)
        || !hasClearLocalServiceIntent(fitProbe);
      const classification = candidate.inactive || badFit
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
        inactive: candidate.inactive || badFit,
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
        city: titleCaseLocation(candidate.city?.trim() || input.city.trim()),
        state: displayStateCode(/^[A-Za-z]{2}$/.test(taggedState) ? taggedState : input.state),
        trade,
        serviceArea: `${titleCaseLocation(input.city.trim())} and nearby communities`,
        sources: candidate.sources,
        sourceConfidence: sourceConfidence(candidate),
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        recentReviewCount: candidate.recentReviewCount,
        activitySignals: [...new Set(activitySignals)],
        originCity: `${titleCaseLocation(input.city.trim())}, ${displayStateCode(input.state)}`,
        matchedCities: [`${titleCaseLocation(input.city.trim())}, ${displayStateCode(input.state)}`],
        recommendedContactMethod,
        inactive: candidate.inactive || badFit,
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
      retryCount: diagnostic.retryCount ?? 0,
      httpStatus: diagnostic.httpStatus ?? 0,
      envVarName: diagnostic.envVarName ?? discoveryProviderDefinitions[provider].envVarName,
      envVarPresent: diagnostic.envVarPresent ?? "not_required",
      canRunWithoutApiKey: diagnostic.canRunWithoutApiKey ?? discoveryProviderDefinitions[provider].canRunWithoutApiKey,
      query: diagnostic.query ?? "",
      attemptedAt: diagnostic.attemptedAt ?? "",
      finishedAt: diagnostic.finishedAt ?? "",
      durationMs: diagnostic.durationMs ?? 0,
      failureType: diagnostic.failureType ?? "none",
      safeErrorMessage: diagnostic.safeErrorMessage ?? "",
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
      categorySignals: discoveryCategorySignals(normalizeTradeCategory(input.trade) ?? input.trade),
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
    ? (() => {
        const tradeDiagnostics = normalizeTradeDiagnostics(candidate.tradeDiagnostics);
        const cityDiagnostics = normalizeCityDiagnostics(candidate.cityDiagnostics);
        const cityTargets = Array.isArray(candidate.cityTargets)
          ? candidate.cityTargets.flatMap((target): Array<{ city: string; state: string; label: string }> => {
              if (!target || Array.isArray(target) || typeof target !== "object") return [];
              const city = "city" in target && typeof target.city === "string" ? titleCaseLocation(target.city) : "";
              const state = "state" in target && typeof target.state === "string" ? displayStateCode(target.state) : "";
              return city && /^[A-Z]{2}$/.test(state) ? [{ city, state, label: `${city}, ${state}` }] : [];
            })
          : [];
        return {
        ...candidate,
        sourceCounts: normalizeSourceCounts(candidate.sourceCounts),
        providerDiagnostics: normalizeProviderDiagnostics(candidate.providerDiagnostics, normalizeSourceCounts(candidate.sourceCounts)),
        finalMergedCount: candidate.finalMergedCount ?? candidate.afterDuplicateFilteringCount,
        ...(tradeDiagnostics.length ? { tradeDiagnostics } : {}),
        ...(cityDiagnostics.length ? { cityDiagnostics } : {}),
        ...(cityTargets.length ? { cityTargets } : {}),
        ...(typeof candidate.excludePreviouslyReviewed === "boolean" ? { excludePreviouslyReviewed: candidate.excludePreviouslyReviewed } : {}),
        ...(Array.isArray(candidate.nextRunRecommendations)
          ? { nextRunRecommendations: candidate.nextRunRecommendations.filter((item): item is string => typeof item === "string").slice(0, 4) }
          : {}),
      } as DiscoveryDiagnostics;
      })()
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
  provider?: Extract<DiscoveryProvider, "azureMaps" | "googlePlaces" | "yelp">;
  configured: boolean;
  url: string;
  init?: RequestInit;
  parse: (value: unknown) => DiscoveryCandidate[];
  returnedCount?: (value: unknown) => number;
  logger?: DiscoveryLogger;
  radiusKm: number;
  query: string;
}): Promise<{ candidates: DiscoveryCandidate[]; diagnostic: DiscoveryProviderDiagnostic }> {
  const staticDiagnostic = input.provider ? providerStaticDiagnostic(input.provider) : {};
  const providerLabel = input.provider ? discoveryProviderDefinitions[input.provider].envVarName : "Provider configuration";
  if (!input.configured) {
    return {
      candidates: [],
      diagnostic: providerDiagnostic(false, false, "not_configured", 0, {
        ...staticDiagnostic,
        query: input.query,
        failureType: "not_configured",
        safeErrorMessage: `${providerLabel} is not configured.`,
      }),
    };
  }
  const startedAt = Date.now();
  input.logger?.("provider_queried", { provider: input.provider ?? input.source, queryKind: input.source, query: input.query, radiusKm: input.radiusKm, requestStartedAt: new Date(startedAt).toISOString() });
  try {
    await delayProviderRequest();
    const { response, retryCount } = await fetchWithBackoff(
      input.url,
      { ...input.init, signal: AbortSignal.timeout(12_000) },
      input.logger,
      { provider: input.provider ?? input.source, queryKind: input.source, query: input.query, radiusKm: input.radiusKm },
    );
    const timing = providerAttemptTiming(startedAt);
    if (!response.ok) {
      const failureType = providerFailureTypeFromStatus(response.status);
      input.logger?.("provider_enrichment_failed", { provider: input.provider ?? input.source, queryKind: input.source, query: input.query, status: response.status, reason: failureType, durationMs: timing.durationMs });
      return {
        candidates: [],
        diagnostic: providerDiagnostic(
          true,
          true,
          response.status === 429 ? "rate_limited" : "failed",
          0,
          {
            ...staticDiagnostic,
            ...timing,
            retryCount,
            httpStatus: response.status,
            query: input.query,
            failureType,
            safeErrorMessage: safeProviderHttpMessage(response.status),
          },
        ),
      };
    }
    const payload = await response.json();
    const candidates = input.parse(payload);
    const returnedCount = input.returnedCount?.(payload) ?? candidates.length;
    input.logger?.("provider_returned_count", { provider: input.provider ?? input.source, queryKind: input.source, query: input.query, rawProviderCount: returnedCount, durationMs: timing.durationMs });
    return {
      candidates,
      diagnostic: providerDiagnostic(true, true, returnedCount ? "succeeded" : "zero_results", returnedCount, {
        ...staticDiagnostic,
        ...timing,
        retryCount,
        query: input.query,
        failureType: "none",
        safeErrorMessage: returnedCount ? "Provider query completed." : "Provider query completed but returned no records.",
      }),
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const timing = providerAttemptTiming(startedAt);
    input.logger?.("provider_enrichment_failed", { provider: input.provider ?? input.source, queryKind: input.source, query: input.query, reason: timedOut ? "timed_out" : "request_failed", durationMs: timing.durationMs });
    return {
      candidates: [],
      diagnostic: providerDiagnostic(true, true, timedOut ? "timed_out" : "failed", 0, {
        ...staticDiagnostic,
        ...timing,
        query: input.query,
        failureType: timedOut ? "timeout" : "network_error",
        safeErrorMessage: timedOut ? "Provider request timed out." : "Provider request failed before a response was returned.",
      }),
    };
  }
}

export async function discoverContractorsWithDiagnostics(input: {
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit?: number;
  prospectType?: ProspectSearchType;
  skipThrottle?: boolean;
  logger?: DiscoveryLogger;
}): Promise<DiscoveryResult> {
  const trade = normalizeTradeCategory(input.trade);
  if (!trade) throw new Error("Trade category is not supported.");
  const city = titleCaseLocation(input.city);
  if (city.includes(",") || !city || !/^[A-Za-z .'-]{2,100}$/.test(city)) throw new Error("Enter one city at a time.");
  if (!/^[A-Za-z]{2}$/.test(input.state.trim())) throw new Error("Enter a two-letter state code.");
  if (![10, 25, 50].includes(input.radiusKm)) throw new Error("Discovery radius is not supported.");
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 25)));

  const now = Date.now();
  if (!input.skipThrottle && globalDiscovery.lastDiscoveryAt && now - globalDiscovery.lastDiscoveryAt < 5_000) {
    throw new TopProspectStageError(
      "discovery_provider_error",
      "Discovery is temporarily rate-limited. Retry after a few seconds.",
    );
  }
  if (!input.skipThrottle) globalDiscovery.lastDiscoveryAt = now;

  const nominatimUrl = process.env.NOMINATIM_API_URL?.trim() || "https://nominatim.openstreetmap.org/search";
  const overpassUrl = process.env.OVERPASS_API_URL?.trim() || "https://overpass-api.de/api/interpreter";
  const headers = {
    "User-Agent": "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)",
    Accept: "application/json",
  };

  const geocodeUrl = new URL(nominatimUrl);
  geocodeUrl.searchParams.set("q", `${city}, ${displayStateCode(input.state)}, USA`);
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
  const queries = buildTradeDiscoveryQueries(trade, radiusMeters, latitude, longitude);
  async function providerElements(query: string, queryKind: "primary" | "enrichment") {
    const staticDiagnostic = providerStaticDiagnostic("osm");
    const startedAt = Date.now();
    const queryLabel = `${trade} ${city} ${displayStateCode(input.state)} (${queryKind})`;
    input.logger?.("provider_queried", { provider: "osm", queryKind, query: queryLabel, radiusKm: input.radiusKm, requestStartedAt: new Date(startedAt).toISOString() });
    let discoveryResponse: Response;
    let retryCount = 0;
    try {
      await delayProviderRequest();
      const result = await fetchWithBackoff(
        overpassUrl,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
          signal: AbortSignal.timeout(queryKind === "primary" ? 22_000 : 10_000),
        },
        input.logger,
        { provider: "osm", queryKind, query: queryLabel, radiusKm: input.radiusKm },
      );
      discoveryResponse = result.response;
      retryCount = result.retryCount;
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      const timing = providerAttemptTiming(startedAt);
      input.logger?.("provider_enrichment_failed", { provider: "osm", queryKind, query: queryLabel, reason: timedOut ? "timed_out" : "request_failed", durationMs: timing.durationMs });
      return {
        elements: [],
        diagnostic: providerDiagnostic(true, true, timedOut ? "timed_out" : "failed", 0, {
          ...staticDiagnostic,
          ...timing,
          query: queryLabel,
          failureType: timedOut ? "timeout" : "network_error",
          safeErrorMessage: timedOut
            ? "OpenStreetMap/Overpass timed out before returning candidates."
            : "OpenStreetMap/Overpass could not be reached.",
        }),
      };
    }
    const timing = providerAttemptTiming(startedAt);
    if (!discoveryResponse.ok) {
      const failureType = providerFailureTypeFromStatus(discoveryResponse.status);
      input.logger?.("provider_enrichment_failed", { provider: "osm", queryKind, query: queryLabel, status: discoveryResponse.status, reason: failureType, durationMs: timing.durationMs });
      return {
        elements: [],
        diagnostic: providerDiagnostic(
          true,
          true,
          discoveryResponse.status === 429 ? "rate_limited" : "failed",
          0,
          {
            ...staticDiagnostic,
            ...timing,
            retryCount,
            httpStatus: discoveryResponse.status,
            query: queryLabel,
            failureType,
            safeErrorMessage: safeProviderHttpMessage(discoveryResponse.status),
          },
        ),
      };
    }
    try {
      const payload = (await discoveryResponse.json()) as { elements?: OverpassElement[] };
      const elements = payload.elements ?? [];
      input.logger?.("provider_returned_count", { provider: "osm", queryKind, query: queryLabel, rawProviderCount: elements.length, durationMs: timing.durationMs });
      return {
        elements,
        diagnostic: providerDiagnostic(true, true, elements.length ? "succeeded" : "zero_results", elements.length, {
          ...staticDiagnostic,
          ...timing,
          retryCount,
          query: queryLabel,
          failureType: "none",
          safeErrorMessage: elements.length ? "OpenStreetMap/Overpass query completed." : "OpenStreetMap/Overpass query completed but returned no records.",
        }),
      };
    } catch {
      input.logger?.("provider_enrichment_failed", { provider: "osm", queryKind, query: queryLabel, reason: "unreadable_response", durationMs: timing.durationMs });
      return {
        elements: [],
        diagnostic: providerDiagnostic(true, true, "failed", 0, {
          ...staticDiagnostic,
          ...timing,
          retryCount,
          query: queryLabel,
          failureType: "parse_error",
          safeErrorMessage: "OpenStreetMap/Overpass returned an unreadable response.",
        }),
      };
    }
  }

  const primaryResult = await providerElements(queries.primary, "primary");
  const googleKey = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
  const azureMapsKey = process.env.AZURE_MAPS_API_KEY?.trim() ?? "";
  const bingKey = process.env.BING_MAPS_API_KEY?.trim() ?? "";
  const yelpKey = process.env.YELP_API_KEY?.trim() ?? "";
  const yellowPagesUrl = process.env.YELLOW_PAGES_API_URL?.trim() ?? "";
  const yellowPagesKey = process.env.YELLOW_PAGES_API_KEY?.trim() ?? "";
  const yellowUrl = yellowPagesUrl ? providerUrl(yellowPagesUrl) : null;
  yellowUrl?.searchParams.set("trade", trade);
  yellowUrl?.searchParams.set("city", city);
  yellowUrl?.searchParams.set("state", displayStateCode(input.state));
  yellowUrl?.searchParams.set("radiusKm", String(input.radiusKm));
  yellowUrl?.searchParams.set("limit", String(limit));

  const googleUrl = process.env.GOOGLE_PLACES_API_URL?.trim() || "https://places.googleapis.com/v1/places:searchText";
  const googleQuery = `${trade} near ${city}, ${displayStateCode(input.state)}`;
  const bingUrl = azureMapsKey
    ? providerUrl(process.env.AZURE_MAPS_POI_API_URL, "https://atlas.microsoft.com/search/poi/json")
    : providerUrl(process.env.BING_LOCAL_API_URL, "https://dev.virtualearth.net/REST/v1/LocalSearch/");
  const bingQuery = `${trade} near ${city}, ${displayStateCode(input.state)}`;
  bingUrl?.searchParams.set("query", bingQuery);
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
  const yelpQuery = `${trade} ${city}, ${displayStateCode(input.state)}`;
  yelpUrl?.searchParams.set("term", trade);
  yelpUrl?.searchParams.set("latitude", String(latitude));
  yelpUrl?.searchParams.set("longitude", String(longitude));
  yelpUrl?.searchParams.set("radius", String(Math.min(40_000, radiusMeters)));
  yelpUrl?.searchParams.set("limit", String(Math.min(50, limit)));

  const enrichmentResult = queries.enrichment
    ? await providerElements(queries.enrichment, "enrichment")
    : { elements: [], diagnostic: providerDiagnostic(true, false, "not_recorded", 0, providerStaticDiagnostic("osm")) };
  const googleResult = await optionalProviderCandidates({
      source: "google",
      provider: "googlePlaces",
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
          textQuery: googleQuery,
          pageSize: Math.min(20, limit),
          includePureServiceAreaBusinesses: true,
          locationBias: { circle: { center: { latitude, longitude }, radius: Math.min(50_000, radiusMeters) } },
        }),
      },
      parse: parseGooglePlaces,
      returnedCount: (value) => Array.isArray((value as { places?: unknown[] }).places) ? (value as { places: unknown[] }).places.length : 0,
      logger: input.logger,
      radiusKm: input.radiusKm,
      query: googleQuery,
    });
  const bingResult = await optionalProviderCandidates({
      source: "bing",
      provider: "azureMaps",
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
      query: bingQuery,
    });
  const yelpResult = await optionalProviderCandidates({
      source: "yelp",
      provider: "yelp",
      configured: Boolean(yelpKey),
      url: yelpUrl?.href ?? "https://invalid.local",
      init: { headers: { ...headers, Authorization: `Bearer ${yelpKey}` } },
      parse: parseYelp,
      returnedCount: (value) => Array.isArray((value as { businesses?: unknown[] }).businesses) ? (value as { businesses: unknown[] }).businesses.length : 0,
      logger: input.logger,
      radiusKm: input.radiusKm,
      query: yelpQuery,
    });
  const yellowPagesResult = await optionalProviderCandidates({
      source: "yellowPages",
      configured: Boolean(yellowUrl),
      url: yellowUrl?.href ?? "https://invalid.local",
      init: { headers: { ...headers, ...(yellowPagesKey ? { Authorization: `Bearer ${yellowPagesKey}` } : {}) } },
      parse: parseLicensedDirectory,
      logger: input.logger,
      radiusKm: input.radiusKm,
      query: `${trade} ${city}, ${displayStateCode(input.state)}`,
    });
  const google = googleResult.candidates;
  const bing = bingResult.candidates;
  const yelp = yelpResult.candidates;
  const yellowPages = yellowPagesResult.candidates;
  const elements = [...primaryResult.elements, ...enrichmentResult.elements];
  const osm = overpassCandidates(elements);
  const candidates = [...osm, ...google, ...bing, ...yelp, ...yellowPages];
  const sourceCounts = emptySourceCounts();
  sourceCounts.osm = osm.length;
  sourceCounts.google = google.length;
  sourceCounts.bing = bing.length;
  sourceCounts.yelp = yelp.length;
  sourceCounts.yellowPages = yellowPages.length;
  const osmProblem = [primaryResult.diagnostic, enrichmentResult.diagnostic].find((diagnostic) => ["failed", "timed_out", "rate_limited"].includes(diagnostic.status));
  const osmZero = [primaryResult.diagnostic, enrichmentResult.diagnostic].some((diagnostic) => diagnostic.status === "zero_results");
  const providerDiagnostics: DiscoveryProviderDiagnostics = {
    osm: {
      ...providerDiagnostic(
        true,
        true,
        elements.length ? "succeeded" : osmProblem?.status ?? (osmZero ? "zero_results" : "not_recorded"),
        elements.length,
        {
          ...providerStaticDiagnostic("osm"),
          retryCount: (primaryResult.diagnostic.retryCount ?? 0) + (enrichmentResult.diagnostic.retryCount ?? 0),
          httpStatus: primaryResult.diagnostic.httpStatus ?? enrichmentResult.diagnostic.httpStatus,
        },
      ),
      query: primaryResult.diagnostic.query ?? enrichmentResult.diagnostic.query,
      attemptedAt: primaryResult.diagnostic.attemptedAt ?? enrichmentResult.diagnostic.attemptedAt,
      finishedAt: primaryResult.diagnostic.finishedAt ?? enrichmentResult.diagnostic.finishedAt,
      durationMs: (primaryResult.diagnostic.durationMs ?? 0) + (enrichmentResult.diagnostic.durationMs ?? 0) || undefined,
      failureType: osmProblem?.failureType ?? (elements.length ? "none" : undefined),
      safeErrorMessage: elements.length
        ? "OpenStreetMap/Overpass query completed."
        : osmProblem?.safeErrorMessage ?? "OpenStreetMap/Overpass query completed but returned no records.",
    },
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
    city,
    state: displayStateCode(input.state),
    trade,
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
