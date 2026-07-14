import type { DiscoveredLead, DiscoveryDiagnostics } from "@/lib/lead-discovery";
import { webworkshopOptOutPattern } from "@/lib/outreach-style-guide";
import { siteUrl } from "@/lib/site";
import type { TopProspectJobFailureClassification } from "@/lib/top-prospect-diagnostics";
import {
  generateOutreach,
  generatePreview,
  allCoreServiceTradesOption,
  coreServiceTrades,
  displayStateCode,
  displayTradeCategory,
  prospectContactMethodIsUsable,
  prospectEmailNeedsManualVerification,
  prospectWrittenContactMethodIsUsable,
  previewStyleProfile,
  scorePreviewQuality,
  normalizeTradeCategory,
  type Analysis,
  type OutreachDraft,
  type Prospect,
  titleCaseLocation,
  prospectSearchTypes,
  type ProspectSearchType,
  type TopProspectTradeSelection,
  type TradeCategory,
  webworkshopPostalAddress,
} from "@/lib/prospect-engine";

export const topProspectJobStatuses = [
  "QUEUED",
  "RUNNING",
  "NEEDS_NEXT_BATCH",
  "PARTIAL_RESULTS_READY",
  "COMPLETED",
  "COMPLETED_WITH_PARTIAL_RESULTS",
  "FAILED",
  "FAILED_AFTER_DISCOVERY",
] as const;
export type TopProspectJobStatus = (typeof topProspectJobStatuses)[number];

export const prospectModes = ["strict", "growth", "volume"] as const;
export type ProspectMode = (typeof prospectModes)[number];

export const topProspectWorkflowTypes = ["search", "morning_batch"] as const;
export type TopProspectWorkflowType = (typeof topProspectWorkflowTypes)[number];

export const outreachPreferences = ["written_only", "phone_allowed"] as const;
export type OutreachPreference = (typeof outreachPreferences)[number];

export const outreachPackageStatuses = [
  "NOT_GENERATED",
  "PACKAGE_GENERATED",
  "READY_FOR_REVIEW",
  "APPROVED_TO_SEND",
  "SENT",
  "SKIPPED",
] as const;
export type OutreachPackageStatus = (typeof outreachPackageStatuses)[number];

export const outreachPackageActions = ["generate", "ready_for_review", "approve", "mark_sent", "skip"] as const;
export type OutreachPackageAction = (typeof outreachPackageActions)[number];

export type TopProspectInput = {
  trade: TopProspectTradeSelection;
  city: string;
  state: string;
  rawCityInput?: string;
  cityTargets?: CitySearchTarget[];
  radiusKm: number;
  businessesToScan: number;
  finalProspectsWanted: number;
  prospectType: ProspectSearchType;
  mode: ProspectMode;
  workflowType: TopProspectWorkflowType;
  outreachPreference: OutreachPreference;
  excludePreviouslyReviewed: boolean;
};

export type CitySearchTarget = {
  city: string;
  state: string;
  label: string;
};

export type RecommendedMarketPreset = {
  id: string;
  name: string;
  cities: CitySearchTarget[];
  trades: TradeCategory[];
  starter: boolean;
};

export type ProspectSalesScores = {
  websiteQualityScore: number;
  revenueOpportunityScore: number;
  contactabilityScore: number;
  localMarketCompetitivenessScore: number;
  aiReplacementConfidenceScore: number;
  weightedSalesScore: number;
};

export type OpportunityAssessment = {
  opportunityScore: number;
  salesScores: ProspectSalesScores;
  presenceScores: NoWebsitePresenceScores | null;
  mainWeakness: string;
  whyMayBuy: string;
  pitchAngle: string;
};

export type NoWebsitePresenceScores = {
  onlinePresenceGapScore: number;
  contactabilityScore: number;
  businessActivityScore: number;
  websiteNeedScore: number;
  localFitScore: number;
  finalSalesScore: number;
};

export const topProspectRejectionReasons = [
  "Already strong website",
  "National/large brand",
  "Low redesign opportunity",
  "Weak sales fit",
  "No usable contact path",
  "Inactive business",
  "Duplicate/bad fit",
  "Supplier/distributor",
  "Institutional/non-business page",
  "Website/business mismatch",
  "Third-party listing only",
  "No clear local service intent",
  "Phone-only / written outreach blocked",
  "Below final cutoff",
] as const;
export type TopProspectRejectionReason = (typeof topProspectRejectionReasons)[number];

export const topProspectResultBuckets = [
  "ranked_top_prospect",
  "reviewable_lower_priority",
  "blocked",
] as const;
export type TopProspectResultBucket = (typeof topProspectResultBuckets)[number];

export type TopProspectResult = OpportunityAssessment & {
  id: string;
  rank: number | null;
  selected: boolean;
  rejectionReason: TopProspectRejectionReason | null;
  resultBucket?: TopProspectResultBucket;
  buildPrompt: string;
  previewLink: string;
  packageStatus: OutreachPackageStatus;
  packageGeneratedAt: string | null;
  packageReviewedAt: string | null;
  packageApprovedAt: string | null;
  packageSentAt: string | null;
  packageSkippedAt: string | null;
  emailQuality: OutreachEmailQuality;
  prospect: Prospect;
};

export type OutreachEmailQualityCheck = {
  key: string;
  label: string;
  passed: boolean;
  phrase?: string;
  reason?: string;
  suggestion?: string;
};

export type OutreachEmailQuality = {
  ready: boolean;
  readinessLabel: SendReadinessLabel;
  checks: OutreachEmailQualityCheck[];
  issues: string[];
};

export const sendReadinessLabels = [
  "Send-ready",
  "Needs review",
  "Missing written contact method",
  "Phone-only / written outreach blocked",
  "Needs sender postal address before sending",
  "Verify email manually",
  "Preview quality issue",
  "Unsupported claim",
  "Too generic",
  "Bad fit",
] as const;
export type SendReadinessLabel = (typeof sendReadinessLabels)[number];

