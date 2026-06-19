import type { Prisma } from "@prisma/client";
import {
  discoverContractorsWithDiagnostics,
  discoveryProviders,
  discoveryLeadsFromJson,
  type DiscoveredLead,
  type DiscoveryDiagnostics,
  type DiscoveryProviderDiagnostic,
  type DiscoveryProviderDiagnostics,
  type DiscoveryProviderStatus,
  type DiscoveryResult,
  type DiscoverySourceCounts,
  type TradeDiscoveryDiagnostic,
} from "@/lib/lead-discovery";
import {
  activity,
  allCoreServiceTradesOption,
  calculatePriority,
  coreServiceTrades,
  createProspect,
  withPresenceGapReview,
  type Prospect,
  type ProspectSearchType,
  type TradeCategory,
} from "@/lib/prospect-engine";
import { findProspectByIdentity, findProspectByWebsite, getProspectDatabase, saveProspect } from "@/lib/prospect-repository";
import { createPublicPreviewToken } from "@/lib/public-preview-token";
import { analyzePublicWebsite, classifyWebsiteAnalysisFailure } from "@/lib/site-analysis";
import {
  likelyNationalOrLargeBrand,
  likelySupplierOrDistributor,
  normalizeProspectMode,
  normalizeOutreachPreference,
  normalizeWebsite,
  prepareTopProspectArtifacts,
  publicProspectPreviewLink,
  type OutreachPreference,
  type ProspectMode,
  topProspectRejectionReason,
} from "@/lib/top-prospects";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import {
  encodeTopProspectJobFailure,
  safeTopProspectJobFailure,
} from "@/lib/top-prospect-diagnostics";

const LEASE_MS = 90_000;
const BATCH_SIZE = 1;
const contactedStatuses = new Set(["Contacted", "Interested", "Proposal Sent", "Closed Won", "Closed Lost"]);

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

function combineProviderDiagnostics(results: DiscoveryResult[]): DiscoveryProviderDiagnostics {
  const combined = emptyProviderDiagnostics();
  for (const provider of discoveryProviders) {
    const items = results.map((result) => result.diagnostics.providerDiagnostics[provider]);
    combined[provider] = {
      configured: combineBooleanState(items.map((item) => item.configured)),
      queryExecuted: combineBooleanState(items.map((item) => item.queryExecuted)),
      status: combineProviderStatus(items),
      returnedCount: items.reduce((total, item) => total + item.returnedCount, 0),
      withinRadiusCount: items.reduce((total, item) => total + item.withinRadiusCount, 0),
      afterDeduplicationCount: items.reduce((total, item) => total + item.afterDeduplicationCount, 0),
      usableWebsiteCount: items.reduce((total, item) => total + item.usableWebsiteCount, 0),
    };
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
  const websiteDomain = leadDomain(lead.website);
  if (websiteDomain) return `website:${websiteDomain}`;
  const profileDomain = leadDomain(lead.profileUrl);
  if (profileDomain) return `profile:${profileDomain}:${lead.profileUrl.toLowerCase()}`;
  const phone = leadPhoneKey(lead.phone);
  if (phone) return `phone:${phone}`;
  return `name:${leadNameKey(lead.businessName)}:${lead.city.toLowerCase()}:${lead.state.toLowerCase()}`;
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
    rating: Math.max(primary.rating ?? 0, secondary.rating ?? 0) || undefined,
    reviewCount: Math.max(primary.reviewCount ?? 0, secondary.reviewCount ?? 0) || undefined,
    recentReviewCount: Math.max(primary.recentReviewCount ?? 0, secondary.recentReviewCount ?? 0) || undefined,
    sourceConfidence: Math.max(primary.sourceConfidence ?? 0, secondary.sourceConfidence ?? 0),
  };
}

