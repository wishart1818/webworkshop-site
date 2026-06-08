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
export type ProspectSort = "priority" | "websiteScore" | "newest" | "businessName";
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
  visualStyleDirection: string;
  hero: string;
  homepageStructure: string[];
  ctaStrategy: string;
  servicePageStructure: string[];
  portfolioDirection: string;
  trustStrategy: string;
  leadCaptureStrategy: string;
  generatedAt: string;
};

export const prospectSortOptions: Array<{ value: ProspectSort; label: string }> = [
  { value: "priority", label: "Priority: highest first" },
  { value: "websiteScore", label: "Website score: lowest first" },
  { value: "newest", label: "Recently added" },
  { value: "businessName", label: "Business name: A-Z" },
];

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

const contractorPlaybooks: Record<TradeCategory, {
  homeownerNeed: string;
  primaryCta: string;
  services: string[];
  trustProof: string[];
  leadDetails: string[];
  visualCue: string;
}> = {
  Roofing: {
    homeownerNeed: "move from roof concern to a confident inspection request",
    primaryCta: "Request a roof inspection",
    services: ["roof repair", "full replacement", "storm-damage response"],
    trustProof: ["license and insurance", "material warranties", "recent local roofs"],
    leadDetails: ["property address", "roof concern", "storm date", "optional damage photos"],
    visualCue: "Use close, labeled roof photography, material detail, and restrained weather-response cues.",
  },
  HVAC: {
    homeownerNeed: "get urgent comfort help or compare a planned system upgrade",
    primaryCta: "Schedule HVAC service",
    services: ["heating and cooling repair", "system installation", "maintenance plans"],
    trustProof: ["technician certifications", "response expectations", "financing and equipment warranties"],
    leadDetails: ["service address", "system type", "comfort issue", "preferred appointment window"],
    visualCue: "Balance urgent service clarity with clean equipment, technician, and comfort imagery.",
  },
  Landscaping: {
    homeownerNeed: "picture the finished property and request a scoped consultation",
    primaryCta: "Plan a landscape consultation",
    services: ["landscape design", "installation", "seasonal maintenance"],
    trustProof: ["before-and-after projects", "plant and material knowledge", "service-area examples"],
    leadDetails: ["property address", "project goals", "budget range", "inspiration photos"],
    visualCue: "Let finished outdoor spaces lead, with seasonal color and clear before-and-after context.",
  },
  Plumbing: {
    homeownerNeed: "find the right repair quickly and understand when help can arrive",
    primaryCta: "Request plumbing service",
    services: ["leak and drain repair", "fixture installation", "water-heater service"],
    trustProof: ["licensed plumbers", "arrival and pricing expectations", "repair guarantees"],
    leadDetails: ["service address", "plumbing issue", "urgency", "optional issue photos"],
    visualCue: "Use clean service imagery and simple diagnostic cues without generic water graphics.",
  },
  Electrical: {
    homeownerNeed: "understand safety-critical services and request qualified help",
    primaryCta: "Request electrical service",
    services: ["electrical repair", "panel and service upgrades", "lighting and EV charger installation"],
    trustProof: ["licenses and permits", "safety process", "completed upgrade examples"],
    leadDetails: ["service address", "project or issue", "property type", "preferred timing"],
    visualCue: "Use precise project photography, clear safety signals, and calm technical detail.",
  },
  "Power Washing": {
    homeownerNeed: "see the likely transformation and request a fast property quote",
    primaryCta: "Request a washing quote",
    services: ["house washing", "concrete cleaning", "roof and soft washing"],
    trustProof: ["before-and-after results", "surface-safe process", "insured service"],
    leadDetails: ["property address", "surfaces to clean", "approximate size", "property photos"],
    visualCue: "Make before-and-after comparisons the visual system, supported by crisp surface detail.",
  },
  "General Contractor": {
    homeownerNeed: "judge project fit and start a well-scoped consultation",
    primaryCta: "Discuss a construction project",
    services: ["renovations", "additions", "new construction and project coordination"],
    trustProof: ["project portfolio", "license and insurance", "process and communication expectations"],
    leadDetails: ["property address", "project type", "target timing", "budget range"],
    visualCue: "Use project narratives, material details, and progress-to-finished photography.",
  },
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

function serviceAreaBoost(serviceArea: string) {
  return /\b(county|counties|regional|statewide|multiple|communities|nearby|greater)\b/i.test(serviceArea) ? 4 : 0;
}

export function calculatePriority(analysis: Analysis | undefined, size: Prospect["sizeIndicator"], serviceArea = "") {
  if (!analysis) return (size === "Established" ? 66 : size === "Growing" ? 58 : 48) + serviceAreaBoost(serviceArea);
  const opportunity = 100 - analysis.overallScore;
  const sizeBoost = size === "Established" ? 18 : size === "Growing" ? 11 : 5;
  return Math.min(99, Math.round(opportunity * 0.82 + sizeBoost + serviceAreaBoost(serviceArea)));
}

export function priorityRationale(prospect: Prospect) {
  const reasons = [
    prospect.analysis ? `${prospect.analysis.opportunityRating.toLowerCase()} redesign opportunity` : "website analysis still needed",
    `${prospect.sizeIndicator.toLowerCase()} business`,
    serviceAreaBoost(prospect.serviceArea) ? "broader service-area reach" : "local service-area reach",
  ];
  return reasons.join(" + ");
}

export function sortProspects(prospects: Prospect[], sort: ProspectSort) {
  return [...prospects].sort((a, b) => {
    if (sort === "websiteScore") {
      const aScore = a.analysis?.overallScore ?? 101;
      const bScore = b.analysis?.overallScore ?? 101;
      return aScore - bScore || b.priorityScore - a.priorityScore;
    }
    if (sort === "newest") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (sort === "businessName") return a.businessName.localeCompare(b.businessName);
    return b.priorityScore - a.priorityScore;
  });
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
  const playbook = contractorPlaybooks[prospect.trade];
  const strength = analysis.strengths[0].replace(/\.$/, "").toLowerCase();
  const weakness = analysis.weaknesses[0].replace(/\.$/, "").toLowerCase();
  const complianceFooter = "WebWorkshop\n[Add your business postal address before sending]\nIf you would rather not receive another note, reply and I will close the loop.";
  return {
    subjects: [
      `A website idea for ${prospect.businessName}`,
      `${prospect.trade} website notes for ${prospect.city}`,
      `A clearer quote path for ${prospect.businessName}`,
    ],
    concise: `Hi ${prospect.businessName} team,\n\nI reviewed your website and noticed ${strength}. I also saw an opportunity: ${weakness}. I sketched a ${prospect.trade.toLowerCase()}-specific direction built around helping homeowners ${playbook.homeownerNeed}, with a clear "${playbook.primaryCta}" path.\n\nWould it be useful if I sent the preview?\n\n${complianceFooter}`,
    detailed: `Hi ${prospect.businessName} team,\n\nI took a careful look at your website while researching ${prospect.trade.toLowerCase()} companies serving ${prospect.city}. The strongest part is that ${strength}.\n\nThe biggest missed opportunity is that ${weakness}. On mobile, that can make a ready-to-hire homeowner hesitate before taking the next step.\n\nI put together a contractor-specific direction centered on ${playbook.services.join(", ")}, proof such as ${playbook.trustProof.join(", ")}, and a shorter "${playbook.primaryCta}" path. This is a personal draft for your business, not an automated campaign.\n\nWould you like me to send the concept for review?\n\n${complianceFooter}`,
    followUps: [
      `Hi again, I wanted to make sure my website notes for ${prospect.businessName} reached you. I can send the short preview if improving quote requests is on your list this year.\n\n${complianceFooter}`,
      `Last note from me: the main idea is a clearer mobile estimate path supported by recent-work proof. Happy to send it over, and I will close the loop if the timing is not right.\n\n${complianceFooter}`,
    ],
    approved: false,
    generatedAt: now(),
  };
}

export function generatePreview(prospect: Prospect): PreviewConcept {
  const trade = prospect.trade.toLowerCase();
  const playbook = contractorPlaybooks[prospect.trade];
  return {
    direction: `A crisp, local-first ${trade} website that feels established, responsive, and easy to hire.`,
    visualStyleDirection: `${playbook.visualCue} Pair it with confident typography, high-contrast actions, and practical proof.`,
    hero: `${prospect.trade} help across ${prospect.serviceArea || prospect.city}, organized to help homeowners ${playbook.homeownerNeed}, with "${playbook.primaryCta}" as the primary action.`,
    homepageStructure: [
      `Outcome-led hero with "${playbook.primaryCta}"`,
      `${playbook.services.join(", ")} organized by homeowner need`,
      `Decision-stage proof: ${playbook.trustProof.join(", ")}`,
      "Recent local work with scope and outcome",
      "Service areas, practical FAQs, and lead form",
    ],
    ctaStrategy: `Use one primary action, "${playbook.primaryCta}," supported by a persistent mobile call action.`,
    servicePageStructure: ["Homeowner problem and service fit", "Scope, options, and what is included", "Relevant local project proof", "Process, trust proof, and FAQs", playbook.primaryCta],
    portfolioDirection: "Use labeled project photos with location, scope, and a short outcome instead of an unlabeled gallery.",
    trustStrategy: `Place ${playbook.trustProof.join(", ")} beside the decisions they support.`,
    leadCaptureStrategy: `Keep the first step focused on ${playbook.leadDetails.join(", ")} and contact details.`,
    generatedAt: now(),
  };
}

export function withAnalysis(prospect: Prospect): Prospect {
  const analysis = analyzeProspect(prospect);
  return {
    ...prospect,
    analysis,
    priorityScore: calculatePriority(analysis, prospect.sizeIndicator, prospect.serviceArea),
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
    priorityScore: calculatePriority(undefined, input.sizeIndicator, input.serviceArea),
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
  priorityScore: calculatePriority(undefined, sizeIndicator as Prospect["sizeIndicator"], `${city} and nearby communities`),
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
