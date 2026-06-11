import type { DiscoveredLead, DiscoveryDiagnostics } from "@/lib/lead-discovery";
import type { TopProspectJobFailureClassification } from "@/lib/top-prospect-diagnostics";
import {
  generateOutreach,
  generatePreview,
  type Analysis,
  type Prospect,
  type TradeCategory,
} from "@/lib/prospect-engine";

export const topProspectJobStatuses = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type TopProspectJobStatus = (typeof topProspectJobStatuses)[number];

export type TopProspectInput = {
  trade: TradeCategory;
  city: string;
  state: string;
  radiusKm: number;
  businessesToScan: number;
  finalProspectsWanted: number;
};

export type OpportunityAssessment = {
  opportunityScore: number;
  mainWeakness: string;
  whyMayBuy: string;
  pitchAngle: string;
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
  prospect: Prospect;
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
    mainWeakness: `The clearest opportunity is ${weakness}.`,
    whyMayBuy: `${prospect.businessName} has an active site and clear local service footprint, but its ${weakness} may be costing ready-to-hire visitors.`,
    pitchAngle: `Lead with a practical ${prospect.trade.toLowerCase()} redesign that improves ${weakness}, local proof, and the path to a quote.`,
  };
}

export function topProspectRejectionReason(
  prospect: Pick<Prospect, "businessName" | "website" | "phone" | "email" | "analysis">,
  assessment: OpportunityAssessment,
): TopProspectRejectionReason | null {
  if (likelyNationalOrLargeBrand(prospect)) return "National/large brand";
  if (!prospect.phone && !prospect.email) return "No usable contact path";
  const websiteScore = prospect.analysis?.overallScore;
  if (websiteScore !== undefined && websiteScore > 85) return "Already strong website";
  if (websiteScore !== undefined && websiteScore > 75) return "Low redesign opportunity";
  if (assessment.opportunityScore < 60) return "Weak sales fit";
  return null;
}

export function topProspectResultDisposition(
  persistedSelected: boolean,
  prospect: Pick<Prospect, "businessName" | "website" | "phone" | "email" | "analysis">,
  assessment: OpportunityAssessment,
) {
  const salesFitRejection = topProspectRejectionReason(prospect, assessment);
  return {
    selected: persistedSelected && salesFitRejection === null,
    rejectionReason: salesFitRejection ?? (persistedSelected ? null : "Below final cutoff" as const),
  };
}

export function generateWebsiteBuildPrompt(prospect: Prospect, assessment: OpportunityAssessment) {
  const analysis = prospect.analysis;
  const preview = prospect.preview ?? generatePreview(prospect);
  if (!analysis) throw new Error("A website build prompt requires website analysis.");
  return [
    `Create a polished, mobile-first website for ${prospect.businessName}, a ${prospect.trade.toLowerCase()} business serving ${prospect.serviceArea || `${prospect.city}, ${prospect.state}`}.`,
    `Primary business goal: turn local homeowners into qualified estimate requests. Primary opportunity: ${assessment.mainWeakness}`,
    `Positioning and pitch: ${assessment.pitchAngle}`,
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

export function prepareTopProspectArtifacts(prospect: Prospect) {
  const withArtifacts = {
    ...prospect,
    outreach: generateOutreach(prospect),
    preview: generatePreview(prospect),
  };
  const assessment = assessOpportunity(withArtifacts);
  return { prospect: withArtifacts, assessment, buildPrompt: generateWebsiteBuildPrompt(withArtifacts, assessment) };
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
  if (!trade || !trades.includes(trade)) return { ok: false, error: "Select a supported trade." };
  if (!/^[A-Za-z .'-]{2,100}$/.test(city)) return { ok: false, error: "Enter a valid city." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Enter a two-letter state code." };
  if (![10, 25, 50].includes(radiusKm)) return { ok: false, error: "Select a supported radius." };
  if (!Number.isInteger(businessesToScan) || businessesToScan < 5 || businessesToScan > 100) return { ok: false, error: "Businesses to scan must be between 5 and 100." };
  if (!Number.isInteger(finalProspectsWanted) || finalProspectsWanted < 1 || finalProspectsWanted > 25 || finalProspectsWanted > businessesToScan) {
    return { ok: false, error: "Final prospects wanted must be between 1 and 25 and no greater than businesses to scan." };
  }
  return { ok: true, value: { trade, city, state, radiusKm, businessesToScan, finalProspectsWanted } };
}
