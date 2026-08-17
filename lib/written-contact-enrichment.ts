import {
  classifyProspectPresence,
  contactEvidenceMethods,
  prospectWrittenContactMethodIsUsable,
  reconcileProspectContactRouting,
  recommendProspectContactMethod,
  type ContactRouteEvidence,
  type Prospect,
} from "@/lib/prospect-engine";
import {
  classifyPublicEmailEvidence,
  verifiedEmailEvidenceForProspect,
  websiteFitAllowsAutonomousOutreach,
} from "@/lib/prospect-qualification";
import {
  discoveryIdentityEvidenceFromSignals,
  discoveryIdentityEvidenceIsFresh,
  discoverySameNameAmbiguityRemains,
  isSpecificBusinessSocialProfileUrl,
  normalizedBusinessIdentityName,
  normalizedCompletePhone,
  normalizedStreetAddress,
  type DiscoveryIdentityEvidence,
  type DiscoveryIdentitySource,
} from "@/lib/prospect-identity-evidence";
import { resolveProviderIdentityCandidates } from "@/lib/prospect-identity-resolution";
import { latestNoSiteEnrichmentDiagnostic } from "@/lib/prospect-verification-resolution";
import { fetchPublicResearchDocument } from "@/lib/site-analysis";
import { prospectIsSuppressed } from "@/lib/prospect-funnel";

export const writtenContactEnrichmentOutcomes = [
  "verified_email",
  "manual_social",
  "no_route",
  "provider_unavailable",
  "identity_conflict",
] as const;
export type WrittenContactEnrichmentOutcome = (typeof writtenContactEnrichmentOutcomes)[number];

export type WrittenContactEnrichmentDiagnostic = {
  version: "written-contact-enrichment-v1";
  outcome: WrittenContactEnrichmentOutcome;
  checkedAt: string;
  reason: string;
  providerSources: DiscoveryIdentitySource[];
  sourceUrl: string;
  routeKind: "email" | "facebook" | "instagram" | "linkedin" | "";
  extractionMethod: ContactRouteEvidence["extractionMethod"] | "";
  requestCount: number;
};

type ResearchDocument = { text: string; url: URL };
export type WrittenContactEnrichmentDependencies = {
  now?: () => Date;
  fetchDocument?: (url: string) => Promise<ResearchDocument>;
};

const diagnosticPrefix = "written_contact_enrichment:";
const diagnosticFreshnessMs = 24 * 60 * 60 * 1_000;
const noSiteEvidenceFreshnessMs = 7 * 24 * 60 * 60 * 1_000;
const maximumSocialDocuments = 2;
const authoritativeSources = new Set<DiscoveryIdentitySource>(["google", "bing", "yelp"]);
const protectedStatuses = new Set(["Contacted", "Interested", "Proposal Sent", "Closed Won", "Closed Lost"]);

function safeDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateIsFresh(value: string, now: Date, maximumAgeMs: number) {
  const timestamp = safeDate(value);
  const age = now.getTime() - timestamp;
  return timestamp > 0 && age >= 0 && age <= maximumAgeMs;
}

function bounded(value: string, length: number) {
  return value.trim().slice(0, length);
}

export function writtenContactEnrichmentDiagnosticSignal(diagnostic: WrittenContactEnrichmentDiagnostic) {
  return `${diagnosticPrefix}${Buffer.from(JSON.stringify(diagnostic)).toString("base64url")}`;
}

