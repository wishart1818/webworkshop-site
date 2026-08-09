import { randomBytes } from "node:crypto";
import { listOutreachQueueItemsForBackfill } from "@/lib/autonomous-growth-repository";
import type { OutreachQueueItem } from "@/lib/autonomous-growth";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import { getProspect } from "@/lib/prospect-repository";
import type { Prospect } from "@/lib/prospect-engine";
import type { WebsiteVerificationDependencies } from "@/lib/site-analysis";
import {
  applyReviewedWebsiteRepairItems,
  buildExistingWebsiteRepairReviewedItem,
  inspectCandidatesBounded,
  listExistingWebsiteRepairCandidatePopulation,
  validateReviewedWebsiteRepairItems,
  websiteRepairConfirmationText,
  websiteRepairRequestBatchLimit,
  type ExistingWebsiteRepairReviewedItem,
} from "@/lib/website-verification-operations";
import { enforceWebsiteRepairApplyRateLimit } from "@/lib/website-repair-rate-limit";
import {
  beginWebsiteRepairAuditApply,
  claimWebsiteRepairApplyWork,
  claimWebsiteRepairAuditWork,
  completeWebsiteRepairApplyGroup,
  completeWebsiteRepairAuditChunk,
  createWebsiteRepairAuditRun,
  failWebsiteRepairApply,
  getAuthorizedWebsiteRepairAuditRun,
  recordWebsiteRepairRemainingCandidates,
  releaseWebsiteRepairApplyLease,
  releaseWebsiteRepairAuditLease,
  type WebsiteRepairAuditRun,
} from "@/lib/website-repair-audit-repository";

export const fullLegacyCleanupAuditChunkSize = 20;
export const fullLegacyCleanupAtomicApplyLimit = websiteRepairRequestBatchLimit;
export const fullLegacyCleanupApplyGroupSize = 20;
export const fullLegacyCleanupRunMaxAgeMs = 2 * 60 * 60 * 1_000;
export const fullLegacyCleanupMaximumCandidates = 500;
export const fullLegacyCleanupConfirmationText = websiteRepairConfirmationText;

export type FullLegacyCleanupDisplayExclusion = {
  prospectId: string;
  businessName: string;
  canonicalWebsite: string;
  disposition: string;
  reason: string;
  identitySummary: string;
};

export type FullLegacyCleanupReport = {
  auditRunId: string;
  accessToken: string;
  status: WebsiteRepairAuditRun["status"];
  applyStatus: WebsiteRepairAuditRun["applyStatus"];
  totalCandidates: number;
  inspectedCount: number;
  safeExclusionCount: number;
  manualReviewCount: number;
  protectedCount: number;
  manualReasonCounts: Record<string, number>;
  safeExclusions: FullLegacyCleanupDisplayExclusion[];
  expiresAt: string;
  completedAt: string;
  appliedCount: number;
  remainingCandidatesBefore: number;
  remainingCandidatesAfter: number | null;
  applyMode: "whole_set_atomic" | "bounded_atomic_groups";
  applyGroupSize: number;
  partialApplyRequiresReview: boolean;
  errorCode: string;
  errorMessage: string;
  nothingSent: true;
};

type FullLegacyCleanupDependencies = {
  now?: () => Date;
  verification?: WebsiteVerificationDependencies;
  listPopulation?: typeof listExistingWebsiteRepairCandidatePopulation;
  getProspect?: typeof getProspect;
  listQueue?: typeof listOutreachQueueItemsForBackfill;
  inspect?: typeof inspectCandidatesBounded;
  validateItems?: typeof validateReviewedWebsiteRepairItems;
  applyItems?: typeof applyReviewedWebsiteRepairItems;
  recordAudit?: typeof safeRecordAudit;
  enforceAuditRateLimit?: () => Promise<unknown>;
  enforceApplyRateLimit?: typeof enforceWebsiteRepairApplyRateLimit;
};

function nowFor(dependencies: FullLegacyCleanupDependencies) {
  return dependencies.now?.() ?? new Date();
}

function safeCleanupErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  return message.length > 0
    && message.length <= 800
    && /changed after review|protected|provider attempt|queue changed|approval changed|lease changed|expired|invalid|fresh audit|fresh dry run|candidate changed|removed after the audit/i.test(message)
    ? message
    : fallback;
}

function reviewedItemIsSafe(item: ExistingWebsiteRepairReviewedItem) {
  return item.record.highConfidenceExclusionEligible
    && item.record.selectionEligible
    && item.record.proposedOutcome === "exclude_from_rebuild_outreach"
    && !item.record.protectedReason
    && item.proposedPatch !== null;
}

