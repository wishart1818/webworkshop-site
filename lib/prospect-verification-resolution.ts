import type { Prospect, WebsiteVerificationReport } from "@/lib/prospect-engine";
import {
  normalizeWebsiteFitDisposition,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";
import {
  affirmativeFirstPartyIdentity,
  authoritativeNoOwnedWebsiteEvidence,
  discoveryIdentityEvidenceFromSignals,
  discoveryIdentityEvidenceSignal,
  isCredibleOwnedWebsiteCandidate,
  providerOwnedWebsiteCandidates,
  type DiscoveryIdentitySource,
} from "@/lib/prospect-identity-evidence";
import {
  authoritativeProviderBoundWebsiteIdentity,
  authoritativeProviderBoundBrokenWebsiteIdentity,
  verifiedCustomerFacingWebsiteStructure,
} from "@/lib/provider-bound-website-exclusion";
import {
  discoverGoogleOwnedWebsiteResolution,
  discoverIndependentNoSiteIdentityResolution,
} from "@/lib/no-site-owned-website-recovery";
import {
  latestProviderIdentityResolutionDiagnostic,
  providerIdentityResolutionDiagnosticSignal,
  resolveProviderIdentityCandidates,
  sameNameIdentityAmbiguityRemains,
  type ProviderIdentityResolution,
  type ProviderIdentityResolutionDiagnostic,
} from "@/lib/prospect-identity-resolution";
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
  noSiteEnrichment?: NoSiteEnrichmentDiagnostic;
};

export type SharedProspectVerificationDependencies = WebsiteVerificationDependencies & {
  googlePlacesApiKey?: string;
  azureMapsApiKey?: string;
  allowHistoricalNoSiteLookup?: boolean;
  forceNoSiteEvidenceRefresh?: boolean;
};

export const noSiteEnrichmentOutcomes = [
  "owned_website_found",
  "probable_no_owned_website",
  "broken_or_inactive_website",
  "unresolved",
] as const;
export type NoSiteEnrichmentOutcome = (typeof noSiteEnrichmentOutcomes)[number];
export type NoSiteEnrichmentDiagnostic = {
  version: "no-site-enrichment-v1" | "no-site-enrichment-v2";
  outcome: NoSiteEnrichmentOutcome;
  reason: string;
  checkedAt: string;
  providerSources: DiscoveryIdentitySource[];
  websiteCandidate: string;
  websiteVerificationStatus: string;
  websiteFitDisposition: string;
  identityMatchedProvider?: DiscoveryIdentitySource | "";
  identityMatchedSignals?: string[];
  identityConflictingSignals?: string[];
  identityConfidenceSufficient?: boolean;
  providerWebsiteAcceptedAsOwned?: boolean;
};

const noSiteEnrichmentSignalPrefix = "no_site_enrichment_diagnostic:";

export function noSiteEnrichmentDiagnosticSignal(diagnostic: NoSiteEnrichmentDiagnostic) {
  return `${noSiteEnrichmentSignalPrefix}${Buffer.from(JSON.stringify(diagnostic)).toString("base64url")}`;
}

