import type { Prisma } from "@prisma/client";
import { activity } from "@/lib/prospect-engine";
import { getProspectDatabase, getProspect, saveProspect } from "@/lib/prospect-repository";
import { createPublicPreviewToken } from "@/lib/public-preview-token";
import { discoveryDiagnosticsFromJson, discoveryLeadsFromJson } from "@/lib/lead-discovery";
import { encodeTopProspectJobFailure, parseTopProspectJobFailure } from "@/lib/top-prospect-diagnostics";
import type {
  OutreachPackageAction,
  TopProspectInput,
  TopProspectJob,
  TopProspectResult,
} from "@/lib/top-prospects";
import {
  assertOutreachEmailReady,
  calculateProspectSalesScores,
  calculateNoWebsitePresenceScores,
  evaluateOutreachEmailQuality,
  normalizeOutreachPreference,
  normalizeOutreachPackageStatus,
  normalizeProspectMode,
  normalizeTopProspectWorkflowType,
  outreachPackageActionAllowed,
  prepareTopProspectArtifacts,
  publicProspectPreviewLink,
  topProspectResultDisposition,
  validPublicPreviewToken,
} from "@/lib/top-prospects";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";

const resultInclude = { prospect: true } satisfies Prisma.TopProspectResultInclude;
const jobInclude = {
  results: { orderBy: [{ selected: "desc" as const }, { rank: "asc" as const }, { weightedSalesScore: "desc" as const }], include: resultInclude },
} satisfies Prisma.TopProspectJobInclude;

type JobRow = Prisma.TopProspectJobGetPayload<{ include: typeof jobInclude }>;
const staleRunningMs = 10 * 60_000;
const activeTopProspectStatuses = ["QUEUED", "RUNNING", "NEEDS_NEXT_BATCH", "PARTIAL_RESULTS_READY"];

function discoveryHasPartialIssues(value: Prisma.JsonValue | null) {
  const diagnostics = discoveryDiagnosticsFromJson(value);
  return Boolean(
    diagnostics?.tradeDiagnostics?.some((trade) => trade.status === "partial" || trade.status === "skipped" || trade.rateLimitedProviders?.length)
    || Object.values(diagnostics?.providerDiagnostics ?? {}).some((provider) => ["rate_limited", "failed", "timed_out"].includes(provider.status)),
  );
}

function waitingStatusForSavedDiscovery(value: Prisma.JsonValue | null) {
  return discoveryHasPartialIssues(value) ? "PARTIAL_RESULTS_READY" : "NEEDS_NEXT_BATCH";
}

function recordValue(value: Prisma.JsonValue | null): Record<string, number> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

async function toResult(
  row: JobRow["results"][number],
  mode: TopProspectInput["mode"],
  outreachPreference: TopProspectInput["outreachPreference"],
): Promise<TopProspectResult> {
  const prospect = await getProspect(row.prospectId);
  if (!prospect) throw new Error("Top prospect result references a missing prospect.");
  const presenceScores = prospect.prospectType === "no_website_social_only"
    ? (
        row.websiteNeedScore > 0
          ? {
              onlinePresenceGapScore: row.onlinePresenceGapScore,
              contactabilityScore: row.contactabilityScore,
              businessActivityScore: row.businessActivityScore,
              websiteNeedScore: row.websiteNeedScore,
              localFitScore: calculateNoWebsitePresenceScores(prospect).localFitScore,
              finalSalesScore: row.weightedSalesScore || calculateNoWebsitePresenceScores(prospect).finalSalesScore,
            }
          : calculateNoWebsitePresenceScores(prospect)
      )
    : null;
  const calculatedSalesScores = prospect.prospectType === "no_website_social_only"
    ? {
        websiteQualityScore: 0,
        revenueOpportunityScore: 0,
        contactabilityScore: presenceScores!.contactabilityScore,
        localMarketCompetitivenessScore: 0,
        aiReplacementConfidenceScore: 0,
        weightedSalesScore: presenceScores!.finalSalesScore,
      }
    : calculateProspectSalesScores(prospect, row.opportunityScore);
  const persistedSalesScores = {
    websiteQualityScore: row.websiteQualityScore,
    revenueOpportunityScore: row.revenueOpportunityScore,
    contactabilityScore: row.contactabilityScore,
    localMarketCompetitivenessScore: row.localMarketCompetitivenessScore,
    aiReplacementConfidenceScore: row.aiReplacementConfidenceScore,
    weightedSalesScore: row.weightedSalesScore,
  };
  const salesScores = row.weightedSalesScore > 0 ? persistedSalesScores : calculatedSalesScores;
  const assessment = {
    opportunityScore: row.opportunityScore,
    salesScores,
    presenceScores,
    mainWeakness: row.mainWeakness,
    whyMayBuy: row.whyMayBuy,
    pitchAngle: row.pitchAngle,
  };
  const { selected, rejectionReason } = topProspectResultDisposition(row.selected, prospect, assessment, mode, outreachPreference);
  return {
    id: row.id,
    rank: row.rank,
    selected,
    rejectionReason,
    ...assessment,
    buildPrompt: row.buildPrompt,
    previewLink: row.previewLink,
    packageStatus: normalizeOutreachPackageStatus(row.packageStatus),
    packageGeneratedAt: row.packageGeneratedAt?.toISOString() ?? null,
    packageReviewedAt: row.packageReviewedAt?.toISOString() ?? null,
    packageApprovedAt: row.packageApprovedAt?.toISOString() ?? null,
    packageSentAt: row.packageSentAt?.toISOString() ?? null,
    packageSkippedAt: row.packageSkippedAt?.toISOString() ?? null,
    emailQuality: evaluateOutreachEmailQuality(prospect, row.previewLink, outreachPreference),
    prospect,
  };
}