function safeReviewedItems(run: WebsiteRepairAuditRun) {
  return run.reviewedItems.filter(reviewedItemIsSafe);
}

function reportForRun(run: WebsiteRepairAuditRun, accessToken: string): FullLegacyCleanupReport {
  const safeItems = safeReviewedItems(run);
  return {
    auditRunId: run.id,
    accessToken,
    status: run.status,
    applyStatus: run.applyStatus,
    totalCandidates: run.totalCandidates,
    inspectedCount: run.inspectedCount,
    safeExclusionCount: run.safeExclusionCount,
    manualReviewCount: run.manualReviewCount,
    protectedCount: run.protectedCount,
    manualReasonCounts: structuredClone(run.manualReasonCounts),
    safeExclusions: safeItems.map((item) => ({
      prospectId: item.prospectId,
      businessName: item.record.businessName,
      canonicalWebsite: item.record.verifiedCanonicalWebsite,
      disposition: item.record.proposedDisposition,
      reason: item.record.exactReason,
      identitySummary: item.record.identitySummary,
    })),
    expiresAt: run.expiresAt,
    completedAt: run.completedAt,
    appliedCount: run.appliedCount,
    remainingCandidatesBefore: run.remainingCandidatesBefore,
    remainingCandidatesAfter: run.remainingCandidatesAfter,
    applyMode: safeItems.length <= fullLegacyCleanupAtomicApplyLimit ? "whole_set_atomic" : "bounded_atomic_groups",
    applyGroupSize: safeItems.length <= fullLegacyCleanupAtomicApplyLimit
      ? safeItems.length
      : fullLegacyCleanupApplyGroupSize,
    partialApplyRequiresReview: run.status === "PARTIAL_NEEDS_REVIEW",
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    nothingSent: true,
  };
}

function queueByProspect(items: OutreachQueueItem[]) {
  const grouped = new Map<string, OutreachQueueItem[]>();
  for (const item of items) grouped.set(item.prospectId, [...(grouped.get(item.prospectId) ?? []), item]);
  return grouped;
}

function auditCounts(items: ExistingWebsiteRepairReviewedItem[]) {
  const manualReasonCounts: Record<string, number> = {};
  let safeExclusionCount = 0;
  let manualReviewCount = 0;
  let protectedCount = 0;
  for (const item of items) {
    if (item.record.protectedReason) {
      protectedCount += 1;
      continue;
    }
    if (reviewedItemIsSafe(item)) {
      safeExclusionCount += 1;
      continue;
    }
    manualReviewCount += 1;
    const reason = item.record.highConfidenceExclusionEligible
      ? "other_manual_review"
      : item.record.safeExclusionReasonCode;
    manualReasonCounts[reason] = (manualReasonCounts[reason] ?? 0) + 1;
  }
  return { safeExclusionCount, manualReviewCount, protectedCount, manualReasonCounts };
}

export async function startFullLegacyWebsiteCleanup(
  dependencies: FullLegacyCleanupDependencies = {},
): Promise<FullLegacyCleanupReport> {
  const now = nowFor(dependencies);
  await (dependencies.enforceAuditRateLimit?.() ?? enforceRateLimit({
    action: "full_legacy_website_cleanup",
    subject: "operator",
    limit: 3,
    windowMs: 60 * 60 * 1_000,
  }));
  const population = await (dependencies.listPopulation ?? listExistingWebsiteRepairCandidatePopulation)();
  if (population.candidates.length > fullLegacyCleanupMaximumCandidates) {
    throw new Error(`Full Legacy Cleanup stopped because ${population.candidates.length} candidates exceed the ${fullLegacyCleanupMaximumCandidates}-record safety bound.`);
  }
  const accessToken = randomBytes(32).toString("base64url");
  const run = await createWebsiteRepairAuditRun({
    accessToken,
    candidateIds: population.candidates.map((prospect) => prospect.id),
    expiresAt: new Date(now.getTime() + fullLegacyCleanupRunMaxAgeMs),
    now,
  });
  await (dependencies.recordAudit ?? safeRecordAudit)({
    action: "full_legacy_website_cleanup_started",
    outcome: "success",
    subject: run.id,
    metadata: { totalCandidates: run.totalCandidates, chunkSize: fullLegacyCleanupAuditChunkSize, sent: 0 },
  });
  return reportForRun(run, accessToken);
}

