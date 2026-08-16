import type { Prisma } from "@prisma/client";
import {
  discoverContractorsWithDiagnostics,
  discoveryDiagnosticsFromJson,
  discoveryProviders,
  discoveryLeadsFromJson,
  type DiscoveredLead,
  type DiscoveryDiagnostics,
  type DiscoveryQualificationBreakdown,
  type CityDiscoveryDiagnostic,
  type DiscoveryProviderDiagnostic,
  type DiscoveryProviderDiagnostics,
  type DiscoveryProviderStatus,
  type DiscoveryResult,
  type DiscoverySourceCounts,
  type TradeDiscoveryDiagnostic,
  type TopProspectWebsiteEnrichmentRecord,
  type UnresolvedTopProspectRecord,
} from "@/lib/lead-discovery";
import {
  activity,
  allCoreServiceTradesOption,
  coreServiceTrades,
  createProspect,
  type Prospect,
  type ProspectSearchType,
  type TradeCategory,
} from "@/lib/prospect-engine";
import { findProspectByIdentity, findProspectByWebsite, getProspectDatabase, saveProspect } from "@/lib/prospect-repository";
import { normalizeWebsiteFitDisposition, prospectFreshnessAt, websiteFitAllowsAutonomousOutreach } from "@/lib/prospect-qualification";
import { prospectIsSuppressed } from "@/lib/prospect-funnel";
import {
  mergeResolvedWebsiteEvidence,
  unresolvedWebsiteReason,
  verifyProspectWebsiteWithSecondPass,
  type SharedProspectVerificationResolution,
} from "@/lib/prospect-verification-resolution";
import {
  likelyNationalOrLargeBrand,
  likelySupplierOrDistributor,
  normalizeProspectMode,
  normalizeOutreachPreference,
  normalizeWebsite,
  parseTopProspectCityTargets,
  citySearchBudgets,
  prepareTopProspectOutreachArtifacts,
  assessManualTopProspectOpportunity,
  type CitySearchTarget,
  type OutreachPreference,
  type ProspectMode,
  topProspectRejectionReason,
} from "@/lib/top-prospects";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import {
  encodeTopProspectJobFailure,
  safeTopProspectJobFailure,
  TopProspectStageError,
} from "@/lib/top-prospect-diagnostics";

const LEASE_MS = 90_000;
const BATCH_SIZE = 3;
const contactedStatuses = new Set(["Contacted", "Interested", "Proposal Sent", "Closed Won", "Closed Lost"]);
const resumableStatuses = ["QUEUED", "RUNNING", "NEEDS_NEXT_BATCH", "PARTIAL_RESULTS_READY", "FAILED", "FAILED_AFTER_DISCOVERY"];

function emptySourceCounts(): DiscoverySourceCounts {
  return { osm: 0, google: 0, bing: 0, yelp: 0, yellowPages: 0 };
}

function emptyProviderDiagnostic(status: DiscoveryProviderStatus = "not_recorded"): DiscoveryProviderDiagnostic {
  return {
    configured: null,
    queryExecuted: null,
    status,
    returnedCount: 0,
    withinRadiusCount: 0,
    afterDeduplicationCount: 0,
    usableWebsiteCount: 0,
  };
}

function emptyProviderDiagnostics(): DiscoveryProviderDiagnostics {
  return {
    osm: emptyProviderDiagnostic(),
    azureMaps: emptyProviderDiagnostic(),
    googlePlaces: emptyProviderDiagnostic(),
    yelp: emptyProviderDiagnostic(),
  };
}

function combineProviderStatus(items: DiscoveryProviderDiagnostic[]): DiscoveryProviderStatus {
  if (items.some((item) => item.status === "succeeded")) return "succeeded";
  if (items.some((item) => item.status === "rate_limited")) return "rate_limited";
  if (items.some((item) => item.status === "timed_out")) return "timed_out";
  if (items.some((item) => item.status === "failed")) return "failed";
  if (items.some((item) => item.status === "zero_results")) return "zero_results";
  if (items.every((item) => item.status === "not_configured")) return "not_configured";
  return "not_recorded";
}

function combineBooleanState(values: Array<boolean | null>) {
  if (values.some((value) => value === true)) return true;
  if (values.length > 0 && values.every((value) => value === false)) return false;
  return null;
}

function latestProviderDetail(items: DiscoveryProviderDiagnostic[]) {
  return items.find((item) => item.safeErrorMessage || item.httpStatus || item.query || item.durationMs) ?? items[0];
}

function combineProviderDiagnosticsFromTradeDiagnostics(tradeDiagnostics: TradeDiscoveryDiagnostic[]): DiscoveryProviderDiagnostics {
  const combined = emptyProviderDiagnostics();
  for (const provider of discoveryProviders) {
    const items = tradeDiagnostics.map((trade) => trade.providerDiagnostics[provider]).filter(Boolean);
    const detail = latestProviderDetail(items);
    combined[provider] = items.length
      ? {
          configured: combineBooleanState(items.map((item) => item.configured)),
          queryExecuted: combineBooleanState(items.map((item) => item.queryExecuted)),
          status: combineProviderStatus(items),
          returnedCount: items.reduce((total, item) => total + item.returnedCount, 0),
          withinRadiusCount: items.reduce((total, item) => total + item.withinRadiusCount, 0),
          afterDeduplicationCount: items.reduce((total, item) => total + item.afterDeduplicationCount, 0),
          usableWebsiteCount: items.reduce((total, item) => total + item.usableWebsiteCount, 0),
          retryCount: items.reduce((total, item) => total + (item.retryCount ?? 0), 0),
          ...(detail?.httpStatus ? { httpStatus: detail.httpStatus } : {}),
          ...(detail?.envVarName ? { envVarName: detail.envVarName } : {}),
          ...(typeof detail?.envVarPresent === "boolean" || detail?.envVarPresent === null ? { envVarPresent: detail.envVarPresent } : {}),
          ...(typeof detail?.canRunWithoutApiKey === "boolean" ? { canRunWithoutApiKey: detail.canRunWithoutApiKey } : {}),
          ...(detail?.query ? { query: detail.query } : {}),
          ...(detail?.attemptedAt ? { attemptedAt: detail.attemptedAt } : {}),
          ...(detail?.finishedAt ? { finishedAt: detail.finishedAt } : {}),
          ...(items.some((item) => item.durationMs) ? { durationMs: items.reduce((total, item) => total + (item.durationMs ?? 0), 0) } : {}),
          ...(detail?.failureType ? { failureType: detail.failureType } : {}),
          ...(detail?.safeErrorMessage ? { safeErrorMessage: detail.safeErrorMessage } : {}),
        }
      : combined[provider];
  }
  return combined;
}

function combineProviderDiagnosticsFromCityDiagnostics(cityDiagnostics: CityDiscoveryDiagnostic[]): DiscoveryProviderDiagnostics {
  const combined = emptyProviderDiagnostics();
  for (const provider of discoveryProviders) {
    const items = cityDiagnostics.map((city) => city.providerDiagnostics[provider]).filter(Boolean);
    const detail = latestProviderDetail(items);
    combined[provider] = items.length
      ? {
          configured: combineBooleanState(items.map((item) => item.configured)),
          queryExecuted: combineBooleanState(items.map((item) => item.queryExecuted)),
          status: combineProviderStatus(items),
          returnedCount: items.reduce((total, item) => total + item.returnedCount, 0),
          withinRadiusCount: items.reduce((total, item) => total + item.withinRadiusCount, 0),
          afterDeduplicationCount: items.reduce((total, item) => total + item.afterDeduplicationCount, 0),
          usableWebsiteCount: items.reduce((total, item) => total + item.usableWebsiteCount, 0),
          retryCount: items.reduce((total, item) => total + (item.retryCount ?? 0), 0),
          ...(detail?.httpStatus ? { httpStatus: detail.httpStatus } : {}),
          ...(detail?.envVarName ? { envVarName: detail.envVarName } : {}),
          ...(typeof detail?.envVarPresent === "boolean" || detail?.envVarPresent === null ? { envVarPresent: detail.envVarPresent } : {}),
          ...(typeof detail?.canRunWithoutApiKey === "boolean" ? { canRunWithoutApiKey: detail.canRunWithoutApiKey } : {}),
          ...(detail?.query ? { query: detail.query } : {}),
          ...(detail?.attemptedAt ? { attemptedAt: detail.attemptedAt } : {}),
          ...(detail?.finishedAt ? { finishedAt: detail.finishedAt } : {}),
          ...(items.some((item) => item.durationMs) ? { durationMs: items.reduce((total, item) => total + (item.durationMs ?? 0), 0) } : {}),
          ...(detail?.failureType ? { failureType: detail.failureType } : {}),
          ...(detail?.safeErrorMessage ? { safeErrorMessage: detail.safeErrorMessage } : {}),
        }
      : combined[provider];
  }
  return combined;
}