function combineTradeDiscoveryResults(input: {
  radiusKm: number;
  limit: number;
  results: Array<{ trade: TradeCategory; result: DiscoveryResult }>;
}): DiscoveryResult {
  const merged = new Map<string, DiscoveredLead>();
  for (const { result } of input.results) {
    for (const lead of result.leads) {
      const key = leadDedupeKey(lead);
      const existing = merged.get(key);
      merged.set(key, existing ? mergeLeadForAllTrades(existing, lead) : lead);
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
  const tradeDiagnostics: TradeDiscoveryDiagnostic[] = input.results.map(({ trade, result }) => ({
    trade,
    rawProviderCount: result.diagnostics.rawProviderCount,
    withinRadiusCount: result.diagnostics.afterDistanceFilteringCount,
    afterDeduplicationCount: result.diagnostics.afterDuplicateFilteringCount,
    usableWebsiteCount: result.diagnostics.afterQualificationFilteringCount,
    returnedCount: result.diagnostics.returnedCount,
    providerDiagnostics: result.diagnostics.providerDiagnostics,
  }));
  const diagnostics: DiscoveryDiagnostics = {
    rawProviderCount: input.results.reduce((total, item) => total + item.result.diagnostics.rawProviderCount, 0),
    afterDistanceFilteringCount: input.results.reduce((total, item) => total + item.result.diagnostics.afterDistanceFilteringCount, 0),
    afterDuplicateFilteringCount: allLeads.length,
    afterQualificationFilteringCount: allLeads.length,
    returnedCount: leads.length,
    radiusKm: input.radiusKm,
    categorySignals: input.results.flatMap((item) => item.result.diagnostics.categorySignals),
    sourceCounts: combineSourceCounts(input.results.map((item) => item.result)),
    providerDiagnostics: combineProviderDiagnostics(input.results.map((item) => item.result)),
    finalMergedCount: allLeads.length,
    tradeDiagnostics,
  };
  return { leads, diagnostics };
}

async function discoverTopProspectLeads(input: {
  jobId: string;
  city: string;
  state: string;
  tradeCategory: string;
  radiusKm: number;
  limit: number;
  prospectType: ProspectSearchType;
}) {
  if (input.tradeCategory !== allCoreServiceTradesOption) {
    return discoverContractorsWithDiagnostics({
      city: input.city,
      state: input.state,
      trade: input.tradeCategory as DiscoveredLead["trade"],
      radiusKm: input.radiusKm,
      limit: input.limit,
      prospectType: input.prospectType,
      logger(event, metadata) {
        console.info(`[top-prospects] ${event}.`, { jobId: input.jobId, trade: input.tradeCategory, ...metadata });
      },
    });
  }

  const perTradeLimit = Math.max(5, Math.ceil(input.limit / coreServiceTrades.length));
  const results: Array<{ trade: TradeCategory; result: DiscoveryResult }> = [];
  for (const trade of coreServiceTrades) {
    console.info("[top-prospects] Trade discovery started.", { jobId: input.jobId, trade, perTradeLimit });
    const result = await discoverContractorsWithDiagnostics({
      city: input.city,
      state: input.state,
      trade,
      radiusKm: input.radiusKm,
      limit: perTradeLimit,
      prospectType: input.prospectType,
      skipThrottle: true,
      logger(event, metadata) {
        console.info(`[top-prospects] ${event}.`, { jobId: input.jobId, trade, ...metadata });
      },
    });
    console.info("[top-prospects] Trade discovery completed.", {
      jobId: input.jobId,
      trade,
      rawProviderCount: result.diagnostics.rawProviderCount,
      returnedCount: result.diagnostics.returnedCount,
    });
    results.push({ trade, result });
  }
  return combineTradeDiscoveryResults({
    radiusKm: input.radiusKm,
    limit: input.limit,
    results,
  });
}

function skipSummary(value: Prisma.JsonValue | null) {
  if (!value || Array.isArray(value) || typeof value !== "object") return {} as Record<string, number>;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function addSkip(summary: Record<string, number>, reason: string) {
  summary[reason] = (summary[reason] ?? 0) + 1;
}

export function recoverableTopProspect(prospect: Awaited<ReturnType<typeof findProspectByWebsite>>, jobCreatedAt: Date) {
  return Boolean(
    prospect
    && Date.parse(prospect.createdAt) >= jobCreatedAt.getTime()
    && (prospect.prospectType === "no_website_social_only" || prospect.analysis)
    && prospect.outreach
    && prospect.preview
    && prospect.activities.some((item) =>
      item.label.startsWith("Automated Top Prospects analysis completed")
      || item.label.startsWith("Automated online presence gap review completed")),
  );
}

async function claimJob(jobId: string) {
  const database = getProspectDatabase();
  const token = crypto.randomUUID();
  const now = new Date();
  const claimed = await database.topProspectJob.updateMany({
    where: {
      id: jobId,
      status: { in: ["QUEUED", "RUNNING", "FAILED"] },
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

async function finalizeJob(jobId: string, wanted: number) {
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
      data: { status: "COMPLETED", stage: "COMPLETE", completedAt: new Date(), leaseToken: null, leaseUntil: null },
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
    select: { publicPreviewToken: true },
  });
  const publicPreviewToken = existingResult?.publicPreviewToken ?? createPublicPreviewToken();
  const prepared = prepareTopProspectArtifacts(prospect, publicProspectPreviewLink(publicPreviewToken), outreachPreference);
  const rejectionReason = topProspectRejectionReason(prepared.prospect, prepared.assessment, mode, outreachPreference);
  const scores = prepared.assessment.salesScores;
  await saveProspect({
    ...prepared.prospect,
    priorityScore: scores.weightedSalesScore,
  });
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
      buildPrompt: prepared.buildPrompt,
      previewLink: prepared.previewLink,
      publicPreviewToken,
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
      buildPrompt: prepared.buildPrompt,
      previewLink: prepared.previewLink,
      publicPreviewToken,
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
) {
  if (likelyNationalOrLargeBrand(lead)) {
    addSkip(summary, "national_large_brand");
    return false;
  }
  if (likelySupplierOrDistributor(lead)) {
    addSkip(summary, "supplier_distributor");
    return false;
  }
  if (lead.inactive) {
    addSkip(summary, "inactive_business");
    return false;
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
    const existingResult = await getProspectDatabase().topProspectResult.findUnique({
      where: { jobId_prospectId: { jobId, prospectId: existing.id } },
      select: { selected: true },
    });
    if (existingResult) return existingResult.selected;
    if (contactedStatuses.has(existing.status)) {
      addSkip(summary, "already_contacted");
      return false;
    }
    if (
      recoverableTopProspect(existing, jobCreatedAt)
      || ((existing.prospectType === "no_website_social_only" || existing.analysis) && existing.outreach && existing.preview)
    ) {
      const rejectionReason = await saveTopProspectResult(jobId, existing, mode, outreachPreference);
      if (rejectionReason) addSkip(summary, rejectionReason.toLowerCase().replaceAll(/[\s/]+/g, "_"));
      return rejectionReason === null;
    }
    addSkip(summary, "duplicate");
    return false;
  }

  let prospect = createProspect({ ...lead, sizeIndicator: "Growing", status: "New" });
  if (prospect.prospectType === "redesign") {
    try {
      const analysis = await analyzePublicWebsite(prospect);
      prospect = {
        ...prospect,
        analysis,
        priorityScore: calculatePriority(analysis, prospect.sizeIndicator, prospect.serviceArea),
        status: "Reviewed",
        activities: [activity("analysis", `Automated Top Prospects analysis completed with a score of ${analysis.overallScore}.`), ...prospect.activities],
      };
    } catch (error) {
      const websiteFailure = classifyWebsiteAnalysisFailure(error);
      if (!websiteFailure) {
        addSkip(summary, "broken_or_inactive_website");
        return false;
      }
      prospect = withPresenceGapReview(prospect, websiteFailure.status, websiteFailure.detail);
    }
  } else {
    prospect = {
      ...prospect,
      status: "Reviewed",
      activities: [activity("analysis", "Automated online presence gap review completed."), ...prospect.activities],
    };
  }

  prospect = {
    ...prospect,
    activities: [
      activity("preview", "Website preview and build prompt added to the Auto Prospect Queue."),
      activity("outreach", "Personalized outreach draft added to the Auto Prospect Queue for human approval."),
      ...prospect.activities,
    ],
  };
  const rejectionReason = await saveTopProspectResult(jobId, prospect, mode, outreachPreference);
  if (rejectionReason) addSkip(summary, rejectionReason.toLowerCase().replaceAll(/[\s/]+/g, "_"));
  return rejectionReason === null;
}

export async function processTopProspectJob(jobId: string) {
  await ensureTopProspectSchema();
  const job = await claimJob(jobId);
  if (!job) return { status: "busy_or_complete" as const, shouldContinue: false };
  const token = job.leaseToken!;
  try {
    if (job.stage === "DISCOVER") {
      console.info("[top-prospects] Discovery started.", {
        jobId: job.id,
        trade: job.tradeCategory,
        city: job.city,
        state: job.state,
        radiusKm: job.radiusKm,
        businessesToScan: job.businessesToScan,
      });
      const discovery = await discoverTopProspectLeads({
        jobId: job.id,
        city: job.city,
        state: job.state,
        tradeCategory: job.tradeCategory,
        radiusKm: job.radiusKm,
        limit: job.businessesToScan,
        prospectType: job.prospectType as ProspectSearchType,
      });
      console.info("[top-prospects] Discovery completed.", { jobId: job.id, ...discovery.diagnostics });
      await getProspectDatabase().topProspectJob.update({
        where: { id: job.id },
        data: { discoveredLeads: discovery as unknown as Prisma.InputJsonValue, stage: "ANALYZE", leaseToken: null, leaseUntil: null },
      });
      return { status: "running" as const, shouldContinue: true };
    }

    const leads = discoveryLeadsFromJson(job.discoveredLeads);
    const mode = normalizeProspectMode(job.prospectMode);
    const outreachPreference = normalizeOutreachPreference(job.outreachPreference);
    const batch = leads.slice(job.nextLeadIndex, job.nextLeadIndex + BATCH_SIZE);
    const summary = skipSummary(job.skipSummary);
    let qualified = 0;
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
      if (await processLead(job.id, job.createdAt, lead, summary, mode, outreachPreference)) qualified += 1;
    }
    const nextLeadIndex = job.nextLeadIndex + batch.length;
    const done = nextLeadIndex >= leads.length || nextLeadIndex >= job.businessesToScan;
    await getProspectDatabase().topProspectJob.update({
      where: { id: job.id },
      data: {
        nextLeadIndex,
        scannedCount: { increment: batch.length },
        qualifiedCount: { increment: qualified },
        skippedCount: { increment: batch.length - qualified },
        skipSummary: summary,
        leaseToken: null,
        leaseUntil: null,
      },
    });
    if (done) {
      await finalizeJob(job.id, job.finalProspectsWanted);
      return { status: "completed" as const, shouldContinue: false };
    }
    return { status: "running" as const, shouldContinue: true };
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
