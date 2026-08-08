import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  listOutreachQueueItemsForBackfill,
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
};

export type ExistingWebsiteRepairReport = {
  mode: "dry_run" | "applied";
  inspected: number;
  candidates: number;
  remainingCandidates: number;
  changed: number;
  skippedProtected: number;
  records: ExistingWebsiteRepairRecord[];
  reviewToken: string;
  nothingSent: true;
};

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
  const fields: Array<keyof Prospect> = [
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
  ];
  return fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])).map(String);
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
  const legacyStatus = ["http_404", "unreachable_website", "broken_website", "inactive_website"].includes(prospect.websiteStatus);
  const transientDetail = transientLegacyEvidence.test(prospect.websiteStatusDetail);
  const staleContactClassification = ["phone_only", "social_only", "no_website"].includes(prospect.classification)
    || prospect.recommendedContactMethod === "needs_manual_contact_research";
  const activeUnsentInventory = !prospect.inactive
    && ["New", "Reviewed"].includes(prospect.status)
    && queueItems.some((item) => (
      activeLegacyQueueStatuses.has(item.status)
      && !item.sentDate
      && !item.replyStatus
    ));
  const outdatedActivePackage = queueItems.some((item) => (
    activeLegacyQueueStatuses.has(item.status)
    && item.outreachCopyVersion !== currentOutreachCopyVersion
  ));
  const legacyEvidenceModel = prospect.websiteVerification?.version !== "website-verification-v2";
  const incompleteEmailEvidence = Boolean(prospect.email && !verifiedEmailEvidenceForProspect(prospect));
  return Boolean(
    (prospect.website && (legacyStatus || transientDetail || staleContactClassification))
    || (activeUnsentInventory && (legacyEvidenceModel || incompleteEmailEvidence || outdatedActivePackage)),
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
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
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
      } satisfies ExistingWebsiteRepairRecord,
    };
  }
  const verified = preserveFreshRenderedFit(
    prospect,
    await verifyProspectWebsite(prospect, dependencies),
    dependencies.now?.() ?? new Date(),
  );
  const decision = legacyAuditDecision(prospect, verified.prospect, "", queueItems);
  const changedFields = changedProspectFields(prospect, verified.prospect);
  return {
    prospect,
    verified,
    record: {
      prospectId: prospect.id,
      businessName: prospect.businessName,
      currentProspectStatus: prospect.status,
      currentQueueStatuses: queueItems.map((item) => item.status),
      currentDisposition: prospect.fitDisposition,
      proposedDisposition: normalizeWebsiteFitDisposition(verified.prospect),
      oldStatus: prospect.websiteStatus,
      proposedStatus: verified.prospect.websiteStatus,
      oldEmail: prospect.email,
      proposedEmail: verified.prospect.email,
      evidence: `Stored trigger: ${prospect.websiteStatus}${prospect.websiteStatusDetail ? ` (${prospect.websiteStatusDetail})` : ""}. Recheck: ${verified.report.explanation}`,
      changedFields,
      fieldChanges: repairFieldChanges(prospect, verified.prospect),
      protectedReason: "",
      newlyFoundContactPaths: newContactPaths(prospect, verified.prospect),
      ...decision,
      productionMutationRequired: changedFields.length > 0,
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

const volatileRepairReviewKeys = new Set([
  "analyzedAt",
  "checkedAt",
  "discoveredAt",
  "durationMs",
  "foundAt",
  "timestamp",
  "updatedAt",
  "websiteAnalysisAttemptedAt",
]);

function canonicalRepairReviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalRepairReviewValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => !volatileRepairReviewKeys.has(key))
      .sort()
      .map((key) => [key, canonicalRepairReviewValue(record[key])]),
  );
}

function proposedProspectReviewValue(prospect: Prospect) {
  return Object.fromEntries(
    Object.entries(prospect).filter(([key]) => key !== "activities"),
  );
}

function repairReviewDigest(
  inspected: Array<Awaited<ReturnType<typeof inspectExistingWebsiteRepairCandidate>>>,
  queue: OutreachQueueItem[],
) {
  const snapshot = inspected.map((candidate) => ({
    record: candidate.record,
    currentProspect: candidate.prospect,
    proposedProspect: candidate.verified
      ? proposedProspectReviewValue(candidate.verified.prospect)
      : null,
    queueItems: queue.filter((item) => item.prospectId === candidate.prospect.id),
  }));
  return createHash("sha256")
    .update(JSON.stringify(canonicalRepairReviewValue(snapshot)))
    .digest("hex");
}

