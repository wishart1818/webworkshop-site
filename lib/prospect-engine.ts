export const prospectStatuses = [
  "New",
  "Reviewed",
  "Contacted",
  "Interested",
  "Proposal Sent",
  "Closed Won",
  "Closed Lost",
] as const;

export const tradeCategories = [
  "Roofing",
  "HVAC",
  "Landscaping",
  "Plumbing",
  "Electrical",
  "Power Washing",
  "General Contractor",
] as const;

export type ProspectStatus = (typeof prospectStatuses)[number];
export type TradeCategory = (typeof tradeCategories)[number];
export type ScoreKey =
  | "mobileExperience"
  | "visualDesign"
  | "ctaStrength"
  | "trustSignals"
  | "contactAccessibility"
  | "portfolioQuality"
  | "brandingQuality"
  | "conversionReadiness"
  | "technicalQuality";

export type Analysis = {
  overallScore: number;
  opportunityRating: "High" | "Medium" | "Low";
  scores: Record<ScoreKey, number>;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  redesignDirection: string;
  analyzedAt: string;
};

export type OutreachDraft = {
  subjects: string[];
  concise: string;
  detailed: string;
  followUps: string[];
  approved: boolean;
  generatedAt: string;
};

export type PreviewConcept = {
  direction: string;
  hero: string;
  homepageStructure: string[];
  ctaStrategy: string;
  servicePageStructure: string[];
  portfolioDirection: string;
  trustStrategy: string;
  leadCaptureStrategy: string;
  generatedAt: string;
};

export type Activity = {
  id: string;
  type: "created" | "analysis" | "outreach" | "preview" | "status" | "note";
  label: string;
  at: string;
};

export type Prospect = {
  id: string;
  businessName: string;
  website: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  trade: TradeCategory;
  status: ProspectStatus;
  serviceArea: string;
  sizeIndicator: "Small" | "Growing" | "Established";
  priorityScore: number;
  analysis?: Analysis;
  outreach?: OutreachDraft;
  preview?: PreviewConcept;
  notes: string[];
  activities: Activity[];
  createdAt: string;
};

const scoreLabels: Record<ScoreKey, string> = {
  mobileExperience: "Mobile experience",
  visualDesign: "Visual design",
  ctaStrength: "CTA strength",
  trustSignals: "Trust signals",
  contactAccessibility: "Contact access",
  portfolioQuality: "Portfolio",
  brandingQuality: "Branding",
  conversionReadiness: "Conversion readiness",
  technicalQuality: "Technical quality",
};

const now = () => new Date().toISOString();
const activity = (type: Activity["type"], label: string): Activity => ({
  id: crypto.randomUUID(),
  type,
  label,
  at: now(),
});

function seededScore(input: string, offset: number) {
  const value = [...input].reduce((sum, char) => sum + char.charCodeAt(0), offset * 37);
  return 32 + (value % 42);
}

export function calculatePriority(analysis: Analysis | undefined, size: Prospect["sizeIndicator"]) {
  if (!analysis) return size === "Established" ? 66 : size === "Growing" ? 58 : 48;
  const opportunity = 100 - analysis.overallScore;
  const sizeBoost = size === "Established" ? 18 : size === "Growing" ? 11 : 5;
  return Math.min(99, Math.round(opportunity * 0.82 + sizeBoost));
}

export function analyzeProspect(prospect: Prospect): Analysis {
  const basis = `${prospect.businessName}${prospect.website}${prospect.trade}`;
  const keys = Object.keys(scoreLabels) as ScoreKey[];
  const scores = Object.fromEntries(keys.map((key, index) => [key, seededScore(basis, index)])) as Record<
    ScoreKey,
    number
  >;
  const overallScore = Math.round(keys.reduce((sum, key) => sum + scores[key], 0) / keys.length);
  const ranked = [...keys].sort((a, b) => scores[b] - scores[a]);
  const strengths = ranked.slice(0, 2).map((key) => `${scoreLabels[key]} is clearer than the rest of the site.`);
  const weaknesses = ranked
    .slice(-3)
    .reverse()
    .map((key) => `${scoreLabels[key]} needs a more deliberate customer path.`);

  return {
    overallScore,
    opportunityRating: overallScore < 52 ? "High" : overallScore < 68 ? "Medium" : "Low",
    scores,
    strengths,
    weaknesses,
    summary: `${prospect.businessName} has a usable foundation, but the website makes homeowners work too hard to understand services, proof, and the next step.`,
    redesignDirection: `Build a mobile-first ${prospect.trade.toLowerCase()} site around service urgency, recent work, service-area proof, and one clear estimate path.`,
    analyzedAt: now(),
  };
}

