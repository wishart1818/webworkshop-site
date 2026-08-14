import { randomBytes } from "node:crypto";
import type { OutreachQueueItem } from "@/lib/autonomous-growth";
import {
  applyReviewedWebsiteRepairItems,
  buildExistingWebsiteRepairReviewedItem,
  validateReviewedWebsiteRepairItems,
  websiteRepairProtectionReason,
  websiteRepairRequestBatchLimit,
  type ExistingWebsiteRepairRecord,
  type ExistingWebsiteRepairReviewedItem,
} from "@/lib/website-verification-operations";
import {
  listOutreachQueueItemsForBackfill,
} from "@/lib/autonomous-growth-repository";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import type { Prospect } from "@/lib/prospect-engine";
import {
  normalizeWebsiteFitDisposition,
  verifiedEmailEvidenceForProspect,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";
import { getProspect, listProspects } from "@/lib/prospect-repository";
import {
  manualReviewTriageReasonCodes,
  unresolvedWebsiteReason,
  verifyProspectWebsiteWithSecondPass,
  type ManualReviewTriageOutcome,
  type ManualReviewTriageReasonCode,
  type SharedProspectVerificationDependencies,
  type SharedProspectVerificationResolution,
} from "@/lib/prospect-verification-resolution";
import { safeHighConfidenceWebsiteExclusion } from "@/lib/website-repair-decision";
import {
  beginWebsiteRepairAuditApply,
  claimWebsiteRepairApplyWork,
  claimWebsiteRepairAuditWork,
  completeWebsiteRepairApplyGroup,
  completeWebsiteRepairAuditChunk,
  createWebsiteRepairAuditRun,
  failWebsiteRepairApply,
  getAuthorizedWebsiteRepairAuditRun,
  releaseWebsiteRepairApplyLease,
  releaseWebsiteRepairAuditLease,
  type WebsiteRepairAuditRun,
} from "@/lib/website-repair-audit-repository";
import { enforceWebsiteRepairApplyRateLimit } from "@/lib/website-repair-rate-limit";

export const manualReviewTriageConfirmationText = "APPLY REVIEWED TRIAGE RESULTS";
export const manualReviewTriageChunkSize = 8;
export const manualReviewTriageConcurrency = 3;
export const manualReviewTriageRunMaxAgeMs = 2 * 60 * 60 * 1_000;
export const manualReviewTriageMaximumCandidates = 500;
const reviewableCountKey = "__reviewable_rebuild_opportunity";

export type ManualReviewTriageRecord = ExistingWebsiteRepairRecord & {
  city: string;
  state: string;
  trade: string;
  storedWebsite: string;
  candidateWebsite: string;
  triageOutcome: ManualReviewTriageOutcome;
  reasonCode: ManualReviewTriageReasonCode;
  humanExplanation: string;
  websiteIdentityConfidence: string;
  fitConfidence: string;
  evidenceSummary: string[];
  firstPartyEvidence: string[];
  contactPathState: string;
  automaticResolution: string;
  recommendedOperatorAction: string;
  persistedAsProspect: true;
  secondPassAttempted: boolean;
  candidateUrlsConsidered: string[];
};

export type ManualReviewTriageReviewedItem = ExistingWebsiteRepairReviewedItem & {
  record: ManualReviewTriageRecord;
};

export type ManualReviewTriageReport = {
  auditRunId: string;
  accessToken: string;
  status: WebsiteRepairAuditRun["status"];
  applyStatus: WebsiteRepairAuditRun["applyStatus"];
  totalCandidates: number;
  inspectedCount: number;
  safeExclusionCount: number;
  reviewableRebuildCount: number;
  stillManualCount: number;
  protectedCount: number;
  applicableCount: number;
  reasonCounts: Record<string, number>;
  records: ManualReviewTriageRecord[];
  expiresAt: string;
  completedAt: string;
  appliedCount: number;
  applyMode: "whole_set_atomic" | "bounded_atomic_groups";
  applyGroupSize: number;
  partialApplyRequiresReview: boolean;
  errorCode: string;
  errorMessage: string;
  nothingSent: true;
};

type ManualReviewTriageDependencies = {
  now?: () => Date;
  verification?: SharedProspectVerificationDependencies;
  listPopulation?: typeof listManualReviewTriagePopulation;
  getProspect?: typeof getProspect;
  listQueue?: typeof listOutreachQueueItemsForBackfill;
  inspect?: typeof inspectManualReviewTriageCandidatesBounded;
  validateItems?: typeof validateReviewedWebsiteRepairItems;
  applyItems?: typeof applyReviewedWebsiteRepairItems;
  recordAudit?: typeof safeRecordAudit;
  enforceAuditRateLimit?: () => Promise<unknown>;
  enforceApplyRateLimit?: typeof enforceWebsiteRepairApplyRateLimit;
};

function nowFor(dependencies: ManualReviewTriageDependencies) {
  return dependencies.now?.() ?? new Date();
}

function queueByProspect(items: OutreachQueueItem[]) {
  const grouped = new Map<string, OutreachQueueItem[]>();
  for (const item of items) grouped.set(item.prospectId, [...(grouped.get(item.prospectId) ?? []), item]);
  return grouped;
}

function triageItems(run: WebsiteRepairAuditRun) {
  return run.reviewedItems as ManualReviewTriageReviewedItem[];
}

function mutableItems(run: WebsiteRepairAuditRun) {
  return triageItems(run).filter((item) => (
    item.record.selectionEligible
    && !item.record.protectedReason
    && item.proposedPatch !== null
    && ["safe_exclusion", "reviewable_rebuild_opportunity"].includes(item.record.triageOutcome)
  ));
}

function reportForRun(run: WebsiteRepairAuditRun, accessToken: string): ManualReviewTriageReport {
  const items = triageItems(run);
  const safeExclusionCount = items.filter((item) => item.record.triageOutcome === "safe_exclusion").length;
  const reviewableRebuildCount = items.filter((item) => item.record.triageOutcome === "reviewable_rebuild_opportunity").length;
  const stillManualCount = items.filter((item) => item.record.triageOutcome === "still_manual").length;
  const applyItems = mutableItems(run);
  return {
    auditRunId: run.id,
    accessToken,
    status: run.status,
    applyStatus: run.applyStatus,
    totalCandidates: run.totalCandidates,
    inspectedCount: run.inspectedCount,
    safeExclusionCount,
    reviewableRebuildCount,
    stillManualCount,
    protectedCount: run.protectedCount,
    applicableCount: applyItems.length,
    reasonCounts: Object.fromEntries(Object.entries(run.manualReasonCounts).filter(([key]) => key !== reviewableCountKey)),
    records: items.map((item) => structuredClone(item.record)),
    expiresAt: run.expiresAt,
    completedAt: run.completedAt,
    appliedCount: run.appliedCount,
    applyMode: applyItems.length <= websiteRepairRequestBatchLimit ? "whole_set_atomic" : "bounded_atomic_groups",
    applyGroupSize: applyItems.length <= websiteRepairRequestBatchLimit ? applyItems.length : 20,
    partialApplyRequiresReview: run.status === "PARTIAL_NEEDS_REVIEW",
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    nothingSent: true,
  };
}

function candidateNeedsTriage(prospect: Prospect) {
  const disposition = normalizeWebsiteFitDisposition(prospect);
  const report = prospect.websiteVerification;
  if (prospect.activitySignals.includes("discovery_identity_conflict:same_name")) return true;
  if (disposition === "inconclusive_requires_review") return true;
  if (report?.version !== "website-verification-v2") return true;
  return ["unknown", "crawler_blocked", "temporarily_unavailable", "inconclusive", "invalid_website", "http_404", "unreachable_website", "broken_website", "inactive_website"]
    .includes(prospect.websiteStatus);
}

export async function listManualReviewTriagePopulation() {
  const [prospects, queue] = await Promise.all([listProspects(), listOutreachQueueItemsForBackfill()]);
  const groupedQueue = queueByProspect(queue);
  const candidates = prospects
    .filter(candidateNeedsTriage)
    .sort((left, right) => {
      const leftProtected = Boolean(triageProtectionReason(left, groupedQueue.get(left.id) ?? []));
      const rightProtected = Boolean(triageProtectionReason(right, groupedQueue.get(right.id) ?? []));
      return Number(leftProtected) - Number(rightProtected)
        || left.businessName.localeCompare(right.businessName)
        || left.id.localeCompare(right.id);
    });
  return { prospects, queue, queueByProspect: groupedQueue, candidates };
}

function triageProtectionReason(prospect: Prospect, queueItems: OutreachQueueItem[]) {
  if (prospect.inactive) return "The business is marked inactive and is protected from triage mutation.";
  return websiteRepairProtectionReason(prospect, queueItems);
}

function boundedVerificationDependencies(
  input: SharedProspectVerificationDependencies = {},
): SharedProspectVerificationDependencies {
  return {
    ...input,
    maxVerificationAttempts: Math.min(3, Math.max(1, input.maxVerificationAttempts ?? 3)),
    maxContactPages: Math.min(2, Math.max(0, input.maxContactPages ?? 2)),
    requestTimeoutMs: Math.min(5_000, Math.max(500, input.requestTimeoutMs ?? 5_000)),
  };
}

function websiteOnlyTarget(before: Prospect, resolved: Prospect) {
  const report = resolved.websiteVerification ? structuredClone(resolved.websiteVerification) : undefined;
  return {
    ...before,
    website: resolved.website,
    websiteStatus: resolved.websiteStatus,
    websiteStatusDetail: resolved.websiteStatusDetail,
    websiteVerification: report,
    fitDisposition: normalizeWebsiteFitDisposition(resolved),
  } satisfies Prospect;
}

function changedWebsiteFields(before: Prospect, after: Prospect) {
  return (["website", "websiteStatus", "websiteStatusDetail", "websiteVerification", "fitDisposition"] as const)
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function contactPathState(prospect: Prospect) {
  const paths = [
    verifiedEmailEvidenceForProspect(prospect) ? "verified public email" : "",
    prospect.contactFormUrl || prospect.quoteFormUrl ? "manual contact/quote form" : "",
    prospect.facebookUrl ? "Facebook" : "",
    prospect.instagramUrl ? "Instagram" : "",
    prospect.phone ? "phone" : "",
  ].filter(Boolean);
  return paths.length ? paths.join(", ") : "No verified written contact path";
}

function baseRecord(input: {
  prospect: Prospect;
  queueItems: OutreachQueueItem[];
  outcome: ManualReviewTriageOutcome;
  reasonCode: ManualReviewTriageReasonCode;
  explanation: string;
  proposed: Prospect | null;
  protectedReason?: string;
  resolution?: SharedProspectVerificationResolution;
}): ManualReviewTriageRecord {
  const proposed = input.proposed ?? input.prospect;
  const report = proposed.websiteVerification;
  const changedFields = input.proposed ? changedWebsiteFields(input.prospect, proposed) : [];
  const proposedOutcome: ExistingWebsiteRepairRecord["proposedOutcome"] = input.outcome === "safe_exclusion"
    ? "exclude_from_rebuild_outreach"
    : input.outcome === "reviewable_rebuild_opportunity"
      ? "potential_candidate"
      : input.outcome === "protected_ineligible"
        ? "protected"
        : "manual_review";
  const mutationEligible = changedFields.length > 0
    && ["safe_exclusion", "reviewable_rebuild_opportunity"].includes(input.outcome)
    && !input.protectedReason;
  const verifiedCanonicalWebsite = report?.canonicalUrl || proposed.website;
  return {
    prospectId: input.prospect.id,
    businessName: input.prospect.businessName,
    currentProspectStatus: input.prospect.status,
    currentQueueStatuses: input.queueItems.map((item) => item.status),
    currentDisposition: input.prospect.fitDisposition,
    proposedDisposition: normalizeWebsiteFitDisposition(proposed),
    oldStatus: input.prospect.websiteStatus,
    proposedStatus: proposed.websiteStatus,
    oldEmail: input.prospect.email,
    proposedEmail: input.prospect.email,
    evidence: input.explanation,
    changedFields,
    fieldChanges: changedFields.map((field) => ({
      field,
      oldValue: field === "websiteVerification" ? input.prospect.websiteVerification?.status ?? "not recorded" : String(input.prospect[field] ?? "not recorded"),
      proposedValue: field === "websiteVerification" ? proposed.websiteVerification?.status ?? "not recorded" : String(proposed[field] ?? "not recorded"),
    })),
    protectedReason: input.protectedReason ?? "",
    newlyFoundContactPaths: [],
    legacyCandidate: input.prospect.websiteVerification?.version !== "website-verification-v2",
    businessIdentitySufficient: report?.ownershipDecision !== "uncertain" && Boolean(report?.identityEvidence?.length),
    websiteEvidenceSufficient: input.outcome === "safe_exclusion" || input.outcome === "reviewable_rebuild_opportunity",
    websiteEvidenceConfidence: report?.confidence ?? "low",
    contactEvidenceSufficient: Boolean(verifiedEmailEvidenceForProspect(input.prospect)),
    manualReviewRequired: input.outcome === "still_manual",
    autonomouslyEligible: false,
    proposedOutcome,
    exactReason: input.explanation,
    productionMutationRequired: mutationEligible,
    alreadyCurrent: changedFields.length === 0,
    selectionEligible: mutationEligible,
    highConfidenceExclusionEligible: input.outcome === "safe_exclusion" && mutationEligible,
    safeExclusionReasonCode: input.outcome === "safe_exclusion" ? "safe_verified_exclusion" : "not_an_exclusion",
    identitySafetyResult: input.outcome === "still_manual" || input.outcome === "protected_ineligible" ? "manual_review" : "safe",
    evidenceSafetyResult: input.outcome === "still_manual" || input.outcome === "protected_ineligible" ? "manual_review" : "safe",
    verifiedCanonicalWebsite,
    identitySummary: report?.identityEvidence?.join(" ") || "First-party identity remains incomplete.",
    city: input.prospect.city,
    state: input.prospect.state,
    trade: input.prospect.trade,
    storedWebsite: input.prospect.website,
    candidateWebsite: verifiedCanonicalWebsite,
    triageOutcome: input.outcome,
    reasonCode: input.reasonCode,
    humanExplanation: input.explanation,
    websiteIdentityConfidence: report?.ownershipDecision === "owned" || report?.ownershipDecision === "not_owned"
      ? `${report.ownershipDecision}; ${report.confidence} confidence`
      : "uncertain",
    fitConfidence: report?.fit?.confidence ?? "low",
    evidenceSummary: [...new Set([...(report?.usableSignals ?? []), ...(report?.fit?.supportingEvidence ?? [])])].slice(0, 20),
    firstPartyEvidence: (report?.identityEvidence ?? []).slice(0, 20),
    contactPathState: contactPathState(input.prospect),
    automaticResolution: input.outcome === "still_manual"
      ? "Automatic resolution failed closed."
      : input.outcome === "protected_ineligible"
        ? "No external verification was attempted because current state is protected."
        : "Authoritative website evidence reached the shared resolution threshold.",
    recommendedOperatorAction: input.outcome === "safe_exclusion"
      ? "Review the evidence, then apply the website-only exclusion if correct."
      : input.outcome === "reviewable_rebuild_opportunity"
        ? "Review the evidence and contact path. Applying only returns the record to human review; it does not approve or send."
        : input.outcome === "protected_ineligible"
          ? "Leave unchanged."
          : "Inspect the evidence manually; do not approve or send from this result.",
    persistedAsProspect: true,
    secondPassAttempted: input.resolution?.secondPassAttempted ?? false,
    candidateUrlsConsidered: input.resolution?.candidateUrlsConsidered ?? [],
  };
}

export async function inspectManualReviewTriageCandidate(
  prospect: Prospect,
  queueItems: OutreachQueueItem[],
  dependencies: SharedProspectVerificationDependencies = {},
) {
  const protectedReason = triageProtectionReason(prospect, queueItems);
  if (protectedReason) {
    const record = baseRecord({
      prospect,
      queueItems,
      outcome: "protected_ineligible",
      reasonCode: "PROTECTED",
      explanation: protectedReason,
      proposed: null,
      protectedReason,
    });
    return { prospect, proposedProspect: null, record };
  }
  let resolution: SharedProspectVerificationResolution;
  try {
    resolution = await verifyProspectWebsiteWithSecondPass(prospect, {
      ...boundedVerificationDependencies(dependencies),
      allowHistoricalNoSiteLookup: true,
    });
  } catch {
    const record = baseRecord({
      prospect,
      queueItems,
      outcome: "still_manual",
      reasonCode: "OTHER_MANUAL",
      explanation: "Bounded verification failed safely. No website conclusion was promoted and no record was changed.",
      proposed: null,
    });
    return { prospect, proposedProspect: null, record };
  }

  const resolved = resolution.result.prospect;
  let outcome = resolution.outcome;
  if (outcome === "safe_exclusion") {
    const exclusion = safeHighConfidenceWebsiteExclusion({
      before: prospect,
      verified: resolved,
      protectedReason: "",
      websiteMutationRequired: true,
      websiteEvidenceSufficient: true,
    });
    if (!exclusion.eligible) outcome = "still_manual";
  } else if (outcome === "reviewable_rebuild_opportunity" && !websiteFitAllowsAutonomousOutreach(resolved)) {
    outcome = "still_manual";
  }
  const proposedProspect = ["safe_exclusion", "reviewable_rebuild_opportunity"].includes(outcome)
    ? websiteOnlyTarget(prospect, resolved)
    : null;
  const record = baseRecord({
    prospect,
    queueItems,
    outcome,
    reasonCode: outcome === "still_manual" ? unresolvedWebsiteReason(resolved) : resolution.reasonCode,
    explanation: outcome === "still_manual" && resolution.outcome !== "still_manual"
      ? "The deeper result did not pass the authoritative first-party identity and website-fit safety predicate, so it remains manual."
      : resolution.explanation,
    proposed: proposedProspect,
    resolution,
  });
  return { prospect, proposedProspect: record.selectionEligible ? proposedProspect : null, record };
}

export async function inspectManualReviewTriageCandidatesBounded(
  candidates: Prospect[],
  dependencies: SharedProspectVerificationDependencies,
  groupedQueue: Map<string, OutreachQueueItem[]>,
) {
  const inspected = new Array<Awaited<ReturnType<typeof inspectManualReviewTriageCandidate>>>(candidates.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const prospect = candidates[index]!;
      inspected[index] = await inspectManualReviewTriageCandidate(
        prospect,
        groupedQueue.get(prospect.id) ?? [],
        dependencies,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(manualReviewTriageConcurrency, candidates.length) }, () => worker()));
  return inspected;
}

function triageCounts(items: ManualReviewTriageReviewedItem[]) {
  const reasonCounts: Record<string, number> = {};
  let resolvedCount = 0;
  let stillManualCount = 0;
  let protectedCount = 0;
  for (const item of items) {
    reasonCounts[item.record.reasonCode] = (reasonCounts[item.record.reasonCode] ?? 0) + 1;
    if (item.record.triageOutcome === "protected_ineligible") protectedCount += 1;
    else if (["safe_exclusion", "reviewable_rebuild_opportunity"].includes(item.record.triageOutcome)) resolvedCount += 1;
    else stillManualCount += 1;
  }
  reasonCounts[reviewableCountKey] = items.filter((item) => item.record.triageOutcome === "reviewable_rebuild_opportunity").length;
  return { safeExclusionCount: resolvedCount, manualReviewCount: stillManualCount, protectedCount, manualReasonCounts: reasonCounts };
}

function safeTriageError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  return message.length > 0 && message.length <= 800
    && /changed after review|protected|provider attempt|queue changed|approval changed|lease changed|expired|invalid|fresh audit|candidate changed/i.test(message)
    ? message
    : fallback;
}

