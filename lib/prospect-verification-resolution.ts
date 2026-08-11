import type { Prospect, WebsiteVerificationReport } from "@/lib/prospect-engine";
import {
  normalizeWebsiteFitDisposition,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";
import {
  affirmativeFirstPartyIdentity,
  discoveryIdentityEvidenceSignal,
  isCredibleOwnedWebsiteCandidate,
  providerOwnedWebsiteCandidates,
} from "@/lib/prospect-identity-evidence";
import {
  authoritativeProviderBoundWebsiteIdentity,
  verifiedCustomerFacingWebsiteStructure,
} from "@/lib/provider-bound-website-exclusion";
import {
  discoverGoogleOwnedWebsiteCandidates,
  discoverIndependentNoSiteIdentityEvidence,
} from "@/lib/no-site-owned-website-recovery";
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

export type SharedProspectVerificationDependencies = WebsiteVerificationDependencies & {
  googlePlacesApiKey?: string;
  azureMapsApiKey?: string;
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
    activitySignals: [...new Set([...existing.activitySignals, ...resolved.activitySignals])],
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

function providerBoundAdequateExclusion(
  result: ProspectWebsiteVerificationResult,
): ProspectWebsiteVerificationResult {
  const disposition = normalizeWebsiteFitDisposition(result.prospect);
  if (disposition !== "inconclusive_requires_review") return result;
  if (!authoritativeProviderBoundWebsiteIdentity(result.prospect, result.report)) return result;
  if (!verifiedCustomerFacingWebsiteStructure(result.prospect, result.report)) return result;

  const supportingEvidence = [
    result.report.usableSignals.includes("meaningful page title") ? "A meaningful page title is present." : "",
    result.report.usableSignals.includes("navigation") ? "Customer navigation is present." : "",
    result.report.usableSignals.includes("service content") ? "Meaningful service content is present." : "",
    result.report.usableSignals.includes("mobile viewport") ? "Mobile viewport markup is present." : "",
    result.prospect.contactFormDetected || result.prospect.quoteFormDetected || result.prospect.email || result.prospect.phone
      ? "A public phone, email, or form contact path is present."
      : "",
    result.report.usableSignals.includes("business imagery") || result.report.usableSignals.includes("structured business data")
      ? "Business imagery or structured business data is present."
      : "",
    "An authoritative provider supplied the same website host for the same normalized business identity and matched a complete business phone or street address.",
  ].filter(Boolean);
  const providerBindingEvidence = "Authoritative provider website binding independently corroborated the stored business website host and business identity.";
  const fit = {
    disposition: "adequate_existing_website" as const,
    reason: "The current site has a complete customer-facing structure, and an authoritative provider independently binds this exact website host to the prospect. It is safe to exclude from rebuild outreach.",
    supportingEvidence,
    confidence: "high" as const,
    analysisOrigin: "automated_html" as const,
    evaluatedAt: result.report.checkedAt,
  };
  const report: WebsiteVerificationReport = {
    ...result.report,
    confidence: "high",
    ownershipDecision: "owned",
    identityEvidence: [...new Set([...(result.report.identityEvidence ?? []), providerBindingEvidence])],
    fit,
    freshness: result.report.freshness
      ? { ...result.report.freshness, humanReviewRequired: false, staleReason: "" }
      : result.report.freshness,
  };
  const resolvedProspect = {
    ...result.prospect,
    websiteVerification: report,
    fitDisposition: "adequate_existing_website" as const,
  };
  return { ...result, prospect: resolvedProspect, report };
}

function safelyResolved(result: ProspectWebsiteVerificationResult) {
  const disposition = normalizeWebsiteFitDisposition(result.prospect);
  if (["adequate_existing_website", "strong_existing_website"].includes(disposition)) {
    return result.report.version === "website-verification-v2"
      && result.report.status === "usable"
      && result.report.confidence === "high"
      && result.report.ownershipDecision === "owned"
      && result.report.fit?.confidence === "high"
      && (
        affirmativeFirstPartyIdentity(result.report.identitySignals)
        || (
          authoritativeProviderBoundWebsiteIdentity(result.prospect, result.report)
          && verifiedCustomerFacingWebsiteStructure(result.prospect, result.report)
        )
      );
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

function secondPassDependencies(input: SharedProspectVerificationDependencies): WebsiteVerificationDependencies {
  return {
    ...input,
    maxVerificationAttempts: Math.min(4, Math.max(1, input.maxVerificationAttempts ?? 4)),
    maxContactPages: Math.min(3, Math.max(0, input.maxContactPages ?? 3)),
    requestTimeoutMs: Math.min(8_000, Math.max(500, input.requestTimeoutMs ?? 8_000)),
  };
}

export async function verifyProspectWebsiteWithSecondPass(
  prospect: Prospect,
  dependencies: SharedProspectVerificationDependencies = {},
): Promise<SharedProspectVerificationResolution> {
  const recoveryTimeoutMs = Math.min(6_000, Math.max(750, dependencies.requestTimeoutMs ?? 5_000));
  const corroboratingEvidence = await discoverIndependentNoSiteIdentityEvidence(prospect, {
    fetch: dependencies.fetch,
    timeoutMs: recoveryTimeoutMs,
    googlePlacesApiKey: dependencies.googlePlacesApiKey,
    azureMapsApiKey: dependencies.azureMapsApiKey,
  });
  const workingProspect = corroboratingEvidence.length
    ? {
        ...prospect,
        activitySignals: [...new Set([
          ...prospect.activitySignals,
          ...corroboratingEvidence.map(discoveryIdentityEvidenceSignal),
          ...corroboratingEvidence.map((item) => `discovery_source:${item.source}`),
        ])],
      }
    : prospect;

  const providerCandidates = providerOwnedWebsiteCandidates(workingProspect);
  const recoveredCandidates = !workingProspect.website.trim() && providerCandidates.length === 0
    ? await discoverGoogleOwnedWebsiteCandidates(workingProspect, {
      fetch: dependencies.fetch,
      timeoutMs: recoveryTimeoutMs,
      googlePlacesApiKey: dependencies.googlePlacesApiKey,
    })
    : [];

  const initialResult = providerBoundAdequateExclusion(await verifyProspectWebsite(workingProspect, dependencies));
  const initialDisposition = normalizeWebsiteFitDisposition(initialResult.prospect);
  const recoveredOwnedSiteMustBeChecked = initialDisposition === "no_owned_website" && recoveredCandidates.length > 0;
  if (safelyResolved(initialResult) && !recoveredOwnedSiteMustBeChecked) {
    return {
      result: initialResult,
      initialResult,
      secondPassAttempted: false,
      candidateUrlsConsidered: workingProspect.website ? [workingProspect.website] : [],
      reasonCode: resolutionReasonCode(initialResult),
      outcome: resolutionOutcome(initialResult),
      explanation: resultExplanation(initialResult, false),
    };
  }

  const storedHost = normalizedHost(workingProspect.website);
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
    workingProspect.website,
    ...providerCandidates,
    ...recoveredCandidates,
  ].filter((value) => value && isCredibleOwnedWebsiteCandidate(value)))].slice(0, 3);
  if (!candidates.length && !workingProspect.website.trim()) {
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

  let best: ProspectWebsiteVerificationResult | null = recoveredOwnedSiteMustBeChecked ? null : initialResult;
  for (const candidate of candidates) {
    const candidateResult = providerBoundAdequateExclusion(await verifyProspectWebsite(
      { ...workingProspect, website: candidate },
      secondPassDependencies(dependencies),
    ));
    if (safelyResolved(candidateResult)) {
      best = candidateResult;
      break;
    }
    if (!best || (best.report.status !== "usable" && candidateResult.report.status === "usable")) {
      best = candidateResult;
    }
  }
  const finalResult = best ?? initialResult;
  return {
    result: finalResult,
    initialResult,
    secondPassAttempted: true,
    candidateUrlsConsidered: candidates,
    reasonCode: resolutionReasonCode(finalResult),
    outcome: resolutionOutcome(finalResult),
    explanation: resultExplanation(finalResult, true),
  };
}