export async function getFullLegacyWebsiteCleanup(input: {
  auditRunId: string;
  accessToken: string;
  dependencies?: FullLegacyCleanupDependencies;
}) {
  const dependencies = input.dependencies ?? {};
  const run = await getAuthorizedWebsiteRepairAuditRun(input.auditRunId, input.accessToken, nowFor(dependencies));
  return reportForRun(run, input.accessToken);
}

export async function continueFullLegacyWebsiteCleanup(input: {
  auditRunId: string;
  accessToken: string;
  dependencies?: FullLegacyCleanupDependencies;
}): Promise<FullLegacyCleanupReport> {
  const dependencies = input.dependencies ?? {};
  const now = nowFor(dependencies);
  const claimed = await claimWebsiteRepairAuditWork({
    id: input.auditRunId,
    accessToken: input.accessToken,
    now,
  });
  if (!claimed) return getFullLegacyWebsiteCleanup(input);
  const { run, leaseToken } = claimed;
  const chunkIds = run.candidateIds.slice(run.nextIndex, run.nextIndex + fullLegacyCleanupAuditChunkSize);
  if (!chunkIds.length) {
    const completed = await completeWebsiteRepairAuditChunk({
      id: run.id,
      leaseToken,
      expectedNextIndex: run.nextIndex,
      reviewedItems: [],
      safeExclusionCount: 0,
      manualReviewCount: 0,
      protectedCount: 0,
      manualReasonCounts: {},
      now,
    });
    return reportForRun(completed, input.accessToken);
  }
  try {
    const [prospects, queue] = await Promise.all([
      Promise.all(chunkIds.map((id) => (dependencies.getProspect ?? getProspect)(id))),
      (dependencies.listQueue ?? listOutreachQueueItemsForBackfill)(),
    ]);
    if (prospects.some((prospect) => !prospect)) {
      throw new Error("A legacy candidate changed or was removed after the audit began. Start a fresh Full Legacy Cleanup run.");
    }
    const groupedQueue = queueByProspect(queue);
    const inspected = await (dependencies.inspect ?? inspectCandidatesBounded)(
      prospects as Prospect[],
      dependencies.verification ?? {},
      groupedQueue,
    );
    const reviewedItems = inspected.map((candidate) => buildExistingWebsiteRepairReviewedItem(
      candidate,
      groupedQueue.get(candidate.prospect.id) ?? [],
    ));
    const counts = auditCounts(reviewedItems);
    const updated = await completeWebsiteRepairAuditChunk({
      id: run.id,
      leaseToken,
      expectedNextIndex: run.nextIndex,
      reviewedItems,
      ...counts,
      now,
    });
    await (dependencies.recordAudit ?? safeRecordAudit)({
      action: updated.status === "READY" ? "full_legacy_website_cleanup_completed" : "full_legacy_website_cleanup_chunk_completed",
      outcome: "success",
      subject: run.id,
      metadata: {
        inspectedCount: updated.inspectedCount,
        totalCandidates: updated.totalCandidates,
        safeExclusionCount: updated.safeExclusionCount,
        manualReviewCount: updated.manualReviewCount,
        protectedCount: updated.protectedCount,
        sent: 0,
      },
    });
    return reportForRun(updated, input.accessToken);
  } catch (error) {
    const message = safeCleanupErrorMessage(
      error,
      "A bounded Full Legacy Cleanup audit chunk failed safely. Resume the run or start a fresh audit.",
    );
    await releaseWebsiteRepairAuditLease({
      id: run.id,
      leaseToken,
      errorCode: "AUDIT_CHUNK_FAILED",
      errorMessage: message,
    });
    throw error;
  }
}

export async function beginFullLegacyWebsiteCleanupApply(input: {
  auditRunId: string;
  accessToken: string;
  confirmation: string;
  dependencies?: FullLegacyCleanupDependencies;
}) {
  if (input.confirmation !== fullLegacyCleanupConfirmationText) {
    throw new Error(`Type ${fullLegacyCleanupConfirmationText} to Apply this reviewed cleanup.`);
  }
  const dependencies = input.dependencies ?? {};
  const now = nowFor(dependencies);
  const run = await getAuthorizedWebsiteRepairAuditRun(input.auditRunId, input.accessToken, now);
  if (run.status === "APPLIED") return reportForRun(run, input.accessToken);
  if (run.status !== "READY") throw new Error("The Full Legacy Cleanup audit is not complete or is no longer applicable.");
  const safeItems = safeReviewedItems(run);
  if (safeItems.length !== run.safeExclusionCount) {
    throw new Error("The Full Legacy Cleanup reviewed safe set is inconsistent. Run a fresh audit.");
  }
  await (dependencies.validateItems ?? validateReviewedWebsiteRepairItems)(safeItems);
  await (dependencies.enforceApplyRateLimit ?? enforceWebsiteRepairApplyRateLimit)();
  const applying = await beginWebsiteRepairAuditApply({ id: run.id, accessToken: input.accessToken, now });
  await (dependencies.recordAudit ?? safeRecordAudit)({
    action: "full_legacy_website_cleanup_apply_started",
    outcome: "success",
    subject: run.id,
    metadata: {
      reviewedSafeExclusions: safeItems.length,
      transactionStrategy: safeItems.length <= fullLegacyCleanupAtomicApplyLimit ? "whole_set_atomic" : "bounded_atomic_groups",
      sent: 0,
    },
  });
  return reportForRun(applying, input.accessToken);
}

