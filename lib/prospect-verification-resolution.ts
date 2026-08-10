import type { Prospect, WebsiteVerificationReport } from "@/lib/prospect-engine";
import {
  normalizeWebsiteFitDisposition,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";
import {
  affirmativeFirstPartyIdentity,
  isCredibleOwnedWebsiteCandidate,
  providerOwnedWebsiteCandidates,
} from "@/lib/prospect-identity-evidence";
import {
  verifyProspectWebsite,
  type ProspectWebsiteVerificationResult,
  type WebsiteVerificationDependencies,
} from "@/lib/site-analysis";

export const manualReviewTriageReasonCodes = [
  "SAFE_VERIFIED_WEBSITE_EXCLUSION",
  "VERIFIED_REBUILD_OPPORTUNITY",
  "CRAWLER_BLOCKED",
  "CRAWLER_TIMEOUT_OR_TRANSIENT_FAILURE",
  "WEBSITE_VERIFICATION_INCONCLUSIVE",
  "WEBSITE_FIT_REQUIRES_REVIEW",
  "IDENTITY_AMBIGUOUS",
  "SAME_NAME_AMBIGUOUS",
  "STORED_DOMAIN_CANONICAL_MISMATCH",
  "THIRD_PARTY_OR_DIRECTORY_DOMAIN",
  "PROVIDER_WEBSITE_CONFLICT",
  "FIRST_PARTY_OWNERSHIP_INCOMPLETE",
  "LIKELY_ADEQUATE_SITE_EVIDENCE_INCOMPLETE",
  "LIKELY_WEAK_SITE_EVIDENCE_INCOMPLETE",
  "LIKELY_NO_SITE_EVIDENCE_INCOMPLETE",
  "CONTACT_EVIDENCE_INCOMPLETE",
  "WRITTEN_CONTACT_PATH_UNAVAILABLE",
  "STALE_OR_CONFLICTING_EVIDENCE",
  "PROTECTED",
  "OTHER_MANUAL",
] as const;

export type ManualReviewTriageReasonCode = (typeof manualReviewTriageReasonCodes)[number];
export type ManualReviewTriageOutcome = "safe_exclusion" | "reviewable_rebuild_opportunity" | "still_manual" | "protected_ineligible";

export type SharedProspectVerificationResolution = {
  result: ProspectWebsiteVerificationResult;
  initialResult: ProspectWebsiteVerificationResult;
  secondPassAttempted: boolean;
  candidateUrlsConsidered: string[];
  reasonCode: ManualReviewTriageReasonCode;
  outcome: Exclude<ManualReviewTriageOutcome, "protected_ineligible">;
  explanation: string;
};

export function mergeResolvedWebsiteEvidence(
  existing: Prospect,
  resolved: Prospect,
): Prospect {
  return {
    ...existing,
    website: resolved.website,
    websiteStatus: resolved.websiteStatus,
    websiteStatusDetail: resolved.websiteStatusDetail,
    websiteVerification: resolved.websiteVerification
      ? structuredClone(resolved.websiteVerification)
      : undefined,
    websiteAnalysisAttemptedAt: resolved.websiteAnalysisAttemptedAt,
    analysis: resolved.analysis ? structuredClone(resolved.analysis) : existing.analysis,
    fitDisposition: normalizeWebsiteFitDisposition(resolved),
    priorityScore: resolved.priorityScore,
    outreach: resolved.outreach ? structuredClone(resolved.outreach) : resolved.outreach,
    preview: resolved.preview ? structuredClone(resolved.preview) : resolved.preview,
    activities: structuredClone(resolved.activities),
  };
}

function normalizedHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safelyResolved(result: ProspectWebsiteVerificationResult) {
  const disposition = normalizeWebsiteFitDisposition(result.prospect);
  if (["adequate_existing_website", "strong_existing_website"].includes(disposition)) {
    return result.report.version === "website-verification-v2"
      && result.report.status === "usable"
      && result.report.confidence === "high"
      && result.report.fit?.confidence === "high"
      && affirmativeFirstPartyIdentity(result.report.identitySignals);
  }
  if (disposition === "no_owned_website") {
    return result.report.status === "no_owned_website"
      && result.report.confidence === "high"
      && result.report.ownershipDecision === "not_owned";
  }
  return websiteFitAllowsAutonomousOutreach(result.prospect);
}

function resolutionOutcome(result: ProspectWebsiteVerificationResult): SharedProspectVerificationResolution["outcome"] {
  const disposition = normalizeWebsiteFitDisposition(result.prospect);
  if (["adequate_existing_website", "strong_existing_website"].includes(disposition) && safelyResolved(result)) {
    return "safe_exclusion";
  }
  if (websiteFitAllowsAutonomousOutreach(result.prospect)) return "reviewable_rebuild_opportunity";
  return "still_manual";
}

function resolutionReasonCode(result: ProspectWebsiteVerificationResult): ManualReviewTriageReasonCode {
  const outcome = resolutionOutcome(result);
  if (outcome === "safe_exclusion") return "SAFE_VERIFIED_WEBSITE_EXCLUSION";
  if (outcome === "reviewable_rebuild_opportunity") return "VERIFIED_REBUILD_OPPORTUNITY";
  return unresolvedWebsiteReason(result.prospect);
}

export function unresolvedWebsiteReason(prospect: Prospect): ManualReviewTriageReasonCode {
  if (prospect.activitySignals.includes("discovery_identity_conflict:same_name")) return "SAME_NAME_AMBIGUOUS";
  const report = prospect.websiteVerification;
  if (report?.status === "crawler_blocked") return "CRAWLER_BLOCKED";
  if (report?.status === "temporarily_unavailable") return "CRAWLER_TIMEOUT_OR_TRANSIENT_FAILURE";
  if (report?.status === "invalid_website") return "WEBSITE_VERIFICATION_INCONCLUSIVE";
  if (!prospect.website.trim() && normalizeWebsiteFitDisposition(prospect) !== "no_owned_website") return "LIKELY_NO_SITE_EVIDENCE_INCOMPLETE";
  if (report?.status === "usable" && report.ownershipDecision !== "owned") return "FIRST_PARTY_OWNERSHIP_INCOMPLETE";
  if (report?.status === "usable" && report.fit?.disposition === "inconclusive_requires_review") return "WEBSITE_FIT_REQUIRES_REVIEW";
  if (normalizeWebsiteFitDisposition(prospect) === "inconclusive_requires_review") return "WEBSITE_VERIFICATION_INCONCLUSIVE";
  return "OTHER_MANUAL";
}

function resultExplanation(result: ProspectWebsiteVerificationResult, secondPassAttempted: boolean) {
  const disposition = normalizeWebsiteFitDisposition(result.prospect);
  if (["adequate_existing_website", "strong_existing_website"].includes(disposition) && safelyResolved(result)) {
    return `Bounded verification established an owned ${disposition.replaceAll("_", " ")} and excluded it from rebuild outreach.`;
  }
  if (websiteFitAllowsAutonomousOutreach(result.prospect)) {
    return `Bounded verification established ${disposition.replaceAll("_", " ")}. The record may enter human review but is not approved or send-ready.`;
  }
  return `${result.report.explanation}${secondPassAttempted ? " A bounded second pass did not establish a safer automatic conclusion." : ""}`;
}

function secondPassDependencies(input: WebsiteVerificationDependencies): WebsiteVerificationDependencies {
  return {
    ...input,
    maxVerificationAttempts: Math.min(4, Math.max(1, input.maxVerificationAttempts ?? 4)),
    maxContactPages: Math.min(3, Math.max(0, input.maxContactPages ?? 3)),
    requestTimeoutMs: Math.min(8_000, Math.max(500, input.requestTimeoutMs ?? 8_000)),
  };
}

export async function verifyProspectWebsiteWithSecondPass(
  prospect: Prospect,
  dependencies: WebsiteVerificationDependencies = {},
): Promise<SharedProspectVerificationResolution> {
  const initialResult = await verifyProspectWebsite(prospect, dependencies);
  if (safelyResolved(initialResult)) {
    return {
      result: initialResult,
      initialResult,
      secondPassAttempted: false,
      candidateUrlsConsidered: prospect.website ? [prospect.website] : [],
      reasonCode: resolutionReasonCode(initialResult),
      outcome: resolutionOutcome(initialResult),
      explanation: resultExplanation(initialResult, false),
    };
  }

  const storedHost = normalizedHost(prospect.website);
  const providerCandidates = providerOwnedWebsiteCandidates(prospect);
  const providerHosts = new Set(providerCandidates.map(normalizedHost).filter(Boolean));
  if (storedHost) providerHosts.add(storedHost);
  if (providerHosts.size > 1) {
    return {
      result: initialResult,
      initialResult,
      secondPassAttempted: false,
      candidateUrlsConsidered: providerCandidates,
      reasonCode: "PROVIDER_WEBSITE_CONFLICT",
      outcome: "still_manual",
      explanation: "Provider website candidates conflict with the stored domain. No candidate was promoted automatically.",
    };
  }

  const candidates = [...new Set([
    prospect.website,
    ...providerCandidates,
  ].filter((value) => value && isCredibleOwnedWebsiteCandidate(value)))].slice(0, 3);
  if (!candidates.length && !prospect.website.trim()) {
    return {
      result: initialResult,
      initialResult,
      secondPassAttempted: false,
      candidateUrlsConsidered: [],
      reasonCode: resolutionReasonCode(initialResult),
      outcome: resolutionOutcome(initialResult),
      explanation: resultExplanation(initialResult, false),
    };
  }

  let best = initialResult;
  for (const candidate of candidates) {
    const candidateResult = await verifyProspectWebsite(
      { ...prospect, website: candidate },
      secondPassDependencies(dependencies),
    );
    if (safelyResolved(candidateResult)) {
      best = candidateResult;
      break;
    }
    const bestReport: WebsiteVerificationReport = best.report;
    if (bestReport.status !== "usable" && candidateResult.report.status === "usable") best = candidateResult;
  }
  return {
    result: best,
    initialResult,
    secondPassAttempted: true,
    candidateUrlsConsidered: candidates,
    reasonCode: resolutionReasonCode(best),
    outcome: resolutionOutcome(best),
    explanation: resultExplanation(best, true),
  };
}
