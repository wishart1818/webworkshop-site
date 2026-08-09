import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  applySelectedWebsiteRepairsAtomically,
  listOutreachQueueItemsForBackfill,
  outreachQueueItemHasPersistedApproval,
  repairOutreachQueueItemForReadiness,
  safeReadinessRepairProtectionReason,
} from "@/lib/autonomous-growth-repository";
import { currentOutreachCopyVersion, outreachHistoryTextIndicatesProtectedContact, type OutreachQueueItem } from "@/lib/autonomous-growth";
import { activity, type Prospect, type WebsiteFitDisposition, type WebsiteVerificationReport } from "@/lib/prospect-engine";
import { buildActiveProspectQualificationAudit } from "@/lib/prospect-qualification-audit";
import {
  normalizeWebsiteFitDisposition,
  outreachObservationForProspect,
  outreachObservationGroundingProblems,
  verifiedEmailEvidenceForProspect,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";
import { getProspect, listProspects, saveProspect } from "@/lib/prospect-repository";
import { safeRecordAudit } from "@/lib/operational-controls";
import { verifyProspectWebsite, type WebsiteVerificationDependencies } from "@/lib/site-analysis";

const protectedProspectStatuses = new Set<Prospect["status"]>([
  "Contacted",
  "Interested",
  "Proposal Sent",
  "Closed Won",
  "Closed Lost",
]);
const transientLegacyEvidence = /\b(?:http\s*(?:403|408|429|500|502|503|504|508)|timeout|timed out|fetch failed|dns|enotfound|connection reset|econnreset|crawler|bot|waf|cloudflare|unreachable)\b/i;
const websiteRepairReviewMaxAgeMs = 15 * 60 * 1000;
const websiteRepairRequestBatchSize = 20;
const websiteRepairRequestBatchLimit = 25;
const websiteRepairConcurrency = 3;
const websiteRepairAttemptLimit = 3;
const websiteRepairContactPageLimit = 2;
const websiteRepairRequestTimeoutMs = 6_000;

export type WebsiteRecheckResult = {
  prospect: Prospect;
  verification: WebsiteVerificationReport;
  approvalsRevoked: number;
  protectedQueueItems: number;
  activeQueueItems: number;
  nothingSent: true;
};

export type ExistingWebsiteRepairRecord = {
  prospectId: string;
  businessName: string;
  currentProspectStatus: Prospect["status"];
  currentQueueStatuses: string[];
  currentDisposition: string;
  proposedDisposition: WebsiteFitDisposition;
  oldStatus: Prospect["websiteStatus"];
  proposedStatus: Prospect["websiteStatus"];
  oldEmail: string;
  proposedEmail: string;
  evidence: string;
  changedFields: string[];
  fieldChanges: Array<{ field: string; oldValue: string; proposedValue: string }>;
  protectedReason: string;
  newlyFoundContactPaths: string[];
  legacyCandidate: boolean;
  businessIdentitySufficient: boolean;
  websiteEvidenceSufficient: boolean;
  websiteEvidenceConfidence: WebsiteVerificationReport["confidence"];
  contactEvidenceSufficient: boolean;
  manualReviewRequired: boolean;
  autonomouslyEligible: boolean;
  proposedOutcome: "exclude_from_rebuild_outreach" | "manual_review" | "potential_candidate" | "protected";
  exactReason: string;
  productionMutationRequired: boolean;
  alreadyCurrent: boolean;
  selectionEligible: boolean;
  highConfidenceExclusionEligible: boolean;
};

export type ExistingWebsiteRepairReport = {
  mode: "dry_run" | "applied";
  scope: "batch" | "exact_prospect";
  inspected: number;
  candidates: number;
  remainingCandidates: number;
  offset: number;
  batchSize: number;
  rangeStart: number;
  rangeEnd: number;
  currentPage: number;
  totalPages: number;
  previousOffset: number | null;
  nextOffset: number | null;
  exactProspectId: string;
  selectedCount: number;
  selectedProspectIds: string[];
  changed: number;
  skippedProtected: number;
  records: ExistingWebsiteRepairRecord[];
  reviewToken: string;
  nothingSent: true;
};

export const websiteRepairReviewTokenMaxLength = 240_000;
const websiteRepairReviewPayloadMaxLength = 1_000_000;

const websiteRepairReportedFields = [
  "website",
  "websiteStatus",
  "websiteStatusDetail",
  "email",
  "phone",
  "contactPageUrl",
  "contactFormUrl",
  "quoteFormUrl",
  "contactFormDetected",
  "quoteFormDetected",
  "contactConfidence",
  "contactEvidence",
  "facebookUrl",
  "instagramUrl",
  "linkedinUrl",
  "recommendedContactMethod",
  "bestManualContactMethod",
  "classification",
  "prospectType",
  "inactive",
  "websiteVerification",
  "fitDisposition",
] as const satisfies readonly (keyof Prospect)[];

const websiteRepairPatchFields = [
  ...websiteRepairReportedFields,
  "xUrl",
  "youtubeUrl",
  "contactDiscoveryNotes",
  "address",
  "websiteAnalysisAttemptedAt",
  "analysis",
  "outreach",
  "preview",
  "priorityScore",
  "status",
] as const satisfies readonly (keyof Prospect)[];

const websiteExclusionPatchFields = [
  "website",
  "websiteStatus",
  "websiteStatusDetail",
  "websiteVerification",
  "fitDisposition",
] as const satisfies readonly (keyof Prospect)[];

const websiteRepairContactFields = [
  "phone",
  "email",
  "contactPageUrl",
  "contactFormUrl",
  "quoteFormUrl",
  "contactFormDetected",
  "quoteFormDetected",
  "facebookUrl",
  "instagramUrl",
  "linkedinUrl",
  "xUrl",
  "youtubeUrl",
  "contactPersonName",
  "contactConfidence",
  "contactEvidence",
  "contactDiscoveryNotes",
  "recommendedContactMethod",
  "bestManualContactMethod",
  "address",
] as const satisfies readonly (keyof Prospect)[];

type WebsiteRepairPatchField = (typeof websiteRepairPatchFields)[number];
type WebsiteRepairPatchEntry = {
  field: WebsiteRepairPatchField;
  unset: boolean;
  value?: unknown;
};
type ReviewedProspectPatch = {
  entries: WebsiteRepairPatchEntry[];
  addedActivities: Prospect["activities"];
};

function assertWebsiteExclusionPreservesContactState(before: Prospect, after: Prospect) {
  for (const field of websiteRepairContactFields) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      throw new Error(`Website exclusion repair cannot modify ${field}. Run a fresh dry run.`);
    }
  }
}

function prospectProtectionReason(prospect: Prospect, queueItems: OutreachQueueItem[] = []) {
  if (protectedProspectStatuses.has(prospect.status)) return `Prospect status ${prospect.status} is protected.`;
  const history = [...prospect.notes, ...prospect.activities.map((item) => item.label)].join("\n");
  if (outreachHistoryTextIndicatesProtectedContact(history)) {
    return "Contact, suppression, or provider-outcome history is protected.";
  }
  const queueProtection = queueItems
    .map((item) => safeReadinessRepairProtectionReason(item, prospect.status))
    .find(Boolean);
  if (queueProtection) return `Outreach queue history is protected. ${queueProtection}`;
  return "";
}

function changedProspectFields(before: Prospect, after: Prospect) {
  return websiteRepairReportedFields
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map(String);
}