export type TopProspectJob = {
  id: string;
  input: TopProspectInput;
  status: TopProspectJobStatus;
  stage: string;
  discoveredCount: number;
  discoveryDiagnostics: DiscoveryDiagnostics | null;
  scannedCount: number;
  qualifiedCount: number;
  skippedCount: number;
  skipSummary: Record<string, number>;
  results: TopProspectResult[];
  reviewedNotRecommended: TopProspectResult[];
  reviewableLowerPriority?: TopProspectResult[];
  blockedProspects?: TopProspectResult[];
  failureClassification: TopProspectJobFailureClassification | null;
  errorMessage: string;
  nextRunRecommendations: string[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const franchiseSignals = [
  "1-800",
  "aireserv",
  "budget blinds",
  "college hunks",
  "five star painting",
  "grounds guys",
  "handyman connection",
  "mr. appliance",
  "mr. electric",
  "mr. handyman",
  "mr. plumber",
  "one hour heating",
  "precision garage door",
  "rainbow restoration",
  "rooter",
  "servpro",
  "the cleaning authority",
  "trugreen",
];

const nationalOrLargeBrandSignals = [
  ...franchiseSignals,
  "erie home",
  "home depot",
  "leaf home",
  "leafguard",
  "lowe's",
  "power home remodeling",
  "renewal by andersen",
];

const supplierDistributorSignals = [
  "equipment",
  "manufacturer",
  "manufacturing",
  "material yard",
  "mulch supply",
  "nursery",
  "parts",
  "building supply",
  "distribution",
  "distributor",
  "exterior supply",
  "landscape supply",
  "landscaping supply",
  "lumber",
  "material supply",
  "materials",
  "roofing products",
  "roofing supply",
  "siding supply",
  "supplier",
  "supply company",
  "supply house",
  "showroom",
  "showroom-only",
  "stone supply",
  "supplies",
  "wholesale",
];

const localServiceSignals = [
  "service",
  "services",
  "repair",
  "installation",
  "install",
  "maintenance",
  "contractor",
  "contracting",
  "residential",
  "commercial",
  "emergency",
  "estimate",
  "quote",
];

const institutionalSignals = [
  "campus operations",
  "facility department",
  "facilities department",
  "facilities management",
  "municipal",
  "physical plant",
  "public works",
  "school district",
  "university",
  "campus",
  "city of",
  "county",
  "government",
  "department",
];

const domainTradeSignals: Record<TradeCategory, string[]> = {
  Roofing: ["roof", "roofing", "shingle", "gutter"],
  HVAC: ["hvac", "heating", "cooling", "air", "furnace"],
  Plumbing: ["plumb", "drain", "waterheater", "water-heater"],
  Electrical: ["electric", "electrical", "wire", "lighting", "panel"],
  Landscaping: ["landscap", "lawn", "outdoor", "yard", "garden"],
  "Pressure Washing": ["pressure", "powerwash", "power-wash", "softwash", "wash"],
  Painting: ["paint", "painting"],
  Concrete: ["concrete", "masonry", "flatwork", "driveway"],
  Cleaning: ["clean", "maid", "janitor"],
  "Tree Service": ["tree", "arbor", "stump"],
  Fencing: ["fence", "fencing"],
  Flooring: ["floor", "flooring", "hardwood", "tile"],
  Remodeling: ["remodel", "renovation", "kitchen", "bath"],
  "General Contractor": ["contractor", "construction", "builder", "build"],
};

const unrelatedBusinessDomainSignals = [
  "bar",
  "campus",
  "coffee",
  "dentist",
  "factory",
  "hotel",
  "law",
  "restaurant",
  "sauna",
  "school",
  "university",
  "wreath",
];

const thirdPartyDirectoryHosts = [
  "bbb.org",
  "chamberofcommerce.com",
  "clutch.co",
  "facebook.com",
  "fb.com",
  "g.page",
  "google.com",
  "homeadvisor.com",
  "houzz.com",
  "hub.biz",
  "instagram.com",
  "maps.app.goo.gl",
  "manta.com",
  "porch.com",
  "thumbtack.com",
  "yellowpages.com",
  "yelp.com",
];

export function normalizeWebsite(value: string) {
  if (!value.trim()) return "";
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

export function likelyFranchise(lead: Pick<DiscoveredLead, "businessName" | "website">) {
  const value = `${lead.businessName} ${normalizeWebsite(lead.website)}`.toLowerCase();
  return franchiseSignals.some((signal) => value.includes(signal));
}

export function likelyNationalOrLargeBrand(lead: Pick<DiscoveredLead, "businessName" | "website">) {
  const value = `${lead.businessName} ${normalizeWebsite(lead.website)}`.toLowerCase();
  return nationalOrLargeBrandSignals.some((signal) => value.includes(signal));
}

export function likelySupplierOrDistributor(lead: Pick<DiscoveredLead, "businessName" | "website">) {
  const value = `${lead.businessName} ${normalizeWebsite(lead.website)}`.toLowerCase();
  const supplierSignal = supplierDistributorSignals.some((signal) => value.includes(signal));
  const serviceSignal = localServiceSignals.some((signal) => value.includes(signal));
  const strongInstallSignal = /\b(install|installation|maintenance|design build|landscape design|lawn care|hardscape|snow removal|tree service)\b/i.test(value);
  if (/\b(?:landscap(?:e|ing) supply|mulch supply|stone supply|material yard|supply house)\b/i.test(value)) return !strongInstallSignal;
  if (/\bnursery\b/i.test(value)) return !strongInstallSignal;
  return supplierSignal && !serviceSignal;
}

export function isThirdPartyDirectoryUrl(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    const host = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
    return thirdPartyDirectoryHosts.some((directoryHost) => host === directoryHost || host.endsWith(`.${directoryHost}`));
  } catch {
    return false;
  }
}

export function thirdPartyListingOnly(
  prospect: Pick<Prospect, "website" | "profileUrl" | "email" | "contactFormUrl" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "recommendedContactMethod" | "classification">,
) {
  const hasDirectorySignal = isThirdPartyDirectoryUrl(prospect.website) || isThirdPartyDirectoryUrl(prospect.profileUrl) || prospect.classification === "listing_only";
  const hasWrittenContact = Boolean(prospect.email || prospect.contactFormUrl || prospect.quoteFormUrl || prospect.facebookUrl || prospect.instagramUrl || prospect.linkedinUrl || prospect.recommendedContactMethod === "message_on_facebook" || prospect.recommendedContactMethod === "message_on_social");
  return hasDirectorySignal && !hasWrittenContact;
}

export function likelyInstitutionalOrNonBusiness(lead: Pick<DiscoveredLead, "businessName" | "website">) {
  const website = lead.website.trim();
  let hostname = "";
  let pathname = "";
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    pathname = url.pathname.toLowerCase();
  } catch {
    hostname = website.toLowerCase();
  }
  const value = `${lead.businessName} ${hostname} ${pathname}`.toLowerCase();
  return hostname.endsWith(".edu")
    || hostname.endsWith(".gov")
    || institutionalSignals.some((signal) => value.includes(signal));
}

function identityTokens(value: string) {
  return value.toLowerCase()
    .replace(/\b(llc|inc|company|co|corp|corporation|services?|service|the|and|of|for|a|an)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function hostnameTokens(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return identityTokens(url.hostname.replace(/^www\./, "").replace(/\.[a-z.]+$/i, ""));
  } catch {
    return identityTokens(value);
  }
}

export function websiteBusinessMismatch(
  lead: Pick<DiscoveredLead, "businessName" | "website" | "trade">,
) {
  if (!lead.website.trim()) return false;
  if (likelyInstitutionalOrNonBusiness(lead)) return true;
  const trade = normalizeTradeCategory(lead.trade) ?? lead.trade;
  const businessTokens = identityTokens(lead.businessName);
  const domainTokens = hostnameTokens(lead.website);
  const domainText = domainTokens.join(" ");
  const sharesNameToken = businessTokens.some((token) => domainTokens.includes(token));
  const expectedSignals = domainTradeSignals[trade] ?? [];
  const domainMatchesTrade = expectedSignals.some((signal) => domainText.includes(signal.replace(/[^a-z0-9]/g, "")) || domainText.includes(signal));
  const otherTradeSignals = Object.entries(domainTradeSignals)
    .filter(([otherTrade]) => otherTrade !== trade)
    .flatMap(([, signals]) => signals)
    .some((signal) => domainText.includes(signal.replace(/[^a-z0-9]/g, "")) || domainText.includes(signal));
  const unrelatedBusinessSignal = unrelatedBusinessDomainSignals.some((signal) => domainText.includes(signal));
  return !sharesNameToken && (otherTradeSignals || unrelatedBusinessSignal) && !domainMatchesTrade;
}

export function hasClearLocalServiceIntent(lead: Pick<DiscoveredLead, "businessName" | "website" | "trade">) {
  const trade = normalizeTradeCategory(lead.trade) ?? lead.trade;
  let website = "";
  try {
    website = normalizeWebsite(lead.website);
  } catch {
    website = lead.website;
  }
  const value = `${lead.businessName} ${website}`.toLowerCase();
  const tradeSignals = domainTradeSignals[trade] ?? [];
  return tradeSignals.some((signal) => value.includes(signal.toLowerCase()))
    || localServiceSignals.some((signal) => value.includes(signal));
}

function prospectTrade(prospect: Pick<Prospect, "trade">) {
  return normalizeTradeCategory(prospect.trade) ?? "General Contractor";
}

function websiteFit(score: number) {
  if (score >= 40 && score <= 75) return 24;
  if (score >= 30 && score < 40) return 16;
  if (score > 75 && score <= 85) return 12;
  return 5;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreAverage(...values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

const tradeRevenuePotential: Record<TradeCategory, number> = {
  Roofing: 88,
  HVAC: 84,
  Plumbing: 76,
  Electrical: 74,
  Landscaping: 66,
  "Pressure Washing": 54,
  Painting: 62,
  Concrete: 70,
  Cleaning: 52,
  "Tree Service": 72,
  Fencing: 64,
  Flooring: 68,
  Remodeling: 82,
  "General Contractor": 82,
};

export function normalizeProspectMode(value: unknown): ProspectMode {
  return typeof value === "string" && prospectModes.includes(value as ProspectMode) ? value as ProspectMode : "strict";
}

export function normalizeTopProspectWorkflowType(value: unknown): TopProspectWorkflowType {
  return typeof value === "string" && topProspectWorkflowTypes.includes(value as TopProspectWorkflowType)
    ? value as TopProspectWorkflowType
    : "search";
}

export function normalizeOutreachPreference(value: unknown): OutreachPreference {
  return typeof value === "string" && outreachPreferences.includes(value as OutreachPreference)
    ? value as OutreachPreference
    : "written_only";
}

export function normalizeOutreachPackageStatus(value: unknown): OutreachPackageStatus {
  return typeof value === "string" && outreachPackageStatuses.includes(value as OutreachPackageStatus)
    ? value as OutreachPackageStatus
    : "NOT_GENERATED";
}

export function prospectPreviewLink(prospectId: string) {
  return `${siteUrl}/engine/previews/${encodeURIComponent(prospectId)}`;
}

export function validPublicPreviewToken(value: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function publicProspectPreviewLink(token: string) {
  if (!validPublicPreviewToken(token)) throw new Error("A valid public preview token is required.");
  return `${siteUrl}/p/${token}`;
}

function isPublicPreviewLink(value: string) {
  try {
    const url = new URL(value);
    return url.origin === new URL(siteUrl).origin
      && url.pathname.startsWith("/p/")
      && validPublicPreviewToken(url.pathname.slice(3));
  } catch {
    return false;
  }
}

export function prospectHasWrittenContactMethod(prospect: Pick<Prospect, "recommendedContactMethod" | "profileUrl" | "email" | "contactFormUrl" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl">) {
  return prospectWrittenContactMethodIsUsable(prospect);
}

export function prospectHasPhoneContactMethod(prospect: Pick<Prospect, "recommendedContactMethod" | "phone">) {
  return prospect.recommendedContactMethod === "call_first" && Boolean(prospect.phone);
}

const unsupportedClaimPatterns: Array<{ pattern: RegExp; reason: string; suggestion: string }> = [
  {
    pattern: /\bI reviewed your website(?: while looking at [^.]+)?\./i,
    reason: "This sounds like an audit claim and can feel automated.",
    suggestion: "I came across your business while looking at local service companies.",
  },
  {
    pattern: /\bI analyzed your website(?: while looking at [^.]+)?\./i,
    reason: "This sounds like an automated audit and overstates the review.",
    suggestion: "I came across your business while looking at local service companies.",
  },
  {
    pattern: /\bI took a careful look at your website(?: while researching [^.]+)?\./i,
    reason: "This overstates how much manual review happened.",
    suggestion: "I came across your business while looking at local service companies.",
  },
  {
    pattern: /\bI reviewed your website\b/i,
    reason: "This sounds like an audit claim and can feel automated.",
    suggestion: "I came across your business",
  },
  {
    pattern: /\bI analyzed your website\b/i,
    reason: "This sounds like an automated audit and overstates the review.",
    suggestion: "I came across your business",
  },
  {
    pattern: /\bI took a careful look at your website\b/i,
    reason: "This overstates how much manual review happened.",
    suggestion: "I came across your business",
  },
  {
    pattern: /\bfree audit\b/i,
    reason: "This reads like generic spam and implies a formal audit.",
    suggestion: "a short concept showing one possible direction",
  },
  {
    pattern: /\b(?:licensed|insured|certified|award(?:ed|-winning)?|guaranteed?|warrant(?:y|ies)|testimonials?|years? (?:of experience|in business)|family[- ]owned|recent local (?:work|projects?|roofs?))\b/i,
    reason: "This business claim must not be used unless it was directly verified from a public source.",
    suggestion: "plain service details a customer can check",
  },
];

function findUnsupportedClaim(value: string) {
  for (const item of unsupportedClaimPatterns) {
    const match = value.match(item.pattern);
    if (match?.[0]) return { phrase: match[0], reason: item.reason, suggestion: item.suggestion };
  }
  return null;
}

function replaceUnsupportedClaims(value: string) {
  return unsupportedClaimPatterns.reduce(
    (draft, item) => draft.replace(item.pattern, item.suggestion),
    value,
  );
}

export function repairUnsupportedOutreachClaims(outreach: OutreachDraft): OutreachDraft {
  return {
    ...outreach,
    concise: replaceUnsupportedClaims(outreach.concise),
    detailed: replaceUnsupportedClaims(outreach.detailed),
    followUps: outreach.followUps.map(replaceUnsupportedClaims),
  };
}

export function evaluateOutreachEmailQuality(
  prospect: Prospect,
  previewLink: string,
  outreachPreference: OutreachPreference = "written_only",
  environment: NodeJS.ProcessEnv = process.env,
): OutreachEmailQuality {
  const outreach = prospect.outreach;
  const drafts = outreach ? [outreach.concise, outreach.detailed, ...outreach.followUps] : [];
  const combined = drafts.join("\n");
  const mainEmails = outreach ? [outreach.concise, outreach.detailed] : [];
  const writtenContactReady = prospectHasWrittenContactMethod(prospect);
  const phoneOnlyBlocked = outreachPreference === "written_only"
    && !writtenContactReady
    && Boolean(prospect.phone || prospect.classification === "phone_only" || prospect.recommendedContactMethod === "call_first");
  const usableContactReady = outreachPreference === "phone_allowed"
    ? prospectContactMethodIsUsable(prospect)
    : writtenContactReady;
  const badFit = prospect.inactive
    || prospect.classification === "national_large_brand"
    || prospect.classification === "duplicate_bad_fit"
    || likelyNationalOrLargeBrand(prospect)
    || likelySupplierOrDistributor(prospect)
    || likelyInstitutionalOrNonBusiness(prospect)
    || websiteBusinessMismatch(prospect)
    || !hasClearLocalServiceIntent(prospect);
  const socialFirstDm = ["facebook", "instagram", "linkedin"].includes(prospect.bestManualContactMethod || "");
  const optOutPattern = webworkshopOptOutPattern();
  const followUpsKeepPermissionFlow = Boolean(outreach?.followUps.every((draft) => (
    draft.includes(previewLink)
    || /earlier message|earlier note|earlier email|send it over|send the preview|want to see|last note|close the loop|timing is not right/i.test(draft)
  )));
  const publicLinkReady = isPublicPreviewLink(previewLink)
    && Boolean(mainEmails[0])
    && !mainEmails[0].includes(previewLink)
    && Boolean(mainEmails[1])
    && mainEmails[1].includes(previewLink)
    && followUpsKeepPermissionFlow;
  const senderPostalAddress = webworkshopPostalAddress(environment);
  const emailNeedsVerification = prospectEmailNeedsManualVerification(prospect)
    && !prospect.quoteFormUrl
    && !prospect.contactFormUrl
    && !prospect.facebookUrl
    && !prospect.instagramUrl
    && !prospect.linkedinUrl;
  const postalAddressReady = prospect.bestManualContactMethod !== "email" && prospect.recommendedContactMethod !== "send_email"
    ? true
    : Boolean(senderPostalAddress) && drafts.every((draft) => draft.includes(senderPostalAddress));
  const optOutReady = socialFirstDm
    ? drafts.length >= 4 && drafts.slice(1).every((draft) => optOutPattern.test(draft))
    : drafts.length >= 4 && drafts.every((draft) => optOutPattern.test(draft));
  const clearCtaReady = socialFirstDm
    ? mainEmails.length === 2
      && /would you like to see it|would you want to see it|want to see it/i.test(mainEmails[0])
      && /here's the preview|here is the preview/i.test(mainEmails[1])
    : mainEmails.length === 2
      && /would you be open to taking a look|would you like to see it|would you want to see it|would you want me to send|would you like me to send|would you want me to send it over|want me to send it over/i.test(mainEmails[0])
      && /would it be worth sending over|would you want me to send over|would you like me to send|i can send over the simple pricing\/options/i.test(mainEmails[1]);
  const unsupportedClaim = findUnsupportedClaim(combined);
  const checks: OutreachEmailQualityCheck[] = [
    {
      key: "public_preview_link",
      label: "Public preview link exists and is included after permission",
      passed: publicLinkReady,
    },
    {
      key: "no_internal_scores",
      label: "Outreach contains no internal score language",
      passed: drafts.length > 0
        && !/\b\d{1,3}\s*\/\s*100\b|\bscore(?:d)?(?:\s+of|:)?\s+\d{1,3}\b|\b(?:overall|website|opportunity|conversion readiness|mobile experience|trust signals|contactability|weighted sales)\s+score\b|\b(?:website quality|revenue opportunity|contactability|local market competitiveness|ai website replacement confidence|weighted sales|mobile experience|conversion readiness|trust signals|opportunity)\b.{0,30}\b\d{1,3}\b/i.test(combined),
    },
    {
      key: "real_strength",
      label: "Outreach includes simple business context",
      passed: mainEmails.length === 2 && /I was looking at|I came across|dedicated website|public business presence/i.test(combined),
    },
    {
      key: "missed_opportunity",
      label: "Outreach uses simple preview wording",
      passed: mainEmails.length === 2
        && !/one missed opportunity:/i.test(combined)
        && /cleaner|calls|quote requests|easier|services|quote|call/i.test(combined),
    },
    {
      key: "clear_cta",
      label: "Outreach includes a clear call to action",
      passed: clearCtaReady,
    },
    {
      key: "opt_out",
      label: "Every draft includes opt-out language",
      passed: optOutReady,
    },
    {
      key: "postal_address",
      label: "Sender postal address is configured",
      passed: drafts.length >= 4 && postalAddressReady && !/\[Add your business postal address before sending\]/i.test(combined),
      reason: "Set WEBWORKSHOP_POSTAL_ADDRESS before marking email outreach send-ready.",
      suggestion: "Add WEBWORKSHOP_POSTAL_ADDRESS in Vercel and redeploy.",
    },
    {
      key: "contact_quality",
      label: "Email address appears business-owned",
      passed: !emailNeedsVerification,
      reason: "The email looks like a theme, developer, noreply, or unrelated-domain address.",
      suggestion: "Verify the email manually or use a contact form/social path instead.",
    },
    {
      key: "written_contact_method",
      label: outreachPreference === "written_only" ? "A usable written contact method exists" : "A usable public contact method exists",
      passed: usableContactReady,
    },
    {
      key: "phone_only_blocked",
      label: "Phone-only leads are blocked from written outreach",
      passed: !phoneOnlyBlocked,
    },
    {
      key: "active_local_business",
      label: "Business appears active, local, and independently operated",
      passed: !badFit,
    },
    {
      key: "supported_facts_only",
      label: "Email avoids unsupported claims",
      passed: drafts.length > 0 && unsupportedClaim === null,
      phrase: unsupportedClaim?.phrase,
      reason: unsupportedClaim?.reason,
      suggestion: unsupportedClaim?.suggestion,
    },
  ];
  const issues = checks
    .filter((check) => !check.passed)
    .map((check) => check.phrase
      ? `${check.label}: "${check.phrase}" (${check.reason} Suggested replacement: ${check.suggestion}.)`
      : check.label);
  const readinessLabel: SendReadinessLabel = issues.length === 0
    ? "Send-ready"
    : badFit
      ? "Bad fit"
      : !publicLinkReady
        ? "Preview quality issue"
        : !postalAddressReady
          ? "Needs sender postal address before sending"
          : emailNeedsVerification
            ? "Verify email manually"
            : phoneOnlyBlocked
              ? "Phone-only / written outreach blocked"
              : !writtenContactReady && outreachPreference === "written_only"
                ? "Missing written contact method"
                : checks.some((check) => check.key === "supported_facts_only" && !check.passed)
                  ? "Unsupported claim"
                  : checks.some((check) => ["real_strength", "missed_opportunity", "clear_cta"].includes(check.key) && !check.passed)
                    ? "Too generic"
                    : "Needs review";
  return { ready: issues.length === 0, readinessLabel, checks, issues };
}

export function assertOutreachEmailReady(prospect: Prospect, previewLink: string, outreachPreference: OutreachPreference = "written_only") {
  const quality = evaluateOutreachEmailQuality(prospect, previewLink, outreachPreference);
  if (!quality.ready) {
    throw new Error(`This Outreach Package cannot be approved before all email quality checks pass. Send readiness: ${quality.readinessLabel}. Required fixes: ${quality.issues.join(", ")}.`);
  }
  return quality;
}

export function outreachPackageStatusLabel(status: OutreachPackageStatus) {
  const labels: Record<OutreachPackageStatus, string> = {
    NOT_GENERATED: "Not generated",
    PACKAGE_GENERATED: "Package Generated",
    READY_FOR_REVIEW: "Ready for Review",
    APPROVED_TO_SEND: "Approved to Send",
    SENT: "Sent",
    SKIPPED: "Skipped",
  };
  return labels[status];
}

export function outreachPackageActionAllowed(status: OutreachPackageStatus, action: OutreachPackageAction) {
  if (action === "generate") return status !== "SENT";
  if (action === "ready_for_review") return status === "PACKAGE_GENERATED" || status === "READY_FOR_REVIEW";
  if (action === "approve") return status === "PACKAGE_GENERATED" || status === "READY_FOR_REVIEW";
  if (action === "mark_sent") return status === "APPROVED_TO_SEND";
  return status === "PACKAGE_GENERATED" || status === "READY_FOR_REVIEW" || status === "APPROVED_TO_SEND";
}

export function calculateProspectSalesScores(prospect: Prospect, opportunityScore: number): ProspectSalesScores {
  const analysis = prospect.analysis;
  if (!analysis) throw new Error("Sales scoring requires website analysis.");
  const trade = prospectTrade(prospect);
  const broaderServiceArea = /\b(county|counties|regional|statewide|multiple|communities|nearby|greater)\b/i.test(prospect.serviceArea);
  const sizePotential = prospect.sizeIndicator === "Established" ? 86 : prospect.sizeIndicator === "Growing" ? 72 : 55;
  const revenueOpportunityScore = clampScore(
    sizePotential * 0.48
    + tradeRevenuePotential[trade] * 0.34
    + (broaderServiceArea ? 86 : prospect.serviceArea ? 64 : 48) * 0.18,
  );
  const contactabilityScore = clampScore(
    analysis.scores.contactAccessibility * 0.48
    + (prospect.phone ? 28 : 0)
    + (prospect.email ? 19 : 0)
    + (prospect.quoteFormUrl ? 22 : prospect.contactFormUrl ? 18 : 0)
    + (prospect.facebookUrl || prospect.instagramUrl ? 10 : 0)
    + (prospect.linkedinUrl ? 8 : 0)
    + 5,
  );
  const localMarketCompetitivenessScore = clampScore(
    (100 - scoreAverage(analysis.scores.trustSignals, analysis.scores.portfolioQuality, analysis.scores.brandingQuality)) * 0.7
    + (broaderServiceArea ? 17 : 10)
    + (prospect.sizeIndicator === "Growing" ? 13 : prospect.sizeIndicator === "Established" ? 10 : 7),
  );
  const aiReplacementConfidenceScore = clampScore(
    (100 - scoreAverage(
      analysis.scores.mobileExperience,
      analysis.scores.visualDesign,
      analysis.scores.ctaStrength,
      analysis.scores.trustSignals,
      analysis.scores.conversionReadiness,
      analysis.scores.technicalQuality,
    )) * 0.82
    + (prospect.serviceArea ? 10 : 5)
    + (prospect.phone || prospect.email || prospect.contactFormUrl || prospect.quoteFormUrl ? 8 : prospect.facebookUrl || prospect.instagramUrl ? 5 : 3),
  );
  const weightedSalesScore = clampScore(
    opportunityScore * 0.3
    + revenueOpportunityScore * 0.22
    + contactabilityScore * 0.18
    + localMarketCompetitivenessScore * 0.14
    + aiReplacementConfidenceScore * 0.16,
  );

  return {
    websiteQualityScore: clampScore(analysis.overallScore),
    revenueOpportunityScore,
    contactabilityScore,
    localMarketCompetitivenessScore,
    aiReplacementConfidenceScore,
    weightedSalesScore,
  };
}

function weakestLabel(analysis: Analysis) {
  const labels: Record<keyof Analysis["scores"], string> = {
    mobileExperience: "mobile experience",
    visualDesign: "visual presentation",
    ctaStrength: "calls to action",
    trustSignals: "trust signals",
    contactAccessibility: "contact accessibility",
    portfolioQuality: "project proof",
    brandingQuality: "brand clarity",
    conversionReadiness: "conversion path",
    technicalQuality: "technical quality",
  };
  const [key] = Object.entries(analysis.scores).sort(([, left], [, right]) => left - right)[0] as [keyof Analysis["scores"], number];
  return labels[key];
}

export function assessOpportunity(prospect: Prospect): OpportunityAssessment {
  const analysis = prospect.analysis;
  if (!analysis) throw new Error("Opportunity assessment requires website analysis.");
  const contactScore = analysis.scores.contactAccessibility;
  const trustScore = analysis.scores.trustSignals;
  const conversionScore = analysis.scores.conversionReadiness;
  const weakness = weakestLabel(analysis);
  const tradeLabel = displayTradeCategory(prospectTrade(prospect)).toLowerCase();
  const score = Math.min(100, Math.round(
    websiteFit(analysis.overallScore)
    + (100 - contactScore) * 0.16
    + (100 - trustScore) * 0.14
    + (100 - conversionScore) * 0.18
    + (prospect.phone ? 7 : 0)
    + (prospect.email ? 4 : 0)
    + (prospect.serviceArea ? 5 : 0)
    + (prospect.sizeIndicator === "Growing" ? 8 : prospect.sizeIndicator === "Established" ? 6 : 5),
  ));

  return {
    opportunityScore: score,
    salesScores: calculateProspectSalesScores(prospect, score),
    presenceScores: null,
    mainWeakness: `The clearest opportunity is ${weakness}.`,
    whyMayBuy: `${prospect.businessName} has an active site and clear local service footprint, but its ${weakness} may be costing ready-to-hire visitors.`,
    pitchAngle: `Lead with a practical ${tradeLabel} redesign that improves ${weakness}, local proof, and the path to a quote.`,
  };
}

export function calculateNoWebsitePresenceScores(prospect: Prospect): NoWebsitePresenceScores {
  const socialOnly = /facebook|instagram/i.test(prospect.profileUrl);
  const googleOnly = /google|g\.page|maps\.app/i.test(prospect.profileUrl);
  const onlinePresenceGapScore = clampScore(socialOnly ? 88 : googleOnly ? 92 : 100);
  const contactabilityScore = clampScore(
    (prospect.email ? 88 : 0)
    + (prospect.quoteFormUrl ? 82 : 0)
    + (prospect.contactFormUrl ? 76 : 0)
    + (prospect.facebookUrl || prospect.instagramUrl ? 54 : 0)
    + (prospect.linkedinUrl ? 44 : 0)
    + (prospect.phone ? 64 : 0)
    + (/facebook|fb\.com/i.test(prospect.profileUrl) ? 48 : prospect.profileUrl ? 18 : 0),
  );
  const reviewStrength = Math.min(52, Math.round(Math.log10(Math.max(1, prospect.reviewCount) + 1) * 28));
  const businessActivityScore = clampScore(
    reviewStrength
    + Math.min(18, prospect.recentReviewCount * 4)
    + (prospect.rating >= 4.5 ? 18 : prospect.rating >= 4 ? 13 : prospect.rating > 0 ? 7 : 0)
    + Math.min(12, Math.round(prospect.sourceConfidence * 0.12))
    + Math.min(12, prospect.activitySignals.length * 3),
  );
  const broaderServiceArea = /\b(county|counties|regional|multiple|communities|nearby|greater)\b/i.test(prospect.serviceArea);
  const localFitScore = clampScore(
    (likelyNationalOrLargeBrand(prospect) ? 0 : 58)
    + (prospect.city && prospect.state ? 16 : 0)
    + (broaderServiceArea ? 8 : prospect.serviceArea ? 5 : 0)
    + Math.min(18, Math.round(prospect.sourceConfidence * 0.18)),
  );
  const websiteNeedScore = clampScore(
    onlinePresenceGapScore * 0.56
    + businessActivityScore * 0.26
    + localFitScore * 0.18,
  );
  const finalSalesScore = clampScore(
    websiteNeedScore * 0.3
    + contactabilityScore * 0.24
    + businessActivityScore * 0.2
    + localFitScore * 0.2
    + prospect.sourceConfidence * 0.06,
  );
  return { onlinePresenceGapScore, contactabilityScore, businessActivityScore, websiteNeedScore, localFitScore, finalSalesScore };
}

export function assessNoWebsiteOpportunity(prospect: Prospect): OpportunityAssessment {
  const presenceScores = calculateNoWebsitePresenceScores(prospect);
  return {
    opportunityScore: presenceScores.finalSalesScore,
    presenceScores,
    salesScores: {
      websiteQualityScore: 0,
      revenueOpportunityScore: 0,
      contactabilityScore: presenceScores.contactabilityScore,
      localMarketCompetitivenessScore: 0,
      aiReplacementConfidenceScore: 0,
      weightedSalesScore: presenceScores.finalSalesScore,
    },
    mainWeakness: "No owned website was found.",
    whyMayBuy: `${prospect.businessName} appears active and contactable, but depends on third-party profiles instead of an online home it controls.`,
    pitchAngle: `Lead with ownership: give ${prospect.businessName} a permanent website for services, local proof, direct inquiries, and search visibility beyond Facebook or Google.`,
  };
}

function hasMeaningfulImprovementGap(prospect: Pick<Prospect, "analysis">) {
  const analysis = prospect.analysis;
  if (!analysis) return false;
  return analysis.overallScore < 95 || Object.values(analysis.scores).some((score) => score < 90);
}

export function topProspectRejectionReason(
  prospect: Pick<Prospect, "businessName" | "website" | "profileUrl" | "phone" | "email" | "contactFormUrl" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "trade" | "analysis" | "prospectType" | "classification" | "recommendedContactMethod" | "inactive" | "reviewCount" | "rating" | "sourceConfidence">,
  assessment: OpportunityAssessment,
  mode: ProspectMode = "strict",
  outreachPreference: OutreachPreference = "written_only",
): TopProspectRejectionReason | null {
  if (likelyInstitutionalOrNonBusiness(prospect)) return "Institutional/non-business page";
  if (likelyNationalOrLargeBrand(prospect)) return "National/large brand";
  if (likelySupplierOrDistributor(prospect)) return "Supplier/distributor";
  if (websiteBusinessMismatch(prospect)) return "Website/business mismatch";
  if (!hasClearLocalServiceIntent(prospect)) return "No clear local service intent";
  if (prospect.inactive) return "Inactive business";
  if (prospect.classification === "duplicate_bad_fit") return "Duplicate/bad fit";
  if (thirdPartyListingOnly(prospect)) return "Third-party listing only";
  const usableContact = outreachPreference === "phone_allowed"
    ? prospectContactMethodIsUsable(prospect)
    : prospectHasWrittenContactMethod(prospect);
  const phoneOnlyBlocked = outreachPreference === "written_only"
    && !usableContact
    && Boolean(prospect.phone || prospect.classification === "phone_only" || prospect.recommendedContactMethod === "call_first");
  if (prospect.prospectType === "no_website_social_only") {
    if (phoneOnlyBlocked) return "Phone-only / written outreach blocked";
    if (!usableContact) return "No usable contact path";
    if (assessment.presenceScores && assessment.presenceScores.finalSalesScore < 45) return "Weak sales fit";
    return null;
  }
  const websiteScore = prospect.analysis?.overallScore;
  if (mode === "volume") {
    if (!hasMeaningfulImprovementGap(prospect)) return "Low redesign opportunity";
    return null;
  }
  if (phoneOnlyBlocked) return "Phone-only / written outreach blocked";
  if (!usableContact) return "No usable contact path";
  if (mode === "growth") {
    if (websiteScore !== undefined && websiteScore > 90) return "Already strong website";
    if (assessment.opportunityScore < 45) return "Weak sales fit";
    return null;
  }
  if (websiteScore !== undefined && websiteScore > 85) return "Already strong website";
  if (websiteScore !== undefined && websiteScore > 75) return "Low redesign opportunity";
  if (assessment.opportunityScore < 60) return "Weak sales fit";
  return null;
}

export function topProspectResultDisposition(
  persistedSelected: boolean,
  prospect: Pick<Prospect, "businessName" | "website" | "profileUrl" | "phone" | "email" | "contactFormUrl" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "trade" | "analysis" | "prospectType" | "classification" | "recommendedContactMethod" | "inactive" | "reviewCount" | "rating" | "sourceConfidence">,
  assessment: OpportunityAssessment,
  mode: ProspectMode = "strict",
  outreachPreference: OutreachPreference = "written_only",
) {
  const salesFitRejection = topProspectRejectionReason(prospect, assessment, mode, outreachPreference);
  return {
    selected: persistedSelected && salesFitRejection === null,
    rejectionReason: salesFitRejection ?? (persistedSelected ? null : "Below final cutoff" as const),
  };
}

const hardBlockedResultReasons = new Set<TopProspectRejectionReason>([
  "National/large brand",
  "No usable contact path",
  "Inactive business",
  "Duplicate/bad fit",
  "Supplier/distributor",
  "Institutional/non-business page",
  "Website/business mismatch",
  "Third-party listing only",
  "No clear local service intent",
  "Phone-only / written outreach blocked",
]);

const reviewableLowerPriorityReasons = new Set<TopProspectRejectionReason>([
  "Already strong website",
  "Low redesign opportunity",
  "Weak sales fit",
  "Below final cutoff",
]);

export function topProspectResultBucket(
  result: Pick<TopProspectResult, "selected" | "rejectionReason" | "packageStatus" | "emailQuality" | "prospect">,
): TopProspectResultBucket {
  if (result.selected) return "ranked_top_prospect";
  if (!result.rejectionReason) return "reviewable_lower_priority";
  if (hardBlockedResultReasons.has(result.rejectionReason)) return "blocked";

  const hasManualWrittenPath = prospectWrittenContactMethodIsUsable(result.prospect)
    || result.prospect.recommendedContactMethod === "verify_email_manually";
  const hasGeneratedPackage = result.packageStatus !== "NOT_GENERATED";
  const manuallyReviewable = hasManualWrittenPath && (
    result.emailQuality.readinessLabel === "Send-ready"
    || result.emailQuality.readinessLabel === "Needs sender postal address before sending"
    || result.emailQuality.readinessLabel === "Verify email manually"
    || result.emailQuality.readinessLabel === "Needs review"
  );

  if (reviewableLowerPriorityReasons.has(result.rejectionReason) && (hasManualWrittenPath || hasGeneratedPackage || manuallyReviewable)) {
    return "reviewable_lower_priority";
  }

  return "blocked";
}

export function generateWebsiteBuildPrompt(prospect: Prospect, assessment: OpportunityAssessment) {
  const analysis = prospect.analysis;
  const preview = prospect.preview ?? generatePreview(prospect);
  const styleProfile = previewStyleProfile(prospect, preview);
  const artDirection = preview.artDirection;
  const quality = preview.qualityScore ?? scorePreviewQuality(prospect, preview);
  const tradeLabel = displayTradeCategory(prospectTrade(prospect)).toLowerCase();
  const serviceArea = prospect.serviceArea || `${titleCaseLocation(prospect.city)}, ${displayStateCode(prospect.state)}`;
  const styleInstructions = [
    `Style profile: ${styleProfile.name}.`,
    `Palette: primary ${styleProfile.primaryColor}, accent ${styleProfile.accentColor}, main surface ${styleProfile.surfaceColor}, soft surface ${styleProfile.softSurfaceColor}, text ${styleProfile.inkColor}.`,
    `Tone and layout: ${styleProfile.tone.replace("-", " ")} with a ${styleProfile.layoutStyle.replace("-", " ")} composition.`,
    `Typography: ${styleProfile.typographyStyle}.`,
    `Primary CTA wording: "${styleProfile.ctaLabel}".`,
    `Why this style was selected: ${styleProfile.styleReason}`,
    artDirection ? `Art direction: ${artDirection.name}. Visual voice: ${artDirection.visualVoice}. Hero treatment: ${artDirection.heroTreatment}. Layout rhythm: ${artDirection.layoutRhythm}. Card style: ${artDirection.cardStyle}.` : "",
    artDirection ? `Imagery and section flow: ${artDirection.imageTreatment} ${artDirection.sectionFlow}` : "",
    artDirection ? `CTA treatment: ${artDirection.ctaTreatment}` : "",
    `Preview quality target: ${quality.overall}/100 overall, with visual polish ${quality.visualPolish}, business specificity ${quality.businessSpecificity}, mobile responsiveness ${quality.mobileResponsiveness}, conversion strength ${quality.conversionStrength}, and safety/truthfulness ${quality.safetyTruthfulness}.`,
    "Do not reuse WebWorkshop branding, dark-green defaults, or agency-template styling. The result should feel like this business, improved.",
    "Use sample imagery only as labeled placeholders until the business provides verified photos, project details, reviews, certifications, warranties, or awards.",
  ].filter(Boolean).join("\n");
  if (prospect.prospectType === "no_website_social_only") {
    return [
      `Create the first owned, polished, mobile-first website for ${prospect.businessName}, a ${tradeLabel} business serving ${serviceArea}.`,
      "The business currently appears to rely on public listings or social profiles. Build a permanent online home it controls rather than a redesign of an existing site.",
      `Positioning and pitch: ${assessment.pitchAngle}`,
      styleInstructions,
      `Visual direction: ${preview.visualStyleDirection}`,
      `Hero: ${preview.hero}`,
      `Homepage sections: ${preview.homepageStructure.join("; ")}.`,
      `Trust strategy: ${preview.trustStrategy}`,
      `Lead form strategy: ${preview.leadCaptureStrategy}`,
      "Use accessible semantic HTML, strong mobile layouts, a visible phone action, local-service language, and no invented claims, reviews, certifications, or project facts.",
    ].join("\n\n");
  }
  if (!analysis) throw new Error("A website build prompt requires website analysis.");
  return [
    `Create a polished, mobile-first website for ${prospect.businessName}, a ${tradeLabel} business serving ${serviceArea}.`,
    `Primary business goal: turn local homeowners into qualified estimate requests. Primary opportunity: ${assessment.mainWeakness}`,
    `Positioning and pitch: ${assessment.pitchAngle}`,
    styleInstructions,
    `Visual direction: ${preview.visualStyleDirection}`,
    `Hero: ${preview.hero}`,
    `Homepage sections: ${preview.homepageStructure.join("; ")}.`,
    `Trust strategy: ${preview.trustStrategy}`,
    `Lead form strategy: ${preview.leadCaptureStrategy}`,
    `Current website strengths to preserve: ${analysis.strengths.join("; ")}.`,
    `Current gaps to solve: ${analysis.weaknesses.join("; ")}.`,
    "Use accessible semantic HTML, strong mobile layouts, real-business language, clear phone and estimate actions, and no invented claims, reviews, certifications, or project facts.",
  ].join("\n\n");
}

export function prepareTopProspectArtifacts(prospect: Prospect, previewLink: string, outreachPreference: OutreachPreference = "written_only") {
  if (!isPublicPreviewLink(previewLink)) {
    throw new Error("A public /p/ preview link is required before generating prospect-facing outreach artifacts.");
  }
  let outreach = generateOutreach(prospect, previewLink);
  let withArtifacts = {
    ...prospect,
    outreach,
    preview: generatePreview(prospect),
  };
  let emailQuality = evaluateOutreachEmailQuality(withArtifacts, previewLink, outreachPreference);
  if (emailQuality.readinessLabel === "Unsupported claim") {
    outreach = repairUnsupportedOutreachClaims(outreach);
    withArtifacts = { ...withArtifacts, outreach };
    emailQuality = evaluateOutreachEmailQuality(withArtifacts, previewLink, outreachPreference);
  }
  const assessment = prospect.prospectType === "no_website_social_only"
    ? assessNoWebsiteOpportunity(withArtifacts)
    : assessOpportunity(withArtifacts);
  return {
    prospect: withArtifacts,
    assessment,
    buildPrompt: generateWebsiteBuildPrompt(withArtifacts, assessment),
    previewLink,
    emailQuality,
  };
}

const stateCodePattern = /^[A-Za-z]{2}$/;

function normalizeCityToken(value: string) {
  return titleCaseLocation(value.trim().replace(/\s+/g, " "));
}

export function parseTopProspectCityTargets(cityInput: unknown, fallbackStateInput: unknown): CitySearchTarget[] {
  const fallbackState = typeof fallbackStateInput === "string" ? displayStateCode(fallbackStateInput) : "";
  if (!/^[A-Z]{2}$/.test(fallbackState)) return [];
  const raw = typeof cityInput === "string" ? cityInput.trim() : "";
  if (!raw) return [];
  const targets: CitySearchTarget[] = [];
  const addTarget = (cityValue: string, stateValue: string) => {
    const city = normalizeCityToken(cityValue);
    const state = displayStateCode(stateValue);
    if (!/^[A-Za-z .'-]{2,100}$/.test(city) || !/^[A-Z]{2}$/.test(state)) return;
    if (targets.some((target) => target.city.toLowerCase() === city.toLowerCase() && target.state === state)) return;
    targets.push({ city, state, label: `${city}, ${state}` });
  };

  for (const segment of raw.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean)) {
    const parts = segment.split(",").map((item) => item.trim()).filter(Boolean);
    if (parts.length === 1) {
      addTarget(parts[0], fallbackState);
      continue;
    }
    if (parts.length > 1 && parts.every((part, index) => index % 2 === 0 || stateCodePattern.test(part))) {
      for (let index = 0; index < parts.length; index += 2) addTarget(parts[index], parts[index + 1] ?? fallbackState);
      continue;
    }
    const finalPart = parts.at(-1);
    if (finalPart && stateCodePattern.test(finalPart)) {
      addTarget(parts.slice(0, -1).join(", "), finalPart);
      continue;
    }
    for (const city of parts) addTarget(city, fallbackState);
  }
  return targets;
}

export function formatCityTargetsForHeader(targets: CitySearchTarget[] | undefined, fallbackCity = "", fallbackState = "") {
  const normalizedTargets = targets?.length ? targets : parseTopProspectCityTargets(fallbackCity, fallbackState);
  if (!normalizedTargets.length) return `${titleCaseLocation(fallbackCity)}, ${displayStateCode(fallbackState)}`;
  const states = [...new Set(normalizedTargets.map((target) => target.state))];
  if (states.length === 1) return `${normalizedTargets.map((target) => target.city).join(", ")}, ${states[0]}`;
  return normalizedTargets.map((target) => target.label).join("; ");
}

export function citySearchBudgets(total: number, targetCount: number) {
  const count = Math.max(1, targetCount);
  return Array.from({ length: count }, (_, index) => Math.floor(total / count) + (index < total % count ? 1 : 0));
}

export function estimatedProviderRequestLoad(targetCount: number, trade: TopProspectTradeSelection) {
  const tradeCount = trade === allCoreServiceTradesOption ? coreServiceTrades.length : 1;
  return Math.max(1, targetCount) * tradeCount * 4;
}

export function cityTargetsToSearchInput(targets: CitySearchTarget[], defaultState: string) {
  const normalizedDefault = displayStateCode(defaultState);
  return targets.every((target) => target.state === normalizedDefault)
    ? targets.map((target) => target.city).join(", ")
    : targets.map((target) => target.label).join("; ");
}

export function dedupeCitySearchTargets(targets: CitySearchTarget[]) {
  const seen = new Set<string>();
  const deduped: CitySearchTarget[] = [];
  for (const target of targets) {
    const key = `${target.city.toLowerCase()}|${target.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(target);
  }
  return deduped;
}

export function applyRecommendedMarketPresetFields({
  currentCityInput,
  currentStateInput,
  mode,
  preset,
  trade,
}: {
  currentCityInput: string;
  currentStateInput: string;
  mode: "replace" | "append";
  preset: RecommendedMarketPreset;
  trade?: TopProspectTradeSelection;
}) {
  const currentTargets = parseTopProspectCityTargets(currentCityInput, currentStateInput);
  const nextTargets = mode === "append"
    ? dedupeCitySearchTargets([...currentTargets, ...preset.cities])
    : preset.cities;
  const singlePresetState = preset.cities.length
    ? preset.cities.every((target) => target.state === preset.cities[0].state) ? preset.cities[0].state : ""
    : "";
  const nextStateInput = mode === "replace" && singlePresetState ? singlePresetState : displayStateCode(currentStateInput);
  return {
    cityInput: cityTargetsToSearchInput(nextTargets, nextStateInput),
    stateInput: nextStateInput,
    ...(trade ? { trade } : {}),
  };
}

export const recommendedMarketPresets: RecommendedMarketPreset[] = [
  {
    id: "northwest-ohio",
    name: "Northwest Ohio",
    starter: true,
    cities: ["Toledo", "Sylvania", "Perrysburg", "Maumee", "Bowling Green"].map((city) => ({ city, state: "OH", label: `${city}, OH` })),
    trades: ["Landscaping", "Pressure Washing", "Cleaning", "Painting", "Concrete", "Roofing", "HVAC", "Plumbing"],
  },
  {
    id: "ohio-midwest",
    name: "Ohio / Midwest",
    starter: false,
    cities: [
      ["Columbus", "OH"],
      ["Cincinnati", "OH"],
      ["Dayton", "OH"],
      ["Cleveland", "OH"],
      ["Akron", "OH"],
      ["Indianapolis", "IN"],
      ["Fort Wayne", "IN"],
      ["Grand Rapids", "MI"],
    ].map(([city, state]) => ({ city, state, label: `${city}, ${state}` })),
    trades: ["Landscaping", "Pressure Washing", "Cleaning", "Painting", "Concrete", "Tree Service", "Roofing", "HVAC"],
  },
  {
    id: "texas-suburbs",
    name: "Texas Suburbs",
    starter: true,
    cities: ["Dallas", "Fort Worth", "Plano", "Frisco", "McKinney", "Denton", "Austin", "Round Rock", "San Antonio", "New Braunfels", "Houston", "Katy", "Cypress", "Conroe"].map((city) => ({ city, state: "TX", label: `${city}, TX` })),
    trades: ["Landscaping", "Pressure Washing", "Cleaning", "Painting", "Roofing", "HVAC", "Plumbing", "Fencing", "Remodeling"],
  },
  {
    id: "florida",
    name: "Florida",
    starter: true,
    cities: ["Tampa", "St. Petersburg", "Clearwater", "Lakeland", "Orlando", "Kissimmee", "Jacksonville", "St. Augustine", "Sarasota", "Fort Myers"].map((city) => ({ city, state: "FL", label: `${city}, FL` })),
    trades: ["Landscaping", "Pressure Washing", "Cleaning", "Painting", "Roofing", "HVAC", "Plumbing", "Tree Service", "Remodeling"],
  },
  {
    id: "carolinas-tennessee-georgia",
    name: "Carolinas / Tennessee / Georgia",
    starter: true,
    cities: [
      ["Charlotte", "NC"],
      ["Concord", "NC"],
      ["Raleigh", "NC"],
      ["Durham", "NC"],
      ["Cary", "NC"],
      ["Greenville", "SC"],
      ["Spartanburg", "SC"],
      ["Charleston", "SC"],
      ["Nashville", "TN"],
      ["Franklin", "TN"],
      ["Murfreesboro", "TN"],
      ["Knoxville", "TN"],
      ["Chattanooga", "TN"],
      ["Atlanta", "GA"],
      ["Marietta", "GA"],
      ["Alpharetta", "GA"],
    ].map(([city, state]) => ({ city, state, label: `${city}, ${state}` })),
    trades: ["Landscaping", "Pressure Washing", "Cleaning", "Painting", "Concrete", "Roofing", "Tree Service", "Fencing", "Remodeling"],
  },
  {
    id: "arizona-nevada",
    name: "Arizona / Nevada",
    starter: false,
    cities: [
      ["Phoenix", "AZ"],
      ["Mesa", "AZ"],
      ["Chandler", "AZ"],
      ["Gilbert", "AZ"],
      ["Scottsdale", "AZ"],
      ["Peoria", "AZ"],
      ["Las Vegas", "NV"],
      ["Henderson", "NV"],
    ].map(([city, state]) => ({ city, state, label: `${city}, ${state}` })),
    trades: ["Landscaping", "Pressure Washing", "Cleaning", "Painting", "HVAC", "Roofing", "Concrete", "Remodeling"],
  },
];

export function topProspectNextRunRecommendations(input: {
  job: Pick<TopProspectJob, "input" | "results" | "reviewedNotRecommended" | "skipSummary" | "discoveryDiagnostics">;
}) {
  const { job } = input;
  const recommendations: string[] = [];
  const targetCount = job.input.cityTargets?.length ?? parseTopProspectCityTargets(job.input.city, job.input.state).length;
  const cityLabel = formatCityTargetsForHeader(job.input.cityTargets, job.input.city, job.input.state);
  const phoneBlocked = job.skipSummary.phone_only_written_outreach_blocked ?? job.skipSummary.phone_only_written_outreach ?? 0;
  const badFit = (job.skipSummary.institutional_non_business_page ?? 0)
    + (job.skipSummary.supplier_distributor ?? 0)
    + (job.skipSummary.website_business_mismatch ?? 0)
    + (job.skipSummary.third_party_listing_only ?? 0)
    + (job.skipSummary.no_clear_local_service_intent ?? 0);
  const providerFailures = (job.discoveryDiagnostics?.cityDiagnostics ?? []).filter((city) => city.status === "failed").length
    + Object.values(job.discoveryDiagnostics?.providerDiagnostics ?? {}).filter((provider) => ["failed", "timed_out", "rate_limited"].includes(provider.status)).length;
  const providerDiagnostics = Object.values(job.discoveryDiagnostics?.providerDiagnostics ?? {});
  const configuredProviders = providerDiagnostics.filter((provider) => provider.configured || provider.canRunWithoutApiKey);
  const attemptedProviders = providerDiagnostics.filter((provider) => provider.queryExecuted);
  const successfulProviders = providerDiagnostics.filter((provider) => provider.status === "succeeded");
  const allAttemptedProvidersFailed = attemptedProviders.length > 0
    && successfulProviders.length === 0
    && attemptedProviders.every((provider) => ["failed", "timed_out", "rate_limited"].includes(provider.status));
  const googleMissing = job.discoveryDiagnostics?.providerDiagnostics.googlePlaces?.configured === false;
  const yelpMissing = job.discoveryDiagnostics?.providerDiagnostics.yelp?.configured === false;
  const azureThin = job.discoveryDiagnostics?.providerDiagnostics.azureMaps?.status === "succeeded"
    && (job.discoveryDiagnostics.providerDiagnostics.azureMaps.usableWebsiteCount ?? 0) === 0;
  const weakProviderCoverage = allAttemptedProvidersFailed || (azureThin && googleMissing && yelpMissing);
  const weakContact = (job.skipSummary.no_usable_contact_path ?? 0) + (job.skipSummary.third_party_listing_only ?? 0);
  if (allAttemptedProvidersFailed) {
    recommendations.push("All attempted discovery providers failed. Check provider health, environment variables, HTTP status, and rate limits before increasing scan count.");
  }
  if (azureThin && googleMissing && yelpMissing) recommendations.push("Configure Google Places before increasing scan count.");
  if (!weakProviderCoverage && targetCount > 1 && job.input.businessesToScan < targetCount * 20) {
    recommendations.push(`Increase scan count to ${Math.min(250, Math.max(150, targetCount * 20))} because you searched ${targetCount} cities.`);
  }
  if (!weakProviderCoverage && configuredProviders.length > 1 && successfulProviders.length === 1) recommendations.push("Only one configured provider returned records. Configure or repair the other providers before broadening scan count.");
  if (phoneBlocked > Math.max(2, job.results.length)) recommendations.push("Try Landscaping, Pressure Washing, Cleaning, Painting, or Concrete next because this run had too many phone-only leads.");
  if (badFit > Math.max(2, job.results.length)) recommendations.push(`This market returned mostly suppliers, directories, or mismatched websites. Try Cleaning or Painting instead.`);
  if (!weakProviderCoverage && providerFailures > 0 && job.results.length === 0) recommendations.push(`Provider coverage was weak for ${cityLabel}. Check provider diagnostics, then try a larger preset, reduce cities, or lower scan count before retrying.`);
  if (weakContact > Math.max(2, job.results.length)) recommendations.push("Too few leads had a written contact path. Use the Facebook Manual DM workflow or try a broader market before email outreach.");
  if (!weakProviderCoverage && (job.results.length + job.reviewedNotRecommended.length) < Math.max(3, job.input.finalProspectsWanted / 2)) recommendations.push("Try Florida or Texas Suburbs next with Growth Mode for a broader written-outreach pool.");
  if (!recommendations.length) recommendations.push(`Best next run: keep ${displayTradeCategory(job.input.trade)} focused, then test one starter trade in the strongest city from ${cityLabel}.`);
  return recommendations.slice(0, 4);
}

export function validateTopProspectInput(value: unknown): { ok: true; value: TopProspectInput } | { ok: false; error: string } {
  const input = value as Partial<TopProspectInput>;
  const normalizedTrade = input.trade === allCoreServiceTradesOption ? allCoreServiceTradesOption : normalizeTradeCategory(input.trade);
  const rawCityInput = typeof input.city === "string" ? input.city.trim() : "";
  const state = typeof input.state === "string" ? displayStateCode(input.state) : "";
  const cityTargets = parseTopProspectCityTargets(rawCityInput, state);
  const city = cityTargets.length === 1 ? cityTargets[0].city : rawCityInput;
  const radiusKm = Number(input.radiusKm);
  const businessesToScan = Number(input.businessesToScan);
  const finalProspectsWanted = Number(input.finalProspectsWanted);
  if (input.mode !== undefined && !prospectModes.includes(input.mode as ProspectMode)) return { ok: false, error: "Select a supported prospect mode." };
  if (input.workflowType !== undefined && !topProspectWorkflowTypes.includes(input.workflowType as TopProspectWorkflowType)) {
    return { ok: false, error: "Select a supported Top Prospects workflow." };
  }
  if (input.outreachPreference !== undefined && !outreachPreferences.includes(input.outreachPreference as OutreachPreference)) {
    return { ok: false, error: "Select a supported outreach preference." };
  }
  if (input.prospectType !== undefined && !prospectSearchTypes.includes(input.prospectType as ProspectSearchType)) {
    return { ok: false, error: "Select a supported prospect type." };
  }
  const prospectType = typeof input.prospectType === "string" && prospectSearchTypes.includes(input.prospectType as ProspectSearchType)
    ? input.prospectType as ProspectSearchType
    : "redesign";
  const mode = normalizeProspectMode(input.mode);
  const workflowType = normalizeTopProspectWorkflowType(input.workflowType);
  const outreachPreference = normalizeOutreachPreference(input.outreachPreference);
  if (!normalizedTrade) return { ok: false, error: "Select a supported trade." };
  if (!cityTargets.length) return { ok: false, error: "Enter one city or supported city/state pairs." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Enter a two-letter state code." };
  if (![10, 25, 50].includes(radiusKm)) return { ok: false, error: "Select a supported radius." };
  if (!Number.isInteger(businessesToScan) || businessesToScan < 5 || businessesToScan > 250) return { ok: false, error: "Businesses to scan must be between 5 and 250." };
  if (!Number.isInteger(finalProspectsWanted) || finalProspectsWanted < 1 || finalProspectsWanted > 25 || finalProspectsWanted > businessesToScan) {
    return { ok: false, error: "Final prospects wanted must be between 1 and 25 and no greater than businesses to scan." };
  }
  return {
    ok: true,
    value: {
      trade: normalizedTrade,
      city,
      state,
      rawCityInput,
      cityTargets,
      radiusKm,
      businessesToScan,
      finalProspectsWanted,
      prospectType,
      mode,
      workflowType,
      outreachPreference,
      excludePreviouslyReviewed: input.excludePreviouslyReviewed !== false,
    },
  };
}