export async function startManualReviewTriage(
  dependencies: ManualReviewTriageDependencies = {},
): Promise<ManualReviewTriageReport> {
  const now = nowFor(dependencies);
  await (dependencies.enforceAuditRateLimit?.() ?? enforceRateLimit({
    action: "manual_review_triage",
    subject: "operator",
    limit: 3,
    windowMs: 60 * 60 * 1_000,
  }));
  const population = await (dependencies.listPopulation ?? listManualReviewTriagePopulation)();
  if (population.candidates.length > manualReviewTriageMaximumCandidates) {
    throw new Error(`Manual Review Triage stopped because the current ${population.candidates.length}-record population exceeds the ${manualReviewTriageMaximumCandidates}-record safety bound.`);
  }
  const accessToken = randomBytes(32).toString("base64url");
  const run = await createWebsiteRepairAuditRun({
    version: 2,
    accessToken,
    candidateIds: population.candidates.map((prospect) => prospect.id),
    expiresAt: new Date(now.getTime() + manualReviewTriageRunMaxAgeMs),
    now,
  });
  await (dependencies.recordAudit ?? safeRecordAudit)({
    action: "manual_review_triage_started",
    outcome: "success",
    subject: run.id,
    metadata: { totalCandidates: run.totalCandidates, chunkSize: manualReviewTriageChunkSize, sent: 0 },
  });
  return reportForRun(run, accessToken);
}