function combineSourceCounts(results: DiscoveryResult[]): DiscoverySourceCounts {
  return results.reduce((combined, result) => {
    for (const [source, count] of Object.entries(result.diagnostics.sourceCounts) as Array<[keyof DiscoverySourceCounts, number]>) {
      combined[source] += count;
    }
    return combined;
  }, emptySourceCounts());
}

function combineQualificationBreakdowns(results: DiscoveryResult[]): DiscoveryQualificationBreakdown | undefined {
  const values = results.map((result) => result.diagnostics.qualificationBreakdown).filter(Boolean) as DiscoveryQualificationBreakdown[];
  if (!values.length) return undefined;
  return values.reduce<DiscoveryQualificationBreakdown>((combined, current) => ({
    mergedCandidates: combined.mergedCandidates + current.mergedCandidates,
    ownedWebsiteCandidates: combined.ownedWebsiteCandidates + current.ownedWebsiteCandidates,
    noOwnedWebsiteCandidates: combined.noOwnedWebsiteCandidates + current.noOwnedWebsiteCandidates,
    requestedTypeMismatch: combined.requestedTypeMismatch + current.requestedTypeMismatch,
    noActivityEvidence: combined.noActivityEvidence + current.noActivityEvidence,
    badFitOrInactive: combined.badFitOrInactive + current.badFitOrInactive,
    eligibleLeads: combined.eligibleLeads + current.eligibleLeads,
    manualOpportunityCandidates: (combined.manualOpportunityCandidates ?? 0) + (current.manualOpportunityCandidates ?? 0),
  }), {
    mergedCandidates: 0,
    ownedWebsiteCandidates: 0,
    noOwnedWebsiteCandidates: 0,
    requestedTypeMismatch: 0,
    noActivityEvidence: 0,
    badFitOrInactive: 0,
    eligibleLeads: 0,
    manualOpportunityCandidates: 0,
  });
}

function leadDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function leadNameKey(value: string) {
  return value.toLowerCase().replace(/\b(llc|inc|company|co|corp|corporation|services?)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function leadPhoneKey(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

function leadDedupeKey(lead: DiscoveredLead) {
  const name = leadNameKey(lead.businessName);
  const websiteDomain = leadDomain(lead.website);
  if (websiteDomain) return `website:${websiteDomain}:${name}`;
  const profileDomain = leadDomain(lead.profileUrl);
  if (profileDomain) return `profile:${profileDomain}:${lead.profileUrl.toLowerCase()}`;
  const phone = leadPhoneKey(lead.phone);
  if (phone) return `phone:${phone}:${name}`;
  const address = lead.address.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return address ? `address:${address}:${name}` : "";
}

function leadMatchedCities(...leads: DiscoveredLead[]) {
  return [...new Set(leads.flatMap((lead) => lead.matchedCities?.length ? lead.matchedCities : [`${lead.city}, ${lead.state}`]))];
}

function mergeLeadForAllTrades(existing: DiscoveredLead, incoming: DiscoveredLead): DiscoveredLead {
  const keepIncoming = (incoming.sourceConfidence ?? 0) > (existing.sourceConfidence ?? 0);
  const primary = keepIncoming ? incoming : existing;
  const secondary = keepIncoming ? existing : incoming;
  return {
    ...primary,
    sources: [...new Set([...(primary.sources ?? []), ...(secondary.sources ?? [])])],
    phone: primary.phone || secondary.phone,
    email: primary.email || secondary.email,
    contactFormUrl: primary.contactFormUrl || secondary.contactFormUrl,
    profileUrl: primary.profileUrl || secondary.profileUrl,
    activitySignals: [...new Set([...(primary.activitySignals ?? []), ...(secondary.activitySignals ?? [])])],
    providerIdentityEvidence: [...(primary.providerIdentityEvidence ?? []), ...(secondary.providerIdentityEvidence ?? [])],
    originCity: primary.originCity || secondary.originCity,
    matchedCities: leadMatchedCities(primary, secondary),
    rating: Math.max(primary.rating ?? 0, secondary.rating ?? 0) || undefined,
    reviewCount: Math.max(primary.reviewCount ?? 0, secondary.reviewCount ?? 0) || undefined,
    recentReviewCount: Math.max(primary.recentReviewCount ?? 0, secondary.recentReviewCount ?? 0) || undefined,
    sourceConfidence: Math.max(primary.sourceConfidence ?? 0, secondary.sourceConfidence ?? 0),
  };
}

export function combineTradeDiscoveryResults(input: {
  radiusKm: number;
  limit: number;
  initialLeads?: DiscoveredLead[];
  previousTradeDiagnostics?: TradeDiscoveryDiagnostic[];
  results: Array<{ trade: TradeCategory; result: DiscoveryResult }>;
}): DiscoveryResult {
  const merged = new Map<string, DiscoveredLead>();
  let unmergeableIndex = 0;
  const saveLead = (lead: DiscoveredLead) => {
    const strongKey = leadDedupeKey(lead);
    const key = strongKey || `unmergeable:${unmergeableIndex++}`;
    const existing = strongKey ? merged.get(key) : undefined;
    merged.set(key, existing ? mergeLeadForAllTrades(existing, lead) : lead);
  };
  for (const lead of input.initialLeads ?? []) saveLead(lead);
  for (const { result } of input.results) {
    for (const lead of result.leads) saveLead(lead);
  }
  const allLeads = [...merged.values()].sort((left, right) =>
    (right.sourceConfidence ?? 0) - (left.sourceConfidence ?? 0)
    || Number(Boolean(right.email)) - Number(Boolean(left.email))
    || Number(Boolean(right.contactFormUrl)) - Number(Boolean(left.contactFormUrl))
    || Number(Boolean(right.phone)) - Number(Boolean(left.phone))
    || (right.recentReviewCount ?? 0) - (left.recentReviewCount ?? 0)
    || (right.reviewCount ?? 0) - (left.reviewCount ?? 0));
  const leads = allLeads.slice(0, input.limit);
  const newTradeDiagnostics: TradeDiscoveryDiagnostic[] = input.results.map(({ trade, result }) => {
    const providerItems = Object.entries(result.diagnostics.providerDiagnostics);
    const rateLimitedProviders = providerItems
      .filter(([, diagnostic]) => diagnostic.status === "rate_limited")
      .map(([provider]) => provider);
    const retryCount = providerItems.reduce((total, [, diagnostic]) => total + (diagnostic.retryCount ?? 0), 0);
    const hasProviderProblem = providerItems.some(([, diagnostic]) => ["rate_limited", "failed", "timed_out"].includes(diagnostic.status));
    return {
      trade,
      status: result.leads.length ? hasProviderProblem ? "partial" as const : "completed" as const : hasProviderProblem ? "skipped" as const : "completed" as const,
      rawProviderCount: result.diagnostics.rawProviderCount,
      withinRadiusCount: result.diagnostics.afterDistanceFilteringCount,
      afterDeduplicationCount: result.diagnostics.afterDuplicateFilteringCount,
      usableWebsiteCount: result.diagnostics.providerDiagnostics.googlePlaces.usableWebsiteCount
        + result.diagnostics.providerDiagnostics.azureMaps.usableWebsiteCount
        + result.diagnostics.providerDiagnostics.osm.usableWebsiteCount
        + result.diagnostics.providerDiagnostics.yelp.usableWebsiteCount,
      returnedCount: result.diagnostics.returnedCount,
      providerDiagnostics: result.diagnostics.providerDiagnostics,
      ...(rateLimitedProviders.length ? { rateLimitedProviders } : {}),
      ...(retryCount ? { retryCount } : {}),
      ...(result.leads.length === 0 && hasProviderProblem ? { skippedReason: "One or more providers were unavailable while no eligible leads were returned." } : {}),
    };
  });
  const tradeDiagnostics = [...(input.previousTradeDiagnostics ?? [])]
    .filter((previous) => !newTradeDiagnostics.some((current) => current.trade === previous.trade))
    .concat(newTradeDiagnostics);
  const qualificationBreakdown = combineQualificationBreakdowns(input.results.map((item) => item.result));
  const preQualificationMergedCount = qualificationBreakdown?.mergedCandidates ?? allLeads.length;
  const diagnostics: DiscoveryDiagnostics = {
    rawProviderCount: tradeDiagnostics.reduce((total, item) => total + item.rawProviderCount, 0),
    afterDistanceFilteringCount: tradeDiagnostics.reduce((total, item) => total + item.withinRadiusCount, 0),
    afterDuplicateFilteringCount: preQualificationMergedCount,
    afterQualificationFilteringCount: allLeads.length,
    returnedCount: leads.length,
    radiusKm: input.radiusKm,
    categorySignals: input.results.flatMap((item) => item.result.diagnostics.categorySignals),
    sourceCounts: combineSourceCounts(input.results.map((item) => item.result)),
    providerDiagnostics: combineProviderDiagnosticsFromTradeDiagnostics(tradeDiagnostics),
    finalMergedCount: preQualificationMergedCount,
    ...(qualificationBreakdown ? { qualificationBreakdown } : {}),
    tradeDiagnostics,
  };
  return { leads, diagnostics };
}

export function combineCityDiscoveryResults(input: {
  radiusKm: number;
  limit: number;
  cityTargets: CitySearchTarget[];
  excludePreviouslyReviewed: boolean;
  results: Array<{ target: CitySearchTarget; requestedCount: number; result: DiscoveryResult }>;
}): DiscoveryResult {
  const merged = new Map<string, DiscoveredLead>();
  let unmergeableIndex = 0;
  for (const { target, result } of input.results) {
    for (const lead of result.leads) {
      const taggedLead: DiscoveredLead = {
        ...lead,
        originCity: lead.originCity ?? target.label,
        matchedCities: lead.matchedCities?.length ? lead.matchedCities : [target.label],
      };
      const strongKey = leadDedupeKey(taggedLead);
      const key = strongKey || `unmergeable:${unmergeableIndex++}`;
      const existing = strongKey ? merged.get(key) : undefined;
      merged.set(key, existing ? mergeLeadForAllTrades(existing, taggedLead) : taggedLead);
    }
  }
  const allLeads = [...merged.values()].sort((left, right) =>
    (right.sourceConfidence ?? 0) - (left.sourceConfidence ?? 0)
    || Number(Boolean(right.email)) - Number(Boolean(left.email))
    || Number(Boolean(right.contactFormUrl)) - Number(Boolean(left.contactFormUrl))
    || Number(Boolean(right.phone)) - Number(Boolean(left.phone))
    || (right.recentReviewCount ?? 0) - (left.recentReviewCount ?? 0)
    || (right.reviewCount ?? 0) - (left.reviewCount ?? 0));
  const leads = allLeads.slice(0, input.limit);
  const cityDiagnostics: CityDiscoveryDiagnostic[] = input.results.map(({ target, requestedCount, result }) => {
    const providerItems = Object.entries(result.diagnostics.providerDiagnostics);
    const hasProviderProblem = providerItems.some(([, diagnostic]) => ["rate_limited", "failed", "timed_out"].includes(diagnostic.status));
    const providerSucceededWithRecords = providerItems.some(([, diagnostic]) => diagnostic.status === "succeeded" && diagnostic.returnedCount > 0);
    const noEligibleMatches = result.leads.length === 0 && providerSucceededWithRecords;
    return {
      city: target.city,
      state: target.state,
      label: target.label,
      status: result.leads.length
        ? hasProviderProblem ? "partial" : "completed"
        : noEligibleMatches
          ? hasProviderProblem ? "partial" : "completed"
          : hasProviderProblem ? "failed" : "completed",
      requestedCount,
      rawProviderCount: result.diagnostics.rawProviderCount,
      withinRadiusCount: result.diagnostics.afterDistanceFilteringCount,
      afterDeduplicationCount: result.diagnostics.afterDuplicateFilteringCount,
      usableWebsiteCount: providerItems.reduce((total, [, diagnostic]) => total + diagnostic.usableWebsiteCount, 0),
      returnedCount: result.diagnostics.returnedCount,
      providerDiagnostics: result.diagnostics.providerDiagnostics,
      providersAttempted: providerItems.filter(([, diagnostic]) => diagnostic.queryExecuted).map(([provider]) => provider),
      skippedCount: Math.max(0, result.diagnostics.afterDuplicateFilteringCount - result.diagnostics.returnedCount),
      qualifiedCount: result.diagnostics.qualificationBreakdown?.eligibleLeads ?? result.diagnostics.returnedCount,
      mainSkipReasons: result.leads.length === 0
        ? noEligibleMatches
          ? ["No eligible records after the requested prospect-type and safety filters"]
          : hasProviderProblem ? ["Provider unavailable or timed out"] : ["No usable records returned"]
        : [],
      ...(result.leads.length === 0
        ? {
            safeReason: noEligibleMatches
              ? "Providers returned business records, but none matched the requested prospect type and safety filters."
              : hasProviderProblem
                ? "Provider unavailable or timed out before eligible records were available for this city."
                : "No eligible business records were returned for this city.",
          }
        : {}),
    };
  });
  const qualificationBreakdown = combineQualificationBreakdowns(input.results.map((item) => item.result));
  const preQualificationMergedCount = qualificationBreakdown?.mergedCandidates
    ?? input.results.reduce((total, item) => total + item.result.diagnostics.afterDuplicateFilteringCount, 0);
  const diagnostics: DiscoveryDiagnostics = {
    rawProviderCount: cityDiagnostics.reduce((total, item) => total + item.rawProviderCount, 0),
    afterDistanceFilteringCount: cityDiagnostics.reduce((total, item) => total + item.withinRadiusCount, 0),
    afterDuplicateFilteringCount: preQualificationMergedCount,
    afterQualificationFilteringCount: allLeads.length,
    returnedCount: leads.length,
    radiusKm: input.radiusKm,
    categorySignals: input.results.flatMap((item) => item.result.diagnostics.categorySignals),
    sourceCounts: combineSourceCounts(input.results.map((item) => item.result)),
    providerDiagnostics: combineProviderDiagnosticsFromCityDiagnostics(cityDiagnostics),
    finalMergedCount: preQualificationMergedCount,
    ...(qualificationBreakdown ? { qualificationBreakdown } : {}),
    tradeDiagnostics: input.results.flatMap((item) => item.result.diagnostics.tradeDiagnostics ?? []),
    cityDiagnostics,
    cityTargets: input.cityTargets,
    excludePreviouslyReviewed: input.excludePreviouslyReviewed,
  };
  return { leads, diagnostics };
}

function savedDiscoveryLeadCount(value: Prisma.JsonValue | null) {
  return discoveryLeadsFromJson(value).length;
}

function discoveryHasPartialIssues(diagnostics: DiscoveryDiagnostics | null | undefined) {
  return Boolean(
    diagnostics?.tradeDiagnostics?.some((trade) => trade.status === "partial" || trade.status === "skipped" || trade.rateLimitedProviders?.length)
    || diagnostics?.cityDiagnostics?.some((city) => city.status === "partial" || city.status === "failed")
    || Object.values(diagnostics?.providerDiagnostics ?? {}).some((provider) => ["rate_limited", "failed", "timed_out"].includes(provider.status)),
  );
}

export function discoveryHasSuccessfulProviderRecords(diagnostics: DiscoveryDiagnostics | null | undefined) {
  return Boolean(Object.values(diagnostics?.providerDiagnostics ?? {})
    .some((provider) => provider.status === "succeeded" && provider.returnedCount > 0));
}

export function waitingStatusForDiscovery(discovery: DiscoveryResult) {
  if (discovery.leads.length === 0) {
    if (discoveryHasSuccessfulProviderRecords(discovery.diagnostics)) {
      return discoveryHasPartialIssues(discovery.diagnostics) ? "COMPLETED_WITH_PARTIAL_RESULTS" : "COMPLETED";
    }
    return "FAILED_AFTER_DISCOVERY";
  }
  return discoveryHasPartialIssues(discovery.diagnostics) ? "PARTIAL_RESULTS_READY" : "NEEDS_NEXT_BATCH";
}

function completedStatusForDiscovery(discoveredLeads: Prisma.JsonValue | null) {
  return discoveryHasPartialIssues(discoveryDiagnosticsFromJson(discoveredLeads)) ? "COMPLETED_WITH_PARTIAL_RESULTS" : "COMPLETED";
}

export function tradeFailureDiscoveryResult(input: {
  trade: TradeCategory;
  radiusKm: number;
  rateLimited: boolean;
  safeReason: string;
}): DiscoveryResult {
  const providerDiagnostics = emptyProviderDiagnostics();
  providerDiagnostics.osm = {
    ...emptyProviderDiagnostic(input.rateLimited ? "rate_limited" : "failed"),
    configured: true,
    queryExecuted: true,
    httpStatus: input.rateLimited ? 429 : undefined,
    retryCount: input.rateLimited ? 2 : undefined,
  };
  return {
    leads: [],
    diagnostics: {
      rawProviderCount: 0,
      afterDistanceFilteringCount: 0,
      afterDuplicateFilteringCount: 0,
      afterQualificationFilteringCount: 0,
      returnedCount: 0,
      radiusKm: input.radiusKm,
      categorySignals: [],
      sourceCounts: emptySourceCounts(),
      providerDiagnostics,
      finalMergedCount: 0,
      tradeDiagnostics: [{
        trade: input.trade,
        status: "skipped",
        rawProviderCount: 0,
        withinRadiusCount: 0,
        afterDeduplicationCount: 0,
        usableWebsiteCount: 0,
        returnedCount: 0,
        providerDiagnostics,
        ...(input.rateLimited ? { rateLimitedProviders: ["osm"], retryCount: 2 } : {}),
        skippedReason: input.safeReason,
      }],
    },
  };
}

function cityFailureDiscoveryResult(input: {
  target: CitySearchTarget;
  radiusKm: number;
  safeReason: string;
  classification?: string;
}): DiscoveryResult {
  const providerDiagnostics = emptyProviderDiagnostics();
  for (const provider of discoveryProviders) {
    providerDiagnostics[provider] = {
      ...emptyProviderDiagnostic(input.classification === "discovery_provider_error" ? "failed" : "not_recorded"),
      configured: null,
      queryExecuted: null,
    };
  }
  return {
    leads: [],
    diagnostics: {
      rawProviderCount: 0,
      afterDistanceFilteringCount: 0,
      afterDuplicateFilteringCount: 0,
      afterQualificationFilteringCount: 0,
      returnedCount: 0,
      radiusKm: input.radiusKm,
      categorySignals: [],
      sourceCounts: emptySourceCounts(),
      providerDiagnostics,
      finalMergedCount: 0,
      cityDiagnostics: [{
        city: input.target.city,
        state: input.target.state,
        label: input.target.label,
        status: "failed",
        requestedCount: 0,
        rawProviderCount: 0,
        withinRadiusCount: 0,
        afterDeduplicationCount: 0,
        usableWebsiteCount: 0,
        returnedCount: 0,
        providerDiagnostics,
        safeReason: input.safeReason,
      }],
    },
  };
}

async function discoverTopProspectLeads(input: {
  jobId: string;
  city: string;
  state: string;
  tradeCategory: string;
  radiusKm: number;
  limit: number;
  prospectType: ProspectSearchType;
  excludePreviouslyReviewed: boolean;
  savePartial?: (result: DiscoveryResult) => Promise<void>;
}) {
  const cityTargets = parseTopProspectCityTargets(input.city, input.state);
  const targets = cityTargets.length ? cityTargets : [{ city: input.city, state: input.state, label: `${input.city}, ${input.state}` }];
  const budgets = citySearchBudgets(input.limit, targets.length);
  const cityResults: Array<{ target: CitySearchTarget; requestedCount: number; result: DiscoveryResult }> = [];

  async function discoverOneCity(target: CitySearchTarget, cityLimit: number) {
    if (input.tradeCategory !== allCoreServiceTradesOption) {
      return discoverContractorsWithDiagnostics({
        city: target.city,
        state: target.state,
        trade: input.tradeCategory as DiscoveredLead["trade"],
        radiusKm: input.radiusKm,
        limit: cityLimit,
        prospectType: input.prospectType,
        skipThrottle: targets.length > 1,
        logger(event, metadata) {
          console.info(`[top-prospects] ${event}.`, { jobId: input.jobId, trade: input.tradeCategory, city: target.label, ...metadata });
        },
      });
    }

    const tradeBudgets = coreServiceTrades.map((trade, index) => ({
      trade,
      limit: Math.floor(cityLimit / coreServiceTrades.length) + (index < cityLimit % coreServiceTrades.length ? 1 : 0),
    })).filter((item) => item.limit > 0);
    const results: Array<{ trade: TradeCategory; result: DiscoveryResult }> = [];
    for (const { trade, limit } of tradeBudgets) {
      console.info("[top-prospects] Trade discovery started.", { jobId: input.jobId, city: target.label, trade, perTradeLimit: limit });
      let result: DiscoveryResult;
      try {
        result = await discoverContractorsWithDiagnostics({
          city: target.city,
          state: target.state,
          trade,
          radiusKm: input.radiusKm,
          limit,
          prospectType: input.prospectType,
          skipThrottle: true,
          logger(event, metadata) {
            console.info(`[top-prospects] ${event}.`, { jobId: input.jobId, city: target.label, trade, ...metadata });
          },
        });
      } catch (error) {
        const providerError = safeTopProspectJobFailure(error);
        if (!(error instanceof TopProspectStageError) || providerError.classification !== "discovery_provider_error") throw error;
        const rateLimited = /HTTP 429|rate.?limit/i.test(providerError.reason);
        result = tradeFailureDiscoveryResult({ trade, radiusKm: input.radiusKm, rateLimited, safeReason: providerError.reason });
      }
      results.push({ trade, result });
    }
    return combineTradeDiscoveryResults({ radiusKm: input.radiusKm, limit: cityLimit, results });
  }

  for (const [index, target] of targets.entries()) {
    const requestedCount = budgets[index];
    console.info("[top-prospects] City discovery started.", { jobId: input.jobId, city: target.label, requestedCount });
    let result: DiscoveryResult;
    try {
      result = await discoverOneCity(target, requestedCount);
    } catch (error) {
      const failure = safeTopProspectJobFailure(error);
      result = cityFailureDiscoveryResult({
        target,
        radiusKm: input.radiusKm,
        safeReason: failure.reason,
        classification: failure.classification,
      });
      console.warn("[top-prospects] City discovery failed safely; continuing remaining cities.", {
        jobId: input.jobId,
        city: target.label,
        classification: failure.classification,
        reason: failure.reason,
      });
    }
    cityResults.push({ target, requestedCount, result });
    const partial = combineCityDiscoveryResults({
      radiusKm: input.radiusKm,
      limit: input.limit,
      cityTargets: targets,
      excludePreviouslyReviewed: input.excludePreviouslyReviewed,
      results: cityResults,
    });
    await input.savePartial?.(partial);
  }
  return combineCityDiscoveryResults({
    radiusKm: input.radiusKm,
    limit: input.limit,
    cityTargets: targets,
    excludePreviouslyReviewed: input.excludePreviouslyReviewed,
    results: cityResults,
  });
}

function skipSummary(value: Prisma.JsonValue | null) {
  if (!value || Array.isArray(value) || typeof value !== "object") return {} as Record<string, number>;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function addSkip(summary: Record<string, number>, reason: string) {
  summary[reason] = (summary[reason] ?? 0) + 1;
}

type ProcessLeadResult = {
  qualified: boolean;
  unresolved?: UnresolvedTopProspectRecord;
  websiteEnrichment?: TopProspectWebsiteEnrichmentRecord;
};

export function existingProspectRequiresWebsiteResolution(prospect: Prospect, now = new Date()) {
  const disposition = normalizeWebsiteFitDisposition(prospect);
  if (["adequate_existing_website", "strong_existing_website"].includes(disposition)) return false;
  if (!websiteFitAllowsAutonomousOutreach(prospect)) return true;
  const freshness = prospectFreshnessAt(prospect, now);
  return !freshness.websiteVerificationFresh || !freshness.websiteFitFresh;
}

function existingProspectNeedsHistoricalNoSiteLookup(prospect: Prospect, now: Date) {
  if (prospect.website.trim() || prospect.prospectType !== "no_website_social_only") return false;
  const createdAt = Date.parse(prospect.createdAt);
  return !Number.isFinite(createdAt) || now.getTime() - createdAt > 7 * 24 * 60 * 60 * 1_000;
}

function unresolvedTopProspectRecord(
  prospect: Prospect,
  lead: DiscoveredLead,
  resolution?: SharedProspectVerificationResolution,
): UnresolvedTopProspectRecord {
  const reasonCode = resolution?.reasonCode ?? unresolvedWebsiteReason(prospect);
  const manualOpportunity = assessManualTopProspectOpportunity(prospect, lead);
  return {
    prospectId: prospect.id,
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: prospect.city,
    state: prospect.state,
    providerSources: [...new Set(lead.sources ?? [])],
    websiteCandidate: prospect.website || lead.website || "",
    websiteVerificationState: prospect.websiteVerification?.status ?? prospect.websiteStatus,
    websiteFitState: normalizeWebsiteFitDisposition(prospect),
    unresolvedReasonCode: reasonCode,
    evidenceSummary: resolution?.explanation ?? (prospect.websiteStatusDetail || "Current structured evidence is incomplete."),
    persistedAsProspect: true,
    preventedQualification: manualOpportunity?.strictRequirementFailed
      ?? "Website identity, ownership, or fit did not reach the shared current-evidence standard.",
    recommendedNextAction: manualOpportunity
      ? "Inspect the business and current evidence manually. This record is not auto-send ready; no package was generated and nothing was sent."
      : "Review this record in Manual Review Triage. No package was generated and nothing was sent.",
    reviewBucket: manualOpportunity ? "manual_opportunity" : "unresolved",
    ...(manualOpportunity
      ? {
          manualOpportunityKind: manualOpportunity.kind,
          websiteObservations: manualOpportunity.websiteObservations,
          evidenceSummary: manualOpportunity.surfacedReason,
        }
      : {}),
  };
}

function topProspectWebsiteEnrichmentRecord(
  prospect: Prospect,
  resolution?: SharedProspectVerificationResolution,
): TopProspectWebsiteEnrichmentRecord | undefined {
  const diagnostic = resolution?.noSiteEnrichment;
  if (!diagnostic) return undefined;
  return {
    prospectId: prospect.id,
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: prospect.city,
    state: prospect.state,
    ...diagnostic,
  };
}

function addUnresolvedSkip(
  summary: Record<string, number>,
  record: UnresolvedTopProspectRecord,
  fallbackReason: string,
) {
  addSkip(summary, record.reviewBucket === "manual_opportunity" ? "manual_opportunity" : fallbackReason);
}

function discoveryWithProcessingRecords(
  value: Prisma.JsonValue | null,
  unresolvedRecords: UnresolvedTopProspectRecord[],
  websiteEnrichmentRecords: TopProspectWebsiteEnrichmentRecord[],
): Prisma.InputJsonValue | undefined {
  if (
    !value
    || Array.isArray(value)
    || typeof value !== "object"
    || (!unresolvedRecords.length && !websiteEnrichmentRecords.length)
  ) return undefined;
  const envelope = structuredClone(value) as Record<string, unknown>;
  const diagnostics = envelope.diagnostics && typeof envelope.diagnostics === "object" && !Array.isArray(envelope.diagnostics)
    ? envelope.diagnostics as Record<string, unknown>
    : {};
  const existing = Array.isArray(diagnostics.unresolvedRecords)
    ? diagnostics.unresolvedRecords as UnresolvedTopProspectRecord[]
    : [];
  const byProspectId = new Map(existing.map((record) => [record.prospectId, record]));
  for (const record of unresolvedRecords) byProspectId.set(record.prospectId, record);
  diagnostics.unresolvedRecords = [...byProspectId.values()].slice(0, 250);
  const existingEnrichment = Array.isArray(diagnostics.websiteEnrichmentRecords)
    ? diagnostics.websiteEnrichmentRecords as TopProspectWebsiteEnrichmentRecord[]
    : [];
  const enrichmentByProspectId = new Map(existingEnrichment.map((record) => [record.prospectId, record]));
  for (const record of websiteEnrichmentRecords) enrichmentByProspectId.set(record.prospectId, record);
  diagnostics.websiteEnrichmentRecords = [...enrichmentByProspectId.values()].slice(0, 250);
  envelope.diagnostics = diagnostics;
  return envelope as Prisma.InputJsonValue;
}

export function recoverableTopProspect(prospect: Awaited<ReturnType<typeof findProspectByWebsite>>, jobCreatedAt: Date) {
  return Boolean(
    prospect
    && Date.parse(prospect.createdAt) >= jobCreatedAt.getTime()
    && (prospect.prospectType === "no_website_social_only" || prospect.analysis)
    && prospect.outreach
    && prospect.activities.some((item) =>
      item.label.startsWith("Automated Top Prospects analysis completed")
      || item.label.startsWith("Automated online presence gap review completed")),
  );
}

function existingProspectWasPreviouslyReviewed(prospect: Prospect) {
  return prospect.status !== "New"
    || Boolean(prospect.analysis)
    || Boolean(prospect.outreach)
    || Boolean(prospect.preview)
    || prospect.activities.some((item) => item.label.startsWith("Automated Top Prospects") || item.label.startsWith("Automated online presence"));
}

export function verifiedExistingTopProspectCanBeReassessed(
  prospect: Prospect,
  now = new Date(),
  options: { excludePreviouslyReviewed?: boolean } = {},
) {
  if (contactedStatuses.has(prospect.status) || prospectIsSuppressed(prospect)) return false;
  if (options.excludePreviouslyReviewed && existingProspectWasPreviouslyReviewed(prospect)) return false;
  const freshness = prospectFreshnessAt(prospect, now);
  return websiteFitAllowsAutonomousOutreach(prospect)
    && freshness.websiteVerificationFresh
    && freshness.websiteFitFresh;
}

async function claimJob(jobId: string) {
  const database = getProspectDatabase();
  const token = crypto.randomUUID();
  const now = new Date();
  const claimed = await database.topProspectJob.updateMany({
    where: {
      id: jobId,
      status: { in: resumableStatuses },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    data: { status: "RUNNING", leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), errorMessage: null },
  });
  if (!claimed.count) return null;
  return database.topProspectJob.findUniqueOrThrow({ where: { id: jobId } });
}

async function releaseLease(jobId: string, token: string) {
  await getProspectDatabase().topProspectJob.updateMany({
    where: { id: jobId, leaseToken: token },
    data: { leaseToken: null, leaseUntil: null },
  });
}

async function finalizeJob(jobId: string, wanted: number, discoveredLeads: Prisma.JsonValue | null) {
  const database = getProspectDatabase();
  const ranked = await database.topProspectResult.findMany({
    where: { jobId, selected: true },
    orderBy: [{ weightedSalesScore: "desc" }, { createdAt: "asc" }],
  });
  await database.$transaction([
    database.topProspectResult.updateMany({ where: { jobId }, data: { selected: false, rank: null } }),
    ...ranked.slice(0, wanted).map((result, index) => database.topProspectResult.update({
      where: { id: result.id },
      data: { selected: true, rank: index + 1 },
    })),
    database.topProspectJob.update({
      where: { id: jobId },
      data: { status: completedStatusForDiscovery(discoveredLeads), stage: "COMPLETE", completedAt: new Date(), leaseToken: null, leaseUntil: null },
    }),
  ]);
}

async function saveTopProspectResult(
  jobId: string,
  prospect: Prospect,
  mode: ProspectMode,
  outreachPreference: OutreachPreference,
) {
  const database = getProspectDatabase();
  const existingResult = await database.topProspectResult.findUnique({
    where: { jobId_prospectId: { jobId, prospectId: prospect.id } },
    select: { buildPrompt: true, previewLink: true, publicPreviewToken: true },
  });
  const prepared = prepareTopProspectOutreachArtifacts(prospect, outreachPreference);
  const rejectionReason = topProspectRejectionReason(prepared.prospect, prepared.assessment, mode, outreachPreference);
  const scores = prepared.assessment.salesScores;
  await saveProspect({
    ...prepared.prospect,
    priorityScore: scores.weightedSalesScore,
    activities: [
      activity("outreach", "Permission-first Top Prospects outreach package generated without building a preview."),
      ...prepared.prospect.activities,
    ],
  });
  const preservedPreview = {
    buildPrompt: existingResult?.buildPrompt ?? "",
    previewLink: existingResult?.previewLink ?? "",
    publicPreviewToken: existingResult?.publicPreviewToken ?? null,
  };
  await database.topProspectResult.upsert({
    where: { jobId_prospectId: { jobId, prospectId: prospect.id } },
    update: {
      opportunityScore: prepared.assessment.opportunityScore,
      ...scores,
      prospectType: prospect.prospectType,
      onlinePresenceGapScore: prepared.assessment.presenceScores?.onlinePresenceGapScore ?? 0,
      businessActivityScore: prepared.assessment.presenceScores?.businessActivityScore ?? 0,
      websiteNeedScore: prepared.assessment.presenceScores?.websiteNeedScore ?? 0,
      mainWeakness: prepared.assessment.mainWeakness,
      whyMayBuy: prepared.assessment.whyMayBuy,
      pitchAngle: prepared.assessment.pitchAngle,
      ...preservedPreview,
      packageStatus: "PACKAGE_GENERATED",
      packageGeneratedAt: new Date(),
      packageReviewedAt: null,
      packageApprovedAt: null,
      packageSentAt: null,
      packageSkippedAt: null,
      selected: rejectionReason === null,
    },
    create: {
      jobId,
      prospectId: prospect.id,
      opportunityScore: prepared.assessment.opportunityScore,
      ...scores,
      prospectType: prospect.prospectType,
      onlinePresenceGapScore: prepared.assessment.presenceScores?.onlinePresenceGapScore ?? 0,
      businessActivityScore: prepared.assessment.presenceScores?.businessActivityScore ?? 0,
      websiteNeedScore: prepared.assessment.presenceScores?.websiteNeedScore ?? 0,
      mainWeakness: prepared.assessment.mainWeakness,
      whyMayBuy: prepared.assessment.whyMayBuy,
      pitchAngle: prepared.assessment.pitchAngle,
      buildPrompt: "",
      previewLink: "",
      packageStatus: "PACKAGE_GENERATED",
      packageGeneratedAt: new Date(),
      selected: rejectionReason === null,
    },
  });
  return rejectionReason;
}

async function processLead(
  jobId: string,
  jobCreatedAt: Date,
  lead: DiscoveredLead,
  summary: Record<string, number>,
  mode: ProspectMode,
  outreachPreference: OutreachPreference,
  excludePreviouslyReviewed: boolean,
): Promise<ProcessLeadResult> {
  if (likelyNationalOrLargeBrand(lead)) {
    addSkip(summary, "national_large_brand");
    return { qualified: false };
  }
  if (likelySupplierOrDistributor(lead)) {
    addSkip(summary, "supplier_distributor");
    return { qualified: false };
  }
  if (lead.inactive) {
    addSkip(summary, "inactive_business");
    return { qualified: false };
  }
  let existing = null;
  if (lead.website) {
    const normalized = normalizeWebsite(lead.website);
    const matchingWebsite = await getProspectDatabase().prospect.findFirst({
      where: { website: { contains: new URL(lead.website).hostname.replace(/^www\./, ""), mode: "insensitive" } },
      select: { website: true },
    });
    existing = matchingWebsite?.website && normalizeWebsite(matchingWebsite.website) === normalized
      ? await findProspectByWebsite(matchingWebsite.website)
      : await findProspectByWebsite(lead.website);
  } else {
    existing = await findProspectByIdentity(lead);
  }
  if (existing) {
    let resolvedExistingNow = false;
    const existingResult = await getProspectDatabase().topProspectResult.findUnique({
      where: { jobId_prospectId: { jobId, prospectId: existing.id } },
      select: { selected: true },
    });
    if (existingResult) return { qualified: existingResult.selected };
    if (contactedStatuses.has(existing.status)) {
      addSkip(summary, "already_contacted");
      return { qualified: false };
    }
    if (prospectIsSuppressed(existing)) {
      addSkip(summary, "suppressed_do_not_contact");
      return { qualified: false };
    }
    const previouslyReviewed = existingProspectWasPreviouslyReviewed(existing);
    if (excludePreviouslyReviewed && previouslyReviewed) {
      addSkip(summary, "previously_reviewed");
      return { qualified: false };
    }
    let existingResolution: SharedProspectVerificationResolution | undefined;
    const existingManualOpportunity = assessManualTopProspectOpportunity(existing, lead);
    if (existingManualOpportunity) {
      try {
        existingResolution = await verifyProspectWebsiteWithSecondPass(existing, {
          allowHistoricalNoSiteLookup: true,
        });
        existing = await saveProspect(mergeResolvedWebsiteEvidence(existing, existingResolution.result.prospect));
      } catch {
        const unresolved = unresolvedTopProspectRecord(existing, lead);
        addUnresolvedSkip(summary, unresolved, "website_verification_failed");
        return { qualified: false, unresolved };
      }
      const websiteEnrichment = topProspectWebsiteEnrichmentRecord(existing, existingResolution);
      const refreshedManualOpportunity = assessManualTopProspectOpportunity(existing, lead);
      if (refreshedManualOpportunity) {
        const unresolved = unresolvedTopProspectRecord(existing, lead, existingResolution);
        addUnresolvedSkip(summary, unresolved, "manual_opportunity");
        return { qualified: false, unresolved, ...(websiteEnrichment ? { websiteEnrichment } : {}) };
      }
      if (!websiteFitAllowsAutonomousOutreach(existing)) {
        const fit = normalizeWebsiteFitDisposition(existing);
        const unresolved = fit === "adequate_existing_website" || fit === "strong_existing_website"
          ? undefined
          : unresolvedTopProspectRecord(existing, lead, existingResolution);
        if (unresolved) addUnresolvedSkip(summary, unresolved, "website_fit_requires_review");
        else addSkip(summary, "confirmed_usable_website_not_fit");
        return {
          qualified: false,
          ...(unresolved ? { unresolved } : {}),
          ...(websiteEnrichment ? { websiteEnrichment } : {}),
        };
      }
      resolvedExistingNow = true;
    }
    if (existingProspectRequiresWebsiteResolution(existing, jobCreatedAt)) {
      let resolution: SharedProspectVerificationResolution;
      try {
        const staleNoSiteEvidence = !existing.website.trim() && existing.prospectType === "no_website_social_only";
        resolution = await verifyProspectWebsiteWithSecondPass(existing, {
          allowHistoricalNoSiteLookup: existingProspectNeedsHistoricalNoSiteLookup(existing, jobCreatedAt),
          forceNoSiteEvidenceRefresh: staleNoSiteEvidence,
        });
      } catch {
        const unresolved = unresolvedTopProspectRecord(existing, lead);
        addUnresolvedSkip(summary, unresolved, "website_verification_failed");
        return { qualified: false, unresolved };
      }
      existing = await saveProspect(mergeResolvedWebsiteEvidence(existing, resolution.result.prospect));
      if (!websiteFitAllowsAutonomousOutreach(existing)) {
        const fit = normalizeWebsiteFitDisposition(existing);
        const unresolved = fit === "adequate_existing_website" || fit === "strong_existing_website"
          ? undefined
          : unresolvedTopProspectRecord(existing, lead, resolution);
        if (unresolved) addUnresolvedSkip(summary, unresolved, "website_fit_requires_review");
        else addSkip(summary, "confirmed_usable_website_not_fit");
        const websiteEnrichment = topProspectWebsiteEnrichmentRecord(existing, resolution);
        return {
          qualified: false,
          ...(unresolved ? { unresolved } : {}),
          ...(websiteEnrichment ? { websiteEnrichment } : {}),
        };
      }
      existingResolution = resolution;
      resolvedExistingNow = true;
    } else if (!websiteFitAllowsAutonomousOutreach(existing)) {
      addSkip(summary, "confirmed_usable_website_not_fit");
      return { qualified: false };
    }
    if (
      resolvedExistingNow
      || verifiedExistingTopProspectCanBeReassessed(existing, jobCreatedAt, { excludePreviouslyReviewed })
      || recoverableTopProspect(existing, jobCreatedAt)
      || ((existing.prospectType === "no_website_social_only" || existing.analysis) && existing.outreach)
    ) {
      if (!websiteFitAllowsAutonomousOutreach(existing)) {
        const fit = normalizeWebsiteFitDisposition(existing);
        if (fit === "adequate_existing_website" || fit === "strong_existing_website") {
          addSkip(summary, "confirmed_usable_website_not_fit");
          const websiteEnrichment = topProspectWebsiteEnrichmentRecord(existing, existingResolution);
          return { qualified: false, ...(websiteEnrichment ? { websiteEnrichment } : {}) };
        }
        const unresolved = unresolvedTopProspectRecord(existing, lead);
        addUnresolvedSkip(summary, unresolved, "website_fit_requires_review");
        const websiteEnrichment = topProspectWebsiteEnrichmentRecord(existing, existingResolution);
        return { qualified: false, unresolved, ...(websiteEnrichment ? { websiteEnrichment } : {}) };
      }
      const rejectionReason = await saveTopProspectResult(jobId, existing, mode, outreachPreference);
      if (rejectionReason) addSkip(summary, rejectionReason.toLowerCase().replaceAll(/[\s/]+/g, "_"));
      const websiteEnrichment = topProspectWebsiteEnrichmentRecord(existing, existingResolution);
      return { qualified: rejectionReason === null, ...(websiteEnrichment ? { websiteEnrichment } : {}) };
    }
    addSkip(summary, "duplicate");
    return { qualified: false };
  }

  let prospect = createProspect({ ...lead, sizeIndicator: "Growing", status: "New" });
  let verification: SharedProspectVerificationResolution;
  try {
    verification = await verifyProspectWebsiteWithSecondPass(prospect);
    prospect = verification.result.prospect;
    if (["crawler_blocked", "temporarily_unavailable", "inconclusive", "invalid_website"].includes(prospect.websiteStatus)) {
      await saveProspect(prospect);
      const unresolved = unresolvedTopProspectRecord(prospect, lead, verification);
      addUnresolvedSkip(summary, unresolved, `website_${prospect.websiteStatus}`);
      const websiteEnrichment = topProspectWebsiteEnrichmentRecord(prospect, verification);
      return { qualified: false, unresolved, ...(websiteEnrichment ? { websiteEnrichment } : {}) };
    }
  } catch {
    prospect = await saveProspect({
      ...prospect,
      websiteStatus: "inconclusive",
      websiteStatusDetail: "Website verification failed safely. Current ownership and fit require manual review.",
      fitDisposition: "inconclusive_requires_review",
    });
    const unresolved = unresolvedTopProspectRecord(prospect, lead);
    addUnresolvedSkip(summary, unresolved, "website_verification_failed");
    return { qualified: false, unresolved };
  }
  const manualOpportunity = assessManualTopProspectOpportunity(prospect, lead);
  if (manualOpportunity) {
    prospect = await saveProspect(prospect);
    const unresolved = unresolvedTopProspectRecord(prospect, lead, verification);
    addUnresolvedSkip(summary, unresolved, "manual_opportunity");
    const websiteEnrichment = topProspectWebsiteEnrichmentRecord(prospect, verification);
    return { qualified: false, unresolved, ...(websiteEnrichment ? { websiteEnrichment } : {}) };
  }
  if (!websiteFitAllowsAutonomousOutreach(prospect)) {
    await saveProspect(prospect);
    const fit = normalizeWebsiteFitDisposition(prospect);
    const unresolved = fit === "adequate_existing_website" || fit === "strong_existing_website"
      ? undefined
      : unresolvedTopProspectRecord(prospect, lead);
    if (unresolved) addUnresolvedSkip(summary, unresolved, "website_fit_requires_review");
    else addSkip(summary, "confirmed_usable_website_not_fit");
    const websiteEnrichment = topProspectWebsiteEnrichmentRecord(prospect, verification);
    return {
      qualified: false,
      ...(unresolved ? { unresolved } : {}),
      ...(websiteEnrichment ? { websiteEnrichment } : {}),
    };
  }

  prospect = {
    ...prospect,
    activities: [
      activity("note", `Found in Top Prospects run ${jobId}${lead.matchedCities?.length ? ` for ${lead.matchedCities.join(", ")}` : ""}.`),
      activity("outreach", "Permission-first outreach draft added to the Auto Prospect Queue for human approval. No preview was built."),
      ...prospect.activities,
    ],
  };
  const rejectionReason = await saveTopProspectResult(jobId, prospect, mode, outreachPreference);
  if (rejectionReason) addSkip(summary, rejectionReason.toLowerCase().replaceAll(/[\s/]+/g, "_"));
  const websiteEnrichment = topProspectWebsiteEnrichmentRecord(prospect, verification);
  return { qualified: rejectionReason === null, ...(websiteEnrichment ? { websiteEnrichment } : {}) };
}

export async function processTopProspectJob(jobId: string) {
  await ensureTopProspectSchema();
  const job = await claimJob(jobId);
  if (!job) return { status: "busy_or_complete" as const, shouldContinue: false };
  const token = job.leaseToken!;
  const acceptedSettings = topProspectExecutionSettings(job);
  try {
    const savedLeadCount = savedDiscoveryLeadCount(job.discoveredLeads);
    if (job.stage === "DISCOVER" && savedLeadCount > 0) {
      console.info("[top-prospects] Saved discovery found; resuming analysis without rediscovery.", {
        jobId: job.id,
        savedLeadCount,
      });
      await getProspectDatabase().topProspectJob.updateMany({
        where: { id: job.id, leaseToken: token },
        data: { stage: "ANALYZE" },
      });
    } else if (job.stage === "DISCOVER") {
      console.info("[top-prospects] Discovery started.", {
        jobId: job.id,
        trade: acceptedSettings.trade,
        city: acceptedSettings.city,
        state: acceptedSettings.state,
        radiusKm: acceptedSettings.radiusKm,
        businessesToScan: acceptedSettings.businessesToScan,
      });
      const discovery = await discoverTopProspectLeads({
        jobId: job.id,
        city: acceptedSettings.city,
        state: acceptedSettings.state,
        tradeCategory: acceptedSettings.trade,
        radiusKm: acceptedSettings.radiusKm,
        limit: acceptedSettings.businessesToScan,
        prospectType: acceptedSettings.prospectType,
        excludePreviouslyReviewed: acceptedSettings.excludePreviouslyReviewed,
        async savePartial(partial) {
          const partialStatus = waitingStatusForDiscovery(partial);
          await getProspectDatabase().topProspectJob.updateMany({
            where: { id: job.id, leaseToken: token },
            data: partial.leads.length
              ? {
                  discoveredLeads: partial as unknown as Prisma.InputJsonValue,
                  stage: "ANALYZE",
                  status: partialStatus,
                  errorMessage: null,
                }
              : { discoveredLeads: partial as unknown as Prisma.InputJsonValue },
          });
        },
      });
      console.info("[top-prospects] Discovery completed.", { jobId: job.id, ...discovery.diagnostics });
      const status = waitingStatusForDiscovery(discovery);
      const completedWithoutEligibleLeads = discovery.leads.length === 0
        && (status === "COMPLETED" || status === "COMPLETED_WITH_PARTIAL_RESULTS");
      await getProspectDatabase().topProspectJob.update({
        where: { id: job.id },
        data: {
          discoveredLeads: discovery as unknown as Prisma.InputJsonValue,
          stage: discovery.leads.length ? "ANALYZE" : completedWithoutEligibleLeads ? "COMPLETE" : "DISCOVER",
          status,
          completedAt: completedWithoutEligibleLeads ? new Date() : null,
          errorMessage: status === "FAILED_AFTER_DISCOVERY"
            ? encodeTopProspectJobFailure("discovery_provider_error", "Discovery providers did not produce usable business records. Review provider diagnostics before retrying.")
            : null,
          leaseToken: null,
          leaseUntil: null,
        },
      });
      return {
        status: status.toLowerCase() as "needs_next_batch" | "partial_results_ready" | "failed_after_discovery" | "completed" | "completed_with_partial_results",
        shouldContinue: discovery.leads.length > 0,
      };
    }

    const leads = discoveryLeadsFromJson(job.discoveredLeads);
    if (leads.length === 0) {
      await getProspectDatabase().topProspectJob.updateMany({
        where: { id: job.id, leaseToken: token },
        data: {
          status: "FAILED_AFTER_DISCOVERY",
          errorMessage: encodeTopProspectJobFailure("discovery_provider_error", "No saved eligible prospects were available for analysis."),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      return { status: "failed_after_discovery" as const, shouldContinue: false };
    }
    const mode = acceptedSettings.mode;
    const outreachPreference = acceptedSettings.outreachPreference;
    const discoveryDiagnostics = discoveryDiagnosticsFromJson(job.discoveredLeads);
    const excludePreviouslyReviewed = acceptedSettings.excludePreviouslyReviewed;
    const batch = leads.slice(job.nextLeadIndex, job.nextLeadIndex + BATCH_SIZE);
    const summary = skipSummary(job.skipSummary);
    let qualified = 0;
    const unresolvedRecords: UnresolvedTopProspectRecord[] = [];
    const websiteEnrichmentRecords: TopProspectWebsiteEnrichmentRecord[] = [];
    for (const lead of batch) {
      if (job.nextLeadIndex === 0) {
        console.info("[top-prospects] First candidate processing started.", {
          jobId: job.id,
          businessName: lead.businessName,
          websiteHost: lead.website ? new URL(lead.website).hostname : "no-owned-website",
          classification: lead.classification,
          recommendedContactMethod: lead.recommendedContactMethod,
        });
      }
      const result = await processLead(job.id, job.createdAt, lead, summary, mode, outreachPreference, excludePreviouslyReviewed);
      if (result.qualified) qualified += 1;
      if (result.unresolved) unresolvedRecords.push(result.unresolved);
      if (result.websiteEnrichment) websiteEnrichmentRecords.push(result.websiteEnrichment);
    }
    const nextLeadIndex = job.nextLeadIndex + batch.length;
    const done = nextLeadIndex >= leads.length || nextLeadIndex >= acceptedSettings.businessesToScan;
    const waitingStatus = discoveryHasPartialIssues(discoveryDiagnostics)
      ? "PARTIAL_RESULTS_READY"
      : "NEEDS_NEXT_BATCH";
    const updatedDiscovery = discoveryWithProcessingRecords(
      job.discoveredLeads,
      unresolvedRecords,
      websiteEnrichmentRecords,
    );
    await getProspectDatabase().topProspectJob.update({
      where: { id: job.id },
      data: {
        status: done ? "RUNNING" : waitingStatus,
        stage: "ANALYZE",
        nextLeadIndex,
        scannedCount: { increment: batch.length },
        qualifiedCount: { increment: qualified },
        skippedCount: { increment: batch.length - qualified },
        skipSummary: summary,
        ...(updatedDiscovery ? { discoveredLeads: updatedDiscovery } : {}),
        leaseToken: null,
        leaseUntil: null,
      },
    });
    if (done) {
      await finalizeJob(
        job.id,
        acceptedSettings.finalProspectsWanted,
        updatedDiscovery ? updatedDiscovery as Prisma.JsonValue : job.discoveredLeads,
      );
      return { status: "completed" as const, shouldContinue: false };
    }
    return { status: waitingStatus.toLowerCase() as "needs_next_batch" | "partial_results_ready", shouldContinue: true };
  } catch (error) {
    const failure = safeTopProspectJobFailure(error);
    await getProspectDatabase().topProspectJob.updateMany({
      where: { id: job.id, leaseToken: token },
      data: {
        status: "FAILED",
        errorMessage: encodeTopProspectJobFailure(failure.classification, failure.reason),
        leaseToken: null,
        leaseUntil: null,
      },
    });
    console.error("[top-prospects] Worker batch failed.", {
      jobId: job.id,
      stage: job.stage,
      classification: failure.classification,
      reason: failure.reason,
    });
    return { status: "failed" as const, shouldContinue: false, classification: failure.classification, reason: failure.reason };
  } finally {
    await releaseLease(job.id, token);
  }
}

export function topProspectExecutionSettings(job: {
  tradeCategory: string;
  city: string;
  state: string;
  radiusKm: number;
  businessesToScan: number;
  finalProspectsWanted: number;
  prospectMode: string;
  prospectType: string;
  workflowType: string;
  outreachPreference: string;
  discoveredLeads: Prisma.JsonValue | null;
}) {
  const prospectType: ProspectSearchType = ["redesign", "no_website_social_only", "all"].includes(job.prospectType)
    ? job.prospectType as ProspectSearchType
    : "redesign";
  return {
    trade: job.tradeCategory,
    city: job.city,
    state: job.state,
    radiusKm: job.radiusKm,
    businessesToScan: job.businessesToScan,
    finalProspectsWanted: job.finalProspectsWanted,
    mode: normalizeProspectMode(job.prospectMode),
    prospectType,
    workflowType: job.workflowType,
    outreachPreference: normalizeOutreachPreference(job.outreachPreference),
    excludePreviouslyReviewed: discoveryDiagnosticsFromJson(job.discoveredLeads)?.excludePreviouslyReviewed !== false,
  };
}