function newContactPaths(before: Prospect, after: Prospect) {
  return [
    !before.email && after.email ? `Email: ${after.email}` : "",
    !before.phone && after.phone ? `Phone: ${after.phone}` : "",
    !before.contactPageUrl && after.contactPageUrl ? `Contact page: ${after.contactPageUrl}` : "",
    !before.contactFormUrl && after.contactFormUrl ? `Contact form: ${after.contactFormUrl}` : "",
    !before.quoteFormUrl && after.quoteFormUrl ? `Quote form: ${after.quoteFormUrl}` : "",
    !before.facebookUrl && after.facebookUrl ? `Facebook: ${after.facebookUrl}` : "",
    !before.instagramUrl && after.instagramUrl ? `Instagram: ${after.instagramUrl}` : "",
  ].filter(Boolean);
}

function repairFieldValue(field: keyof Prospect, value: Prospect[keyof Prospect]) {
  if (field === "websiteVerification") {
    const report = value as Prospect["websiteVerification"];
    return report
      ? `${report.status}; ${report.confidence} confidence; ${report.attempts.length} bounded attempt(s); canonical ${report.canonicalUrl || "not confirmed"}`
      : "not recorded";
  }
  if (field === "contactEvidence") {
    return `${Array.isArray(value) ? value.length : 0} evidence record(s)`;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string" || typeof value === "number") return String(value) || "not recorded";
  if (value === null || value === undefined) return "not recorded";
  return "structured value updated";
}

function repairFieldChanges(before: Prospect, after: Prospect) {
  return changedProspectFields(before, after).map((fieldName) => {
    const field = fieldName as keyof Prospect;
    return {
      field: fieldName,
      oldValue: repairFieldValue(field, before[field]),
      proposedValue: repairFieldValue(field, after[field]),
    };
  });
}

async function revokeStaleQueueApproval(prospect: Prospect, reason: string) {
  const queue = await listOutreachQueueItemsForBackfill();
  const matchingItems = queue.filter((candidate) => candidate.prospectId === prospect.id);
  const protectedItems = matchingItems.filter((item) => (
    Boolean(safeReadinessRepairProtectionReason(item, prospect.status))
  ));
  const activeItems = protectedItems.filter((item) => (
    item.status === "Sending"
    || item.notes.includes("[auto-email-ambiguous]")
  ));
  if (protectedItems.length) {
    return {
      approvalsRevoked: 0,
      protectedQueueItems: protectedItems.length,
      activeQueueItems: activeItems.length,
    };
  }
  let approvalsRevoked = 0;
  let protectedQueueItems = 0;
  let activeQueueItems = 0;
  for (const item of matchingItems) {
    const repaired = await repairOutreachQueueItemForReadiness({
      id: item.id,
      action: "mark_needs_manual_review",
      reason,
    });
    if (repaired.changed) approvalsRevoked += 1;
    else {
      protectedQueueItems += 1;
      if (
        repaired.item?.status === "Sending"
        || repaired.item?.notes.includes("[auto-email-ambiguous]")
      ) activeQueueItems += 1;
    }
  }
  return { approvalsRevoked, protectedQueueItems, activeQueueItems };
}

function ensureNoProtectedQueueMutation(queueResult: Awaited<ReturnType<typeof revokeStaleQueueApproval>>) {
  if (queueResult.activeQueueItems) {
    throw new Error("Website/contact changes are blocked while an email provider attempt is in progress or awaiting reconciliation.");
  }
  if (queueResult.protectedQueueItems) {
    throw new Error("Website/contact changes are blocked because protected outreach or contact history exists.");
  }
}

function withApprovalRevoked(prospect: Prospect, shouldRevoke: boolean) {
  if (!shouldRevoke || !prospect.outreach?.approved) return prospect;
  return {
    ...prospect,
    outreach: {
      ...prospect.outreach,
      approved: false,
    },
  };
}

async function ensureProspectWebsiteMutationIsSafe(prospect: Prospect) {
  const queue = (await listOutreachQueueItemsForBackfill()).filter((item) => item.prospectId === prospect.id);
  if (queue.some((item) => item.status === "Sending" || item.notes.includes("[auto-email-ambiguous]"))) {
    throw new Error("Website/contact changes are blocked while an email provider attempt is in progress or awaiting reconciliation.");
  }
  if (prospectProtectionReason(prospect, queue)) {
    throw new Error("Website/contact changes are blocked because protected outreach or contact history exists.");
  }
}

export async function recheckProspectWebsite(
  prospectId: string,
  dependencies: WebsiteVerificationDependencies = {},
): Promise<WebsiteRecheckResult> {
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect was not found.");
  await ensureProspectWebsiteMutationIsSafe(prospect);
  const verified = await verifyProspectWebsite(prospect, dependencies);
  const changes = changedProspectFields(prospect, verified.prospect);
  const recipientOrEligibilityChanged = changes.some((field) => [
    "email",
    "website",
    "websiteStatus",
    "websiteVerification",
    "contactEvidence",
    "contactConfidence",
    "recommendedContactMethod",
    "bestManualContactMethod",
    "classification",
    "prospectType",
    "inactive",
    "fitDisposition",
  ].includes(field));
  const queueResult = recipientOrEligibilityChanged
    ? await revokeStaleQueueApproval(prospect, "Website or public-contact verification changed. Review and approve the exact current recipient and draft again.")
    : { approvalsRevoked: 0, protectedQueueItems: 0, activeQueueItems: 0 };
  ensureNoProtectedQueueMutation(queueResult);
  const saved = await saveProspect(withApprovalRevoked(verified.prospect, recipientOrEligibilityChanged));
  await safeRecordAudit({
    action: "website_contact_recheck",
    outcome: verified.report.status === "usable" ? "success" : "rejected",
    subject: prospect.businessName,
    metadata: {
      prospectId,
      status: verified.report.status,
      changedFields: changes,
      approvalsRevoked: queueResult.approvalsRevoked,
      protectedQueueItems: queueResult.protectedQueueItems,
      activeQueueItems: queueResult.activeQueueItems,
      sent: 0,
    },
  });
  return { prospect: saved, verification: verified.report, ...queueResult, nothingSent: true };
}

const operatorFitDispositions = new Set<WebsiteFitDisposition>([
  "clearly_weak_or_outdated_website",
  "adequate_existing_website",
  "strong_existing_website",
  "inconclusive_requires_review",
]);

export async function setProspectWebsiteFitDisposition(input: {
  prospectId: string;
  disposition: WebsiteFitDisposition;
  reason: string;
  confirmed: boolean;
}) {
  if (!input.confirmed) throw new Error("Confirmation is required.");
  if (!operatorFitDispositions.has(input.disposition)) throw new Error("Select a supported website-fit disposition.");
  const reason = input.reason.trim();
  if (reason.length < 12) throw new Error("A concise factual reason is required for the website-fit decision.");
  const prospectId = input.prospectId;
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect was not found.");
  await ensureProspectWebsiteMutationIsSafe(prospect);
  if (prospect.websiteStatus !== "usable" || prospect.websiteVerification?.status !== "usable") {
    throw new Error("Only a currently verified usable website can receive this disposition.");
  }
  if (prospect.websiteVerification.version !== "website-verification-v2" || prospect.websiteVerification.ownershipDecision !== "owned") {
    throw new Error("Current evidence-backed website ownership is required before setting website fit.");
  }
  const queueResult = await revokeStaleQueueApproval(
    prospect,
    `Operator changed website fit to ${input.disposition.replaceAll("_", " ")}.`,
  );
  ensureNoProtectedQueueMutation(queueResult);
  const now = new Date().toISOString();
  const websiteVerification: WebsiteVerificationReport = {
    ...prospect.websiteVerification,
    fit: {
      disposition: input.disposition,
      reason,
      supportingEvidence: [`Operator rendered review: ${reason}`],
      confidence: "high",
      analysisOrigin: "manual",
      evaluatedAt: now,
      // A free-form operator reason is internal evidence, not automatically safe
      // customer-facing copy. The next bounded verification must save a grounded
      // observation before this record can become autonomously eligible.
      observation: undefined,
    },
    freshness: prospect.websiteVerification.freshness ? {
      ...prospect.websiteVerification.freshness,
      websiteFitFresh: true,
      approvalFresh: false,
      lastMeaningfulChange: now,
      staleReason: "Approval must be reviewed after the website-fit decision changed.",
      humanReviewRequired: input.disposition === "inconclusive_requires_review",
    } : undefined,
  };
  const saved = await saveProspect(withApprovalRevoked({
    ...prospect,
    fitDisposition: input.disposition,
    websiteVerification,
    activities: [
      activity("status", `Operator set website fit to ${input.disposition.replaceAll("_", " ")}: ${reason} No contact was recorded and nothing was sent.`),
      ...prospect.activities,
    ],
  }, true));
  await safeRecordAudit({
    action: "prospect_fit_disposition",
    outcome: "success",
    subject: prospect.businessName,
    metadata: {
      prospectId,
      disposition: input.disposition,
      reason,
      approvalsRevoked: queueResult.approvalsRevoked,
      contacted: false,
      sent: 0,
    },
  });
  return { prospect: saved, ...queueResult, nothingSent: true as const };
}

export async function confirmUsableWebsiteNotFit(prospectId: string, confirmed: boolean) {
  if (!confirmed) throw new Error("Confirmation is required.");
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect was not found.");
  if (prospect.websiteStatus !== "usable" || prospect.websiteVerification?.status !== "usable") {
    throw new Error("Only a currently verified usable website can receive this disposition.");
  }
  return setProspectWebsiteFitDisposition({
    prospectId,
    disposition: "strong_existing_website",
    reason: "Operator confirmed the current website is strong and is not a fit for the website-rebuild offer.",
    confirmed,
  });
}

export async function auditActiveProspectQualificationsReadOnly(now = new Date()) {
  const [prospects, queue] = await Promise.all([
    listProspects(),
    listOutreachQueueItemsForBackfill(),
  ]);
  return buildActiveProspectQualificationAudit(prospects, queue, now);
}

const activeLegacyQueueStatuses = new Set<OutreachQueueItem["status"]>([
  "Draft",
  "Eligible",
  "Needs Review",
  "DM Draft",
  "Queued",
]);

function existingRecordNeedsWebsiteAudit(prospect: Prospect, queueItems: OutreachQueueItem[]) {
  if (authoritativeCurrentWebsiteExclusion(prospect)) return false;
  const currentExclusionRequiresRepair = currentWebsiteExclusionConclusion(prospect);
  const legacyStatus = ["http_404", "unreachable_website", "broken_website", "inactive_website"].includes(prospect.websiteStatus);
  const transientDetail = transientLegacyEvidence.test(prospect.websiteStatusDetail)
    && (prospect.websiteVerification?.version !== "website-verification-v2" || prospect.websiteVerification.status !== "usable");
  const staleContactClassification = ["phone_only", "social_only", "no_website"].includes(prospect.classification)
    || prospect.recommendedContactMethod === "needs_manual_contact_research";
  const activeUnsentInventory = !prospect.inactive
    && ["New", "Reviewed"].includes(prospect.status)
    && queueItems.some((item) => (
      activeLegacyQueueStatuses.has(item.status)
      && !item.sentDate
      && !item.replyStatus
    ));
  const legacyEvidenceModel = prospect.websiteVerification?.version !== "website-verification-v2";
  const incompleteEmailEvidence = Boolean(prospect.email && !verifiedEmailEvidenceForProspect(prospect));
  return Boolean(
    currentExclusionRequiresRepair
    || (prospect.website && (legacyStatus || transientDetail || staleContactClassification))
    || (activeUnsentInventory && (legacyEvidenceModel || incompleteEmailEvidence)),
  );
}

const structuralWebsiteSignals = new Set([
  "meaningful page title",
  "business name",
  "navigation",
  "service content",
  "mobile viewport",
  "public phone",
  "public email",
  "contact or quote form",
  "business imagery",
  "structured business data",
]);

function normalizedCanonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizedEvidenceText(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedEvidenceList(values: string[] | undefined) {
  return [...new Set((values ?? []).map(normalizedEvidenceText).filter(Boolean))].sort();
}

function canonicalWebsiteVerificationForExclusion(report: Prospect["websiteVerification"]) {
  if (!report) return null;
  const attempts = report.attempts.map((attempt) => ({
    requestedUrl: normalizedCanonicalUrl(attempt.requestedUrl),
    normalizedUrl: normalizedCanonicalUrl(attempt.normalizedUrl),
    finalUrl: normalizedCanonicalUrl(attempt.finalUrl),
    httpStatus: attempt.httpStatus,
    redirectChain: attempt.redirectChain.map(normalizedCanonicalUrl),
    contentType: normalizedEvidenceText(attempt.contentType),
    failureCategory: attempt.failureCategory,
    robotsAllowed: attempt.robotsAllowed,
    botBlocked: attempt.botBlocked,
    browserCompatibleHeaders: attempt.browserCompatibleHeaders,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const observation = report.fit?.observation;
  return {
    version: report.version,
    status: report.status,
    confidence: report.confidence,
    canonicalUrl: normalizedCanonicalUrl(report.canonicalUrl),
    attempts,
    usableSignals: normalizedEvidenceList(report.usableSignals),
    explanation: normalizedEvidenceText(report.explanation),
    ownershipDecision: report.ownershipDecision ?? "",
    identityEvidence: normalizedEvidenceList(report.identityEvidence),
    fit: report.fit ? {
      disposition: report.fit.disposition,
      reason: normalizedEvidenceText(report.fit.reason),
      supportingEvidence: normalizedEvidenceList(report.fit.supportingEvidence),
      confidence: report.fit.confidence,
      analysisOrigin: report.fit.analysisOrigin,
      observation: observation ? {
        kind: observation.kind,
        statement: normalizedEvidenceText(observation.statement),
        rebuildSentence: normalizedEvidenceText(observation.rebuildSentence),
        evidence: normalizedEvidenceList(observation.evidence),
        demoChecklist: normalizedEvidenceList(observation.demoChecklist),
      } : null,
    } : null,
  };
}

function websiteVerificationForExclusion(report: Prospect["websiteVerification"]) {
  if (!report) return undefined;
  const websiteVerification = structuredClone(report);
  delete websiteVerification.freshness;
  return websiteVerification;
}

function websiteExclusionRepairTarget(before: Prospect, verified: Prospect) {
  const canonicalWebsite = verified.websiteVerification?.canonicalUrl || verified.website;
  const verifiedWebsiteReport = websiteVerificationForExclusion(verified.websiteVerification);
  const websiteChanged = normalizedCanonicalUrl(before.website) !== normalizedCanonicalUrl(canonicalWebsite);
  const statusChanged = before.websiteStatus !== verified.websiteStatus;
  const verificationChanged = JSON.stringify(canonicalWebsiteVerificationForExclusion(before.websiteVerification))
    !== JSON.stringify(canonicalWebsiteVerificationForExclusion(verifiedWebsiteReport));
  const verifiedDisposition = normalizeWebsiteFitDisposition(verified);
  const dispositionChanged = before.fitDisposition !== verifiedDisposition;
  const legacyTransientDetail = transientLegacyEvidence.test(before.websiteStatusDetail)
    && (before.websiteVerification?.version !== "website-verification-v2" || before.websiteVerification.status !== "usable");
  const detailRequiresRepair = !before.websiteStatusDetail.trim()
    || legacyTransientDetail
    || statusChanged
    || before.websiteVerification?.version !== "website-verification-v2";
  const detailChanged = detailRequiresRepair
    && normalizedEvidenceText(before.websiteStatusDetail) !== normalizedEvidenceText(verified.websiteStatusDetail);
  if (!websiteChanged && !statusChanged && !verificationChanged && !dispositionChanged && !detailChanged) return before;
  return {
    ...before,
    website: websiteChanged ? canonicalWebsite : before.website,
    websiteStatus: statusChanged ? verified.websiteStatus : before.websiteStatus,
    websiteStatusDetail: detailChanged ? verified.websiteStatusDetail : before.websiteStatusDetail,
    websiteVerification: verificationChanged ? verifiedWebsiteReport : before.websiteVerification,
    fitDisposition: dispositionChanged ? verifiedDisposition : before.fitDisposition,
  } satisfies Prospect;
}

function currentWebsiteExclusionConclusion(prospect: Prospect) {
  const disposition = normalizeWebsiteFitDisposition(prospect);
  const report = prospect.websiteVerification;
  return ["adequate_existing_website", "strong_existing_website"].includes(disposition)
    && report?.version === "website-verification-v2"
    && report.status === "usable"
    && report.ownershipDecision === "owned"
    && Boolean(report.identityEvidence?.length)
    && report.fit?.disposition === disposition;
}

function authoritativeCurrentWebsiteExclusion(prospect: Prospect) {
  const disposition = normalizeWebsiteFitDisposition(prospect);
  const report = prospect.websiteVerification;
  const canonicalWebsite = normalizedCanonicalUrl(report?.canonicalUrl ?? "");
  return currentWebsiteExclusionConclusion(prospect)
    && prospect.fitDisposition === disposition
    && prospect.websiteStatus === "usable"
    && report?.confidence === "high"
    && Boolean(canonicalWebsite)
    && normalizedCanonicalUrl(prospect.website) === canonicalWebsite
    && Boolean(prospect.websiteStatusDetail.trim())
    && Boolean(report.identityEvidence?.length)
    && report.fit?.confidence === "high";
}

function structuralWebsiteSignature(signals: string[] = []) {
  return signals.filter((signal) => structuralWebsiteSignals.has(signal)).sort().join("|");
}

function preserveFreshRenderedFit(
  before: Prospect,
  verified: Awaited<ReturnType<typeof verifyProspectWebsite>>,
  now: Date,
) {
  const priorFit = before.websiteVerification?.fit;
  const sameCanonical = Boolean(
    normalizedCanonicalUrl(before.websiteVerification?.canonicalUrl ?? "")
    && normalizedCanonicalUrl(before.websiteVerification?.canonicalUrl ?? "")
      === normalizedCanonicalUrl(verified.report.canonicalUrl),
  );
  const priorSignature = structuralWebsiteSignature(before.websiteVerification?.usableSignals);
  const sameStructure = Boolean(
    priorSignature
    && priorSignature === structuralWebsiteSignature(verified.report.usableSignals),
  );
  const evaluatedAt = Date.parse(priorFit?.evaluatedAt ?? "");
  const freshRenderedFit = Boolean(
    priorFit
    && ["manual", "rendered_review"].includes(priorFit.analysisOrigin)
    && Number.isFinite(evaluatedAt)
    && now.getTime() - evaluatedAt <= 7 * 24 * 60 * 60 * 1_000,
  );
  if (!sameCanonical || !sameStructure || !freshRenderedFit || !verified.prospect.websiteVerification) return verified;
  const report = { ...verified.report, fit: priorFit };
  return {
    ...verified,
    report,
    prospect: {
      ...verified.prospect,
      fitDisposition: priorFit!.disposition,
      websiteVerification: report,
    },
  };
}

function websiteEvidenceSufficientForDisposition(prospect: Prospect) {
  const disposition = normalizeWebsiteFitDisposition(prospect);
  if (["adequate_existing_website", "strong_existing_website"].includes(disposition)) {
    return prospect.websiteVerification?.version === "website-verification-v2"
      && prospect.websiteVerification.status === "usable"
      && prospect.websiteVerification.ownershipDecision === "owned"
      && prospect.websiteVerification.fit?.disposition === disposition;
  }
  return websiteFitAllowsAutonomousOutreach(prospect);
}

function legacyAuditDecision(
  before: Prospect,
  proposed: Prospect,
  protectedReason: string,
  queueItems: OutreachQueueItem[],
) {
  const disposition = normalizeWebsiteFitDisposition(proposed);
  const businessIdentitySufficient = proposed.websiteVerification?.version === "website-verification-v2"
    && proposed.websiteVerification.ownershipDecision !== "uncertain"
    && Boolean(proposed.websiteVerification.identityEvidence?.length);
  const websiteEvidenceSufficient = websiteEvidenceSufficientForDisposition(proposed);
  const websiteEvidenceConfidence = proposed.websiteVerification?.confidence ?? "low";
  const contactEvidenceSufficient = Boolean(verifiedEmailEvidenceForProspect(proposed));
  const observationProblems = outreachObservationGroundingProblems(outreachObservationForProspect(proposed));
  const legacyCandidate = before.websiteVerification?.version !== "website-verification-v2"
    || queueItems.some((item) => item.outreachCopyVersion !== currentOutreachCopyVersion);
  if (protectedReason) {
    return {
      legacyCandidate,
      businessIdentitySufficient,
      websiteEvidenceSufficient,
      websiteEvidenceConfidence,
      contactEvidenceSufficient,
      manualReviewRequired: false,
      autonomouslyEligible: false,
      proposedOutcome: "protected" as const,
      exactReason: protectedReason,
    };
  }
  if (["adequate_existing_website", "strong_existing_website"].includes(disposition) && websiteEvidenceSufficient) {
    return {
      legacyCandidate,
      businessIdentitySufficient,
      websiteEvidenceSufficient,
      websiteEvidenceConfidence,
      contactEvidenceSufficient,
      manualReviewRequired: false,
      autonomouslyEligible: false,
      proposedOutcome: "exclude_from_rebuild_outreach" as const,
      exactReason: `The current evidence classifies the owned website as ${disposition.replaceAll("_", " ")}. It is excluded regardless of business score or contactability.`,
    };
  }
  if (disposition === "inconclusive_requires_review" || !websiteEvidenceSufficient) {
    return {
      legacyCandidate,
      businessIdentitySufficient,
      websiteEvidenceSufficient,
      websiteEvidenceConfidence,
      contactEvidenceSufficient,
      manualReviewRequired: true,
      autonomouslyEligible: false,
      proposedOutcome: "manual_review" as const,
      exactReason: disposition === "inconclusive_requires_review"
        ? "Website fit remains inconclusive under the v2 evidence model and requires rendered human review."
        : "Current structured website identity, ownership, status, or fit evidence is incomplete.",
    };
  }
  if (!contactEvidenceSufficient || observationProblems.length) {
    return {
      legacyCandidate,
      businessIdentitySufficient,
      websiteEvidenceSufficient,
      websiteEvidenceConfidence,
      contactEvidenceSufficient,
      manualReviewRequired: true,
      autonomouslyEligible: false,
      proposedOutcome: "manual_review" as const,
      exactReason: !contactEvidenceSufficient
        ? "The stored public email lacks current autonomous-quality source URL and provenance evidence."
        : observationProblems.join(" "),
    };
  }
  return {
    legacyCandidate,
    businessIdentitySufficient,
    websiteEvidenceSufficient,
    websiteEvidenceConfidence,
    contactEvidenceSufficient,
    manualReviewRequired: false,
    autonomouslyEligible: true,
    proposedOutcome: "potential_candidate" as const,
    exactReason: "Current website-fit, business identity, public-email provenance, and outreach-observation evidence pass. The package still requires current copy and deliberate human approval before any send.",
  };
}

async function inspectExistingWebsiteRepairCandidate(
  prospect: Prospect,
  dependencies: WebsiteVerificationDependencies,
  queueItems: OutreachQueueItem[],
) {
  const protectedReason = prospectProtectionReason(prospect, queueItems);
  if (protectedReason) {
    const decision = legacyAuditDecision(prospect, prospect, protectedReason, queueItems);
    return {
      prospect,
      verified: null,
      proposedProspect: null,
      record: {
        prospectId: prospect.id,
        businessName: prospect.businessName,
        currentProspectStatus: prospect.status,
        currentQueueStatuses: queueItems.map((item) => item.status),
        currentDisposition: prospect.fitDisposition,
        proposedDisposition: normalizeWebsiteFitDisposition(prospect),
        oldStatus: prospect.websiteStatus,
        proposedStatus: prospect.websiteStatus,
        oldEmail: prospect.email,
        proposedEmail: prospect.email,
        evidence: prospect.websiteStatusDetail || "Stored legacy classification.",
        changedFields: [],
        fieldChanges: [],
        protectedReason,
        newlyFoundContactPaths: [],
        ...decision,
        productionMutationRequired: false,
        alreadyCurrent: false,
        selectionEligible: false,
        highConfidenceExclusionEligible: false,
      } satisfies ExistingWebsiteRepairRecord,
    };
  }
  const verified = preserveFreshRenderedFit(
    prospect,
    await verifyProspectWebsite(prospect, dependencies),
    dependencies.now?.() ?? new Date(),
  );
  const decision = legacyAuditDecision(prospect, verified.prospect, "", queueItems);
  const proposedProspect = decision.proposedOutcome === "exclude_from_rebuild_outreach"
    ? websiteExclusionRepairTarget(prospect, verified.prospect)
    : verified.prospect;
  const changedFields = changedProspectFields(prospect, proposedProspect);
  const alreadyCurrent = decision.proposedOutcome === "exclude_from_rebuild_outreach" && changedFields.length === 0;
  const selectionEligible = changedFields.length > 0;
  const highConfidenceExclusionEligible = selectionEligible
    && decision.proposedOutcome === "exclude_from_rebuild_outreach"
    && ["adequate_existing_website", "strong_existing_website"].includes(normalizeWebsiteFitDisposition(verified.prospect))
    && verified.report.version === "website-verification-v2"
    && verified.report.status === "usable"
    && verified.report.ownershipDecision === "owned"
    && decision.websiteEvidenceSufficient
    && decision.websiteEvidenceConfidence === "high"
    && verified.report.fit?.confidence === "high";
  return {
    prospect,
    verified,
    proposedProspect,
    record: {
      prospectId: prospect.id,
      businessName: prospect.businessName,
      currentProspectStatus: prospect.status,
      currentQueueStatuses: queueItems.map((item) => item.status),
      currentDisposition: prospect.fitDisposition,
      proposedDisposition: normalizeWebsiteFitDisposition(verified.prospect),
      oldStatus: prospect.websiteStatus,
      proposedStatus: proposedProspect.websiteStatus,
      oldEmail: prospect.email,
      proposedEmail: proposedProspect.email,
      evidence: `Stored trigger: ${prospect.websiteStatus}${prospect.websiteStatusDetail ? ` (${prospect.websiteStatusDetail})` : ""}. Recheck: ${verified.report.explanation}`,
      changedFields,
      fieldChanges: repairFieldChanges(prospect, proposedProspect),
      protectedReason: "",
      newlyFoundContactPaths: newContactPaths(prospect, verified.prospect),
      ...decision,
      productionMutationRequired: changedFields.length > 0,
      alreadyCurrent,
      selectionEligible,
      highConfidenceExclusionEligible,
    } satisfies ExistingWebsiteRepairRecord,
  };
}

async function inspectCandidatesBounded(
  candidates: Prospect[],
  dependencies: WebsiteVerificationDependencies,
  queueByProspect: Map<string, OutreachQueueItem[]>,
) {
  const inspected = new Array<Awaited<ReturnType<typeof inspectExistingWebsiteRepairCandidate>>>(candidates.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const prospect = candidates[index]!;
      inspected[index] = await inspectExistingWebsiteRepairCandidate(
        prospect,
        dependencies,
        queueByProspect.get(prospect.id) ?? [],
      );
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(websiteRepairConcurrency, candidates.length) },
    () => worker(),
  ));
  return inspected;
}

function canonicalRepairReviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalRepairReviewValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalRepairReviewValue(record[key])]),
  );
}

