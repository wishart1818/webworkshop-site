import type { Prisma } from "@prisma/client";
import {
  discoverContractorsWithDiagnostics,
  discoveryLeadsFromJson,
  type DiscoveredLead,
} from "@/lib/lead-discovery";
import { activity, calculatePriority, createProspect, withPresenceGapReview, type Prospect, type ProspectSearchType } from "@/lib/prospect-engine";
import { findProspectByIdentity, findProspectByWebsite, getProspectDatabase, saveProspect } from "@/lib/prospect-repository";
import { createPublicPreviewToken } from "@/lib/public-preview-token";
import { analyzePublicWebsite, classifyWebsiteAnalysisFailure } from "@/lib/site-analysis";
import {
  likelyNationalOrLargeBrand,
  normalizeProspectMode,
  normalizeWebsite,
  prepareTopProspectArtifacts,
  publicProspectPreviewLink,
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
) {
  const database = getProspectDatabase();
  const existingResult = await database.topProspectResult.findUnique({
    where: { jobId_prospectId: { jobId, prospectId: prospect.id } },
    select: { publicPreviewToken: true },
  });
  const publicPreviewToken = existingResult?.publicPreviewToken ?? createPublicPreviewToken();
  const prepared = prepareTopProspectArtifacts(prospect, publicProspectPreviewLink(publicPreviewToken));
  const rejectionReason = topProspectRejectionReason(prepared.prospect, prepared.assessment, mode);
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
) {
  if (likelyNationalOrLargeBrand(lead)) {
    addSkip(summary, "national_large_brand");
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
      const rejectionReason = await saveTopProspectResult(jobId, existing, mode);
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
  const rejectionReason = await saveTopProspectResult(jobId, prospect, mode);
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
      const discovery = await discoverContractorsWithDiagnostics({
        city: job.city,
        state: job.state,
        trade: job.tradeCategory as DiscoveredLead["trade"],
        radiusKm: job.radiusKm,
        limit: job.businessesToScan,
        prospectType: job.prospectType as ProspectSearchType,
        logger(event, metadata) {
          console.info(`[top-prospects] ${event}.`, { jobId: job.id, ...metadata });
        },
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
      if (await processLead(job.id, job.createdAt, lead, summary, mode)) qualified += 1;
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