export async function continueFullLegacyWebsiteCleanupApply(input: {
  auditRunId: string;
  accessToken: string;
  dependencies?: FullLegacyCleanupDependencies;
}): Promise<FullLegacyCleanupReport> {
  const dependencies = input.dependencies ?? {};
  const now = nowFor(dependencies);
  const claimed = await claimWebsiteRepairApplyWork({ id: input.auditRunId, accessToken: input.accessToken, now });
  if (!claimed) return getFullLegacyWebsiteCleanup(input);
  const { run, leaseToken } = claimed;
  if (run.status === "APPLIED") return reportForRun(run, input.accessToken);
  const safeItems = safeReviewedItems(run);
  const groupSize = safeItems.length <= fullLegacyCleanupAtomicApplyLimit
    ? safeItems.length
    : fullLegacyCleanupApplyGroupSize;
  const group = safeItems.slice(run.applyNextIndex, run.applyNextIndex + Math.max(1, groupSize));
  try {
    if (group.length) {
      await (dependencies.applyItems ?? applyReviewedWebsiteRepairItems)({ reviewedItems: group, now });
    }
  } catch (error) {
    const message = safeCleanupErrorMessage(
      error,
      "Full Legacy Cleanup Apply failed safely before this group committed. Review current protections and run a fresh audit.",
    );
    await failWebsiteRepairApply({
      id: run.id,
      leaseToken,
      errorCode: "APPLY_REJECTED",
      errorMessage: message,
    });
    await (dependencies.recordAudit ?? safeRecordAudit)({
      action: "full_legacy_website_cleanup_apply_rejected",
      outcome: "rejected",
      subject: run.id,
      metadata: { appliedBeforeFailure: run.appliedCount, sent: 0 },
    });
    throw error;
  }
  const nextIndex = run.applyNextIndex + group.length;
  const done = nextIndex >= safeItems.length;
  let updated: WebsiteRepairAuditRun;
  try {
    updated = await completeWebsiteRepairApplyGroup({
      id: run.id,
      leaseToken,
      expectedApplyNextIndex: run.applyNextIndex,
      processedCount: group.length,
      changedCount: group.length,
      done,
      now,
    });
  } catch (error) {
    await releaseWebsiteRepairApplyLease({
      id: run.id,
      leaseToken,
      errorCode: "APPLY_PROGRESS_PENDING",
      errorMessage: "A committed repair group is awaiting idempotent progress reconciliation.",
    });
    throw new Error("A repair group committed, but progress reconciliation was interrupted. Resume this Full Legacy Cleanup to reconcile it safely.", { cause: error });
  }
  for (const item of group) {
    await (dependencies.recordAudit ?? safeRecordAudit)({
      action: "full_legacy_website_cleanup_record_repaired",
      outcome: "success",
      subject: item.prospectId,
      metadata: {
        auditRunId: run.id,
        disposition: item.record.proposedDisposition,
        sent: 0,
      },
    });
  }
  if (done) {
    try {
      const remainingCandidatesAfter = (await (dependencies.listPopulation ?? listExistingWebsiteRepairCandidatePopulation)()).candidates.length;
      updated = await recordWebsiteRepairRemainingCandidates({ id: run.id, remainingCandidatesAfter, now }) ?? updated;
    } catch {
      // The repair is complete; the dashboard reload below also reconciles current inventory.
    }
  }
  await (dependencies.recordAudit ?? safeRecordAudit)({
    action: done ? "full_legacy_website_cleanup_apply_succeeded" : "full_legacy_website_cleanup_apply_group_succeeded",
    outcome: "success",
    subject: run.id,
    metadata: {
      groupSize: group.length,
      appliedCount: updated.appliedCount,
      totalReviewedSafeExclusions: safeItems.length,
      remainingCandidatesAfter: updated.remainingCandidatesAfter,
      sent: 0,
    },
  });
  return reportForRun(updated, input.accessToken);
}
