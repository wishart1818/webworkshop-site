import {
  listOutreachQueueItemsForBackfill,
  repairOutreachQueueItemForReadiness,
  safeReadinessRepairProtectionReason,
} from "@/lib/autonomous-growth-repository";
import { outreachHistoryTextIndicatesProtectedContact, type OutreachQueueItem } from "@/lib/autonomous-growth";
import { activity, type Prospect, type WebsiteVerificationReport } from "@/lib/prospect-engine";
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
  oldStatus: Prospect["websiteStatus"];
  proposedStatus: Prospect["websiteStatus"];
  oldEmail: string;
  proposedEmail: string;
  evidence: string;
  changedFields: string[];
  fieldChanges: Array<{ field: string; oldValue: string; proposedValue: string }>;
  protectedReason: string;
  newlyFoundContactPaths: string[];
};

export type ExistingWebsiteRepairReport = {
  mode: "dry_run" | "applied";
  inspected: number;
  changed: number;
  skippedProtected: number;
  records: ExistingWebsiteRepairRecord[];
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
  const activeItems = matchingItems.filter((item) => (
    item.status === "Sending"
    || item.notes.includes("[auto-email-ambiguous]")
  ));
  if (activeItems.length) {
    return {
      approvalsRevoked: 0,
      protectedQueueItems: matchingItems.length,
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

export async function recheckProspectWebsite(
  prospectId: string,
  dependencies: WebsiteVerificationDependencies = {},
): Promise<WebsiteRecheckResult> {
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect was not found.");
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

export async function confirmUsableWebsiteNotFit(prospectId: string, confirmed: boolean) {
  if (!confirmed) throw new Error("Confirmation is required.");
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect was not found.");
  if (prospect.websiteStatus !== "usable" || prospect.websiteVerification?.status !== "usable") {
    throw new Error("Only a currently verified usable website can receive this disposition.");
  }
  if (protectedProspectStatuses.has(prospect.status)) {
    throw new Error("Previously contacted or closed prospects cannot be changed by this fit action.");
  }
  const queueResult = await revokeStaleQueueApproval(
    prospect,
    "Operator confirmed a usable established website is not a fit for the current offer.",
  );
  ensureNoProtectedQueueMutation(queueResult);
  const saved = await saveProspect(withApprovalRevoked({
    ...prospect,
    fitDisposition: "confirmed_usable_not_fit",
    activities: [
      activity("status", "Operator confirmed the usable website is not a fit for the current offer. No contact was recorded and nothing was sent."),
      ...prospect.activities,
    ],
  }, true));
  await safeRecordAudit({
    action: "prospect_fit_disposition",
    outcome: "success",
    subject: prospect.businessName,
    metadata: {
      prospectId,
      disposition: "confirmed_usable_not_fit",
      approvalsRevoked: queueResult.approvalsRevoked,
      contacted: false,
      sent: 0,
    },
  });
  return { prospect: saved, ...queueResult, nothingSent: true as const };
}

function existingRecordNeedsWebsiteAudit(prospect: Prospect) {
  const legacyStatus = ["http_404", "unreachable_website", "broken_website", "inactive_website"].includes(prospect.websiteStatus);
  const transientDetail = transientLegacyEvidence.test(prospect.websiteStatusDetail);
  const staleContactClassification = ["phone_only", "social_only", "no_website"].includes(prospect.classification)
    || prospect.recommendedContactMethod === "needs_manual_contact_research";
  return Boolean(prospect.website && (legacyStatus || transientDetail || staleContactClassification));
}

async function inspectExistingWebsiteRepairCandidate(
  prospect: Prospect,
  dependencies: WebsiteVerificationDependencies,
  queueItems: OutreachQueueItem[],
) {
  const protectedReason = prospectProtectionReason(prospect, queueItems);
  if (protectedReason) {
    return {
      prospect,
      verified: null,
      record: {
        prospectId: prospect.id,
        businessName: prospect.businessName,
        oldStatus: prospect.websiteStatus,
        proposedStatus: prospect.websiteStatus,
        oldEmail: prospect.email,
        proposedEmail: prospect.email,
        evidence: prospect.websiteStatusDetail || "Stored legacy classification.",
        changedFields: [],
        fieldChanges: [],
        protectedReason,
        newlyFoundContactPaths: [],
      } satisfies ExistingWebsiteRepairRecord,
    };
  }
  const verified = await verifyProspectWebsite(prospect, dependencies);
  return {
    prospect,
    verified,
    record: {
      prospectId: prospect.id,
      businessName: prospect.businessName,
      oldStatus: prospect.websiteStatus,
      proposedStatus: verified.prospect.websiteStatus,
      oldEmail: prospect.email,
      proposedEmail: verified.prospect.email,
      evidence: `Stored trigger: ${prospect.websiteStatus}${prospect.websiteStatusDetail ? ` (${prospect.websiteStatusDetail})` : ""}. Recheck: ${verified.report.explanation}`,
      changedFields: changedProspectFields(prospect, verified.prospect),
      fieldChanges: repairFieldChanges(prospect, verified.prospect),
      protectedReason: "",
      newlyFoundContactPaths: newContactPaths(prospect, verified.prospect),
    } satisfies ExistingWebsiteRepairRecord,
  };
}

export async function auditExistingWebsiteRecords(input: {
  apply: boolean;
  confirmation?: string;
  dependencies?: WebsiteVerificationDependencies;
  limit?: number;
}): Promise<ExistingWebsiteRepairReport> {
  if (input.apply && input.confirmation !== "REPAIR VERIFIED WEBSITE RECORDS") {
    throw new Error("Type REPAIR VERIFIED WEBSITE RECORDS to apply this audit.");
  }
  const candidates = (await listProspects()).filter(existingRecordNeedsWebsiteAudit).slice(0, Math.min(25, Math.max(1, input.limit ?? 15)));
  const queue = await listOutreachQueueItemsForBackfill();
  const inspected = [];
  for (const prospect of candidates) {
    inspected.push(await inspectExistingWebsiteRepairCandidate(
      prospect,
      input.dependencies ?? {},
      queue.filter((item) => item.prospectId === prospect.id),
    ));
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
  await safeRecordAudit({
    action: "existing_website_record_audit",
    outcome: "success",
    subject: input.apply ? "confirmed repair" : "dry run",
    metadata: {
      inspected: inspected.length,
      changed,
      skippedProtected,
      sent: 0,
    },
  });
  return {
    mode: input.apply ? "applied" : "dry_run",
    inspected: inspected.length,
    changed,
    skippedProtected,
    records: inspected.map((candidate) => candidate.record),
    nothingSent: true,
  };
}
