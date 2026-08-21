import type { Prospect } from "@/lib/prospect-engine";
import {
  prospectIsBadFit,
  prospectIsContacted,
  prospectIsDuplicate,
  prospectIsSuppressed,
} from "@/lib/prospect-funnel";
import {
  boundedWebsiteReviewSignals,
  normalizeWebsiteFitDisposition,
  outreachObservationForProspect,
  outreachObservationGroundingProblems,
  prospectFreshnessAt,
  prospectQualificationBlockReasons,
  verifiedEmailEvidenceForProspect,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";

export type EmailReviewEligibility = {
  eligible: boolean;
  reasons: string[];
  reviewSignals: string[];
};

export type ProspectRoutingDecision = {
  opportunity: "Qualified" | "Needs Review" | "Not a Fit";
  email: "Ready" | "Verify Email" | "No Email";
  sending: "Strict Email Eligible" | "Review Only" | "Blocked";
};

function routingSafetyReasons(prospect: Prospect) {
  return [
    prospectIsContacted(prospect) ? `Prospect status ${prospect.status} is protected.` : "",
    prospectIsSuppressed(prospect) ? "Prospect history contains contact protection or suppression evidence." : "",
    prospectIsBadFit(prospect) ? "The prospect is inactive, blocked, or not a supported local-business fit." : "",
    prospectIsDuplicate(prospect) ? "The prospect is a duplicate." : "",
    prospect.classification === "phone_only" ? "Phone-only prospects cannot enter email routing." : "",
    prospect.recommendedContactMethod !== "send_email" ? "The current verified contact route is not public email." : "",
  ].filter(Boolean);
}

function reviewSignals(prospect: Prospect) {
  const signals: string[] = [];
  const fit = prospect.websiteVerification?.fit;
  if (fit?.observation?.statement.trim()) signals.push(fit.observation.statement.trim());
  for (const item of fit?.supportingEvidence ?? []) {
    if (/\b(?:no |missing|weak|low|limited|unclear|not found|couldn't find|did not find|requires review)\b/i.test(item)) signals.push(item.trim());
  }

  signals.push(...boundedWebsiteReviewSignals(prospect.analysis).map((signal) => signal.statement));
  return [...new Set(signals)].slice(0, 4);
}

export function prospectEmailReviewEligibility(prospect: Prospect, now = new Date()): EmailReviewEligibility {
  const fit = normalizeWebsiteFitDisposition(prospect);
  const verification = prospect.websiteVerification;
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const freshness = prospectFreshnessAt(prospect, now);
  const signals = reviewSignals(prospect);
  const observationProblems = outreachObservationGroundingProblems(outreachObservationForProspect(prospect));
  const reasons = [
    ...routingSafetyReasons(prospect),
    prospect.prospectType !== "redesign" ? "Only existing-site redesign prospects use this human-review email lane." : "",
    verification?.version !== "website-verification-v2" ? "Current structured website verification is missing." : "",
    prospect.websiteStatus !== "usable" || verification?.status !== "usable" ? "The owned website is not currently verified usable." : "",
    verification?.ownershipDecision !== "owned" ? "Website ownership is not established." : "",
    verification?.confidence !== "high" ? "Website identity/availability confidence is not high enough for review routing." : "",
    verification?.identitySignals?.includes("public_phone_conflict") ? "The verified website publishes a conflicting business phone." : "",
    fit !== "inconclusive_requires_review" ? "This lane is only for otherwise-plausible sites whose rebuild fit still needs human review." : "",
    websiteFitAllowsAutonomousOutreach(prospect) ? "The prospect already passes the stricter autonomous website-fit path." : "",
    !freshness.websiteVerificationFresh ? "Website verification is stale." : "",
    !freshness.websiteFitFresh ? "Website-fit evidence is stale." : "",
    !freshness.contactSourceFresh ? "Public contact evidence is stale." : "",
    !emailEvidence ? "No current autonomous-quality first-party public business email is saved." : "",
    !signals.length ? "No bounded website observation is strong enough to justify human redesign review." : "",
    observationProblems.length ? `The saved website observation is not review-copy ready: ${observationProblems.join(" ")}` : "",
  ].filter(Boolean);
  return { eligible: reasons.length === 0, reasons, reviewSignals: signals };
}

export function prospectRoutingDecision(prospect: Prospect, now = new Date()): ProspectRoutingDecision {
  const fit = normalizeWebsiteFitDisposition(prospect);
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const review = prospectEmailReviewEligibility(prospect, now);
  const routingBlocked = routingSafetyReasons(prospect).length > 0;
  const strictEmailEligible = !routingBlocked
    && prospectQualificationBlockReasons(prospect, { now }).length === 0
    && Boolean(emailEvidence)
    && websiteFitAllowsAutonomousOutreach(prospect);
  const notFit = prospect.inactive
    || ["national_large_brand", "duplicate_bad_fit"].includes(prospect.classification)
    || ["adequate_existing_website", "strong_existing_website"].includes(fit);

  return {
    opportunity: strictEmailEligible ? "Qualified" : notFit ? "Not a Fit" : "Needs Review",
    email: emailEvidence ? "Ready" : prospect.email.trim() ? "Verify Email" : "No Email",
    sending: strictEmailEligible ? "Strict Email Eligible" : review.eligible ? "Review Only" : "Blocked",
  };
}
