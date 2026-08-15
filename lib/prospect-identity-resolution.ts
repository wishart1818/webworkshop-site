import type { Prospect } from "@/lib/prospect-engine";
import {
  discoveryIdentityEvidenceFromSignals,
  discoverySameNameAmbiguityRemains,
  normalizedBusinessIdentityName,
  normalizedCompletePhone,
  normalizedStreetAddress,
  type DiscoveryIdentityEvidence,
  type DiscoveryIdentitySource,
} from "@/lib/prospect-identity-evidence";

export const providerIdentityMatchedSignals = [
  "normalized_name",
  "legal_suffix_equivalent_name",
  "exact_phone",
  "strong_address",
  "city_state",
  "close_coordinates",
] as const;
export type ProviderIdentityMatchedSignal = (typeof providerIdentityMatchedSignals)[number];

export const providerIdentityConflictingSignals = [
  "phone_conflict",
  "address_conflict",
  "city_state_conflict",
  "coordinate_conflict",
  "multiple_plausible_matches",
] as const;
export type ProviderIdentityConflictingSignal = (typeof providerIdentityConflictingSignals)[number];

export type ProviderIdentityCandidateAssessment = {
  evidence: DiscoveryIdentityEvidence;
  matchedSignals: ProviderIdentityMatchedSignal[];
  conflictingSignals: ProviderIdentityConflictingSignal[];
  strongNameMatch: boolean;
  strongIndependentSignal: boolean;
  confidenceSufficient: boolean;
};

export type ProviderIdentityResolution = {
  status: "strong_match" | "ambiguous" | "no_match";
  matchedEvidence: DiscoveryIdentityEvidence | null;
  matchedProvider: DiscoveryIdentitySource | "";
  matchedSignals: ProviderIdentityMatchedSignal[];
  conflictingSignals: ProviderIdentityConflictingSignal[];
  confidenceSufficient: boolean;
  plausibleCandidateCount: number;
  reason: string;
};

export type ProviderIdentityResolutionDiagnostic = {
  version: "provider-identity-resolution-v1";
  status: ProviderIdentityResolution["status"];
  matchedProvider: DiscoveryIdentitySource | "";
  matchedSignals: ProviderIdentityMatchedSignal[];
  conflictingSignals: ProviderIdentityConflictingSignal[];
  confidenceSufficient: boolean;
  evidenceCurrentForQualification: boolean;
  plausibleCandidateCount: number;
  websiteCandidate: string;
  providerWebsiteAcceptedAsOwned: boolean;
  reason: string;
  checkedAt: string;
};

