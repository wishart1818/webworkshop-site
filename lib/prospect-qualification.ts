import { WEBWORKSHOP_OUTREACH_COPY_VERSION, webworkshopCleanBusinessName } from "@/lib/outreach-style-guide";
import type {
  ContactRouteEvidence,
  Prospect,
  ProspectFreshness,
  WebsiteFitDisposition,
  WebsiteFitObservation,
} from "@/lib/prospect-engine";

const freeMailboxDomains = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

const autonomousWebsiteFits = new Set<WebsiteFitDisposition>([
  "no_owned_website",
  "broken_or_inactive_website",
  "clearly_weak_or_outdated_website",
]);

const protectedProspectStatuses = new Set<Prospect["status"]>([
  "Contacted",
  "Interested",
  "Proposal Sent",
  "Closed Won",
  "Closed Lost",
]);

const oneDayMs = 24 * 60 * 60 * 1_000;
const sevenDaysMs = 7 * oneDayMs;
const thirtyDaysMs = 30 * oneDayMs;

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function emailParts(value: string) {
  const [local = "", domain = ""] = normalizedEmail(value).split("@");
  return { local, domain };
}

function publicHostname(value: string) {
  if (!value.trim()) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

function sourceIsFirstParty(sourceUrl: string, website: string) {
  const sourceHost = publicHostname(sourceUrl);
  const websiteHost = publicHostname(website);
  return Boolean(
    sourceHost
    && websiteHost
    && (
      sourceHost === websiteHost
      || sourceHost.endsWith(`.${websiteHost}`)
      || websiteHost.endsWith(`.${sourceHost}`)
    ),
  );
}

function normalizedPublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return "";
  }
}

function officialSocialSourceMatchesProspect(
  sourceUrl: string,
  prospect: Partial<Pick<Prospect, "profileUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "xUrl" | "youtubeUrl">>,
) {
  const source = normalizedPublicUrl(sourceUrl);
  if (!source) return false;
  return [
    prospect.profileUrl,
    prospect.facebookUrl,
    prospect.instagramUrl,
    prospect.linkedinUrl,
    prospect.xUrl,
    prospect.youtubeUrl,
  ].some((candidate) => normalizedPublicUrl(candidate ?? "") === source);
}

function emailSyntaxValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function suspiciousMailbox(local: string) {
  return /^(?:admin|billing|developer|example|filler|no-?reply|noreply|do-?not-?reply|donotreply|privacy|test|webmaster|wordpress|wp)$/i.test(local);
}

function vendorOrTemplateDomain(domain: string) {
  return /(?:analytics|cloudflare|demo|developer|directory|godaddy|hosting|hubspot|mailchimp|sentry|shopify|sitebuilder|squarespace|template|themeforest|totalwp|webdesigner|wix|wordpress|wpengine|yellowpages|yelp)/i.test(domain);
}

function publicContactContext(sourceUrl: string, sourceText: string) {
  let path = "";
  try {
    path = new URL(sourceUrl).pathname;
  } catch {
    path = "";
  }
  const editorialOrVendorContext = /\b(?:site|website)\s+(?:built|created|designed|developed|hosted|maintained|powered)\s+by\b|\bweb\s+(?:design|designer|development|developer|hosting)\b|\btheme\s+by\b/i.test(sourceText);
  if (editorialOrVendorContext) return false;
  return /contact|about|quote|estimate|booking|schedule|location/i.test(path)
    || /\b(?:contact|email|reach us|office|request (?:a )?(?:quote|estimate)|get in touch)\b/i.test(sourceText);
}

export type PublicEmailEvidenceInput = {
  email: string;
  businessName: string;
  website: string;
  sourceUrl: string;
  extractionMethod: ContactRouteEvidence["extractionMethod"];
  sourceText?: string;
  sourceType?: ContactRouteEvidence["sourceType"];
};

