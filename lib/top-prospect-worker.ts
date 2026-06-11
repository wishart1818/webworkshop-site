import type { Prisma } from "@prisma/client";
import { discoverContractors, type DiscoveredLead } from "@/lib/lead-discovery";
import { activity, calculatePriority, createProspect } from "@/lib/prospect-engine";
import { findProspectByWebsite, getProspectDatabase, saveProspect } from "@/lib/prospect-repository";
import { analyzePublicWebsite } from "@/lib/site-analysis";
import {
  likelyNationalOrLargeBrand,
  normalizeWebsite,
  prepareTopProspectArtifacts,
  topProspectRejectionReason,
} from "@/lib/top-prospects";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import { classifyTopProspectFailure } from "@/lib/top-prospect-diagnostics";

const LEASE_MS = 90_000;
const BATCH_SIZE = 1;
const contactedStatuses = new Set(["Contacted", "Interested", "Proposal Sent", "Closed Won", "Closed Lost"]);

function leadsFromJson(value: Prisma.JsonValue | null): DiscoveredLead[] {
  return Array.isArray(value) ? value as unknown as DiscoveredLead[] : [];
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
    && prospect.analysis
    && prospect.outreach
    && prospect.preview
    && prospect.activities.some((item) => item.label.startsWith("Automated Top Prospects analysis completed")),
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
    orderBy: [{ opportunityScore: "desc" }, { createdAt: "asc" }],
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

async function saveTopProspectResult(jobId: string, prospect: NonNullable<Awaited<ReturnType<typeof findProspectByWebsite>>>) {
  const prepared = prepareTopProspectArtifacts(prospect);
  const rejectionReason = topProspectRejectionReason(prepared.prospect, prepared.assessment);
  await getProspectDatabase().topProspectResult.upsert({
    where: { jobId_prospectId: { jobId, prospectId: prospect.id } },
    update: {
      opportunityScore: prepared.assessment.opportunityScore,
      mainWeakness: prepared.assessment.mainWeakness,
      whyMayBuy: prepared.assessment.whyMayBuy,
      pitchAngle: prepared.assessment.pitchAngle,
      buildPrompt: prepared.buildPrompt,
      selected: rejectionReason === null,
    },
    create: {
      jobId,
      prospectId: prospect.id,
      opportunityScore: prepared.assessment.opportunityScore,
      mainWeakness: prepared.assessment.mainWeakness,
      whyMayBuy: prepared.assessment.whyMayBuy,
      pitchAngle: prepared.assessment.pitchAngle,
      buildPrompt: prepared.buildPrompt,
      selected: rejectionReason === null,
    },
  });
  return rejectionReason;
}

async function processLead(jobId: string, jobCreatedAt: Date, lead: DiscoveredLead, summary: Record<string, number>) {
  if (likelyNationalOrLargeBrand(lead)) {
    addSkip(summary, "national_large_brand");
    return false;
  }
  if (!lead.phone && !lead.email) {
    addSkip(summary, "no_usable_contact_path");
    return false;
  }
  const normalized = normalizeWebsite(lead.website);
  const matchingWebsite = await getProspectDatabase().prospect.findFirst({
    where: { website: { contains: new URL(lead.website).hostname.replace(/^www\./, ""), mode: "insensitive" } },
    select: { website: true },
  });
  const existing = matchingWebsite && normalizeWebsite(matchingWebsite.website) === normalized
    ? await findProspectByWebsite(matchingWebsite.website)
    : await findProspectByWebsite(lead.website);
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
      || (existing.analysis && existing.outreach && existing.preview)
    ) {
      const rejectionReason = await saveTopProspectResult(jobId, existing);
      if (rejectionReason) addSkip(summary, rejectionReason.toLowerCase().replaceAll(/[\s/]+/g, "_"));
      return rejectionReason === null;
    }
    addSkip(summary, "duplicate");
    return false;
  }

  let prospect = createProspect({ ...lead, sizeIndicator: "Growing", status: "New" });
  try {
    const analysis = await analyzePublicWebsite(prospect);
    prospect = {
      ...prospect,
      analysis,
      priorityScore: calculatePriority(analysis, prospect.sizeIndicator, prospect.serviceArea),
      status: "Reviewed",
      activities: [activity("analysis", `Automated Top Prospects analysis completed with a score of ${analysis.overallScore}.`), ...prospect.activities],
    };
  } catch {
    addSkip(summary, "broken_or_inactive_website");
    return false;
  }

  const prepared = prepareTopProspectArtifacts(prospect);
  const saved = await saveProspect({
    ...prepared.prospect,
    activities: [
      activity("preview", "Website preview and build prompt prepared for manual review."),
      activity("outreach", "Personalized outreach draft generated for human review."),
      ...prepared.prospect.activities,
    ],
  });
  const rejectionReason = await saveTopProspectResult(jobId, saved);
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
      const leads = await discoverContractors({
        city: job.city,
        state: job.state,
        trade: job.tradeCategory as DiscoveredLead["trade"],
        radiusKm: job.radiusKm,
        limit: job.businessesToScan,
      });
      await getProspectDatabase().topProspectJob.update({
        where: { id: job.id },
        data: { discoveredLeads: leads as unknown as Prisma.InputJsonValue, stage: "ANALYZE", leaseToken: null, leaseUntil: null },
      });
      return { status: "running" as const, shouldContinue: true };
    }

    const leads = leadsFromJson(job.discoveredLeads);
    const batch = leads.slice(job.nextLeadIndex, job.nextLeadIndex + BATCH_SIZE);
    const summary = skipSummary(job.skipSummary);
    let qualified = 0;
    for (const lead of batch) {
      if (await processLead(job.id, job.createdAt, lead, summary)) qualified += 1;
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
    await getProspectDatabase().topProspectJob.updateMany({
      where: { id: job.id, leaseToken: token },
      data: {
        status: "FAILED",
        errorMessage: "Processing stopped safely. Retry to continue from the last saved business.",
        leaseToken: null,
        leaseUntil: null,
      },
    });
    console.error("[top-prospects] Worker batch failed.", { classification: classifyTopProspectFailure(error) });
    return { status: "failed" as const, shouldContinue: false };
  } finally {
    await releaseLease(job.id, token);
  }
}