const diagnosticSignalPrefix = "provider_identity_resolution:";
const legalSuffixes = new Set(["llc", "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "pllc"]);
const closeCoordinateToleranceKm = 0.35;
const conflictingCoordinateDistanceKm = 3;

function normalizedNameWithLegalSuffixes(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function legalSuffixStrippedName(value: string) {
  return normalizedNameWithLegalSuffixes(value)
    .split(" ")
    .filter((token) => !legalSuffixes.has(token))
    .join(" ");
}

function normalizedLocation(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function addressCore(value: string, city: string, state: string) {
  const locationTokens = new Set([
    ...normalizedLocation(city).split(" "),
    ...normalizedLocation(state).split(" "),
  ].filter(Boolean));
  return normalizedStreetAddress(value)
    .split(" ")
    .filter((token) => token && !/^\d{5}(?:\d{4})?$/.test(token) && !locationTokens.has(token));
}

function stronglyMatchingAddress(
  left: Pick<DiscoveryIdentityEvidence, "address" | "city" | "state">,
  right: Pick<DiscoveryIdentityEvidence, "address" | "city" | "state">,
) {
  const leftNormalized = normalizedStreetAddress(left.address);
  const rightNormalized = normalizedStreetAddress(right.address);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;

  const leftCore = addressCore(left.address, left.city, left.state);
  const rightCore = addressCore(right.address, right.city, right.state);
  const leftNumber = leftCore.find((token) => /^\d+[a-z]?$/.test(token));
  const rightNumber = rightCore.find((token) => /^\d+[a-z]?$/.test(token));
  if (!leftNumber || leftNumber !== rightNumber) return false;
  const leftWords = new Set(leftCore.filter((token) => !/^\d/.test(token)));
  const rightWords = new Set(rightCore.filter((token) => !/^\d/.test(token)));
  const shared = [...leftWords].filter((token) => rightWords.has(token)).length;
  const denominator = Math.max(leftWords.size, rightWords.size);
  return denominator >= 1 && shared / denominator >= 0.8;
}

function addressesConflict(
  candidate: Pick<DiscoveryIdentityEvidence, "address" | "city" | "state">,
  references: DiscoveryIdentityEvidence[],
) {
  if (!candidate.address.trim() || !references.some((item) => item.address.trim())) return false;
  const candidateCore = addressCore(candidate.address, candidate.city, candidate.state);
  const candidateNumber = candidateCore.find((token) => /^\d+[a-z]?$/.test(token));
  if (!candidateNumber) return false;
  const referenceNumbers = references
    .map((item) => addressCore(item.address, item.city, item.state).find((token) => /^\d+[a-z]?$/.test(token)))
    .filter(Boolean);
  return referenceNumbers.some((value) => value !== candidateNumber);
}

function radians(value: number) {
  return value * Math.PI / 180;
}

function distanceKm(left: DiscoveryIdentityEvidence, right: DiscoveryIdentityEvidence) {
  if (left.latitude === null || left.longitude === null || right.latitude === null || right.longitude === null) return null;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function prospectReferenceEvidence(prospect: Prospect, candidateSource: DiscoveryIdentitySource) {
  const stored = discoveryIdentityEvidenceFromSignals(prospect.activitySignals)
    .filter((item) => item.source !== candidateSource);
  const direct: DiscoveryIdentityEvidence = {
    source: stored[0]?.source ?? "osm",
    businessName: prospect.businessName,
    website: prospect.website,
    profileUrl: prospect.profileUrl,
    phone: prospect.phone,
    address: prospect.address,
    city: prospect.city,
    state: prospect.state,
    latitude: null,
    longitude: null,
  };
  return [direct, ...stored];
}

function candidateKey(candidate: DiscoveryIdentityEvidence) {
  return [
    normalizedBusinessIdentityName(candidate.businessName),
    normalizedCompletePhone(candidate.phone),
    normalizedStreetAddress(candidate.address),
    candidate.latitude?.toFixed(4) ?? "",
    candidate.longitude?.toFixed(4) ?? "",
    candidate.website.trim().toLowerCase(),
  ].join("|");
}

function assessCandidate(prospect: Prospect, candidate: DiscoveryIdentityEvidence): ProviderIdentityCandidateAssessment {
  const references = prospectReferenceEvidence(prospect, candidate.source);
  const expectedExactName = normalizedNameWithLegalSuffixes(prospect.businessName);
  const candidateExactName = normalizedNameWithLegalSuffixes(candidate.businessName);
  const exactNameMatch = Boolean(expectedExactName && expectedExactName === candidateExactName);
  const suffixEquivalentName = Boolean(
    !exactNameMatch
    && legalSuffixStrippedName(prospect.businessName)
    && (
      legalSuffixStrippedName(prospect.businessName) === legalSuffixStrippedName(candidate.businessName)
      || legalSuffixStrippedName(prospect.businessName).replaceAll(" ", "") === legalSuffixStrippedName(candidate.businessName).replaceAll(" ", "")
    ),
  );
  const strongNameMatch = exactNameMatch || suffixEquivalentName;
  const matchedSignals: ProviderIdentityMatchedSignal[] = [
    ...(exactNameMatch ? ["normalized_name" as const] : []),
    ...(suffixEquivalentName ? ["legal_suffix_equivalent_name" as const] : []),
  ];
  const conflictingSignals: ProviderIdentityConflictingSignal[] = [];

  const knownPhones = new Set(references.map((item) => normalizedCompletePhone(item.phone)).filter(Boolean));
  const candidatePhone = normalizedCompletePhone(candidate.phone);
  if (candidatePhone && knownPhones.has(candidatePhone)) matchedSignals.push("exact_phone");
  if (candidatePhone && knownPhones.size > 0 && [...knownPhones].some((value) => value !== candidatePhone)) conflictingSignals.push("phone_conflict");

  if (references.some((item) => stronglyMatchingAddress(candidate, item))) matchedSignals.push("strong_address");
  else if (addressesConflict(candidate, references)) conflictingSignals.push("address_conflict");

  const candidateCity = normalizedLocation(candidate.city);
  const candidateState = normalizedLocation(candidate.state);
  const referenceLocations = references.filter((item) => item.city.trim() || item.state.trim());
  const cityStateMatch = referenceLocations.some((item) => (
    (!candidateCity || normalizedLocation(item.city) === candidateCity)
    && (!candidateState || normalizedLocation(item.state) === candidateState)
  ));
  if ((candidateCity || candidateState) && cityStateMatch) matchedSignals.push("city_state");
  if ((candidateCity || candidateState) && referenceLocations.some((item) => (
    (candidateCity && normalizedLocation(item.city) && normalizedLocation(item.city) !== candidateCity)
    || (candidateState && normalizedLocation(item.state) && normalizedLocation(item.state) !== candidateState)
  ))) conflictingSignals.push("city_state_conflict");

  const distances = references.map((item) => distanceKm(candidate, item)).filter((value): value is number => value !== null);
  if (distances.some((value) => value <= closeCoordinateToleranceKm)) matchedSignals.push("close_coordinates");
  if (distances.some((value) => value > conflictingCoordinateDistanceKm)) conflictingSignals.push("coordinate_conflict");

  const strongIndependentSignal = matchedSignals.some((signal) => ["exact_phone", "strong_address", "close_coordinates"].includes(signal));
  const confidenceSufficient = strongNameMatch && strongIndependentSignal && conflictingSignals.length === 0;
  return { evidence: candidate, matchedSignals, conflictingSignals, strongNameMatch, strongIndependentSignal, confidenceSufficient };
}

export function resolveProviderIdentityCandidates(
  prospect: Prospect,
  candidates: DiscoveryIdentityEvidence[],
): ProviderIdentityResolution {
  const distinct = [...new Map(candidates.map((candidate) => [candidateKey(candidate), candidate])).values()];
  const assessed = distinct.map((candidate) => assessCandidate(prospect, candidate));
  const plausible = assessed.filter((candidate) => (
    candidate.strongNameMatch
    && (candidate.strongIndependentSignal || candidate.matchedSignals.includes("city_state"))
  ));
  const strong = plausible.filter((candidate) => candidate.confidenceSufficient);
  if (plausible.length > 1) {
    return {
      status: "ambiguous",
      matchedEvidence: null,
      matchedProvider: "",
      matchedSignals: [...new Set(plausible.flatMap((item) => item.matchedSignals))],
      conflictingSignals: [
        "multiple_plausible_matches",
        ...new Set(plausible.flatMap((item) => item.conflictingSignals)),
      ],
      confidenceSufficient: false,
      plausibleCandidateCount: plausible.length,
      reason: "Multiple plausible provider records matched the business identity. The record remains manual to avoid merging same-name businesses.",
    };
  }
  if (strong.length === 1) {
    const match = strong[0]!;
    return {
      status: "strong_match",
      matchedEvidence: match.evidence,
      matchedProvider: match.evidence.source,
      matchedSignals: match.matchedSignals,
      conflictingSignals: [],
      confidenceSufficient: true,
      plausibleCandidateCount: 1,
      reason: `A unique ${match.evidence.source} provider record matched the normalized business identity and ${match.matchedSignals.filter((signal) => !signal.includes("name")).join(", ").replaceAll("_", " ")}.`,
    };
  }
  const conflicts = [...new Set(assessed.flatMap((item) => item.conflictingSignals))];
  return {
    status: conflicts.length ? "ambiguous" : "no_match",
    matchedEvidence: null,
    matchedProvider: "",
    matchedSignals: [...new Set(assessed.flatMap((item) => item.matchedSignals))],
    conflictingSignals: conflicts,
    confidenceSufficient: false,
    plausibleCandidateCount: plausible.length,
    reason: conflicts.length
      ? `Provider identity evidence conflicted (${conflicts.join(", ").replaceAll("_", " ")}); no record was merged.`
      : "No provider record matched the business with both a strong name and an independent phone, address, or close-location signal.",
  };
}

export function providerIdentityResolutionDiagnosticSignal(diagnostic: ProviderIdentityResolutionDiagnostic) {
  return `${diagnosticSignalPrefix}${Buffer.from(JSON.stringify(diagnostic)).toString("base64url")}`;
}

export function latestProviderIdentityResolutionDiagnostic(signals: string[]) {
  return signals.flatMap((signal): ProviderIdentityResolutionDiagnostic[] => {
    if (!signal.startsWith(diagnosticSignalPrefix) || signal.length > 8_000) return [];
    try {
      const value = JSON.parse(Buffer.from(signal.slice(diagnosticSignalPrefix.length), "base64url").toString("utf8")) as Partial<ProviderIdentityResolutionDiagnostic>;
      if (
        value.version !== "provider-identity-resolution-v1"
        || !["strong_match", "ambiguous", "no_match"].includes(String(value.status))
        || typeof value.matchedProvider !== "string"
        || !Array.isArray(value.matchedSignals)
        || !Array.isArray(value.conflictingSignals)
        || typeof value.confidenceSufficient !== "boolean"
        || typeof value.evidenceCurrentForQualification !== "boolean"
        || typeof value.plausibleCandidateCount !== "number"
        || typeof value.websiteCandidate !== "string"
        || typeof value.providerWebsiteAcceptedAsOwned !== "boolean"
        || typeof value.reason !== "string"
        || typeof value.checkedAt !== "string"
      ) return [];
      return [{
        version: "provider-identity-resolution-v1",
        status: value.status as ProviderIdentityResolution["status"],
        matchedProvider: (["osm", "google", "bing", "yelp", "yellowPages"].includes(value.matchedProvider)
          ? value.matchedProvider
          : "") as DiscoveryIdentitySource | "",
        matchedSignals: value.matchedSignals.filter((item): item is ProviderIdentityMatchedSignal => providerIdentityMatchedSignals.includes(item as ProviderIdentityMatchedSignal)),
        conflictingSignals: value.conflictingSignals.filter((item): item is ProviderIdentityConflictingSignal => providerIdentityConflictingSignals.includes(item as ProviderIdentityConflictingSignal)),
        confidenceSufficient: value.confidenceSufficient,
        evidenceCurrentForQualification: value.evidenceCurrentForQualification,
        plausibleCandidateCount: Math.max(0, Math.min(20, Math.floor(value.plausibleCandidateCount))),
        websiteCandidate: value.websiteCandidate.slice(0, 500),
        providerWebsiteAcceptedAsOwned: value.providerWebsiteAcceptedAsOwned,
        reason: value.reason.slice(0, 1_000),
        checkedAt: value.checkedAt.slice(0, 100),
      }];
    } catch {
      return [];
    }
  }).at(-1) ?? null;
}

export function sameNameIdentityAmbiguityRemains(signals: string[]) {
  return discoverySameNameAmbiguityRemains(signals);
}