function repairStateDigest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalRepairReviewValue(value)))
    .digest("hex");
}

function repairProspectStateDigest(prospect: Prospect) {
  return repairStateDigest({
    ...prospect,
    notes: [...prospect.notes].sort(),
    activities: [...prospect.activities].sort((left, right) => left.id.localeCompare(right.id)),
    contactEvidence: [...prospect.contactEvidence].sort((left, right) => (
      JSON.stringify(canonicalRepairReviewValue(left)).localeCompare(JSON.stringify(canonicalRepairReviewValue(right)))
    )),
  });
}

function orderedRepairQueueSnapshot(items: OutreachQueueItem[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

type ExistingWebsiteRepairSelection = {
  scope: "batch" | "exact_prospect";
  offset: number;
  limit: number;
  prospectId: string;
};

type ExistingWebsiteRepairReviewSnapshot = {
  version: 3;
  issuedAt: string;
  selection: ExistingWebsiteRepairSelection;
  summary: {
    inspected: number;
    candidates: number;
    remainingCandidates: number;
    rangeStart: number;
    rangeEnd: number;
    currentPage: number;
    totalPages: number;
    previousOffset: number | null;
    nextOffset: number | null;
    exactProspectId: string;
    skippedProtected: number;
  };
  records: Array<{
    prospectId: string;
    record: ExistingWebsiteRepairRecord;
    currentProspectDigest: string;
    currentQueueDigest: string;
    postApplyProspectDigest: string;
    proposedPatch: ReviewedProspectPatch | null;
  }>;
};

function reviewedProspectPatch(
  before: Prospect,
  after: Prospect,
  proposedOutcome: ExistingWebsiteRepairRecord["proposedOutcome"],
): ReviewedProspectPatch {
  if (proposedOutcome === "exclude_from_rebuild_outreach") {
    assertWebsiteExclusionPreservesContactState(before, after);
  }
  const patchFields = proposedOutcome === "exclude_from_rebuild_outreach"
    ? websiteExclusionPatchFields
    : websiteRepairPatchFields;
  const allowedFields = new Set<string>(patchFields);
  const changedKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of changedKeys) {
    if (key === "activities" || JSON.stringify(before[key as keyof Prospect]) === JSON.stringify(after[key as keyof Prospect])) continue;
    if (!allowedFields.has(key)) {
      throw new Error(`Website verification proposed an unsupported ${key} change. Keep this record in manual review.`);
    }
  }
  const entries = patchFields.flatMap((field): WebsiteRepairPatchEntry[] => {
    if (JSON.stringify(before[field]) === JSON.stringify(after[field])) return [];
    if (after[field] === undefined) return [{ field, unset: true }];
    return [{ field, unset: false, value: structuredClone(after[field]) }];
  });
  const addedActivityCount = after.activities.length - before.activities.length;
  if (
    addedActivityCount < 0
    || JSON.stringify(after.activities.slice(addedActivityCount)) !== JSON.stringify(before.activities)
    || (proposedOutcome === "exclude_from_rebuild_outreach" && addedActivityCount !== 0)
  ) {
    throw new Error("Website verification proposed an unsupported activity-history change. Keep this record in manual review.");
  }
  return {
    entries,
    addedActivities: structuredClone(after.activities.slice(0, addedActivityCount)),
  };
}

function applyReviewedProspectPatch(
  prospect: Prospect,
  patch: ReviewedProspectPatch,
  proposedOutcome: ExistingWebsiteRepairRecord["proposedOutcome"],
) {
  const allowedFields = new Set<string>(proposedOutcome === "exclude_from_rebuild_outreach"
    ? websiteExclusionPatchFields
    : websiteRepairPatchFields);
  const unsettableFields = new Set<string>(["analysis", "outreach", "preview"]);
  const seen = new Set<string>();
  const updated = structuredClone(prospect);
  const writable = updated as unknown as Record<string, unknown>;
  for (const entry of patch.entries) {
    if (!entry || !allowedFields.has(entry.field) || seen.has(entry.field)) {
      throw new Error("The reviewed website-repair proposal is invalid. Run a fresh dry run.");
    }
    if (entry.unset && !unsettableFields.has(entry.field)) {
      throw new Error("The reviewed website-repair proposal contains an invalid unset operation. Run a fresh dry run.");
    }
    seen.add(entry.field);
    writable[entry.field] = entry.unset ? undefined : structuredClone(entry.value);
  }
  if (!Array.isArray(patch.addedActivities)) {
    throw new Error("The reviewed website-repair activity data is invalid. Run a fresh dry run.");
  }
  if (proposedOutcome === "exclude_from_rebuild_outreach" && patch.addedActivities.length) {
    throw new Error("Website exclusion repairs cannot modify prospect activity history. Run a fresh dry run.");
  }
  const existingActivityIds = new Set(prospect.activities.map((item) => item.id));
  if (patch.addedActivities.some((item) => !item?.id || existingActivityIds.has(item.id))) {
    throw new Error("The reviewed website-repair activity data is stale or invalid. Run a fresh dry run.");
  }
  updated.activities = [...structuredClone(patch.addedActivities), ...prospect.activities];
  if (proposedOutcome === "exclude_from_rebuild_outreach") {
    assertWebsiteExclusionPreservesContactState(prospect, updated);
  }
  return updated;
}

function repairReviewToken(snapshot: ExistingWebsiteRepairReviewSnapshot, secret: string) {
  const payload = Buffer.from(JSON.stringify(snapshot));
  if (payload.length > websiteRepairReviewPayloadMaxLength) {
    throw new Error("The reviewed website-record snapshot is too large. Run a smaller dry-run batch.");
  }
  const encodedPayload = deflateRawSync(payload, { level: 9 }).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const token = `${encodedPayload}.${signature}`;
  if (token.length > websiteRepairReviewTokenMaxLength) {
    throw new Error("The reviewed website-record snapshot is too large. Run a smaller dry-run batch.");
  }
  return token;
}

function verifiedRepairReviewSnapshot(token: string, secret: string, now: Date) {
  if (!token || token.length > websiteRepairReviewTokenMaxLength) {
    throw new Error("The reviewed website-repair snapshot is invalid. Run the dry run again.");
  }
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) {
    throw new Error("Run a fresh website-record dry run before applying repairs.");
  }
  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    throw new Error("The reviewed website-repair snapshot is invalid. Run the dry run again.");
  }
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) {
    throw new Error("The reviewed website-repair snapshot is invalid. Run the dry run again.");
  }
  let payload: Partial<ExistingWebsiteRepairReviewSnapshot>;
  try {
    const decodedPayload = inflateRawSync(Buffer.from(encodedPayload, "base64url"), {
      maxOutputLength: websiteRepairReviewPayloadMaxLength,
    });
    payload = JSON.parse(decodedPayload.toString("utf8")) as Partial<ExistingWebsiteRepairReviewSnapshot>;
  } catch {
    throw new Error("The reviewed website-repair snapshot is invalid. Run the dry run again.");
  }
  const issuedAt = Date.parse(payload.issuedAt ?? "");
  if (
    payload.version !== 3
    || !payload.selection
    || !["batch", "exact_prospect"].includes(payload.selection.scope)
    || !Number.isInteger(payload.selection.offset)
    || !Number.isInteger(payload.selection.limit)
    || payload.selection.offset < 0
    || payload.selection.limit < 1
    || payload.selection.limit > websiteRepairRequestBatchLimit
    || typeof payload.selection.prospectId !== "string"
    || !Number.isFinite(issuedAt)
    || issuedAt > now.getTime() + 60_000
    || now.getTime() - issuedAt > websiteRepairReviewMaxAgeMs
    || !payload.summary
    || !Array.isArray(payload.records)
    || payload.records.length < 1
    || payload.records.length > websiteRepairRequestBatchLimit
  ) {
    throw new Error("The reviewed website-repair snapshot expired or is invalid. Run the dry run again.");
  }
  const prospectIds = new Set<string>();
  for (const candidate of payload.records) {
    if (
      !candidate
      || typeof candidate.prospectId !== "string"
      || !candidate.prospectId
      || candidate.prospectId.length > 100
      || prospectIds.has(candidate.prospectId)
      || candidate.record?.prospectId !== candidate.prospectId
      || !/^[a-f0-9]{64}$/.test(candidate.currentProspectDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(candidate.currentQueueDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(candidate.postApplyProspectDigest ?? "")
      || (
        candidate.proposedPatch !== null
        && (
          typeof candidate.proposedPatch !== "object"
          || !Array.isArray(candidate.proposedPatch.entries)
          || !Array.isArray(candidate.proposedPatch.addedActivities)
        )
      )
    ) {
      throw new Error("The reviewed website-repair snapshot is invalid. Run the dry run again.");
    }
    prospectIds.add(candidate.prospectId);
  }
  return payload as ExistingWebsiteRepairReviewSnapshot;
}

function boundedRepairLimit(value: number | undefined) {
  const limit = value ?? websiteRepairRequestBatchSize;
  if (!Number.isInteger(limit) || limit < 1 || limit > websiteRepairRequestBatchLimit) {
    throw new Error(`Website-record audit batch size must be between 1 and ${websiteRepairRequestBatchLimit}.`);
  }
  return limit;
}

function boundedRepairOffset(value: number | undefined) {
  const offset = value ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("Website-record audit offset must be a non-negative integer.");
  }
  return offset;
}