export function latestNoSiteEnrichmentDiagnostic(signals: string[]) {
  return signals.flatMap((signal): NoSiteEnrichmentDiagnostic[] => {
    if (!signal.startsWith(noSiteEnrichmentSignalPrefix) || signal.length > 8_000) return [];
    try {
      const value = JSON.parse(Buffer.from(signal.slice(noSiteEnrichmentSignalPrefix.length), "base64url").toString("utf8")) as Partial<NoSiteEnrichmentDiagnostic>;
      if (
        !["no-site-enrichment-v1", "no-site-enrichment-v2"].includes(String(value.version))
        || !noSiteEnrichmentOutcomes.includes(value.outcome as NoSiteEnrichmentOutcome)
        || typeof value.reason !== "string"
        || typeof value.checkedAt !== "string"
        || !Array.isArray(value.providerSources)
        || typeof value.websiteCandidate !== "string"
        || typeof value.websiteVerificationStatus !== "string"
        || typeof value.websiteFitDisposition !== "string"
      ) return [];
      return [{
        version: value.version as NoSiteEnrichmentDiagnostic["version"],
        outcome: value.outcome as NoSiteEnrichmentOutcome,
        reason: value.reason.slice(0, 1_000),
        checkedAt: value.checkedAt.slice(0, 100),
        providerSources: value.providerSources.filter((source): source is DiscoveryIdentitySource => (
          ["osm", "google", "bing", "yelp", "yellowPages"].includes(String(source))
        )),
        websiteCandidate: value.websiteCandidate.slice(0, 500),
        websiteVerificationStatus: value.websiteVerificationStatus.slice(0, 100),
        websiteFitDisposition: value.websiteFitDisposition.slice(0, 100),
        ...(typeof value.identityMatchedProvider === "string" ? { identityMatchedProvider: value.identityMatchedProvider as DiscoveryIdentitySource | "" } : {}),
        ...(Array.isArray(value.identityMatchedSignals) ? { identityMatchedSignals: value.identityMatchedSignals.filter((item): item is string => typeof item === "string").slice(0, 12) } : {}),
        ...(Array.isArray(value.identityConflictingSignals) ? { identityConflictingSignals: value.identityConflictingSignals.filter((item): item is string => typeof item === "string").slice(0, 12) } : {}),
        ...(typeof value.identityConfidenceSufficient === "boolean" ? { identityConfidenceSufficient: value.identityConfidenceSufficient } : {}),
        ...(typeof value.providerWebsiteAcceptedAsOwned === "boolean" ? { providerWebsiteAcceptedAsOwned: value.providerWebsiteAcceptedAsOwned } : {}),
      }];
    } catch {
      return [];
    }
  }).at(-1) ?? null;
}

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

function replaceIdentityDiagnostic(
  prospect: Prospect,
  update: (diagnostic: ProviderIdentityResolutionDiagnostic) => ProviderIdentityResolutionDiagnostic,
) {
  const diagnostic = latestProviderIdentityResolutionDiagnostic(prospect.activitySignals);
  if (!diagnostic) return prospect;
  return {
    ...prospect,
    activitySignals: [
      ...prospect.activitySignals.filter((signal) => !signal.startsWith("provider_identity_resolution:")),
      providerIdentityResolutionDiagnosticSignal(update(diagnostic)),
    ],
  };
}

function providerBoundBrokenWebsiteOwnership(
  result: ProspectWebsiteVerificationResult,
): ProspectWebsiteVerificationResult {
  if (!authoritativeProviderBoundBrokenWebsiteIdentity(result.prospect, result.report)) return result;
  const providerBindingEvidence = "A trusted provider record strongly matched the business by name and independent identity evidence and associated this exact website host with that business.";
  const report: WebsiteVerificationReport = {
    ...result.report,
    ownershipDecision: "owned",
    identityEvidence: [...new Set([...(result.report.identityEvidence ?? []), providerBindingEvidence])],
    fit: result.report.fit ? {
      ...result.report.fit,
      supportingEvidence: [...new Set([...result.report.fit.supportingEvidence, providerBindingEvidence])],
    } : result.report.fit,
    freshness: result.report.freshness ? {
      ...result.report.freshness,
      humanReviewRequired: false,
      staleReason: "",
    } : result.report.freshness,
  };
  const prospect = replaceIdentityDiagnostic({ ...result.prospect, websiteVerification: report }, (diagnostic) => ({
    ...diagnostic,
    providerWebsiteAcceptedAsOwned: true,
    reason: `${diagnostic.reason} Shared website verification confirmed the provider-associated domain is ${report.status.replace("confirmed_", "")}.`,
  }));
  return { ...result, prospect, report };
}