async function toJob(row: JobRow): Promise<TopProspectJob> {
  const failure = parseTopProspectJobFailure(row.errorMessage);
  const mode = normalizeProspectMode(row.prospectMode);
  const workflowType = normalizeTopProspectWorkflowType(row.workflowType);
  const outreachPreference = normalizeOutreachPreference(row.outreachPreference);
  const allResults = await Promise.all(row.results.map((result) => toResult(result, mode, outreachPreference)));
  const recommended = allResults
    .filter((result) => result.selected)
    .sort((left, right) => (left.rank ?? 999) - (right.rank ?? 999) || right.salesScores.weightedSalesScore - left.salesScores.weightedSalesScore);
  const reviewedNotRecommended = allResults
    .filter((result) => !result.selected)
    .sort((left, right) => right.salesScores.weightedSalesScore - left.salesScores.weightedSalesScore);
  return {
    id: row.id,
    input: {
      trade: row.tradeCategory as TopProspectInput["trade"],
      city: row.city,
      state: row.state,
      radiusKm: row.radiusKm,
      businessesToScan: row.businessesToScan,
      finalProspectsWanted: row.finalProspectsWanted,
      prospectType: row.prospectType as TopProspectInput["prospectType"],
      mode,
      workflowType,
      outreachPreference,
    },
    status: row.status as TopProspectJob["status"],
    stage: row.stage,
    discoveredCount: discoveryLeadsFromJson(row.discoveredLeads).length,
    discoveryDiagnostics: discoveryDiagnosticsFromJson(row.discoveredLeads),
    scannedCount: row.scannedCount,
    qualifiedCount: recommended.length,
    skippedCount: row.skippedCount,
    skipSummary: recordValue(row.skipSummary),
    results: recommended,
    reviewedNotRecommended,
    failureClassification: failure.classification,
    errorMessage: failure.reason,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createTopProspectJob(input: TopProspectInput) {
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  await reconcileStaleTopProspectJobs();
  const active = await database.topProspectJob.findFirst({ where: { status: { in: activeTopProspectStatuses } }, select: { id: true } });
  if (active) throw new Error("A Top Prospects search is already running.");
  const job = await database.topProspectJob.create({
    data: {
      tradeCategory: input.trade,
      city: input.city,
      state: input.state,
      radiusKm: input.radiusKm,
      businessesToScan: input.businessesToScan,
      finalProspectsWanted: input.finalProspectsWanted,
      prospectMode: input.mode,
      prospectType: input.prospectType,
      workflowType: input.workflowType,
      outreachPreference: input.outreachPreference,
    },
  });
  console.info("[top-prospects] Job created.", {
    jobId: job.id,
    trade: job.tradeCategory,
    city: job.city,
    state: job.state,
    radiusKm: job.radiusKm,
    businessesToScan: job.businessesToScan,
    finalProspectsWanted: job.finalProspectsWanted,
    mode: job.prospectMode,
    prospectType: job.prospectType,
    workflowType: job.workflowType,
    outreachPreference: job.outreachPreference,
  });
  return job;
}

export async function getTopProspectJob(id: string) {
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().topProspectJob.findUnique({ where: { id }, include: jobInclude });
  return row ? toJob(row) : null;
}

export async function listTopProspectJobs() {
  await ensureTopProspectSchema();
  await reconcileStaleTopProspectJobs();
  const rows = await getProspectDatabase().topProspectJob.findMany({ include: jobInclude, orderBy: { createdAt: "desc" }, take: 10 });
  return Promise.all(rows.map(toJob));
}

export async function getPublicProspectPreview(token: string) {
  if (!validPublicPreviewToken(token)) return null;
  await ensureTopProspectSchema();
  const result = await getProspectDatabase().topProspectResult.findUnique({
    where: { publicPreviewToken: token },
    select: { prospectId: true },
  });
  if (!result) return null;
  const prospect = await getProspect(result.prospectId);
  if (!prospect?.preview) return null;
  return {
    ...prospect,
    website: "",
    profileUrl: "",
    email: "",
    contactFormUrl: "",
    address: "",
    priorityScore: 0,
    rating: 0,
    reviewCount: 0,
    recentReviewCount: 0,
    sourceConfidence: 0,
    activitySignals: [],
    recommendedContactMethod: "needs_manual_contact_research" as const,
    analysis: undefined,
    outreach: undefined,
    notes: [],
    activities: [],
  };
}

export async function findResumableTopProspectJobId(now = new Date()) {
  await ensureTopProspectSchema();
  await reconcileStaleTopProspectJobs(now);
  const row = await getProspectDatabase().topProspectJob.findFirst({
    where: {
      status: { in: activeTopProspectStatuses },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function reconcileStaleTopProspectJobs(now = new Date()) {
  const database = getProspectDatabase();
  const staleBefore = new Date(now.getTime() - staleRunningMs);
  const rows = await database.topProspectJob.findMany({
    where: {
      status: "RUNNING",
      updatedAt: { lte: staleBefore },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    select: {
      id: true,
      stage: true,
      discoveredLeads: true,
    },
  });
  for (const row of rows) {
    const leads = discoveryLeadsFromJson(row.discoveredLeads);
    if (leads.length > 0 && row.stage === "DISCOVER") {
      await database.topProspectJob.update({
        where: { id: row.id },
        data: {
          status: waitingStatusForSavedDiscovery(row.discoveredLeads),
          stage: "ANALYZE",
          leaseToken: null,
          leaseUntil: null,
        },
      });
      continue;
    }
    if (leads.length > 0 && row.stage === "ANALYZE") {
      await database.topProspectJob.update({
        where: { id: row.id },
        data: {
          status: waitingStatusForSavedDiscovery(row.discoveredLeads),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      continue;
    }
    if (leads.length === 0 && row.stage !== "COMPLETE") {
      await database.topProspectJob.update({
        where: { id: row.id },
        data: {
          status: "FAILED_AFTER_DISCOVERY",
          errorMessage: encodeTopProspectJobFailure("discovery_provider_error", "Discovery stopped before saved eligible prospects were available."),
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }
  }
}

function packageResultFromJob(job: TopProspectJob, resultId: string) {
  return [...job.results, ...job.reviewedNotRecommended].find((result) => result.id === resultId) ?? null;
}

export async function updateTopProspectOutreachPackage(resultId: string, action: OutreachPackageAction) {
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const result = await database.topProspectResult.findUnique({
    where: { id: resultId },
    include: { job: { select: { outreachPreference: true } } },
  });
  if (!result) return null;
  const prospect = await getProspect(result.prospectId);
  if (!prospect) throw new Error("Outreach package references a missing prospect.");
  const currentStatus = normalizeOutreachPackageStatus(result.packageStatus);
  if (!outreachPackageActionAllowed(currentStatus, action)) {
    if (currentStatus === "NOT_GENERATED") throw new Error("Generate the Outreach Package before reviewing it.");
    if (currentStatus === "SENT") throw new Error("A sent Outreach Package cannot be changed.");
    if (currentStatus === "SKIPPED") throw new Error("Generate the Outreach Package again before reviewing it.");
    throw new Error("This Outreach Package action is not available for the current status.");
  }

  if (action === "generate") {
    const publicPreviewToken = result.publicPreviewToken ?? createPublicPreviewToken();
    const prepared = prepareTopProspectArtifacts(prospect, publicProspectPreviewLink(publicPreviewToken), normalizeOutreachPreference(result.job?.outreachPreference));
    const saved = await saveProspect({
      ...prepared.prospect,
      activities: [
        activity("preview", "Outreach Package website preview generated for human review."),
        activity("outreach", "Outreach Package email sequence generated and left unapproved."),
        ...prepared.prospect.activities,
      ],
    });
    const scores = prepared.assessment.salesScores;
    await database.topProspectResult.update({
      where: { id: resultId },
      data: {
        opportunityScore: prepared.assessment.opportunityScore,
        ...scores,
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
      },
    });
    console.info("[outreach-package] Package generated.", { resultId, prospectId: saved.id });
  } else {
    if (action === "approve") {
      assertOutreachEmailReady(prospect, result.previewLink, normalizeOutreachPreference(result.job?.outreachPreference));
    }
    const now = new Date();
    const statusData = action === "ready_for_review"
      ? { packageStatus: "READY_FOR_REVIEW", packageReviewedAt: now }
      : action === "approve"
        ? { packageStatus: "APPROVED_TO_SEND", packageReviewedAt: result.packageReviewedAt ?? now, packageApprovedAt: now }
        : action === "mark_sent"
          ? { packageStatus: "SENT", packageSentAt: now }
          : { packageStatus: "SKIPPED", packageSkippedAt: now };
    const updates: Prisma.PrismaPromise<unknown>[] = [
      database.topProspectResult.update({ where: { id: resultId }, data: statusData }),
    ];
    if (action === "approve" && prospect.outreach) {
      updates.push(database.outreachDraft.updateMany({
        where: { prospectId: prospect.id, createdAt: new Date(prospect.outreach.generatedAt) },
        data: { approvedAt: now },
      }));
    }
    await database.$transaction(updates);
    console.info("[outreach-package] Package status changed.", { resultId, prospectId: prospect.id, action });
  }

  const job = await getTopProspectJob(result.jobId);
  return job ? packageResultFromJob(job, resultId) : null;
}
