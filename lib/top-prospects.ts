import type { DiscoveredLead, DiscoveryDiagnostics } from "@/lib/lead-discovery";
import { siteUrl } from "@/lib/site";
import type { TopProspectJobFailureClassification } from "@/lib/top-prospect-diagnostics";
import {
  generateOutreach,
  generatePreview,
  previewStyleProfile,
  type Analysis,
  type Prospect,
  prospectTypes,
  type ProspectType,
  type TradeCategory,
} from "@/lib/prospect-engine";

export const topProspectJobStatuses = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type TopProspectJobStatus = (typeof topProspectJobStatuses)[number];

export const prospectModes = ["strict", "growth", "volume"] as const;
export type ProspectMode = (typeof prospectModes)[number];

export const topProspectWorkflowTypes = ["search", "morning_batch"] as const;
export type TopProspectWorkflowType = (typeof topProspectWorkflowTypes)[number];

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
  trade: TradeCategory;
  city: string;
  state: string;
  radiusKm: number;
  businessesToScan: number;
  finalProspectsWanted: number;
  prospectType: ProspectType;
  mode: ProspectMode;
  workflowType: TopProspectWorkflowType;
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
};

export const topProspectRejectionReasons = [
  "Already strong website",
  "National/large brand",
  "Low redesign opportunity",
  "Weak sales fit",
  "No usable contact path",
  "Below final cutoff",
] as const;
export type TopProspectRejectionReason = (typeof topProspectRejectionReasons)[number];

export type TopProspectResult = OpportunityAssessment & {
  id: string;
  rank: number | null;
  selected: boolean;
  rejectionReason: TopProspectRejectionReason | null;
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
};

export type OutreachEmailQuality = {
  ready: boolean;
  checks: OutreachEmailQualityCheck[];
  issues: string[];
};

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
  failureClassification: TopProspectJobFailureClassification | null;
  errorMessage: string;
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