function applyProviderBoundWebsiteEvidence(result: ProspectWebsiteVerificationResult) {
  return providerBoundBrokenWebsiteOwnership(providerBoundAdequateExclusion(result));
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
  if (sameNameIdentityAmbiguityRemains(prospect.activitySignals)) return "SAME_NAME_AMBIGUOUS";
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

function noSiteEnrichmentDiagnosticFor(input: {
  resolution: SharedProspectVerificationResolution;
  workingProspect: Prospect;
  corroboratingEvidenceCount: number;
  recoveredCandidates: string[];
  checkedAt: string;
  identityResolution: ProviderIdentityResolution | null;
}) {
  const { resolution } = input;
  const resolved = resolution.result.prospect;
  const report = resolution.result.report;
  const providerSources = [...new Set(
    discoveryIdentityEvidenceFromSignals(input.workingProspect.activitySignals).map((item) => item.source),
  )].sort();
  const candidate = resolved.website || input.recoveredCandidates[0] || "";
  const disposition = normalizeWebsiteFitDisposition(resolved);
  let outcome: NoSiteEnrichmentOutcome = "unresolved";
  let reason = resolution.explanation;

  if (report.status === "usable" && report.ownershipDecision === "owned" && candidate) {
    outcome = "owned_website_found";
    reason = `An exact provider identity match supplied ${candidate}; shared website verification confirmed an owned usable website.`;
  } else if (["confirmed_broken", "confirmed_inactive"].includes(report.status) && candidate) {
    outcome = "broken_or_inactive_website";
    reason = `A matched business-domain candidate (${candidate}) passed through shared website verification and was confirmed ${report.status.replace("confirmed_", "")}.`;
  } else if (disposition === "no_owned_website" && report.status === "no_owned_website") {
    outcome = "probable_no_owned_website";
    reason = `Independent provider identities (${providerSources.join(", ")}) matched the business without supplying a credible owned website; existing no-owned-website qualification rules accepted that evidence.`;
  } else if (input.recoveredCandidates.length > 0) {
    reason = `A matched provider website candidate was found, but shared verification remained ${report.status.replaceAll("_", " ")}; the record stays unresolved.`;
  } else if (input.corroboratingEvidenceCount === 0) {
    reason = `No independent provider result matched the stored business identity with sufficient phone or address evidence. ${resolution.explanation}`;
  }

  const identityDiagnostic = latestProviderIdentityResolutionDiagnostic(resolved.activitySignals)
    ?? latestProviderIdentityResolutionDiagnostic(input.workingProspect.activitySignals);
  if (identityDiagnostic && !identityDiagnostic.confidenceSufficient) {
    reason = `${identityDiagnostic.reason} ${reason}`.slice(0, 1_000);
  }

  return {
    version: "no-site-enrichment-v2",
    outcome,
    reason: reason.slice(0, 1_000),
    checkedAt: input.checkedAt,
    providerSources,
    websiteCandidate: candidate,
    websiteVerificationStatus: report.status,
    websiteFitDisposition: disposition,
    identityMatchedProvider: identityDiagnostic?.matchedProvider ?? input.identityResolution?.matchedProvider ?? "",
    identityMatchedSignals: identityDiagnostic?.matchedSignals ?? input.identityResolution?.matchedSignals ?? [],
    identityConflictingSignals: identityDiagnostic?.conflictingSignals ?? input.identityResolution?.conflictingSignals ?? [],
    identityConfidenceSufficient: identityDiagnostic?.confidenceSufficient ?? input.identityResolution?.confidenceSufficient ?? false,
    providerWebsiteAcceptedAsOwned: identityDiagnostic?.providerWebsiteAcceptedAsOwned ?? false,
  } satisfies NoSiteEnrichmentDiagnostic;
}

function attachNoSiteEnrichment(
  resolution: SharedProspectVerificationResolution,
  input: {
    startedAsProbableNoSite: boolean;
    workingProspect: Prospect;
    corroboratingEvidenceCount: number;
    recoveredCandidates: string[];
    checkedAt: string;
    identityResolution: ProviderIdentityResolution | null;
  },
) {
  if (!input.startedAsProbableNoSite) return resolution;
  const diagnostic = noSiteEnrichmentDiagnosticFor({ resolution, ...input });
  const prospect = resolution.result.prospect;
  const activitySignals = [
    ...prospect.activitySignals.filter((signal) => !signal.startsWith(noSiteEnrichmentSignalPrefix)),
    noSiteEnrichmentDiagnosticSignal(diagnostic),
  ];
  return {
    ...resolution,
    result: {
      ...resolution.result,
      prospect: { ...prospect, activitySignals },
    },
    noSiteEnrichment: diagnostic,
  } satisfies SharedProspectVerificationResolution;
}

export async function verifyProspectWebsiteWithSecondPass(
  prospect: Prospect,
  dependencies: SharedProspectVerificationDependencies = {},
): Promise<SharedProspectVerificationResolution> {
  const startedAsProbableNoSite = !prospect.website.trim()
    && prospect.prospectType === "no_website_social_only"
    && !prospect.inactive;
  const recoveryTimeoutMs = Math.min(6_000, Math.max(750, dependencies.requestTimeoutMs ?? 5_000));
  const independentLookup = await discoverIndependentNoSiteIdentityResolution(prospect, {
    fetch: dependencies.fetch,
    timeoutMs: recoveryTimeoutMs,
    googlePlacesApiKey: dependencies.googlePlacesApiKey,
    azureMapsApiKey: dependencies.azureMapsApiKey,
    allowHistoricalLookup: dependencies.allowHistoricalNoSiteLookup,
  });
  const corroboratingEvidence = independentLookup?.evidence ?? [];
  const checkedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const prospectCreatedAt = Date.parse(prospect.createdAt);
  const identityEvidenceCurrentForQualification = !dependencies.allowHistoricalNoSiteLookup
    && Number.isFinite(prospectCreatedAt)
    && Date.parse(checkedAt) - prospectCreatedAt <= 7 * 24 * 60 * 60 * 1_000;
  const identityDiagnosticFor = (
    resolution: ProviderIdentityResolution,
    websiteCandidate = resolution.matchedEvidence?.website ?? "",
  ): ProviderIdentityResolutionDiagnostic => ({
    version: "provider-identity-resolution-v1",
    status: resolution.status,
    matchedProvider: resolution.matchedProvider,
    matchedSignals: resolution.matchedSignals,
    conflictingSignals: resolution.conflictingSignals,
    confidenceSufficient: resolution.confidenceSufficient,
    evidenceCurrentForQualification: identityEvidenceCurrentForQualification,
    plausibleCandidateCount: resolution.plausibleCandidateCount,
    websiteCandidate,
    providerWebsiteAcceptedAsOwned: false,
    reason: resolution.reason,
    checkedAt,
  });
  const workingProspect = corroboratingEvidence.length
    ? {
        ...prospect,
        activitySignals: [...new Set([
          ...prospect.activitySignals,
          ...corroboratingEvidence.map(discoveryIdentityEvidenceSignal),
          ...corroboratingEvidence.map((item) => `discovery_source:${item.source}`),
          ...(independentLookup ? [providerIdentityResolutionDiagnosticSignal(identityDiagnosticFor(independentLookup.resolution))] : []),
        ])],
      }
    : independentLookup
      ? {
          ...prospect,
          activitySignals: [
            ...prospect.activitySignals.filter((signal) => !signal.startsWith("provider_identity_resolution:")),
            providerIdentityResolutionDiagnosticSignal(identityDiagnosticFor(independentLookup.resolution)),
          ],
        }
      : prospect;

  let resolvedWorkingProspect = workingProspect;
  let identityResolution = independentLookup?.resolution ?? null;
  let providerCandidates = providerOwnedWebsiteCandidates(resolvedWorkingProspect);
  if (!identityResolution && providerCandidates.length > 0) {
    const providerWebsiteEvidence = discoveryIdentityEvidenceFromSignals(resolvedWorkingProspect.activitySignals)
      .filter((item) => isCredibleOwnedWebsiteCandidate(item.website));
    const storedResolution = resolveProviderIdentityCandidates(resolvedWorkingProspect, providerWebsiteEvidence);
    identityResolution = storedResolution;
    resolvedWorkingProspect = {
      ...resolvedWorkingProspect,
      activitySignals: [
        ...resolvedWorkingProspect.activitySignals.filter((signal) => !signal.startsWith("provider_identity_resolution:")),
        providerIdentityResolutionDiagnosticSignal(identityDiagnosticFor(storedResolution)),
      ],
    };
  }
  const independentlyCorroboratedWithoutWebsite = Boolean(
    independentLookup?.resolution.confidenceSufficient
    && independentLookup.resolution.matchedProvider === "google"
    && independentLookup.evidence.length === 1
    && !isCredibleOwnedWebsiteCandidate(independentLookup.evidence[0]?.website ?? "")
    && new Set(discoveryIdentityEvidenceFromSignals(resolvedWorkingProspect.activitySignals).map((item) => item.source)).size >= 2,
  );
  const authoritativeNoSiteVerifiedAtEntry = !dependencies.forceNoSiteEvidenceRefresh
    && authoritativeNoOwnedWebsiteEvidence(prospect, new Date(checkedAt)).verified;
  const ownedWebsiteLookup = !resolvedWorkingProspect.website.trim()
    && providerCandidates.length === 0
    && !independentlyCorroboratedWithoutWebsite
    && !authoritativeNoSiteVerifiedAtEntry
    ? await discoverGoogleOwnedWebsiteResolution(resolvedWorkingProspect, {
      fetch: dependencies.fetch,
      timeoutMs: recoveryTimeoutMs,
      googlePlacesApiKey: dependencies.googlePlacesApiKey,
      allowHistoricalLookup: dependencies.allowHistoricalNoSiteLookup,
    })
    : null;
  const recoveredCandidates = ownedWebsiteLookup?.candidates ?? [];
  if (ownedWebsiteLookup) {
    identityResolution = ownedWebsiteLookup.resolution;
    resolvedWorkingProspect = {
      ...resolvedWorkingProspect,
      activitySignals: [...new Set([
        ...resolvedWorkingProspect.activitySignals.filter((signal) => !signal.startsWith("provider_identity_resolution:")),
        ...ownedWebsiteLookup.evidence.map(discoveryIdentityEvidenceSignal),
        ...ownedWebsiteLookup.evidence.map((item) => `discovery_source:${item.source}`),
        providerIdentityResolutionDiagnosticSignal(identityDiagnosticFor(
          ownedWebsiteLookup.resolution,
          ownedWebsiteLookup.resolution.matchedEvidence?.website ?? "",
        )),
      ])],
    };
    providerCandidates = providerOwnedWebsiteCandidates(resolvedWorkingProspect);
  }

  const initialVerificationProspect = dependencies.forceNoSiteEvidenceRefresh && startedAsProbableNoSite
    ? {
        ...resolvedWorkingProspect,
        websiteStatus: "unknown" as const,
        websiteStatusDetail: "Stored no-owned-website evidence is being refreshed.",
        fitDisposition: "inconclusive_requires_review" as const,
        websiteVerification: undefined,
      }
    : resolvedWorkingProspect;
  const initialResult = applyProviderBoundWebsiteEvidence(await verifyProspectWebsite(initialVerificationProspect, dependencies));
  const finish = (resolution: SharedProspectVerificationResolution) => attachNoSiteEnrichment(resolution, {
    startedAsProbableNoSite,
    workingProspect: resolvedWorkingProspect,
    corroboratingEvidenceCount: corroboratingEvidence.length,
    recoveredCandidates,
    checkedAt,
    identityResolution,
  });
  const recoveredOwnedSiteMustBeChecked = startedAsProbableNoSite && recoveredCandidates.length > 0;
  if (safelyResolved(initialResult) && !recoveredOwnedSiteMustBeChecked) {
    return finish({
      result: initialResult,
      initialResult,
      secondPassAttempted: false,
      candidateUrlsConsidered: resolvedWorkingProspect.website ? [resolvedWorkingProspect.website] : [],
      reasonCode: resolutionReasonCode(initialResult),
      outcome: resolutionOutcome(initialResult),
      explanation: resultExplanation(initialResult, false),
    });
  }

  const storedHost = normalizedHost(resolvedWorkingProspect.website);
  const providerHosts = new Set(providerCandidates.map(normalizedHost).filter(Boolean));
  if (storedHost) providerHosts.add(storedHost);
  if (providerHosts.size > 1) {
    return finish({
      result: initialResult,
      initialResult,
      secondPassAttempted: false,
      candidateUrlsConsidered: providerCandidates,
      reasonCode: "PROVIDER_WEBSITE_CONFLICT",
      outcome: "still_manual",
      explanation: "Provider website candidates conflict with the stored domain. No candidate was promoted automatically.",
    });
  }

  const candidates = [...new Set([
    resolvedWorkingProspect.website,
    ...providerCandidates,
    ...recoveredCandidates,
  ].filter((value) => value && isCredibleOwnedWebsiteCandidate(value)))].slice(0, 3);
  if (!candidates.length && !resolvedWorkingProspect.website.trim()) {
    return finish({
      result: initialResult,
      initialResult,
      secondPassAttempted: false,
      candidateUrlsConsidered: [],
      reasonCode: resolutionReasonCode(initialResult),
      outcome: resolutionOutcome(initialResult),
      explanation: resultExplanation(initialResult, false),
    });
  }

  let best: ProspectWebsiteVerificationResult | null = recoveredOwnedSiteMustBeChecked ? null : initialResult;
  for (const candidate of candidates) {
    const candidateResult = applyProviderBoundWebsiteEvidence(await verifyProspectWebsite(
      { ...resolvedWorkingProspect, website: candidate },
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
  return finish({
    result: finalResult,
    initialResult,
    secondPassAttempted: true,
    candidateUrlsConsidered: candidates,
    reasonCode: resolutionReasonCode(finalResult),
    outcome: resolutionOutcome(finalResult),
    explanation: resultExplanation(finalResult, true),
  });
}
