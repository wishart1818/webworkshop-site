import {
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
  worthCallingReasons: string[];
  noWrittenPathReasons: string[];
  recommendedPitchAngle: string;
  callScript: string;
};

const resolvedCallPattern = /\b(marked called|call completed|not interested|do not contact|manual call resolved|called\b|interested\b)/i;
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
  if (pendingFollowUpPattern.test(text)) return "pending";
  if (resolvedCallPattern.test(text) || prospect.status === "Contacted" || prospect.status === "Interested") return "resolved";
  return "new";
}

export function prospectCallQueueEligibility(prospect: Prospect) {
  const explanation = explainProspectBucket(prospect);
  const activityStrong = prospect.reviewCount >= 20 || prospect.rating >= 4.4 || prospect.recentReviewCount >= 3 || prospect.activitySignals.length >= 2;
  const highOpportunity = prospect.priorityScore >= 85;
  const phoneOnly = prospectIsPhoneOnly(prospect) || prospectCurrentBucket(prospect) === "phone_only";
  const disqualified = prospectIsSuppressed(prospect)
    || prospectIsContacted(prospect)
    || prospectIsBadFit(prospect)
    || prospectIsDuplicate(prospect)
    || prospect.inactive
    || prospectHasUsableWrittenContactPath(prospect);
  const worthCallingReasons = [
    highOpportunity ? `High opportunity score (${prospect.priorityScore}).` : "",
    activityStrong ? `Strong activity signal: ${prospect.rating ? `${prospect.rating} rating` : "active business"}${prospect.reviewCount ? `, ${prospect.reviewCount} reviews` : ""}.` : "",
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
    eligible: Boolean(phoneOnly && highOpportunity && activityStrong && !disqualified && prospect.phone),
    phoneOnly,
    highOpportunity,
    activityStrong,
    disqualified,
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
  const pitch = `Lead with a short, manual offer: WebWorkshop made a cleaner ${trade} website preview that could help make calls and quote requests easier. Ask permission before sending anything.`;
  return {
    prospect,
    pending: callQueueResolutionState(prospect) !== "resolved",
    worthCallingReasons: eligibility.worthCallingReasons,
    noWrittenPathReasons: eligibility.noWrittenPathReasons,
    recommendedPitchAngle: pitch,
    callScript: [
      `Hi, is this ${prospect.businessName}? This is Brendan with WebWorkshop.`,
      "",
      `I was looking at ${trade} businesses around ${city}, ${state}. I could not find a good written contact path, so I wanted to ask quickly before sending anything.`,
      "",
      "I put together a quick website preview showing how the page could look cleaner and help get you more calls and quote requests.",
      "",
      "Would you want me to send it to the best email or Facebook page for the business?",
    ].join("\n"),
  };
}

export function buildManualCallsQueue(prospects: Prospect[]) {
  return prospects
    .map(manualCallQueueItem)
    .filter((item): item is ManualCallQueueItem => Boolean(item))
    .sort((left, right) => right.prospect.priorityScore - left.prospect.priorityScore);
}

export function pendingManualCallsCount(prospects: Prospect[]) {
  return buildManualCallsQueue(prospects).filter((item) => item.pending).length;
}

export function callQueueSummaryLabels(prospect: Prospect) {
  return prospectPresenceLabels(prospect).filter((label) => /phone|manual|website|broken|no website/i.test(label)).slice(0, 4);
}