function normalizedSelectedRepairProspectIds(values: string[] | undefined, apply: boolean) {
  if (!apply) return [];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Select at least one reviewed website record before applying repairs.");
  }
  if (values.length > websiteRepairRequestBatchLimit) {
    throw new Error("The selected website-record set exceeds the reviewed batch limit.");
  }
  const selected = values.map((value) => value.trim());
  if (selected.some((value) => !value || value.length > 100)) {
    throw new Error("A selected prospect ID is invalid.");
  }
  if (new Set(selected).size !== selected.length) {
    throw new Error("Selected prospect IDs must be unique.");
  }
  return selected;
}

function reviewedRepairQueueReason(record: ExistingWebsiteRepairRecord) {
  return record.proposedOutcome === "exclude_from_rebuild_outreach"
    ? "Current verified website fit excludes this prospect from website-rebuild outreach. Any stale approval was removed and the record remains non-sendable."
    : "Existing website/contact verification changed. Any stale approval was removed and the record returned to human review.";
}

async function queueAlreadyReflectsReviewedExclusion(
  items: OutreachQueueItem[],
  record: ExistingWebsiteRepairRecord,
) {
  if (record.proposedOutcome !== "exclude_from_rebuild_outreach") return false;
  const reason = reviewedRepairQueueReason(record);
  for (const item of items) {
    if (
      item.status !== "Needs Review"
      || Boolean(item.queuedDate)
      || Boolean(item.sentDate)
      || Boolean(item.replyStatus)
      || item.notes.includes("[auto-email-ambiguous]")
      || item.notes.includes("[auto-email-approved]")
      || item.recommendedNextAction !== "Needs Human Review"
      || !item.blockedReason.includes(reason)
      || !item.notes.includes(`Safe readiness repair: ${reason}. Approval removed when present. Nothing was sent.`)
      || await outreachQueueItemHasPersistedApproval(item)
    ) return false;
  }
  return true;
}

