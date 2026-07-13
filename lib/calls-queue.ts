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

export function manualCallValueTier(prospect: Prospect): ManualCallQueueItem["valueTier"] {
  if (prospect.priorityScore >= 92 || prospect.reviewCount >= 75 || prospect.rating >= 4.7) return "High";
  if (prospect.priorityScore >= 88 || prospect.reviewCount >= 35 || prospect.rating >= 4.5) return "Medium";
  return "Watch";
}

export function manualCallNextAction(prospect: Prospect) {
  const state = callQueueResolutionState(prospect);
  const text = prospectCallHistoryText(prospect);
  if (state === "resolved") return "No call action needed unless the operator manually reopens this record.";
  if (/\b(call back|callback)\b/i.test(text)) return "Call back manually at the agreed time, then record the outcome.";
  if (/\b(no answer|try again|follow up call due)\b/i.test(text)) return "Retry manually once if still worth calling, then close or move to research.";
  return "Call once manually and ask for the best written contact path. Do not text the prospect.";
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
    valueTier: manualCallValueTier(prospect),
    worthCallingReasons: eligibility.worthCallingReasons,
    noWrittenPathReasons: eligibility.noWrittenPathReasons,
    nextCallAction: manualCallNextAction(prospect),
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
