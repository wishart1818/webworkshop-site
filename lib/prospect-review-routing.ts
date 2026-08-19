import type { Prospect } from "@/lib/prospect-engine";
import {
  normalizeWebsiteFitDisposition,
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
  sending: "Auto Eligible" | "Approval Required" | "Blocked";
};

function reviewSignals(prospect: Prospect) {
  const signals: string[] = [];
  const fit = prospect.websiteVerification?.fit;
  if (fit?.observation?.statement.trim()) signals.push(fit.observation.statement.trim());
  for (const item of fit?.supportingEvidence ?? []) {
    if (/\b(?:no |missing|weak|low|limited|unclear|not found|couldn't find|did not find|requires review)\b/i.test(item)) signals.push(item.trim());
  }

  const scores = prospect.analysis?.scores;
  if (scores) {
    const bounded: Array<[number, number, string]> = [
      [scores.contactAccessibility, 60, `Contact accessibility scored ${scores.contactAccessibility}/100.`],
      [scores.ctaStrength, 60, `Call-to-action strength scored ${scores.ctaStrength}/100.`],
      [scores.conversionReadiness, 55, `Conversion readiness scored ${scores.conversionReadiness}/100.`],
      [scores.portfolioQuality, 45, `Project/portfolio proof scored ${scores.portfolioQuality}/100.`],
      [scores.trustSignals, 45, `Visible trust signals scored ${scores.trustSignals}/100.`],
      [scores.technicalQuality, 50, `Technical page signals scored ${scores.technicalQuality}/100.`],
    ];
    for (const [score, maximum, statement] of bounded) {
      if (score <= maximum) signals.push(statement);
    }
  }
  return [...new Set(signals)].slice(0, 4);
}

export function prospectEmailReviewEligibility(prospect: Prospect, now = new Date()): EmailReviewEligibility {
  const fit = normalizeWebsiteFitDisposition(prospect);
  const verification = prospect.websiteVerification;
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const freshness = prospectFreshnessAt(prospect, now);
  const signals = reviewSignals(prospect);
  const reasons = [
    prospect.prospectType !== "redesign" ? "Only existing-site redesign prospects use this human-review email lane." : "",
    prospect.inactive ? "The business is inactive." : "",
    ["national_large_brand", "duplicate_bad_fit"].includes(prospect.classification) ? "The prospect classification is blocked." : "",
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
  ].filter(Boolean);
  return { eligible: reasons.length === 0, reasons, reviewSignals: signals };
}

export function prospectRoutingDecision(prospect: Prospect, now = new Date()): ProspectRoutingDecision {
  const fit = normalizeWebsiteFitDisposition(prospect);
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const review = prospectEmailReviewEligibility(prospect, now);
  const strictAuto = prospectQualificationBlockReasons(prospect, { now }).length === 0
    && Boolean(emailEvidence)
    && websiteFitAllowsAutonomousOutreach(prospect);
  const notFit = prospect.inactive
    || ["national_large_brand", "duplicate_bad_fit"].includes(prospect.classification)
    || ["adequate_existing_website", "strong_existing_website"].includes(fit);

  return {
    opportunity: strictAuto ? "Qualified" : notFit ? "Not a Fit" : "Needs Review",
    email: emailEvidence ? "Ready" : prospect.email.trim() ? "Verify Email" : "No Email",
    sending: strictAuto ? "Auto Eligible" : review.eligible ? "Approval Required" : "Blocked",
  };
}
