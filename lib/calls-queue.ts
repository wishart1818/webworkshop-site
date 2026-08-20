import {
  activity,
  displayStateCode,
  displayTradeCategory,
  prospectPresenceLabels,
  titleCaseLocation,
  type Prospect,
} from "@/lib/prospect-engine";
import {
  explainProspectBucket,
  prospectCurrentBucket,
  prospectHasUsableWrittenContactPath,
  prospectIsBadFit,
  prospectIsContacted,
  prospectIsDuplicate,
  prospectIsPhoneOnly,
  prospectIsSuppressed,
} from "@/lib/prospect-funnel";

export type ManualCallQueueItem = {
  prospect: Prospect;
  pending: boolean;
  valueTier: "High" | "Medium" | "Watch";
  callOpportunityScore: number;
  worthCallingReasons: string[];
  noWrittenPathReasons: string[];
  nextCallAction: string;
  recommendedPitchAngle: string;
  callScript: string;
};

const resolvedCallPattern = /\b(marked called|call completed|not interested|do not contact|manual call resolved|called\b|interested\b|no further action)\b/i;
const pendingFollowUpPattern = /\b(call back|callback|no answer|try again|follow up call due)\b/i;

function prospectCallHistoryText(prospect: Prospect) {
  return [
    prospect.status,
    ...prospect.notes,
    ...prospect.activities.map((item) => item.label),
  ].join(" ");
}

export function callQueueResolutionState(prospect: Prospect) {
  const text = prospectCallHistoryText(prospect);
  if (prospectIsSuppressed(prospect) || prospect.status === "Closed Lost" || /\b(do not contact|never contact|opted out|not interested)\b/i.test(text)) return "resolved";
  if (resolvedCallPattern.test(text) || prospect.status === "Contacted" || prospect.status === "Interested") return "resolved";
  if (pendingFollowUpPattern.test(text)) return "pending";
  return "new";
}

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function manualCallOpportunityScore(prospect: Prospect) {
  const websiteNeed = prospect.fitDisposition === "no_owned_website" ? 100
    : prospect.fitDisposition === "broken_or_inactive_website" ? 92
      : prospect.fitDisposition === "clearly_weak_or_outdated_website" ? 82
        : prospect.fitDisposition === "inconclusive_requires_review" ? 55
          : ["adequate_existing_website", "strong_existing_website", "confirmed_usable_not_fit"].includes(prospect.fitDisposition) ? 0
            : prospect.classification === "phone_only" ? 55
              : 0;
  const verification = prospect.websiteVerification;
  const identityConfidence = verification?.ownershipDecision === "not_owned" && verification.confidence === "high" ? 95
    : verification?.ownershipDecision === "owned" && verification.confidence === "high" ? 92
      : verification?.ownershipDecision === "owned" || verification?.ownershipDecision === "not_owned" ? 75
        : bounded(prospect.sourceConfidence || 0);
  const activityStrength = bounded(
    (prospect.rating ? Math.min(100, prospect.rating * 20) : 40) * 0.35
    + Math.min(100, Math.log10(Math.max(1, prospect.reviewCount) + 1) * 45) * 0.25
    + Math.min(100, prospect.recentReviewCount * 18) * 0.15
    + Math.min(100, prospect.activitySignals.length * 20) * 0.1
    + Math.min(100, prospect.sourceConfidence || 0) * 0.15,
  );
  const evidenceWeightedScore = bounded(
    websiteNeed * 0.35
    + identityConfidence * 0.3
    + activityStrength * 0.25
    + bounded(prospect.priorityScore) * 0.1,
  );
  const establishedOpportunityFloor = prospect.priorityScore >= 85
    ? bounded(bounded(prospect.priorityScore) * 0.75 + activityStrength * 0.25)
    : 0;
  return Math.max(evidenceWeightedScore, establishedOpportunityFloor);
}

export function manualCallValueTier(prospect: Prospect): ManualCallQueueItem["valueTier"] {
  const score = manualCallOpportunityScore(prospect);
  if (score >= 80) return "High";
  if (score >= 68) return "Medium";
  return "Watch";
}

export function manualCallNextAction(prospect: Prospect) {
  const state = callQueueResolutionState(prospect);
  const text = prospectCallHistoryText(prospect);
  if (state === "resolved") return "No call action needed unless the operator manually reopens this record.";
  if (/\b(call back|callback)\b/i.test(text)) return "Call back manually at the agreed time, then record the outcome.";
  if (/\b(no answer|try again|follow up call due)\b/i.test(text)) return "Retry manually once if still worth calling, then close or move to research.";
  return "Call once manually and ask whether the business is open to receiving a couple website ideas. Do not text the prospect.";
}

export function applyManualCallSuppression(prospect: Prospect): Prospect {
  return {
    ...prospect,
    status: "Closed Lost",
    recommendedContactMethod: "do_not_contact",
    activities: [activity("status", "Marked Do Not Contact from Calls queue."), ...prospect.activities],
    notes: ["Calls queue: Marked Do Not Contact. Suppressed from future outreach.", ...prospect.notes],
  };
}