export function normalizeWebsite(value: string) {
  if (!value.trim()) return "";
  const url = new URL(value);
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
  Landscaping: 66,
  Plumbing: 76,
  Electrical: 74,
  "Power Washing": 54,
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

export function evaluateOutreachEmailQuality(prospect: Prospect, previewLink: string): OutreachEmailQuality {
  const outreach = prospect.outreach;
  const drafts = outreach ? [outreach.concise, outreach.detailed, ...outreach.followUps] : [];
  const combined = drafts.join("\n");
  const mainEmails = outreach ? [outreach.concise, outreach.detailed] : [];
  const publicLinkReady = isPublicPreviewLink(previewLink)
    && mainEmails.every((draft) => draft.includes(previewLink))
    && Boolean(outreach?.followUps.every((draft) => draft.includes(previewLink) || /earlier email/i.test(draft)));
  const checks: OutreachEmailQualityCheck[] = [
    {
      key: "public_preview_link",
      label: "Public preview link exists and is included",
      passed: publicLinkReady,
    },
    {
      key: "no_internal_scores",
      label: "Email contains no internal score language",
      passed: drafts.length > 0
        && !/\b\d{1,3}\s*\/\s*100\b|\bscore(?:d)?(?:\s+of|:)?\s+\d{1,3}\b|\b(?:overall|website|opportunity|conversion readiness|mobile experience|trust signals|contactability|weighted sales)\s+score\b|\b(?:website quality|revenue opportunity|contactability|local market competitiveness|ai website replacement confidence|weighted sales|mobile experience|conversion readiness|trust signals|opportunity)\b.{0,30}\b\d{1,3}\b/i.test(combined),
    },
    {
      key: "real_strength",
      label: "Email includes one real strength",
      passed: mainEmails.length === 2 && mainEmails.every((draft) => /one thing that already works well:/i.test(draft)),
    },
    {
      key: "missed_opportunity",
      label: "Email includes one real missed opportunity",
      passed: mainEmails.length === 2 && mainEmails.every((draft) => /one missed opportunity:/i.test(draft)),
    },
    {
      key: "clear_cta",
      label: "Email includes a clear call to action",
      passed: mainEmails.length === 2 && mainEmails.every((draft) => /would you be open to a quick 10-minute call/i.test(draft)),
    },
    {
      key: "opt_out",
      label: "Every draft includes opt-out language",
      passed: drafts.length >= 4 && drafts.every((draft) => /would rather not receive another note/i.test(draft)),
    },
    {
      key: "postal_address",
      label: "Every draft includes a postal address or placeholder",
      passed: drafts.length >= 4 && drafts.every((draft) => /\[Add your business postal address before sending\]/i.test(draft)),
    },
  ];
  return {
    ready: checks.every((check) => check.passed),
    checks,
    issues: checks.filter((check) => !check.passed).map((check) => check.label),
  };
}

export function assertOutreachEmailReady(prospect: Prospect, previewLink: string) {
  const quality = evaluateOutreachEmailQuality(prospect, previewLink);
  if (!quality.ready) {
    throw new Error(`This Outreach Package cannot be approved before all email quality checks pass: ${quality.issues.join(", ")}.`);
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
  const broaderServiceArea = /\b(county|counties|regional|statewide|multiple|communities|nearby|greater)\b/i.test(prospect.serviceArea);
  const sizePotential = prospect.sizeIndicator === "Established" ? 86 : prospect.sizeIndicator === "Growing" ? 72 : 55;
  const revenueOpportunityScore = clampScore(
    sizePotential * 0.48
    + tradeRevenuePotential[prospect.trade] * 0.34
    + (broaderServiceArea ? 86 : prospect.serviceArea ? 64 : 48) * 0.18,
  );
  const contactabilityScore = clampScore(
    analysis.scores.contactAccessibility * 0.48
    + (prospect.phone ? 28 : 0)
    + (prospect.email ? 19 : 0)
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
    + (prospect.phone || prospect.email ? 8 : 3),
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
    pitchAngle: `Lead with a practical ${prospect.trade.toLowerCase()} redesign that improves ${weakness}, local proof, and the path to a quote.`,
  };
}

export function calculateNoWebsitePresenceScores(prospect: Prospect): NoWebsitePresenceScores {
  const socialOnly = /facebook|instagram/i.test(prospect.profileUrl);
  const googleOnly = /google|g\.page|maps\.app/i.test(prospect.profileUrl);
  const onlinePresenceGapScore = clampScore(socialOnly ? 88 : googleOnly ? 92 : 100);
  const contactabilityScore = clampScore((prospect.phone ? 78 : 0) + (prospect.email ? 17 : 0) + (prospect.profileUrl ? 5 : 0));
  const reviewStrength = Math.min(52, Math.round(Math.log10(Math.max(1, prospect.reviewCount) + 1) * 28));
  const businessActivityScore = clampScore(
    reviewStrength
    + Math.min(18, prospect.recentReviewCount * 4)
    + (prospect.rating >= 4.5 ? 18 : prospect.rating >= 4 ? 13 : prospect.rating > 0 ? 7 : 0)
    + Math.min(12, Math.round(prospect.sourceConfidence * 0.12)),
  );
  const websiteNeedScore = clampScore(
    onlinePresenceGapScore * 0.42
    + contactabilityScore * 0.2
    + businessActivityScore * 0.28
    + prospect.sourceConfidence * 0.1,
  );
  return { onlinePresenceGapScore, contactabilityScore, businessActivityScore, websiteNeedScore };
}

export function assessNoWebsiteOpportunity(prospect: Prospect): OpportunityAssessment {
  const presenceScores = calculateNoWebsitePresenceScores(prospect);
  return {
    opportunityScore: presenceScores.websiteNeedScore,
    presenceScores,
    salesScores: {
      websiteQualityScore: 0,
      revenueOpportunityScore: 0,
      contactabilityScore: presenceScores.contactabilityScore,
      localMarketCompetitivenessScore: 0,
      aiReplacementConfidenceScore: 0,
      weightedSalesScore: presenceScores.websiteNeedScore,
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
  prospect: Pick<Prospect, "businessName" | "website" | "phone" | "email" | "analysis" | "prospectType" | "reviewCount" | "rating" | "sourceConfidence">,
  assessment: OpportunityAssessment,
  mode: ProspectMode = "strict",
): TopProspectRejectionReason | null {
  if (likelyNationalOrLargeBrand(prospect)) return "National/large brand";
  if (prospect.prospectType === "no_website_social_only") {
    if (!prospect.phone && !prospect.email) return "No usable contact path";
    if (assessment.presenceScores && assessment.presenceScores.websiteNeedScore < 45) return "Weak sales fit";
    return null;
  }
  const websiteScore = prospect.analysis?.overallScore;
  if (mode === "volume") {
    if (!hasMeaningfulImprovementGap(prospect)) return "Low redesign opportunity";
    return null;
  }
  if (!prospect.phone && !prospect.email) return "No usable contact path";
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
  prospect: Pick<Prospect, "businessName" | "website" | "phone" | "email" | "analysis" | "prospectType" | "reviewCount" | "rating" | "sourceConfidence">,
  assessment: OpportunityAssessment,
  mode: ProspectMode = "strict",
) {
  const salesFitRejection = topProspectRejectionReason(prospect, assessment, mode);
  return {
    selected: persistedSelected && salesFitRejection === null,
    rejectionReason: salesFitRejection ?? (persistedSelected ? null : "Below final cutoff" as const),
  };
}

export function generateWebsiteBuildPrompt(prospect: Prospect, assessment: OpportunityAssessment) {
  const analysis = prospect.analysis;
  const preview = prospect.preview ?? generatePreview(prospect);
  const styleProfile = previewStyleProfile(prospect, preview);
  const styleInstructions = [
    `Style profile: ${styleProfile.name}.`,
    `Palette: primary ${styleProfile.primaryColor}, accent ${styleProfile.accentColor}, main surface ${styleProfile.surfaceColor}, soft surface ${styleProfile.softSurfaceColor}, text ${styleProfile.inkColor}.`,
    `Tone and layout: ${styleProfile.tone.replace("-", " ")} with a ${styleProfile.layoutStyle.replace("-", " ")} composition.`,
    `Typography: ${styleProfile.typographyStyle}.`,
    `Primary CTA wording: "${styleProfile.ctaLabel}".`,
    `Why this style was selected: ${styleProfile.styleReason}`,
    "Do not reuse WebWorkshop branding, dark-green defaults, or agency-template styling. The result should feel like this business, improved.",
  ].join("\n");
  if (prospect.prospectType === "no_website_social_only") {
    return [
      `Create the first owned, polished, mobile-first website for ${prospect.businessName}, a ${prospect.trade.toLowerCase()} business serving ${prospect.serviceArea || `${prospect.city}, ${prospect.state}`}.`,
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
    `Create a polished, mobile-first website for ${prospect.businessName}, a ${prospect.trade.toLowerCase()} business serving ${prospect.serviceArea || `${prospect.city}, ${prospect.state}`}.`,
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

export function prepareTopProspectArtifacts(prospect: Prospect, previewLink = prospectPreviewLink(prospect.id)) {
  const withArtifacts = {
    ...prospect,
    outreach: generateOutreach(prospect, previewLink),
    preview: generatePreview(prospect),
  };
  const assessment = prospect.prospectType === "no_website_social_only"
    ? assessNoWebsiteOpportunity(withArtifacts)
    : assessOpportunity(withArtifacts);
  return {
    prospect: withArtifacts,
    assessment,
    buildPrompt: generateWebsiteBuildPrompt(withArtifacts, assessment),
    previewLink,
    emailQuality: evaluateOutreachEmailQuality(withArtifacts, previewLink),
  };
}

export function validateTopProspectInput(value: unknown): { ok: true; value: TopProspectInput } | { ok: false; error: string } {
  const input = value as Partial<TopProspectInput>;
  const trades: TradeCategory[] = ["Roofing", "HVAC", "Landscaping", "Plumbing", "Electrical", "Power Washing", "General Contractor"];
  const trade = input.trade;
  const city = typeof input.city === "string" ? input.city.trim() : "";
  const state = typeof input.state === "string" ? input.state.trim().toUpperCase() : "";
  const radiusKm = Number(input.radiusKm);
  const businessesToScan = Number(input.businessesToScan);
  const finalProspectsWanted = Number(input.finalProspectsWanted);
  if (input.mode !== undefined && !prospectModes.includes(input.mode as ProspectMode)) return { ok: false, error: "Select a supported prospect mode." };
  if (input.workflowType !== undefined && !topProspectWorkflowTypes.includes(input.workflowType as TopProspectWorkflowType)) {
    return { ok: false, error: "Select a supported Top Prospects workflow." };
  }
  if (input.prospectType !== undefined && !prospectTypes.includes(input.prospectType as ProspectType)) {
    return { ok: false, error: "Select a supported prospect type." };
  }
  const prospectType = typeof input.prospectType === "string" && prospectTypes.includes(input.prospectType as ProspectType)
    ? input.prospectType as ProspectType
    : "redesign";
  const mode = normalizeProspectMode(input.mode);
  const workflowType = normalizeTopProspectWorkflowType(input.workflowType);
  if (!trade || !trades.includes(trade)) return { ok: false, error: "Select a supported trade." };
  if (!/^[A-Za-z .'-]{2,100}$/.test(city)) return { ok: false, error: "Enter a valid city." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Enter a two-letter state code." };
  if (![10, 25, 50].includes(radiusKm)) return { ok: false, error: "Select a supported radius." };
  if (!Number.isInteger(businessesToScan) || businessesToScan < 5 || businessesToScan > 100) return { ok: false, error: "Businesses to scan must be between 5 and 100." };
  if (!Number.isInteger(finalProspectsWanted) || finalProspectsWanted < 1 || finalProspectsWanted > 25 || finalProspectsWanted > businessesToScan) {
    return { ok: false, error: "Final prospects wanted must be between 1 and 25 and no greater than businesses to scan." };
  }
  return { ok: true, value: { trade, city, state, radiusKm, businessesToScan, finalProspectsWanted, prospectType, mode, workflowType } };
}