export function classifyPublicEmailEvidence(input: PublicEmailEvidenceInput) {
  const email = normalizedEmail(input.email);
  const { local, domain } = emailParts(email);
  const websiteFirstParty = sourceIsFirstParty(input.sourceUrl, input.website);
  const sourceType = input.sourceType ?? (websiteFirstParty ? "owned_website" : "unknown");
  const firstParty = websiteFirstParty || sourceType === "official_social";
  const websiteHost = publicHostname(input.website);
  const domainMatchesBusiness = Boolean(
    domain
    && websiteHost
    && (websiteHost === domain || websiteHost.endsWith(`.${domain}`)),
  );
  const methodIsPublic = ["visible_text", "mailto", "json_ld", "metadata"].includes(input.extractionMethod);
  const strongPublicContext = publicContactContext(input.sourceUrl, input.sourceText ?? "");

  if (!emailSyntaxValid(email) || !local || !domain) {
    return { decision: "rejected" as const, reason: "The email is malformed.", firstParty, domainMatchesBusiness, sourceType };
  }
  if (vendorOrTemplateDomain(domain)) {
    return { decision: "rejected" as const, reason: "The address belongs to a vendor, directory, template, or infrastructure domain.", firstParty, domainMatchesBusiness, sourceType };
  }
  if (/^(?:privacy|legal|abuse|security)$/i.test(local)) {
    return { decision: "rejected" as const, reason: "The address is a privacy, legal, abuse, or security mailbox rather than a business-outreach contact.", firstParty, domainMatchesBusiness, sourceType };
  }
  if (suspiciousMailbox(local)) {
    return { decision: "manual_review_required" as const, reason: "The mailbox role is suspicious or not clearly intended for business outreach.", firstParty, domainMatchesBusiness, sourceType };
  }
  if (!input.sourceUrl || sourceType === "provider" || sourceType === "directory" || input.extractionMethod === "existing_provider") {
    return { decision: "manual_review_required" as const, reason: "Provider or directory data requires corroboration from an official public source.", firstParty, domainMatchesBusiness, sourceType };
  }
  if (domainMatchesBusiness && firstParty && methodIsPublic) {
    return {
      decision: "autonomous_eligible" as const,
      reason: sourceType === "official_social"
        ? "The business-domain address is publicly displayed on the verified official social profile."
        : "The business-domain address is publicly displayed on the verified owned website.",
      firstParty,
      domainMatchesBusiness,
      sourceType,
    };
  }
  if (freeMailboxDomains.has(domain)) {
    const stronglyPublished = firstParty
      && methodIsPublic
      && (["json_ld", "metadata"].includes(input.extractionMethod) || strongPublicContext);
    return stronglyPublished
      ? {
          decision: "autonomous_eligible" as const,
          reason: sourceType === "official_social"
            ? "The free-domain address is explicitly published as a business contact on the verified official social profile."
            : "The free-domain address is explicitly published as a business contact on the verified owned website.",
          firstParty,
          domainMatchesBusiness,
          sourceType,
        }
      : { decision: "manual_review_required" as const, reason: "Free-domain addresses require explicit first-party business-contact evidence.", firstParty, domainMatchesBusiness, sourceType };
  }
  return {
    decision: "manual_review_required" as const,
    reason: firstParty
      ? "The unrelated-domain address needs operator verification before outreach."
      : "The address was not found on the verified owned website.",
    firstParty,
    domainMatchesBusiness,
    sourceType,
  };
}

export function contactEvidenceIsAutonomousEmail(
  evidence: ContactRouteEvidence | null | undefined,
) {
  let officialSocialSource = false;
  if (evidence?.sourceType === "official_social") {
    try {
      const host = new URL(evidence.sourceUrl).hostname.replace(/^www\./i, "").toLowerCase();
      officialSocialSource = ["facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com", "youtube.com"]
        .some((domain) => host === domain || host.endsWith(`.${domain}`));
    } catch {
      officialSocialSource = false;
    }
  }
  return Boolean(
    evidence
    && evidence.kind === "email"
    && evidence.decision === "autonomous_eligible"
    && evidence.firstParty === true
    && ["owned_website", "official_social"].includes(evidence.sourceType ?? "")
    && evidence.confidence === "high"
    && evidence.sourceUrl
    && (evidence.sourceType !== "official_social" || officialSocialSource),
  );
}

