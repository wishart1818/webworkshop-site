import { outreachHistoryTextIndicatesProtectedContact, type OutreachQueueItem } from "@/lib/autonomous-growth";
import type { Prospect } from "@/lib/prospect-engine";
import {
  normalizeWebsiteFitDisposition,
  outreachObservationForProspect,
  prospectFreshnessAt,
  prospectQualificationBlockReasons,
  verifiedContactFirstNameForProspect,
  verifiedEmailEvidenceForProspect,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";

const protectedQueueStatuses = new Set([
  "Sending",
  "Sent",
  "Replied",
  "Positive Reply",
  "Won",
  "Lost",
  "Not Interested",
  "Opted Out",
  "Bounced",
  "Complained",
  "Suppressed",
  "Never Contact",
]);

export type ProspectQualificationAuditRecord = {
  businessName: string;
  prospectId: string;
  queuePackageIds: string[];
  currentStatus: string;
  currentDecision: string;
  proposedDecision: "Eligible after review" | "Blocked" | "Manual review only" | "Protected history";
  exactReasons: string[];
  evidence: string[];
  categories: string[];
  productionMutationRequired: boolean;
};

export type ProspectQualificationAuditReport = {
  mode: "read_only";
  inspected: number;
  activeUnsent: number;
  eligibleAfterReview: number;
  blocked: number;
  manualReviewOnly: number;
  protectedHistory: number;
  records: ProspectQualificationAuditRecord[];
  nothingChanged: true;
  outreachSent: 0;
};

function queueHistoryProtected(items: OutreachQueueItem[]) {
  return items.some((item) => (
    Boolean(item.sentDate)
    || Boolean(item.replyStatus)
    || protectedQueueStatuses.has(item.status)
    || item.notes.includes("[auto-email-ambiguous]")
    || outreachHistoryTextIndicatesProtectedContact(`${item.blockedReason}\n${item.notes}`)
  ));
}

function auditCategories(prospect: Prospect, reasons: string[]) {
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const fit = normalizeWebsiteFitDisposition(prospect);
  const observation = outreachObservationForProspect(prospect);
  const greetingVerified = verifiedContactFirstNameForProspect(prospect);
  return [
    ["adequate_existing_website", "strong_existing_website"].includes(fit) ? "adequate_or_strong_website" : "",
    fit === "inconclusive_requires_review" ? "inconclusive_website_fit" : "",
    prospect.websiteVerification?.ownershipDecision !== "owned" && fit !== "no_owned_website" ? "website_identity_or_domain_uncertain" : "",
    prospect.email && /@(gmail|yahoo|outlook|hotmail|aol|icloud|proton(?:mail)?)\./i.test(prospect.email) ? "free_domain_email" : "",
    prospect.email && !emailEvidence?.sourceUrl ? "missing_email_source_url" : "",
    prospect.email && emailEvidence?.decision !== "autonomous_eligible" ? "email_manual_or_rejected" : "",
    prospect.contactPersonName && !greetingVerified ? "unverified_person_greeting_blocked" : "",
    prospect.outreach && !observation ? "generic_or_unsupported_outreach" : "",
    prospect.outreach && observation && !prospect.outreach.concise.includes(observation.statement) ? "email_claim_lacks_saved_evidence" : "",
    prospect.outreach && observation && !observation.demoChecklist.length ? "claim_not_mapped_to_demo" : "",
    reasons.some((reason) => /stale|outdated/i.test(reason)) ? "stale_verification_or_copy" : "",
  ].filter(Boolean);
}

export function buildActiveProspectQualificationAudit(
  prospects: Prospect[],
  queue: OutreachQueueItem[],
  now = new Date(),
): ProspectQualificationAuditReport {
  const records = prospects.flatMap((prospect): ProspectQualificationAuditRecord[] => {
    const matchingQueue = queue.filter((item) => item.prospectId === prospect.id);
    const protectedHistory = !["New", "Reviewed"].includes(prospect.status) || queueHistoryProtected(matchingQueue);
    const activeUnsent = !prospect.inactive && !protectedHistory;
    if (!activeUnsent && !protectedHistory) return [];
    const reasons = protectedHistory
      ? ["Persisted prospect or queue history shows prior contact, a terminal state, suppression, or an ambiguous provider outcome."]
      : prospectQualificationBlockReasons(prospect, { now });
    const fit = normalizeWebsiteFitDisposition(prospect);
    const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
    const currentDecision = `${prospect.fitDisposition}; ${prospect.recommendedContactMethod}; ${prospect.status}`;
    const proposedDecision = protectedHistory
      ? "Protected history" as const
      : ["adequate_existing_website", "strong_existing_website"].includes(fit)
        ? "Blocked" as const
        : reasons.length || !emailEvidence || !websiteFitAllowsAutonomousOutreach(prospect)
          ? "Manual review only" as const
          : "Eligible after review" as const;
    const observation = outreachObservationForProspect(prospect);
    const freshness = prospectFreshnessAt(prospect, now);
    const evidence = [
      prospect.websiteVerification?.fit?.reason ?? "No evidence-backed website-fit reason is saved.",
      prospect.websiteVerification?.identityEvidence?.join(" ") ?? "No website identity evidence is saved.",
      emailEvidence
        ? `Email source: ${emailEvidence.sourceUrl}; ${emailEvidence.extractionMethod}; ${emailEvidence.decisionReason ?? emailEvidence.confidence}.`
        : prospect.email ? "The stored email lacks autonomous-quality first-party evidence." : "No public email is stored.",
      observation ? `Saved outreach observation: ${observation.statement}` : "No supported outreach observation is saved.",
      freshness.staleReason,
    ].filter(Boolean);
    return [{
      businessName: prospect.businessName,
      prospectId: prospect.id,
      queuePackageIds: matchingQueue.map((item) => item.id),
      currentStatus: prospect.status,
      currentDecision,
      proposedDecision,
      exactReasons: reasons.length ? reasons : ["Saved evidence passes the new qualification rules; human approval is still required."],
      evidence,
      categories: auditCategories(prospect, reasons),
      productionMutationRequired: !protectedHistory && proposedDecision !== "Eligible after review",
    }];
  });
  return {
    mode: "read_only",
    inspected: prospects.length,
    activeUnsent: records.filter((record) => record.proposedDecision !== "Protected history").length,
    eligibleAfterReview: records.filter((record) => record.proposedDecision === "Eligible after review").length,
    blocked: records.filter((record) => record.proposedDecision === "Blocked").length,
    manualReviewOnly: records.filter((record) => record.proposedDecision === "Manual review only").length,
    protectedHistory: records.filter((record) => record.proposedDecision === "Protected history").length,
    records,
    nothingChanged: true,
    outreachSent: 0,
  };
}