export async function auditExistingWebsiteRecords(input: {
  apply: boolean;
  confirmation?: string;
  dependencies?: WebsiteVerificationDependencies;
  limit?: number;
  offset?: number;
  prospectId?: string;
  reviewToken?: string;
  selectedProspectIds?: string[];
  snapshotSecret?: string;
}): Promise<ExistingWebsiteRepairReport> {
  if (input.apply && input.confirmation !== "REPAIR VERIFIED WEBSITE RECORDS") {
    throw new Error("Type REPAIR VERIFIED WEBSITE RECORDS to apply this audit.");
  }
  const exactProspectId = input.prospectId?.trim() ?? "";
  if (input.apply && exactProspectId) {
    throw new Error("Exact-prospect website audits are read-only and cannot be applied.");
  }
  if (exactProspectId.length > 100) {
    throw new Error("Prospect ID is invalid.");
  }
  const requestedSelectedProspectIds = normalizedSelectedRepairProspectIds(
    input.selectedProspectIds,
    input.apply,
  );
  const limit = exactProspectId ? 1 : boundedRepairLimit(input.limit);
  const requestedOffset = exactProspectId ? 0 : boundedRepairOffset(input.offset);
  const snapshotSecret = input.snapshotSecret ?? process.env.ENGINE_PASSWORD?.trim() ?? "";
  if (!snapshotSecret) {
    throw new Error("Website-repair review signing is not configured.");
  }
  const now = input.dependencies?.now?.() ?? new Date();

  if (input.apply) {
    const reviewed = verifiedRepairReviewSnapshot(input.reviewToken ?? "", snapshotSecret, now);
    const requestedSelection: ExistingWebsiteRepairSelection = {
      scope: "batch",
      offset: requestedOffset,
      limit,
      prospectId: "",
    };
    if (
      reviewed.selection.scope !== "batch"
      || JSON.stringify(reviewed.selection) !== JSON.stringify(requestedSelection)
    ) {
      throw new Error("The reviewed website-repair snapshot belongs to a different page or scope. Run that dry run again.");
    }
    const reviewedById = new Map(reviewed.records.map((candidate) => [candidate.prospectId, candidate]));
    for (const selectedProspectId of requestedSelectedProspectIds) {
      const candidate = reviewedById.get(selectedProspectId);
      if (!candidate) {
        throw new Error("A selected prospect is outside the signed reviewed website-record snapshot.");
      }
      if (!candidate.record.selectionEligible || candidate.record.protectedReason || !candidate.proposedPatch) {
        throw new Error(`The selected record ${candidate.record.businessName} is protected or has no reviewed mutable change.`);
      }
    }
    const requestedSelectionIds = new Set(requestedSelectedProspectIds);
    const selectedReviewed = reviewed.records.filter((candidate) => requestedSelectionIds.has(candidate.prospectId));
    const selectedProspectIds = selectedReviewed.map((candidate) => candidate.prospectId);
    const [currentProspects, queue] = await Promise.all([
      Promise.all(selectedReviewed.map((candidate) => getProspect(candidate.prospectId))),
      listOutreachQueueItemsForBackfill(),
    ]);
    const queueByProspect = new Map<string, OutreachQueueItem[]>();
    for (const item of queue) {
      queueByProspect.set(item.prospectId, [...(queueByProspect.get(item.prospectId) ?? []), item]);
    }
    const mutations = [] as Parameters<typeof applySelectedWebsiteRepairsAtomically>[0]["mutations"];
    for (const [index, candidate] of selectedReviewed.entries()) {
      const currentProspect = currentProspects[index];
      if (!currentProspect) {
        throw new Error(`The selected record ${candidate.record.businessName} changed after review. Run a fresh dry run.`);
      }
      const currentQueueItems = queueByProspect.get(candidate.prospectId) ?? [];
      const protectedReason = prospectProtectionReason(currentProspect, currentQueueItems);
      if (protectedReason) {
        throw new Error(`${candidate.record.businessName} is now protected. ${protectedReason} Run a fresh dry run.`);
      }
      const currentProspectDigest = repairProspectStateDigest(currentProspect);
      const currentQueueDigest = repairStateDigest(orderedRepairQueueSnapshot(currentQueueItems));
      const queueReason = reviewedRepairQueueReason(candidate.record);
      if (
        currentProspectDigest === candidate.postApplyProspectDigest
        && await queueAlreadyReflectsReviewedExclusion(currentQueueItems, candidate.record)
      ) {
        mutations.push({
          expectedProspect: currentProspect,
          proposedProspect: currentProspect,
          expectedQueueItems: currentQueueItems,
          queueReason,
          alreadyApplied: true,
        });
        continue;
      }
      if (currentProspectDigest !== candidate.currentProspectDigest) {
        throw new Error(`The selected record ${candidate.record.businessName} changed after review. Run a fresh dry run.`);
      }
      if (currentQueueDigest !== candidate.currentQueueDigest) {
        throw new Error(`The selected outreach queue for ${candidate.record.businessName} changed after review. Run a fresh dry run.`);
      }
      const proposedProspect = withApprovalRevoked(
        applyReviewedProspectPatch(currentProspect, candidate.proposedPatch!, candidate.record.proposedOutcome),
        true,
      );
      if (repairProspectStateDigest(proposedProspect) !== candidate.postApplyProspectDigest) {
        throw new Error("The reviewed website-repair proposal is invalid. Run a fresh dry run.");
      }
      mutations.push({
        expectedProspect: currentProspect,
        proposedProspect,
        expectedQueueItems: currentQueueItems,
        queueReason,
      });
    }
    const atomicResult = await applySelectedWebsiteRepairsAtomically({ mutations, now });
    const changedProspectIds = new Set(atomicResult.changedProspectIds);
    for (const candidate of selectedReviewed) {
      await safeRecordAudit({
        action: changedProspectIds.has(candidate.prospectId)
          ? "existing_website_record_repair"
          : "existing_website_record_repair_noop",
        outcome: "success",
        subject: candidate.record.businessName,
        metadata: {
          prospectId: candidate.prospectId,
          oldStatus: candidate.record.oldStatus,
          newStatus: candidate.record.proposedStatus,
          changedFields: candidate.record.changedFields,
          proposedOutcome: candidate.record.proposedOutcome,
          changed: changedProspectIds.has(candidate.prospectId),
          sent: 0,
        },
      });
    }
    await safeRecordAudit({
      action: "existing_website_record_audit",
      outcome: "success",
      subject: "confirmed repair",
      metadata: {
        inspected: reviewed.summary.inspected,
        selectedCount: selectedProspectIds.length,
        selectedProspectIds,
        changed: atomicResult.changedProspectIds.length,
        skippedProtected: reviewed.summary.skippedProtected,
        sent: 0,
      },
    });
    return {
      mode: "applied",
      scope: reviewed.selection.scope,
      inspected: reviewed.summary.inspected,
      candidates: reviewed.summary.candidates,
      remainingCandidates: reviewed.summary.remainingCandidates,
      offset: reviewed.selection.offset,
      batchSize: reviewed.selection.limit,
      rangeStart: reviewed.summary.rangeStart,
      rangeEnd: reviewed.summary.rangeEnd,
      currentPage: reviewed.summary.currentPage,
      totalPages: reviewed.summary.totalPages,
      previousOffset: reviewed.summary.previousOffset,
      nextOffset: reviewed.summary.nextOffset,
      exactProspectId: reviewed.summary.exactProspectId,
      selectedCount: selectedProspectIds.length,
      selectedProspectIds,
      changed: atomicResult.changedProspectIds.length,
      skippedProtected: reviewed.summary.skippedProtected,
      records: reviewed.records.map((candidate) => candidate.record),
      reviewToken: "",
      nothingSent: true,
    };
  }

  const [prospects, queue] = await Promise.all([
    listProspects(),
    listOutreachQueueItemsForBackfill(),
  ]);
  const queueByProspect = new Map<string, OutreachQueueItem[]>();
  for (const item of queue) {
    queueByProspect.set(item.prospectId, [...(queueByProspect.get(item.prospectId) ?? []), item]);
  }
  const allCandidates = prospects
    .filter((prospect) => existingRecordNeedsWebsiteAudit(prospect, queueByProspect.get(prospect.id) ?? []))
    .sort((left, right) => {
      const leftProtected = Boolean(prospectProtectionReason(left, queueByProspect.get(left.id) ?? []));
      const rightProtected = Boolean(prospectProtectionReason(right, queueByProspect.get(right.id) ?? []));
      return Number(leftProtected) - Number(rightProtected)
        || left.businessName.localeCompare(right.businessName)
        || left.id.localeCompare(right.id);
    });
  let offset = requestedOffset;
  let candidates: Prospect[];
  let selection: ExistingWebsiteRepairSelection;
  if (exactProspectId) {
    const exactIndex = allCandidates.findIndex((prospect) => prospect.id === exactProspectId);
    if (exactIndex < 0) {
      const prospectExists = prospects.some((prospect) => prospect.id === exactProspectId);
      throw new Error(prospectExists
        ? "The selected prospect is not part of the current legacy website audit inventory."
        : "Prospect was not found.");
    }
    offset = exactIndex;
    candidates = [allCandidates[exactIndex]!];
    selection = { scope: "exact_prospect", offset, limit: 1, prospectId: exactProspectId };
  } else {
    if (offset > 0 && offset >= allCandidates.length) {
      throw new Error("Website-record audit offset is outside the current candidate range.");
    }
    candidates = allCandidates.slice(offset, offset + limit);
    selection = { scope: "batch", offset, limit, prospectId: "" };
  }
  const boundedDependencies: WebsiteVerificationDependencies = {
    ...(input.dependencies ?? {}),
    maxVerificationAttempts: Math.min(
      websiteRepairAttemptLimit,
      Math.max(1, input.dependencies?.maxVerificationAttempts ?? websiteRepairAttemptLimit),
    ),
    maxContactPages: Math.min(
      websiteRepairContactPageLimit,
      Math.max(0, input.dependencies?.maxContactPages ?? websiteRepairContactPageLimit),
    ),
    requestTimeoutMs: Math.min(
      websiteRepairRequestTimeoutMs,
      Math.max(500, input.dependencies?.requestTimeoutMs ?? websiteRepairRequestTimeoutMs),
    ),
  };
  const inspected = await inspectCandidatesBounded(candidates, boundedDependencies, queueByProspect);
  const skippedProtected = inspected.filter((candidate) => Boolean(candidate.record.protectedReason)).length;
  const summary: ExistingWebsiteRepairReviewSnapshot["summary"] = {
    inspected: inspected.length,
    candidates: allCandidates.length,
    remainingCandidates: selection.scope === "batch"
      ? Math.max(0, allCandidates.length - (offset + inspected.length))
      : 0,
    rangeStart: inspected.length ? offset + 1 : 0,
    rangeEnd: offset + inspected.length,
    currentPage: selection.scope === "batch" ? Math.floor(offset / limit) + 1 : 1,
    totalPages: selection.scope === "batch" ? Math.max(1, Math.ceil(allCandidates.length / limit)) : 1,
    previousOffset: selection.scope === "batch" && offset > 0 ? Math.max(0, offset - limit) : null,
    nextOffset: selection.scope === "batch" && offset + inspected.length < allCandidates.length
      ? offset + inspected.length
      : null,
    exactProspectId,
    skippedProtected,
  };
  const reviewedSnapshot: ExistingWebsiteRepairReviewSnapshot = {
    version: 3,
    issuedAt: now.toISOString(),
    selection,
    summary,
    records: inspected.map((candidate) => {
      const queueItems = queueByProspect.get(candidate.prospect.id) ?? [];
      const proposedPatch = candidate.proposedProspect
        ? reviewedProspectPatch(
          candidate.prospect,
          candidate.proposedProspect,
          candidate.record.proposedOutcome,
        )
        : null;
      const postApplyProspect = proposedPatch
        ? withApprovalRevoked(
          applyReviewedProspectPatch(candidate.prospect, proposedPatch, candidate.record.proposedOutcome),
          true,
        )
        : candidate.prospect;
      return {
        prospectId: candidate.prospect.id,
        record: candidate.record,
        currentProspectDigest: repairProspectStateDigest(candidate.prospect),
        currentQueueDigest: repairStateDigest(orderedRepairQueueSnapshot(queueItems)),
        postApplyProspectDigest: repairProspectStateDigest(postApplyProspect),
        proposedPatch,
      };
    }),
  };
  return {
    mode: "dry_run",
    scope: selection.scope,
    inspected: summary.inspected,
    candidates: summary.candidates,
    remainingCandidates: summary.remainingCandidates,
    offset,
    batchSize: limit,
    rangeStart: summary.rangeStart,
    rangeEnd: summary.rangeEnd,
    currentPage: summary.currentPage,
    totalPages: summary.totalPages,
    previousOffset: summary.previousOffset,
    nextOffset: summary.nextOffset,
    exactProspectId,
    selectedCount: 0,
    selectedProspectIds: [],
    changed: 0,
    skippedProtected,
    records: inspected.map((candidate) => candidate.record),
    reviewToken: repairReviewToken(reviewedSnapshot, snapshotSecret),
    nothingSent: true,
  };
}