export function verifiedEmailEvidenceForProspect(
  prospect: Pick<Prospect, "email" | "contactEvidence"> & Partial<Pick<Prospect, "website" | "websiteVerification" | "profileUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "xUrl" | "youtubeUrl">>,
) {
  const email = normalizedEmail(prospect.email);
  if (!email) return null;
  return prospect.contactEvidence.find((item) => (
    item.kind === "email"
    && normalizedEmail(item.value) === email
    && contactEvidenceIsAutonomousEmail(item)
    && (item.sourceType !== "owned_website" || sourceIsFirstParty(
      item.sourceUrl,
      prospect.websiteVerification?.canonicalUrl || prospect.website || "",
    ))
    && (item.sourceType !== "official_social" || officialSocialSourceMatchesProspect(item.sourceUrl, prospect))
  )) ?? null;
}

export function verifiedContactFirstNameForProspect(
  prospect: Pick<Prospect, "contactPersonName" | "contactEvidence"> & Partial<Pick<Prospect, "website" | "websiteVerification" | "profileUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "xUrl" | "youtubeUrl">>,
) {
  const candidate = prospect.contactPersonName.trim();
  if (!candidate) return "";
  const evidence = prospect.contactEvidence.find((item) => (
    item.kind === "contact_person"
    && item.value.trim().toLowerCase() === candidate.toLowerCase()
    && item.firstParty === true
    && ["owned_website", "official_social"].includes(item.sourceType ?? "")
    && item.confidence === "high"
    && Boolean(item.sourceUrl)
    && (item.sourceType !== "owned_website" || sourceIsFirstParty(
      item.sourceUrl,
      prospect.websiteVerification?.canonicalUrl || prospect.website || "",
    ))
    && (item.sourceType !== "official_social" || officialSocialSourceMatchesProspect(item.sourceUrl, prospect))
  ));
  return evidence ? candidate : "";
}

export function normalizeWebsiteFitDisposition(
  prospect: Pick<Prospect, "fitDisposition" | "websiteStatus" | "websiteVerification">,
): WebsiteFitDisposition {
  if (autonomousWebsiteFits.has(prospect.fitDisposition as WebsiteFitDisposition)
    || (["adequate_existing_website", "strong_existing_website", "inconclusive_requires_review"] as string[]).includes(prospect.fitDisposition)) {
    return prospect.fitDisposition as WebsiteFitDisposition;
  }
  if (prospect.fitDisposition === "confirmed_usable_not_fit") return "adequate_existing_website";
  // Legacy opportunity labels were created before the evidence-backed fit model.
  // They remain readable but must be re-verified before autonomous use.
  return "inconclusive_requires_review";
}

export function websiteFitAllowsAutonomousOutreach(
  prospect: Pick<Prospect, "fitDisposition" | "websiteStatus" | "websiteVerification">,
) {
  const disposition = normalizeWebsiteFitDisposition(prospect);
  const ownershipMatches = disposition === "no_owned_website"
    ? prospect.websiteVerification?.ownershipDecision === "not_owned"
    : prospect.websiteVerification?.ownershipDecision === "owned";
  const statusMatches = disposition === "no_owned_website"
    ? prospect.websiteStatus === "no_owned_website" && prospect.websiteVerification?.status === "no_owned_website"
    : disposition === "broken_or_inactive_website"
      ? ["confirmed_broken", "confirmed_inactive"].includes(prospect.websiteStatus)
        && ["confirmed_broken", "confirmed_inactive"].includes(prospect.websiteVerification?.status ?? "")
      : disposition === "clearly_weak_or_outdated_website"
        ? prospect.websiteStatus === "usable" && prospect.websiteVerification?.status === "usable"
        : false;
  return autonomousWebsiteFits.has(disposition)
    && prospect.websiteVerification?.version === "website-verification-v2"
    && prospect.websiteVerification.fit?.disposition === disposition
    && ownershipMatches
    && statusMatches;
}