function repairReviewToken(digest: string, secret: string, issuedAt: Date) {
  const encodedPayload = Buffer.from(JSON.stringify({
    version: 1,
    digest,
    issuedAt: issuedAt.toISOString(),
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifiedRepairReviewDigest(token: string, secret: string, now: Date) {
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
  let payload: { version?: number; digest?: string; issuedAt?: string };
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as typeof payload;
  } catch {
    throw new Error("The reviewed website-repair snapshot is invalid. Run the dry run again.");
  }
  const issuedAt = Date.parse(payload.issuedAt ?? "");
  if (
    payload.version !== 1
    || !/^[a-f0-9]{64}$/.test(payload.digest ?? "")
    || !Number.isFinite(issuedAt)
    || issuedAt > now.getTime() + 60_000
    || now.getTime() - issuedAt > websiteRepairReviewMaxAgeMs
  ) {
    throw new Error("The reviewed website-repair snapshot expired or is invalid. Run the dry run again.");
  }
  return payload.digest!;
}

export async function auditExistingWebsiteRecords(input: {
  apply: boolean;
  confirmation?: string;
  dependencies?: WebsiteVerificationDependencies;
  limit?: number;
  reviewToken?: string;
  snapshotSecret?: string;
}): Promise<ExistingWebsiteRepairReport> {
  if (input.apply && input.confirmation !== "REPAIR VERIFIED WEBSITE RECORDS") {
    throw new Error("Type REPAIR VERIFIED WEBSITE RECORDS to apply this audit.");
  }
  const snapshotSecret = input.snapshotSecret ?? process.env.ENGINE_PASSWORD?.trim() ?? "";
  if (!snapshotSecret) {
    throw new Error("Website-repair review signing is not configured.");
  }
  const now = input.dependencies?.now?.() ?? new Date();
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
        || left.businessName.localeCompare(right.businessName);
    });
  const candidates = allCandidates.slice(0, Math.min(
      websiteRepairRequestBatchLimit,
      Math.max(1, input.limit ?? websiteRepairRequestBatchSize),
    ));
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
  const currentDigest = repairReviewDigest(inspected, queue);
  if (input.apply) {
    const reviewedDigest = verifiedRepairReviewDigest(
      input.reviewToken ?? "",
      snapshotSecret,
      now,
    );
    if (reviewedDigest !== currentDigest) {
      throw new Error("Website or contact evidence changed since the reviewed dry run. Run a fresh dry run before applying repairs.");
    }
  }
  let changed = 0;
  let skippedProtected = 0;
  if (input.apply) {
    for (const candidate of inspected) {
      if (candidate.record.protectedReason || !candidate.verified) {
        skippedProtected += 1;
        continue;
      }
      if (!candidate.record.changedFields.length) continue;
      const queueResult = await revokeStaleQueueApproval(
        candidate.prospect,
        "Existing website/contact verification changed. Any stale approval was removed and the record returned to human review.",
      );
      if (queueResult.activeQueueItems || queueResult.protectedQueueItems) {
        candidate.record.protectedReason = queueResult.activeQueueItems
          ? "An email provider attempt is in progress or awaiting reconciliation."
          : "Protected outreach or contact history exists.";
        skippedProtected += 1;
        continue;
      }
      const saved = await saveProspect(withApprovalRevoked(candidate.verified.prospect, true));
      await safeRecordAudit({
        action: "existing_website_record_repair",
        outcome: "success",
        subject: saved.businessName,
        metadata: {
          prospectId: saved.id,
          oldStatus: candidate.record.oldStatus,
          newStatus: candidate.record.proposedStatus,
          changedFields: candidate.record.changedFields,
          sent: 0,
        },
      });
      changed += 1;
    }
  } else {
    skippedProtected = inspected.filter((candidate) => Boolean(candidate.record.protectedReason)).length;
  }
  if (input.apply) {
    await safeRecordAudit({
      action: "existing_website_record_audit",
      outcome: "success",
      subject: "confirmed repair",
      metadata: {
        inspected: inspected.length,
        changed,
        skippedProtected,
        sent: 0,
      },
    });
  }
  return {
    mode: input.apply ? "applied" : "dry_run",
    inspected: inspected.length,
    candidates: allCandidates.length,
    remainingCandidates: Math.max(0, allCandidates.length - inspected.length),
    changed,
    skippedProtected,
    records: inspected.map((candidate) => candidate.record),
    reviewToken: input.apply ? "" : repairReviewToken(currentDigest, snapshotSecret, now),
    nothingSent: true,
  };
}
