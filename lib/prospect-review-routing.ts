import type { Prospect, WebsiteFitObservation } from "@/lib/prospect-engine";
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
  type BoundedWebsiteReviewSignal,
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

const commercialReviewSignalKeys = new Set<BoundedWebsiteReviewSignal["key"]>([
  "contact_accessibility",
  "cta_strength",
  "conversion_readiness",
]);

export function adequateWebsiteCommercialReviewSignals(prospect: Prospect) {
  if (normalizeWebsiteFitDisposition(prospect) !== "adequate_existing_website") return [];
  const signals = boundedWebsiteReviewSignals(prospect.analysis);
  return signals.length >= 2 && signals.some((signal) => commercialReviewSignalKeys.has(signal.key))
    ? signals
    : [];
}

export function reviewOnlyOutreachObservationForProspect(prospect: Prospect): WebsiteFitObservation | null {
  if (normalizeWebsiteFitDisposition(prospect) !== "adequate_existing_website") {
    return outreachObservationForProspect(prospect);
  }
  const signals = adequateWebsiteCommercialReviewSignals(prospect);
  const primary = signals.find((signal) => commercialReviewSignalKeys.has(signal.key));
  if (!primary) return null;

  const copy = primary.key === "contact_accessibility"
    ? {
        statement: "I took a look at your website and had a couple of ideas around making the customer contact or quote path a little clearer.",
        rebuildSentence: "I can rebuild your current website with a more focused contact and quote path while keeping your services and contact information easy for customers to find.",
        checklist: "Show a clearer customer contact and quote path in the proposed direction.",
      }
    : primary.key === "cta_strength"
      ? {
          statement: "I took a look at your website and had a couple of ideas around making the next step for customers a little clearer.",
          rebuildSentence: "I can rebuild your current website with clearer calls to action and an easier path to contact the business or request a quote.",
          checklist: "Show clearer primary calls to action and the next customer step.",
        }
      : {
          statement: "I took a look at your website and had a couple of ideas around simplifying the path from service information to getting in touch.",
          rebuildSentence: "I can rebuild your current website with a clearer path from service details to contacting the business or requesting a quote.",
          checklist: "Show a clearer path from service information to a customer inquiry.",
        };

  return {
    kind: "general_rebuild",
    statement: copy.statement,
    rebuildSentence: copy.rebuildSentence,
    evidence: signals.map((signal) => signal.statement),
    demoChecklist: [copy.checklist],
  };
}

export function reviewOnlyOutreachObservationSupported(prospect: Prospect, body: string) {
  const observation = reviewOnlyOutreachObservationForProspect(prospect);
  if (!observation || outreachObservationGroundingProblems(observation).length) return false;
  const normalizedBody = body.replace(/\s+/g, " ").toLowerCase();
  return normalizedBody.includes(observation.statement.replace(/\s+/g, " ").toLowerCase())
    && normalizedBody.includes(observation.rebuildSentence.replace(/\s+/g, " ").toLowerCase());
}

function reviewSignals(prospect: Prospect) {
  const commercialSignals = adequateWebsiteCommercialReviewSignals(prospect);
  if (normalizeWebsiteFitDisposition(prospect) === "adequate_existing_website") {
    return commercialSignals.map((signal) => signal.statement).slice(0, 4);
  }
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
  const commercialSignals = adequateWebsiteCommercialReviewSignals(prospect);
  const reviewFitEligible = fit === "inconclusive_requires_review"
    || (fit === "adequate_existing_website" && commercialSignals.length >= 2);
  const observationProblems = outreachObservationGroundingProblems(reviewOnlyOutreachObservationForProspect(prospect));
  const reasons = [
    ...routingSafetyReasons(prospect),
    prospect.prospectType !== "redesign" ? "Only existing-site redesign prospects use this human-review email lane." : "",
    verification?.version !== "website-verification-v2" ? "Current structured website verification is missing." : "",
    prospect.websiteStatus !== "usable" || verification?.status !== "usable" ? "The owned website is not currently verified usable." : "",
    verification?.ownershipDecision !== "owned" ? "Website ownership is not established." : "",
    verification?.confidence !== "high" ? "Website identity/availability confidence is not high enough for review routing." : "",
    verification?.identitySignals?.includes("public_phone_conflict") ? "The verified website publishes a conflicting business phone." : "",
    !reviewFitEligible ? "This lane requires either inconclusive rebuild fit or an adequate site with at least two bounded commercial-review signals, including contact, CTA, or conversion evidence." : "",
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
    || fit === "strong_existing_website"
    || (fit === "adequate_existing_website" && !review.eligible);

  return {
    opportunity: strictEmailEligible ? "Qualified" : review.eligible ? "Needs Review" : notFit ? "Not a Fit" : "Needs Review",
    email: emailEvidence ? "Ready" : prospect.email.trim() ? "Verify Email" : "No Email",
    sending: strictEmailEligible ? "Strict Email Eligible" : review.eligible ? "Review Only" : "Blocked",
  };
}