export async function getManualReviewTriage(input: {
  auditRunId: string;
  accessToken: string;
  dependencies?: ManualReviewTriageDependencies;
}) {
  const dependencies = input.dependencies ?? {};
  const run = await getAuthorizedWebsiteRepairAuditRun(input.auditRunId, input.accessToken, nowFor(dependencies), 2);
  return reportForRun(run, input.accessToken);
}

export async function continueManualReviewTriage(input: {
  auditRunId: string;
  accessToken: string;
  dependencies?: ManualReviewTriageDependencies;
}): Promise<ManualReviewTriageReport> {
  const dependencies = input.dependencies ?? {};
  const now = nowFor(dependencies);
  const claimed = await claimWebsiteRepairAuditWork({
    id: input.auditRunId,
    accessToken: input.accessToken,
    now,
    expectedVersion: 2,
  });
  if (!claimed) return getManualReviewTriage(input);
  const { run, leaseToken } = claimed;
  const chunkIds = run.candidateIds.slice(run.nextIndex, run.nextIndex + manualReviewTriageChunkSize);
  try {
    const [prospects, queue] = await Promise.all([
      Promise.all(chunkIds.map((id) => (dependencies.getProspect ?? getProspect)(id))),
      (dependencies.listQueue ?? listOutreachQueueItemsForBackfill)(),
    ]);
    if (prospects.some((prospect) => !prospect)) {
      throw new Error("A triage candidate changed or was removed after the run began. Start a fresh Manual Review Triage run.");
    }
    const groupedQueue = queueByProspect(queue);
    const inspected = await (dependencies.inspect ?? inspectManualReviewTriageCandidatesBounded)(
      prospects as Prospect[],
      dependencies.verification ?? {},
      groupedQueue,
    );
    const reviewedItems = inspected.map((candidate) => buildExistingWebsiteRepairReviewedItem(
      candidate,
      groupedQueue.get(candidate.prospect.id) ?? [],
    ) as ManualReviewTriageReviewedItem);
    const counts = triageCounts(reviewedItems);
    const updated = await completeWebsiteRepairAuditChunk({
      id: run.id,
      leaseToken,
      expectedNextIndex: run.nextIndex,
      reviewedItems,
      ...counts,
      now,
      expectedVersion: 2,
    });
    await (dependencies.recordAudit ?? safeRecordAudit)({
      action: updated.status === "READY" ? "manual_review_triage_completed" : "manual_review_triage_chunk_completed",
      outcome: "success",
      subject: run.id,
      metadata: { inspectedCount: updated.inspectedCount, totalCandidates: updated.totalCandidates, sent: 0 },
    });
    return reportForRun(updated, input.accessToken);
  } catch (error) {
    await releaseWebsiteRepairAuditLease({
      id: run.id,
      leaseToken,
      errorCode: "TRIAGE_CHUNK_FAILED",
      errorMessage: safeTriageError(error, "A bounded triage chunk failed safely. Resume the run or start a fresh audit."),
    });
    throw error;
  }
}