export function generateOutreach(prospect: Prospect): OutreachDraft {
  const analysis = prospect.analysis ?? analyzeProspect(prospect);
  const strength = analysis.strengths[0].replace(/\.$/, "").toLowerCase();
  const weakness = analysis.weaknesses[0].replace(/\.$/, "").toLowerCase();
  return {
    subjects: [
      `A website idea for ${prospect.businessName}`,
      `${prospect.trade} website notes for ${prospect.city}`,
      `A clearer quote path for ${prospect.businessName}`,
    ],
    concise: `Hi ${prospect.businessName} team,\n\nI reviewed your website and noticed ${strength}. I also saw an opportunity: ${weakness}. I sketched a practical redesign direction that would make it easier for homeowners to understand your services and request an estimate.\n\nWould it be useful if I sent the preview?\n\nWebWorkshop`,
    detailed: `Hi ${prospect.businessName} team,\n\nI took a careful look at your website while researching ${prospect.trade.toLowerCase()} companies serving ${prospect.city}. The strongest part is that ${strength}.\n\nThe biggest missed opportunity is that ${weakness}. On mobile, that can make a ready-to-hire homeowner hesitate or leave before requesting a quote.\n\nI put together a contractor-specific direction focused on clearer services, stronger trust proof, and a shorter estimate path. This is a personal draft for your business, not an automated campaign.\n\nWould you like me to send the concept for review?\n\nWebWorkshop`,
    followUps: [
      `Hi again, I wanted to make sure my website notes for ${prospect.businessName} reached you. I can send the short preview if improving quote requests is on your list this year.`,
      `Last note from me: the main idea is a clearer mobile estimate path supported by recent-work proof. Happy to send it over, and I will close the loop if the timing is not right.`,
    ],
    approved: false,
    generatedAt: now(),
  };
}

export function generatePreview(prospect: Prospect): PreviewConcept {
  const trade = prospect.trade.toLowerCase();
  return {
    direction: `A crisp, local-first ${trade} website that feels established, responsive, and easy to hire.`,
    hero: `${prospect.trade} help across ${prospect.serviceArea || prospect.city}, with a direct request-an-estimate action and a secondary call option.`,
    homepageStructure: [
      "Urgency-aware hero and service-area promise",
      "Primary services organized by homeowner need",
      "Recent work and project proof",
      "Trust signals and what to expect",
      "Service areas, FAQs, and estimate form",
    ],
    ctaStrategy: "Use one primary action, Request an estimate, supported by a persistent mobile call action.",
    servicePageStructure: ["Problem and service fit", "What is included", "Recent related work", "FAQs", "Estimate request"],
    portfolioDirection: "Use labeled project photos with location, scope, and a short outcome instead of an unlabeled gallery.",
    trustStrategy: "Place licenses, years in business, reviews, warranties, and process expectations beside decision points.",
    leadCaptureStrategy: "Ask only for service needed, ZIP code, contact details, and optional project photos before the first conversation.",
    generatedAt: now(),
  };
}

export function withAnalysis(prospect: Prospect): Prospect {
  const analysis = analyzeProspect(prospect);
  return {
    ...prospect,
    analysis,
    priorityScore: calculatePriority(analysis, prospect.sizeIndicator),
    status: prospect.status === "New" ? "Reviewed" : prospect.status,
    activities: [activity("analysis", `Website analysis completed with a score of ${analysis.overallScore}.`), ...prospect.activities],
  };
}

export function withOutreach(prospect: Prospect): Prospect {
  return {
    ...prospect,
    outreach: generateOutreach(prospect),
    activities: [activity("outreach", "Personalized outreach draft generated for human review."), ...prospect.activities],
  };
}

export function withPreview(prospect: Prospect): Prospect {
  return {
    ...prospect,
    preview: generatePreview(prospect),
    activities: [activity("preview", "Contractor-specific website preview concept generated."), ...prospect.activities],
  };
}

export function createProspect(input: Omit<Prospect, "id" | "createdAt" | "priorityScore" | "notes" | "activities">): Prospect {
  const createdAt = now();
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt,
    priorityScore: calculatePriority(undefined, input.sizeIndicator),
    notes: [],
    activities: [{ id: crypto.randomUUID(), type: "created", label: "Prospect added to the discovery queue.", at: createdAt }],
  };
}

const seedCreatedAt = "2026-06-01T12:00:00.000Z";

export const seedProspects: Prospect[] = [
  ["Summit Ridge Roofing", "https://example.com/summit-roofing", "(419) 555-0142", "hello@summitridge.example", "Findlay", "OH", "Roofing", "Established"],
  ["Northline Heating & Air", "https://example.com/northline-hvac", "(419) 555-0188", "", "Toledo", "OH", "HVAC", "Growing"],
  ["Evergreen Outdoor Works", "https://example.com/evergreen-outdoor", "(614) 555-0129", "office@evergreen.example", "Dublin", "OH", "Landscaping", "Growing"],
  ["ClearFlow Plumbing", "https://example.com/clearflow", "(567) 555-0134", "", "Lima", "OH", "Plumbing", "Established"],
  ["BrightWire Electric", "https://example.com/brightwire", "(419) 555-0171", "service@brightwire.example", "Perrysburg", "OH", "Electrical", "Small"],
  ["Freshline Power Washing", "https://example.com/freshline", "(419) 555-0160", "", "Bowling Green", "OH", "Power Washing", "Small"],
].map(([businessName, website, phone, email, city, state, trade, sizeIndicator], index) => ({
  id: `seed-prospect-${index + 1}`,
  businessName,
  website,
  phone,
  email,
  city,
  state,
  trade: trade as TradeCategory,
  status: "New",
  serviceArea: `${city} and nearby communities`,
  sizeIndicator: sizeIndicator as Prospect["sizeIndicator"],
  priorityScore: calculatePriority(undefined, sizeIndicator as Prospect["sizeIndicator"]),
  notes: [],
  activities: [
    {
      id: `seed-activity-${index + 1}`,
      type: "created" as const,
      label: "Prospect added to the discovery queue.",
      at: seedCreatedAt,
    },
  ],
  createdAt: seedCreatedAt,
}));

export { activity, scoreLabels };