function dateMs(value: string | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function prospectFreshnessAt(prospect: Prospect, now = new Date()): ProspectFreshness {
  const nowMs = now.getTime();
  const checkedAt = prospect.websiteVerification?.checkedAt || prospect.websiteAnalysisAttemptedAt;
  const fitAt = prospect.websiteVerification?.fit?.evaluatedAt || checkedAt;
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const verifiedFirstName = verifiedContactFirstNameForProspect(prospect);
  const contactPersonEvidence = verifiedFirstName
    ? prospect.contactEvidence.find((item) => (
        item.kind === "contact_person"
        && item.value.trim().toLowerCase() === verifiedFirstName.toLowerCase()
        && item.firstParty === true
        && item.confidence === "high"
      ))
    : null;
  const protectedRecord = protectedProspectStatuses.has(prospect.status);
  const verificationMaxAge = protectedRecord || prospect.inactive ? thirtyDaysMs : oneDayMs;
  const websiteVerificationFresh = dateMs(checkedAt) > 0 && nowMs - dateMs(checkedAt) <= verificationMaxAge;
  const websiteFitFresh = dateMs(fitAt) > 0 && nowMs - dateMs(fitAt) <= (protectedRecord ? thirtyDaysMs : sevenDaysMs);
  const emailSourceFresh = !prospect.email
    || Boolean(emailEvidence && nowMs - dateMs(emailEvidence.lastVerifiedAt || emailEvidence.discoveredAt) <= verificationMaxAge);
  const personSourceFresh = !verifiedFirstName
    || Boolean(contactPersonEvidence && nowMs - dateMs(contactPersonEvidence.lastVerifiedAt || contactPersonEvidence.discoveredAt) <= verificationMaxAge);
  const contactSourceFresh = emailSourceFresh && personSourceFresh;
  const copyVersionFresh = !prospect.outreach || prospect.outreach.outreachCopyVersion === WEBWORKSHOP_OUTREACH_COPY_VERSION;
  const websiteEvidenceChangedAt = prospect.websiteVerification?.freshness?.lastMeaningfulChange
    || fitAt
    || checkedAt;
  const evidenceFloor = Math.max(
    dateMs(websiteEvidenceChangedAt),
    dateMs(fitAt),
    dateMs(emailEvidence?.discoveredAt),
    dateMs(contactPersonEvidence?.discoveredAt),
  );
  const approvalFresh = !prospect.outreach?.approved
    || (copyVersionFresh && dateMs(prospect.outreach.generatedAt) >= evidenceFloor && evidenceFloor > 0);
  const staleReasons = [
    !websiteVerificationFresh ? "Website verification is stale." : "",
    !websiteFitFresh ? "Website-fit evidence is stale." : "",
    !contactSourceFresh ? "Public contact evidence is stale or unverified." : "",
    !copyVersionFresh ? "Outreach copy version is stale." : "",
    !approvalFresh ? "Approval predates the current evidence or copy." : "",
  ].filter(Boolean);
  const cadenceMs = protectedRecord || prospect.inactive ? thirtyDaysMs : oneDayMs;
  return {
    lastVerifiedAt: checkedAt || "",
    nextVerificationAt: checkedAt ? new Date(dateMs(checkedAt) + cadenceMs).toISOString() : "",
    nextDeepAssessmentAt: checkedAt ? new Date(dateMs(checkedAt) + (protectedRecord ? thirtyDaysMs : sevenDaysMs)).toISOString() : "",
    websiteVerificationFresh,
    websiteFitFresh,
    contactSourceFresh,
    copyVersionFresh,
    approvalFresh,
    lastMeaningfulChange: prospect.websiteVerification?.freshness?.lastMeaningfulChange || checkedAt || "",
    staleReason: staleReasons.join(" "),
    humanReviewRequired: staleReasons.length > 0 || normalizeWebsiteFitDisposition(prospect) === "inconclusive_requires_review",
  };
}

export function initialProspectFreshness(prospect: Prospect, checkedAt: string): ProspectFreshness {
  const cadenceMs = protectedProspectStatuses.has(prospect.status) || prospect.inactive ? thirtyDaysMs : oneDayMs;
  return {
    lastVerifiedAt: checkedAt,
    nextVerificationAt: new Date(Date.parse(checkedAt) + cadenceMs).toISOString(),
    nextDeepAssessmentAt: new Date(Date.parse(checkedAt) + (cadenceMs === thirtyDaysMs ? thirtyDaysMs : sevenDaysMs)).toISOString(),
    websiteVerificationFresh: true,
    websiteFitFresh: true,
    contactSourceFresh: true,
    copyVersionFresh: !prospect.outreach || prospect.outreach.outreachCopyVersion === WEBWORKSHOP_OUTREACH_COPY_VERSION,
    approvalFresh: !prospect.outreach?.approved,
    lastMeaningfulChange: checkedAt,
    staleReason: "",
    humanReviewRequired: false,
  };
}

export function outreachObservationForProspect(prospect: Prospect): WebsiteFitObservation | null {
  if (!websiteFitAllowsAutonomousOutreach(prospect)) return null;
  const saved = prospect.websiteVerification?.fit?.observation;
  if (saved) return saved;
  const disposition = normalizeWebsiteFitDisposition(prospect);
  if (disposition === "no_owned_website") {
    return {
      kind: "no_owned_website",
      statement: "I couldn't find a dedicated website linked from the business's public profiles.",
      rebuildSentence: "I can build you a modern website from the ground up that clearly presents your services and makes it easier for customers to call or request a quote.",
      evidence: [prospect.websiteVerification?.explanation || "Verified public profiles did not identify an owned website."],
      demoChecklist: ["Show verified services", "Show the desktop and mobile layouts", "Show the phone and quote-request paths"],
    };
  }
  if (disposition === "broken_or_inactive_website") {
    return {
      kind: "broken_or_inactive",
      statement: "I wasn't able to reach a working version of your current website after checking the public site more than once.",
      rebuildSentence: "I can rebuild the website with a modern, mobile-friendly design that clearly presents your services and gives customers a reliable way to call or request a quote.",
      evidence: [prospect.websiteVerification?.explanation || "Independent verification attempts confirmed the website is inactive."],
      demoChecklist: ["Show a complete working homepage", "Show the mobile layout", "Show verified contact actions"],
    };
  }
  return null;
}

export function outreachObservationGroundingProblems(observation: WebsiteFitObservation | null) {
  if (!observation) return ["No evidence-backed outreach observation is saved."];
  const problems = [
    !observation.statement.trim() ? "The outreach observation has no customer-facing statement." : "",
    !observation.rebuildSentence.trim() ? "The outreach observation has no matching rebuild solution." : "",
    !observation.evidence.some((item) => item.trim().length >= 8) ? "The outreach observation has no supporting evidence." : "",
    !observation.demoChecklist.some((item) => item.trim().length >= 5) ? "The outreach observation has no Lovable/Loom demonstration checklist." : "",
  ];
  if (observation.kind === "mobile_layout") {
    if (!observation.evidence.some((item) => /mobile|phone|viewport|responsive|390px|430px/i.test(item))) {
      problems.push("The mobile claim lacks mobile-specific rendered evidence.");
    }
    if (!observation.demoChecklist.some((item) => /mobile|phone|viewport|responsive/i.test(item))) {
      problems.push("The mobile claim is not mapped to a mobile Lovable/Loom demonstration.");
    }
  }
  return problems.filter(Boolean);
}

export function outreachObservationSupported(prospect: Prospect, body: string) {
  const observation = outreachObservationForProspect(prospect);
  if (!observation || outreachObservationGroundingProblems(observation).length) return false;
  const normalizedBody = body.replace(/\s+/g, " ").toLowerCase();
  return normalizedBody.includes(observation.statement.replace(/\s+/g, " ").toLowerCase())
    && normalizedBody.includes(observation.rebuildSentence.replace(/\s+/g, " ").toLowerCase());
}

export function prospectQualificationBlockReasons(
  prospect: Prospect,
  options: { allowRefreshableStaleness?: boolean; now?: Date } = {},
) {
  const fit = normalizeWebsiteFitDisposition(prospect);
  const freshness = prospectFreshnessAt(prospect, options.now);
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const observation = outreachObservationForProspect(prospect);
  return [
    protectedProspectStatuses.has(prospect.status) ? `Prospect status ${prospect.status} is protected.` : "",
    !websiteFitAllowsAutonomousOutreach(prospect)
      ? fit === "adequate_existing_website" || fit === "strong_existing_website"
        ? "The verified website is adequate or strong and is not a fit for rebuild outreach."
        : "Website fit is inconclusive or lacks current structured evidence."
      : "",
    prospect.websiteVerification?.ownershipDecision === "uncertain" ? "Website ownership is uncertain." : "",
    prospect.email && !emailEvidence ? "Public email lacks autonomous-quality first-party evidence." : "",
    !options.allowRefreshableStaleness && !freshness.websiteVerificationFresh ? "Website verification is stale." : "",
    !options.allowRefreshableStaleness && !freshness.websiteFitFresh ? "Website-fit evidence is stale." : "",
    !options.allowRefreshableStaleness && !freshness.contactSourceFresh ? "Public contact evidence is stale." : "",
    !freshness.copyVersionFresh ? "Outreach copy is outdated." : "",
    !freshness.approvalFresh ? "Approval predates the current evidence or copy." : "",
    ...outreachObservationGroundingProblems(observation),
    prospect.outreach && !outreachObservationSupported(prospect, prospect.outreach.concise)
      ? "The first-touch claim is not tied to the saved website observation and rebuild solution."
      : "",
  ].filter(Boolean);
}

export type ProspectDecisionDimensions = {
  businessQuality: number;
  websiteQuality: number;
  websiteNeed: number;
  contactability: number;
  businessIdentityConfidence: number;
  contactEvidenceConfidence: number;
  outreachFit: number;
  finalAutonomousEligibility: "Eligible" | "Blocked" | "Needs Review";
};

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function prospectDecisionDimensions(prospect: Prospect): ProspectDecisionDimensions {
  const fit = normalizeWebsiteFitDisposition(prospect);
  const emailEvidence = verifiedEmailEvidenceForProspect(prospect);
  const blockReasons = prospectQualificationBlockReasons(prospect);
  const identityConfidence = prospect.websiteVerification?.ownershipDecision === "owned"
    ? prospect.websiteVerification.confidence === "high" ? 100 : 75
    : prospect.websiteVerification?.ownershipDecision === "not_owned" ? 90 : 25;
  const websiteNeed: Record<WebsiteFitDisposition, number> = {
    no_owned_website: 100,
    broken_or_inactive_website: 95,
    clearly_weak_or_outdated_website: 82,
    inconclusive_requires_review: 45,
    adequate_existing_website: 10,
    strong_existing_website: 0,
  };
  const websiteQualityFallback: Record<WebsiteFitDisposition, number> = {
    no_owned_website: 0,
    broken_or_inactive_website: 5,
    clearly_weak_or_outdated_website: 30,
    inconclusive_requires_review: 50,
    adequate_existing_website: 78,
    strong_existing_website: 92,
  };
  const businessQuality = bounded(
    (prospect.sourceConfidence || 0) * 0.35
    + (prospect.rating ? Math.min(100, prospect.rating * 20) : 45) * 0.2
    + Math.min(100, Math.log10(Math.max(1, prospect.reviewCount) + 1) * 45) * 0.2
    + (prospect.sizeIndicator === "Established" ? 90 : prospect.sizeIndicator === "Growing" ? 72 : 55) * 0.25,
  );
  const contactability = bounded(
    emailEvidence ? 100
      : prospect.contactFormUrl || prospect.quoteFormUrl ? 70
        : prospect.facebookUrl || prospect.instagramUrl || prospect.linkedinUrl ? 50
          : prospect.phone ? 25 : 0,
  );
  const outreachFit = bounded(websiteNeed[fit] * 0.65 + identityConfidence * 0.2 + contactability * 0.15);
  return {
    businessQuality,
    websiteQuality: prospect.analysis?.overallScore ?? websiteQualityFallback[fit],
    websiteNeed: websiteNeed[fit],
    contactability,
    businessIdentityConfidence: identityConfidence,
    contactEvidenceConfidence: emailEvidence?.confidence === "high" ? 100 : emailEvidence?.confidence === "medium" ? 70 : 0,
    outreachFit,
    finalAutonomousEligibility: blockReasons.length === 0 ? "Eligible" : fit === "inconclusive_requires_review" ? "Needs Review" : "Blocked",
  };
}

export function cleanBusinessNameForGreeting(value: string) {
  return webworkshopCleanBusinessName(value);
}