export function latestWrittenContactEnrichmentDiagnostic(signals: string[]) {
  return signals.flatMap((signal): WrittenContactEnrichmentDiagnostic[] => {
    if (!signal.startsWith(diagnosticPrefix) || signal.length > 6_000) return [];
    try {
      const value = JSON.parse(Buffer.from(signal.slice(diagnosticPrefix.length), "base64url").toString("utf8")) as Partial<WrittenContactEnrichmentDiagnostic>;
      if (
        value.version !== "written-contact-enrichment-v1"
        || !writtenContactEnrichmentOutcomes.includes(value.outcome as WrittenContactEnrichmentOutcome)
        || typeof value.checkedAt !== "string"
        || typeof value.reason !== "string"
        || !Array.isArray(value.providerSources)
        || typeof value.sourceUrl !== "string"
        || !["email", "facebook", "instagram", "linkedin", ""].includes(String(value.routeKind))
        || ![...contactEvidenceMethods, ""].includes(value.extractionMethod as ContactRouteEvidence["extractionMethod"] | "")
        || typeof value.requestCount !== "number"
      ) return [];
      return [{
        version: "written-contact-enrichment-v1",
        outcome: value.outcome as WrittenContactEnrichmentOutcome,
        checkedAt: bounded(value.checkedAt, 100),
        reason: bounded(value.reason, 1_000),
        providerSources: value.providerSources.filter((source): source is DiscoveryIdentitySource => ["osm", "google", "bing", "yelp", "yellowPages"].includes(String(source))),
        sourceUrl: bounded(value.sourceUrl, 500),
        routeKind: value.routeKind as WrittenContactEnrichmentDiagnostic["routeKind"],
        extractionMethod: bounded(value.extractionMethod as string, 100) as WrittenContactEnrichmentDiagnostic["extractionMethod"],
        requestCount: Math.max(0, Math.min(maximumSocialDocuments, Math.floor(value.requestCount))),
      }];
    } catch {
      return [];
    }
  }).at(-1) ?? null;
}

export function writtenContactEnrichmentDiagnosticIsFresh(
  diagnostic: WrittenContactEnrichmentDiagnostic | null,
  now = new Date(),
) {
  if (!diagnostic) return false;
  return dateIsFresh(diagnostic.checkedAt, now, diagnosticFreshnessMs);
}

export function prospectNeedsBoundedWrittenContactEnrichment(prospect: Prospect, now = new Date()) {
  if (
    prospect.prospectType !== "no_website_social_only"
    || !prospect.phone.trim()
    || protectedStatuses.has(prospect.status)
    || prospectIsSuppressed(prospect)
    || (prospectWrittenContactMethodIsUsable(prospect) && writtenContactRouteIsFresh(prospect, now))
    || !websiteFitAllowsAutonomousOutreach(prospect)
  ) return false;
  const report = prospect.websiteVerification;
  if (
    report?.version !== "website-verification-v2"
    || report.status !== "no_owned_website"
    || report.ownershipDecision !== "not_owned"
    || report.fit?.disposition !== "no_owned_website"
    || report.confidence !== "high"
    || !dateIsFresh(report.checkedAt, now, noSiteEvidenceFreshnessMs)
  ) return false;
  const noSite = latestNoSiteEnrichmentDiagnostic(prospect.activitySignals);
  if (
    noSite?.outcome !== "probable_no_owned_website"
    || new Set(noSite.providerSources).size < 2
    || !dateIsFresh(noSite.checkedAt, now, noSiteEvidenceFreshnessMs)
  ) return false;
  const latest = latestWrittenContactEnrichmentDiagnostic(prospect.activitySignals);
  return !writtenContactEnrichmentDiagnosticIsFresh(latest, now);
}

function writtenContactRouteIsFresh(prospect: Prospect, now: Date) {
  const activeValues = new Set([
    prospect.email,
    prospect.contactFormUrl,
    prospect.quoteFormUrl,
    prospect.facebookUrl,
    prospect.instagramUrl,
    prospect.linkedinUrl,
  ].map((value) => value.trim().toLowerCase()).filter(Boolean));
  return prospect.contactEvidence.some((item) => {
    const checkedAt = safeDate(item.lastVerifiedAt || item.discoveredAt);
    return activeValues.has(item.value.trim().toLowerCase())
      && checkedAt > 0
      && now.getTime() - checkedAt >= 0
      && now.getTime() - checkedAt <= diagnosticFreshnessMs;
  });
}

function normalizedSocialUrl(value: string) {
  if (!isSpecificBusinessSocialProfileUrl(value)) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return "";
  }
}

function socialKind(value: string): "facebook" | "instagram" | "linkedin" | "" {
  try {
    const host = new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com")) return "facebook";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  } catch {
    return "";
  }
  return "";
}

function socialProviderDomain(value: string) {
  const kind = socialKind(value);
  return kind || "unsupported";
}

function matchedSocialCandidates(prospect: Prospect, evidence: DiscoveryIdentityEvidence[], now: Date) {
  if (discoverySameNameAmbiguityRemains(prospect.activitySignals)) return [];
  return evidence.flatMap((item) => {
    if (!authoritativeSources.has(item.source) || !discoveryIdentityEvidenceIsFresh(item, now)) return [];
    const resolution = resolveProviderIdentityCandidates(prospect, [item]);
    if (resolution.status !== "strong_match" || !resolution.confidenceSufficient) return [];
    const candidates = [item.profileUrl, item.website].map(normalizedSocialUrl).filter(Boolean);
    return candidates.map((url) => ({ url, evidence: item }));
  }).filter((candidate, index, all) => all.findIndex((item) => item.url === candidate.url) === index)
    .slice(0, maximumSocialDocuments);
}