export async function beginManualReviewTriageApply(input: {
  auditRunId: string;
  accessToken: string;
  confirmation: string;
  dependencies?: ManualReviewTriageDependencies;
}) {
  if (input.confirmation !== manualReviewTriageConfirmationText) {
    throw new Error(`Type ${manualReviewTriageConfirmationText} to Apply the reviewed triage results.`);
  }
  const dependencies = input.dependencies ?? {};
  const now = nowFor(dependencies);
  const run = await getAuthorizedWebsiteRepairAuditRun(input.auditRunId, input.accessToken, now, 2);
  if (run.status === "APPLIED") return reportForRun(run, input.accessToken);
  if (run.status !== "READY") throw new Error("Manual Review Triage is not complete or is no longer applicable.");
  const items = mutableItems(run);
  if (items.length !== run.safeExclusionCount) {
    throw new Error("The reviewed triage mutation set is inconsistent. Run a fresh triage audit.");
  }
  await (dependencies.validateItems ?? validateReviewedWebsiteRepairItems)(items);
  await (dependencies.enforceApplyRateLimit ?? enforceWebsiteRepairApplyRateLimit)();
  const applying = await beginWebsiteRepairAuditApply({
    id: run.id,
    accessToken: input.accessToken,
    now,
    expectedVersion: 2,
  });
  await (dependencies.recordAudit ?? safeRecordAudit)({
    action: "manual_review_triage_apply_started",
    outcome: "success",
    subject: run.id,
    metadata: { reviewedMutationCount: items.length, sent: 0 },
  });
  return reportForRun(applying, input.accessToken);
}