export function prospectCallQueueEligibility(prospect: Prospect) {
  const explanation = explainProspectBucket(prospect);
  const callOpportunityScore = manualCallOpportunityScore(prospect);
  const strongIdentity = Boolean(
    prospect.websiteVerification?.confidence === "high"
    && ["owned", "not_owned"].includes(prospect.websiteVerification.ownershipDecision ?? ""),
  ) || prospect.sourceConfidence >= 85 || Boolean(
    prospect.priorityScore >= 88
    && (prospect.reviewCount >= 20 || prospect.rating >= 4.4 || prospect.recentReviewCount >= 3 || prospect.activitySignals.length >= 2),
  );
  const activityStrong = prospect.reviewCount >= 20
    || prospect.rating >= 4.4
    || prospect.recentReviewCount >= 3
    || prospect.activitySignals.length >= 2
    || strongIdentity;
  const highOpportunity = callOpportunityScore >= 65;
  const phoneOnly = prospectIsPhoneOnly(prospect) || prospectCurrentBucket(prospect) === "phone_only";
  const disqualified = prospectIsSuppressed(prospect)
    || prospectIsContacted(prospect)
    || prospectIsBadFit(prospect)
    || prospectIsDuplicate(prospect)
    || prospect.inactive
    || prospectHasUsableWrittenContactPath(prospect)
    || prospect.websiteVerification?.identitySignals?.includes("public_phone_conflict") === true;
  const worthCallingReasons = [
    highOpportunity ? `Manual call opportunity score ${callOpportunityScore}/100.` : "",
    strongIdentity ? "Strong saved business-identity evidence." : "",
    activityStrong ? `Business activity is sufficient for manual review${prospect.rating ? ` (${prospect.rating} rating)` : ""}${prospect.reviewCount ? `, ${prospect.reviewCount} reviews` : ""}.` : "",
    prospect.fitDisposition === "no_owned_website" ? "Verified no-owned-website opportunity." : "",
    prospect.serviceArea ? `Service area recorded: ${prospect.serviceArea}.` : "",
  ].filter(Boolean);
  const noWrittenPathReasons = [
    !explanation.contactPaths.email ? "No public business email found." : "",
    !explanation.contactPaths.facebook ? "No usable Facebook DM path found." : "",
    !explanation.contactPaths.instagram ? "No usable Instagram DM path found." : "",
    !explanation.contactPaths.contactForm && !explanation.contactPaths.quoteForm ? "No contact or quote form found." : "",
    prospect.phone ? "Phone is the only recorded contact path." : "No usable phone number recorded.",
  ].filter(Boolean);

  return {
    eligible: Boolean(phoneOnly && highOpportunity && activityStrong && strongIdentity && !disqualified && prospect.phone),
    phoneOnly,
    highOpportunity,
    activityStrong,
    strongIdentity,
    disqualified,
    callOpportunityScore,
    worthCallingReasons,
    noWrittenPathReasons,
  };
}

export function manualCallQueueItem(prospect: Prospect): ManualCallQueueItem | null {
  const eligibility = prospectCallQueueEligibility(prospect);
  if (!eligibility.eligible) return null;
  const city = titleCaseLocation(prospect.city);
  const state = displayStateCode(prospect.state);
  const trade = displayTradeCategory(prospect.trade).toLowerCase();
  const pitch = `Lead with a short permission-first offer: you found a plausible ${trade} website opportunity and have a couple ideas. Ask whether they want the ideas sent over; do not imply a preview is already built.`;
  return {
    prospect,
    pending: callQueueResolutionState(prospect) !== "resolved",
    valueTier: manualCallValueTier(prospect),
    callOpportunityScore: eligibility.callOpportunityScore,
    worthCallingReasons: eligibility.worthCallingReasons,
    noWrittenPathReasons: eligibility.noWrittenPathReasons,
    nextCallAction: manualCallNextAction(prospect),
    recommendedPitchAngle: pitch,
    callScript: [
      `Hi, is this ${prospect.businessName}? This is Brendan with WebWorkshop.`,
      "",
      `I was looking at ${trade} businesses around ${city}, ${state} and had a couple ideas for improving the website or online presence and making the next step easier for customers.`,
      "",
      "Would you be open to me sending those ideas over to the best email or business page?",
    ].join("\n"),
  };
}

export function buildManualCallsQueue(prospects: Prospect[]) {
  return prospects
    .map(manualCallQueueItem)
    .filter((item): item is ManualCallQueueItem => Boolean(item))
    .sort((left, right) => right.callOpportunityScore - left.callOpportunityScore);
}

export function pendingManualCallsCount(prospects: Prospect[]) {
  return buildManualCallsQueue(prospects).filter((item) => item.pending).length;
}

export function callQueueSummaryLabels(prospect: Prospect) {
  return prospectPresenceLabels(prospect).filter((label) => /phone|manual|website|broken|no website/i.test(label)).slice(0, 4);
}