function cleanPublicText(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&commat;|&#64;|&#x40;/gi, "@")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageReconfirmsIdentity(prospect: Prospect, evidence: DiscoveryIdentityEvidence, html: string) {
  const text = cleanPublicText(html);
  const normalizedPage = normalizedBusinessIdentityName(text);
  const expectedName = normalizedBusinessIdentityName(prospect.businessName);
  if (!expectedName || !normalizedPage.includes(expectedName)) return false;
  const expectedPhone = normalizedCompletePhone(prospect.phone);
  const pagePhones = new Set((text.match(/(?:\+?1[\s.(\-]*)?(?:\d{3}|\(\d{3}\))[\s.)\-]*\d{3}[\s.\-]*\d{4}/g) ?? [])
    .map(normalizedCompletePhone)
    .filter(Boolean));
  if (expectedPhone && pagePhones.size > 0 && !pagePhones.has(expectedPhone)) return false;
  if (expectedPhone && pagePhones.has(expectedPhone)) return true;
  const expectedAddress = normalizedStreetAddress(prospect.address);
  const evidenceAddress = normalizedStreetAddress(evidence.address);
  return Boolean(
    expectedAddress
    && evidenceAddress
    && expectedAddress === evidenceAddress
    && text.toLowerCase().includes(prospect.city.toLowerCase())
    && text.toLowerCase().includes(prospect.state.toLowerCase()),
  );
}