export async function continueManualReviewTriageApply(input: {
  auditRunId: string;
  accessToken: string;
  dependencies?: ManualReviewTriageDependencies;
}): Promise<ManualReviewTriageReport> {
  const dependencies = input.dependencies ?? {};
  const now = nowFor(dependencies);
  const claimed = await claimWebsiteRepairApplyWork({
    id: input.auditRunId,
    accessToken: input.accessToken,
    now,
    expectedVersion: 2,
  });
  if (!claimed) return getManualReviewTriage(input);
  const { run, leaseToken } = claimed;
  if (run.status === "APPLIED") return reportForRun(run, input.accessToken);
  const items = mutableItems(run);
  const groupSize = items.length <= websiteRepairRequestBatchLimit ? items.length : 20;
  const group = items.slice(run.applyNextIndex, run.applyNextIndex + Math.max(1, groupSize));
  try {
    if (group.length) await (dependencies.applyItems ?? applyReviewedWebsiteRepairItems)({ reviewedItems: group, now });
  } catch (error) {
    await failWebsiteRepairApply({
      id: run.id,
      leaseToken,
      errorCode: "TRIAGE_APPLY_REJECTED",
      errorMessage: safeTriageError(error, "Manual Review Triage Apply failed safely before this atomic group committed."),
    });
    throw error;
  }
  const nextIndex = run.applyNextIndex + group.length;
  const done = nextIndex >= items.length;
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
      expectedVersion: 2,
    });
  } catch (error) {
    await releaseWebsiteRepairApplyLease({
      id: run.id,
      leaseToken,
      errorCode: "TRIAGE_APPLY_PROGRESS_PENDING",
      errorMessage: "A committed triage group is awaiting idempotent progress reconciliation.",
    });
    throw new Error("A triage group committed, but progress reconciliation was interrupted. Resume the run to reconcile it safely.", { cause: error });
  }
  for (const item of group) {
    await (dependencies.recordAudit ?? safeRecordAudit)({
      action: "manual_review_triage_record_applied",
      outcome: "success",
      subject: item.prospectId,
      metadata: { auditRunId: run.id, triageOutcome: item.record.triageOutcome, sent: 0 },
    });
  }
  return reportForRun(updated, input.accessToken);
}

export function manualReviewTriageConfigurationForTests() {
  return {
    reasonCodes: [...manualReviewTriageReasonCodes],
    confirmationText: manualReviewTriageConfirmationText,
    chunkSize: manualReviewTriageChunkSize,
  };
}