function observedEmailCandidates(html: string) {
  const visible = cleanPublicText(html).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const mailto = [...html.matchAll(/href\s*=\s*["']mailto:([^?"']+)/gi)]
    .map((match) => match[1] ? decodeURIComponent(match[1]) : "")
    .filter(Boolean);
  return [...new Set([...mailto, ...visible].map((email) => email.trim().toLowerCase()))];
}

function withDiagnostic(prospect: Prospect, diagnostic: WrittenContactEnrichmentDiagnostic) {
  return {
    ...prospect,
    activitySignals: [
      ...prospect.activitySignals.filter((signal) => !signal.startsWith(diagnosticPrefix)),
      writtenContactEnrichmentDiagnosticSignal(diagnostic),
    ],
  };
}

function withSocialRoute(prospect: Prospect, url: string, checkedAt: string) {
  const kind = socialKind(url);
  if (!kind) return prospect;
  const evidence: ContactRouteEvidence = {
    kind,
    value: url,
    sourceUrl: url,
    extractionMethod: "existing_provider",
    confidence: "high",
    domainMatchesBusiness: false,
    discoveredAt: checkedAt,
    lastVerifiedAt: checkedAt,
    sourceType: "official_social",
    firstParty: true,
    decision: "manual_review_required",
    decisionReason: "An identity-matched provider supplied this official social profile. Social messages remain manual.",
  };
  const contactEvidence = [
    ...prospect.contactEvidence.filter((item) => !(item.kind === kind && item.value === url)),
    evidence,
  ];
  const updated = {
    ...prospect,
    ...(kind === "facebook" ? { facebookUrl: url } : {}),
    ...(kind === "instagram" ? { instagramUrl: url } : {}),
    ...(kind === "linkedin" ? { linkedinUrl: url } : {}),
    contactEvidence,
  };
  const classification = classifyProspectPresence(updated);
  return reconcileProspectContactRouting({
    ...updated,
    classification,
    recommendedContactMethod: recommendProspectContactMethod({ ...updated, classification }),
  });
}

function withObservedEmail(prospect: Prospect, email: string, sourceUrl: string, html: string, checkedAt: string) {
  const extractionMethod: ContactRouteEvidence["extractionMethod"] = new RegExp(`mailto:${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(html)
    ? "mailto"
    : "visible_text";
  const decision = classifyPublicEmailEvidence({
    email,
    businessName: prospect.businessName,
    website: "",
    sourceUrl,
    extractionMethod,
    sourceText: cleanPublicText(html),
    sourceType: "official_social",
  });
  const evidence: ContactRouteEvidence = {
    kind: "email",
    value: email,
    sourceUrl,
    extractionMethod,
    confidence: decision.decision === "autonomous_eligible" ? "high" : "medium",
    domainMatchesBusiness: decision.domainMatchesBusiness,
    discoveredAt: checkedAt,
    lastVerifiedAt: checkedAt,
    sourceType: decision.sourceType,
    firstParty: decision.firstParty,
    decision: decision.decision,
    decisionReason: decision.reason,
  };
  const contactEvidence = [
    ...prospect.contactEvidence.filter((item) => !(item.kind === "email" && item.value.toLowerCase() === email)),
    evidence,
  ];
  if (decision.decision !== "autonomous_eligible") return { prospect: { ...prospect, contactEvidence }, evidence };
  const updated = reconcileProspectContactRouting({ ...prospect, email, contactEvidence }, [email]);
  return { prospect: updated, evidence };
}

export async function enrichProspectWrittenContact(
  prospect: Prospect,
  dependencies: WrittenContactEnrichmentDependencies = {},
) {
  const now = dependencies.now?.() ?? new Date();
  if (!prospectNeedsBoundedWrittenContactEnrichment(prospect, now)) {
    return { prospect, attempted: false, diagnostic: latestWrittenContactEnrichmentDiagnostic(prospect.activitySignals) };
  }
  const checkedAt = now.toISOString();
  const providerEvidence = discoveryIdentityEvidenceFromSignals(prospect.activitySignals)
    .filter((item) => discoveryIdentityEvidenceIsFresh(item, now));
  const providerSources = [...new Set(providerEvidence.map((item) => item.source))].sort();
  const candidates = matchedSocialCandidates(prospect, providerEvidence, now);
  let requestCount = 0;
  let updated = prospect;
  let verifiedEmail: ContactRouteEvidence | null = null;
  let selectedSocial = "";

  for (const candidate of candidates) {
    selectedSocial ||= candidate.url;
    updated = withSocialRoute(updated, candidate.url, checkedAt);
    try {
      requestCount += 1;
      const document = await (dependencies.fetchDocument
        ? dependencies.fetchDocument(candidate.url)
        : fetchPublicResearchDocument(candidate.url, { requestTimeoutMs: 5_000 }));
      if (socialProviderDomain(document.url.href) !== socialProviderDomain(candidate.url)) continue;
      if (!pageReconfirmsIdentity(updated, candidate.evidence, document.text)) continue;
      for (const email of observedEmailCandidates(document.text)) {
        const result = withObservedEmail(updated, email, candidate.url, document.text, checkedAt);
        updated = result.prospect;
        if (verifiedEmailEvidenceForProspect(updated)) {
          verifiedEmail = result.evidence;
          break;
        }
      }
      if (verifiedEmail) break;
    } catch {
      // A social page may block crawling. The identity-matched profile remains a manual route.
    }
  }

  const ambiguity = discoverySameNameAmbiguityRemains(prospect.activitySignals);
  const outcome: WrittenContactEnrichmentOutcome = verifiedEmail
    ? "verified_email"
    : selectedSocial
      ? "manual_social"
      : ambiguity
        ? "identity_conflict"
        : providerEvidence.length === 0
          ? "provider_unavailable"
          : "no_route";
  const routeKind = verifiedEmail ? "email" : selectedSocial ? socialKind(selectedSocial) : "";
  const sourceUrl = verifiedEmail?.sourceUrl ?? selectedSocial;
  const reason = verifiedEmail
    ? `A verified public email was observed on the identity-matched official social profile ${sourceUrl}.`
    : selectedSocial
      ? `An identity-matched official ${routeKind} profile was found. Messaging remains manual and no message was sent.`
      : ambiguity
        ? "Provider identity evidence remains ambiguous, so no written contact route was attached."
        : providerEvidence.length === 0
          ? "No current provider identity evidence was available for bounded written-contact enrichment."
          : "Current identity-matched provider evidence contained no trustworthy public written contact route.";
  const diagnostic: WrittenContactEnrichmentDiagnostic = {
    version: "written-contact-enrichment-v1",
    outcome,
    checkedAt,
    reason,
    providerSources,
    sourceUrl,
    routeKind,
    extractionMethod: verifiedEmail?.extractionMethod ?? (selectedSocial ? "existing_provider" : ""),
    requestCount,
  };
  return { prospect: withDiagnostic(updated, diagnostic), attempted: true, diagnostic };
}
