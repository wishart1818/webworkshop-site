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
export const prospectTypes = ["redesign", "no_website_social_only"] as const;
export type ProspectType = (typeof prospectTypes)[number];
export const websiteAvailabilityStatuses = [
  "unknown",
  "usable",
  "no_owned_website",
  "invalid_website",
  "http_404",
  "unreachable_website",
  "broken_website",
  "inactive_website",
] as const;
export type WebsiteAvailabilityStatus = (typeof websiteAvailabilityStatuses)[number];
export const prospectSearchTypes = [...prospectTypes, "all"] as const;
export type ProspectSearchType = (typeof prospectSearchTypes)[number];
export const prospectClassifications = [
  "website_redesign",
  "no_website",
  "social_only",
  "listing_only",
  "phone_only",
  "not_enough_contact_info",
  "national_large_brand",
  "duplicate_bad_fit",
] as const;
export type ProspectClassification = (typeof prospectClassifications)[number];
export const recommendedContactMethods = [
  "send_email",
  "submit_contact_form",
  "message_on_facebook",
  "call_first",
  "needs_manual_contact_research",
  "do_not_contact",
] as const;
export type RecommendedContactMethod = (typeof recommendedContactMethods)[number];
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
  heroHeadline?: string;
  heroSupporting?: string;
  serviceHighlights?: string[];
  trustItems?: string[];
  styleProfile?: PreviewStyleProfile;
  homepageStructure: string[];
  ctaStrategy: string;
  servicePageStructure: string[];
  portfolioDirection: string;
  trustStrategy: string;
  leadCaptureStrategy: string;
  generatedAt: string;
};

export type PreviewStyleProfile = {
  name: string;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  softSurfaceColor: string;
  inkColor: string;
  mutedTextColor: string;
  borderColor: string;
  typographyStyle: string;
  headingFont: string;
  bodyFont: string;
  tone: "practical" | "modern-practical" | "local-family" | "premium-craft" | "high-trust";
  layoutStyle: "trust-led" | "service-led" | "project-led" | "clean-split";
  ctaLabel: string;
  styleReason: string;
  brandSource: "business-name cue" | "website-domain cue" | "trade fallback";
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
  profileUrl: string;
  prospectType: ProspectType;
  classification: ProspectClassification;
  phone: string;
  email: string;
  contactFormUrl: string;
  address: string;
  city: string;
  state: string;
  trade: TradeCategory;
  status: ProspectStatus;
  serviceArea: string;
  sizeIndicator: "Small" | "Growing" | "Established";
  priorityScore: number;
  rating: number;
  reviewCount: number;
  recentReviewCount: number;
  sourceConfidence: number;
  activitySignals: string[];
  recommendedContactMethod: RecommendedContactMethod;
  inactive: boolean;
  websiteStatus: WebsiteAvailabilityStatus;
  websiteStatusDetail: string;
  websiteAnalysisAttemptedAt: string;
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

type PreviewPalette = Pick<
  PreviewStyleProfile,
  "primaryColor" | "accentColor" | "surfaceColor" | "softSurfaceColor" | "inkColor" | "mutedTextColor" | "borderColor"
> & { label: string };

const tradePreviewPalettes: Record<TradeCategory, PreviewPalette[]> = {
  Roofing: [
    { label: "Slate and copper", primaryColor: "#263746", accentColor: "#b85c2e", surfaceColor: "#ffffff", softSurfaceColor: "#f2f4f5", inkColor: "#18222b", mutedTextColor: "#53616d", borderColor: "#d8dee2" },
    { label: "Navy and safety gold", primaryColor: "#173b63", accentColor: "#d69b24", surfaceColor: "#ffffff", softSurfaceColor: "#f2f5f8", inkColor: "#17222d", mutedTextColor: "#536474", borderColor: "#d5dde5" },
  ],
  HVAC: [
    { label: "Comfort blue and warm orange", primaryColor: "#155b83", accentColor: "#d66a2f", surfaceColor: "#ffffff", softSurfaceColor: "#eef6f8", inkColor: "#17262d", mutedTextColor: "#53666e", borderColor: "#d2e0e5" },
    { label: "Teal and amber", primaryColor: "#17636a", accentColor: "#c78624", surfaceColor: "#ffffff", softSurfaceColor: "#edf6f5", inkColor: "#172827", mutedTextColor: "#526866", borderColor: "#d0dfdd" },
  ],
  Landscaping: [
    { label: "Evergreen and clay", primaryColor: "#315c45", accentColor: "#b86f3d", surfaceColor: "#fffefa", softSurfaceColor: "#f2f5ee", inkColor: "#202b24", mutedTextColor: "#5b685f", borderColor: "#d8dfd7" },
    { label: "Olive and goldenrod", primaryColor: "#53633d", accentColor: "#b88722", surfaceColor: "#fffefa", softSurfaceColor: "#f4f5ed", inkColor: "#262c21", mutedTextColor: "#616959", borderColor: "#dedfce" },
  ],
  Plumbing: [
    { label: "Clear blue and coral", primaryColor: "#145d82", accentColor: "#d35f4b", surfaceColor: "#ffffff", softSurfaceColor: "#eef6f9", inkColor: "#16272f", mutedTextColor: "#516772", borderColor: "#d2e1e7" },
    { label: "Deep aqua and brass", primaryColor: "#17656d", accentColor: "#b9892e", surfaceColor: "#ffffff", softSurfaceColor: "#eef7f7", inkColor: "#172a2c", mutedTextColor: "#526a6d", borderColor: "#d1e1e2" },
  ],
  Electrical: [
    { label: "Graphite and electric amber", primaryColor: "#303b46", accentColor: "#d99a18", surfaceColor: "#ffffff", softSurfaceColor: "#f3f5f6", inkColor: "#1b232b", mutedTextColor: "#596570", borderColor: "#d9dfe3" },
    { label: "Midnight blue and bright yellow", primaryColor: "#243c61", accentColor: "#d8a91d", surfaceColor: "#ffffff", softSurfaceColor: "#f1f4f8", inkColor: "#192433", mutedTextColor: "#566579", borderColor: "#d6dde7" },
  ],
  "Power Washing": [
    { label: "Crisp blue and aqua", primaryColor: "#17648b", accentColor: "#22a3a6", surfaceColor: "#ffffff", softSurfaceColor: "#edf7fa", inkColor: "#172830", mutedTextColor: "#536b76", borderColor: "#d1e3e9" },
    { label: "Ocean navy and clean cyan", primaryColor: "#244b70", accentColor: "#2b9eb3", surfaceColor: "#ffffff", softSurfaceColor: "#eff5f8", inkColor: "#192630", mutedTextColor: "#586b79", borderColor: "#d5e0e6" },
  ],
  "General Contractor": [
    { label: "Charcoal and brick", primaryColor: "#353b3d", accentColor: "#a95537", surfaceColor: "#ffffff", softSurfaceColor: "#f4f3f1", inkColor: "#242627", mutedTextColor: "#666562", borderColor: "#dedbd6" },
    { label: "Deep navy and bronze", primaryColor: "#283d52", accentColor: "#a87938", surfaceColor: "#ffffff", softSurfaceColor: "#f3f4f4", inkColor: "#1d272e", mutedTextColor: "#5c686f", borderColor: "#d9dddf" },
  ],
};

const brandCuePalettes: Array<{ pattern: RegExp; palette: PreviewPalette; cue: string }> = [
  { pattern: /\bblue\b|\bblue line\b/i, cue: "blue business-name cue", palette: { label: "Blue-line navy and sky", primaryColor: "#174b78", accentColor: "#2c94c6", surfaceColor: "#ffffff", softSurfaceColor: "#eef5f9", inkColor: "#172632", mutedTextColor: "#526977", borderColor: "#d2e0e8" } },
  { pattern: /\bevergreen\b|\bgreen\b|\blawn\b|\bgarden\b|\boutdoor\b/i, cue: "green or outdoor business-name cue", palette: { label: "Evergreen and field gold", primaryColor: "#315b43", accentColor: "#b88a2a", surfaceColor: "#fffefa", softSurfaceColor: "#f1f5ef", inkColor: "#202b24", mutedTextColor: "#5c695f", borderColor: "#d7dfd7" } },
  { pattern: /\bclear\b|\bflow\b|\bwater\b|\bcoast\b/i, cue: "water or clarity business-name cue", palette: { label: "Clear-water blue and coral", primaryColor: "#17617f", accentColor: "#c9664c", surfaceColor: "#ffffff", softSurfaceColor: "#eef6f8", inkColor: "#17272e", mutedTextColor: "#536a73", borderColor: "#d2e2e6" } },
  { pattern: /\bbright\b|\bsun\b|\bgold\b|\bspark\b/i, cue: "bright business-name cue", palette: { label: "Graphite and bright amber", primaryColor: "#313c46", accentColor: "#d69a20", surfaceColor: "#ffffff", softSurfaceColor: "#f4f5f6", inkColor: "#1c242b", mutedTextColor: "#596670", borderColor: "#d9dfe3" } },
  { pattern: /\bsummit\b|\bridge\b|\bstone\b|\biron\b|\bsteel\b/i, cue: "sturdy material or terrain cue", palette: { label: "Mountain slate and rust", primaryColor: "#344653", accentColor: "#ae623a", surfaceColor: "#ffffff", softSurfaceColor: "#f2f4f5", inkColor: "#1c272e", mutedTextColor: "#596872", borderColor: "#d8dee2" } },
];

function stableIndex(value: string, length: number) {
  return [...value].reduce((total, character) => total + character.charCodeAt(0), 0) % length;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function websiteHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function previewTone(prospect: Prospect): PreviewStyleProfile["tone"] {
  const identity = `${prospect.businessName} ${websiteHostname(prospect.website)}`.toLowerCase();
  if (/\bfamily\b|\b& sons?\b|\band sons?\b|\bowner\b/.test(identity)) return "local-family";
  if (/\bcustom\b|\bpremium\b|\bluxury\b|\bdesign\b/.test(identity)) return "premium-craft";
  if (prospect.sizeIndicator === "Established") return "high-trust";
  if (/\bblue\b|\bbright\b|\bclear\b|\bnorth\b|\bline\b/.test(identity)) return "modern-practical";
  return "practical";
}

function previewLayout(prospect: Prospect): PreviewStyleProfile["layoutStyle"] {
  if (prospect.trade === "Landscaping" || prospect.trade === "Power Washing" || prospect.trade === "General Contractor") return "project-led";
  if (prospect.trade === "HVAC" || prospect.trade === "Plumbing") return "service-led";
  if (prospect.trade === "Roofing") return stableIndex(prospect.businessName, 2) ? "trust-led" : "clean-split";
  return "clean-split";
}

function previewCta(prospect: Prospect) {
  if (prospect.trade === "Roofing") return /storm|damage|repair/i.test(prospect.businessName) ? "Schedule an inspection" : "Request an estimate";
  if (prospect.trade === "HVAC") return "Schedule service";
  if (prospect.trade === "Landscaping") return "Get a free quote";
  if (prospect.trade === "Plumbing") return "Request service";
  if (prospect.trade === "Electrical") return "Request an estimate";
  if (prospect.trade === "Power Washing") return "Get a free quote";
  return "Discuss your project";
}

export function generateProspectStyleProfile(prospect: Prospect): PreviewStyleProfile {
  const hostname = websiteHostname(prospect.website);
  const nameCue = brandCuePalettes.find(({ pattern }) => pattern.test(prospect.businessName));
  const domainCue = nameCue
    ? undefined
    : brandCuePalettes.find(({ pattern }) => pattern.test(hostname.replaceAll(/[-_.]/g, " ")));
  const selectedCue = nameCue ?? domainCue;
  const tradePalettes = tradePreviewPalettes[prospect.trade];
  const palette = selectedCue?.palette ?? tradePalettes[stableIndex(`${prospect.businessName}${hostname}`, tradePalettes.length)];
  const tone = previewTone(prospect);
  const typography = tone === "premium-craft"
    ? { typographyStyle: "Craft-led serif headings with plainspoken sans-serif body copy", headingFont: "Georgia, 'Times New Roman', serif", bodyFont: "Arial, Helvetica, sans-serif" }
    : tone === "local-family"
      ? { typographyStyle: "Friendly humanist sans-serif with approachable, sturdy headings", headingFont: "'Trebuchet MS', Arial, sans-serif", bodyFont: "Arial, Helvetica, sans-serif" }
      : { typographyStyle: "Clear, sturdy sans-serif with compact high-trust headings", headingFont: "Arial, Helvetica, sans-serif", bodyFont: "Arial, Helvetica, sans-serif" };
  const brandSource: PreviewStyleProfile["brandSource"] = nameCue ? "business-name cue" : domainCue ? "website-domain cue" : "trade fallback";
  const reason = selectedCue
    ? `${titleCase(selectedCue.cue)} informed the palette; the ${prospect.trade.toLowerCase()} category informed the trust, service, and layout treatment.`
    : `No recognizable color cue was available, so the palette and layout use a restrained ${prospect.trade.toLowerCase()} direction suited to a ${tone.replace("-", " ")} local business.`;

  return {
    name: `${palette.label} ${tone.replace("-", " ")}`,
    ...palette,
    ...typography,
    tone,
    layoutStyle: previewLayout(prospect),
    ctaLabel: previewCta(prospect),
    styleReason: reason,
    brandSource,
  };
}

export function previewStyleProfile(prospect: Prospect, preview?: PreviewConcept) {
  return preview?.styleProfile ?? generateProspectStyleProfile(prospect);
}

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
  if (prospect.prospectType === "no_website_social_only") {
    return prospect.reviewCount > 0
      ? `${prospect.reviewCount} public reviews + no owned website`
      : "active public profile + no owned website";
  }
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

const outreachStrengths: Record<ScoreKey, string> = {
  mobileExperience: "Your site is already pretty easy to view on mobile.",
  visualDesign: "Your current site already gives homeowners a clear sense of the business.",
  ctaStrength: "Your current site already gives visitors a visible next step.",
  trustSignals: "Your site already gives homeowners useful reasons to trust the business.",
  contactAccessibility: "Your phone and contact details are already fairly easy to find.",
  portfolioQuality: "Your site already gives visitors useful proof of your work.",
  brandingQuality: "Your business name and brand already come through clearly.",
  conversionReadiness: "Interested homeowners already have a reasonable path to reach out.",
  technicalQuality: "Your current site already has a solid technical foundation.",
};

function isFacebookProfile(value: string) {
  return /(?:^|\/\/)(?:www\.)?(?:facebook|fb)\.com\//i.test(value);
}

function isSocialProfile(value: string) {
  return /(?:^|\/\/)(?:www\.)?(?:facebook|fb|instagram)\.com\//i.test(value);
}

export function classifyProspectPresence(input: Pick<Prospect, "website" | "profileUrl" | "phone" | "email" | "contactFormUrl">): ProspectClassification {
  if (input.website) return "website_redesign";
  if (isSocialProfile(input.profileUrl)) return "social_only";
  if (input.profileUrl) return "listing_only";
  if (input.phone && !input.email && !input.contactFormUrl) return "phone_only";
  if (input.phone || input.email || input.contactFormUrl) return "no_website";
  return "not_enough_contact_info";
}

export const websiteAvailabilityLabels: Record<WebsiteAvailabilityStatus, string> = {
  unknown: "Website not analyzed yet",
  usable: "Usable website",
  no_owned_website: "No owned website detected",
  invalid_website: "No usable website found",
  http_404: "Website returned 404",
  unreachable_website: "Website appears broken",
  broken_website: "Website appears broken",
  inactive_website: "Website appears inactive",
};

export function prospectHasUnusableWebsite(prospect: Pick<Prospect, "prospectType" | "websiteStatus">) {
  return prospect.prospectType === "no_website_social_only"
    || !["unknown", "usable"].includes(prospect.websiteStatus);
}

export function prospectPresenceLabels(prospect: Pick<Prospect, "websiteStatus" | "classification" | "email" | "contactFormUrl" | "recommendedContactMethod">) {
  const labels: string[] = [];
  if (prospect.websiteStatus === "no_owned_website" || prospect.classification === "no_website") labels.push("No website found");
  if (["invalid_website", "http_404", "unreachable_website", "broken_website", "inactive_website"].includes(prospect.websiteStatus)) labels.push("Broken website");
  if (prospect.classification === "listing_only" || prospect.classification === "social_only") labels.push("Listing only");
  if (prospect.classification === "phone_only") labels.push("Phone only");
  if (prospect.recommendedContactMethod === "needs_manual_contact_research") labels.push("Needs manual contact research");
  if (prospect.email) labels.push("Public email available");
  if (prospect.contactFormUrl) labels.push("Contact form available");
  return [...new Set(labels)];
}

export function recommendProspectContactMethod(input: Pick<Prospect, "classification" | "profileUrl" | "phone" | "email" | "contactFormUrl" | "inactive">): RecommendedContactMethod {
  if (input.inactive || input.classification === "national_large_brand" || input.classification === "duplicate_bad_fit") return "do_not_contact";
  if (input.email) return "send_email";
  if (input.contactFormUrl) return "submit_contact_form";
  if (isFacebookProfile(input.profileUrl)) return "message_on_facebook";
  if (input.phone) return "call_first";
  return "needs_manual_contact_research";
}

export function prospectContactMethodIsUsable(input: Pick<Prospect, "recommendedContactMethod" | "profileUrl" | "phone" | "email" | "contactFormUrl">) {
  if (input.recommendedContactMethod === "send_email") return Boolean(input.email);
  if (input.recommendedContactMethod === "submit_contact_form") return Boolean(input.contactFormUrl);
  if (input.recommendedContactMethod === "message_on_facebook") return isFacebookProfile(input.profileUrl);
  if (input.recommendedContactMethod === "call_first") return Boolean(input.phone);
  return false;
}

const outreachOpportunities: Record<ScoreKey, string> = {
  mobileExperience: "Some mobile visitors may still have to work too hard to find the next step.",
  visualDesign: "The presentation could do more to make the business feel established at a glance.",
  ctaStrength: "The quote or inspection path could be clearer for homeowners who are ready to call.",
  trustSignals: "Recent local work and trust details could be easier to see before someone calls.",
  contactAccessibility: "Your phone and estimate options could be easier to find from every page.",
  portfolioQuality: "Recent project proof could be easier for local homeowners to find.",
  brandingQuality: "The site could make the business name and local reputation more memorable.",
  conversionReadiness: "The quote or inspection path could be clearer for homeowners who are ready to call.",
  technicalQuality: "A faster, simpler page structure could make the site easier to use.",
};

function strongestAndWeakestObservation(analysis: Analysis) {
  const keys = Object.keys(analysis.scores) as ScoreKey[];
  const strongest = [...keys].sort((left, right) => analysis.scores[right] - analysis.scores[left])[0];
  const weakest = [...keys].sort((left, right) => analysis.scores[left] - analysis.scores[right])[0];
  return {
    strength: analysis.scores[strongest] >= 60
      ? outreachStrengths[strongest]
      : "You already have an active website where homeowners can find the business online.",
    opportunity: outreachOpportunities[weakest],
  };
}

function outreachGoal(prospect: Prospect) {
  if (prospect.trade === "Roofing") return "help turn more local visitors into roofing estimate requests";
  if (prospect.trade === "HVAC") return "help turn more local visitors into service and replacement inquiries";
  return `help turn more local visitors into ${prospect.trade.toLowerCase()} estimate requests`;
}

const complianceFooter = "WebWorkshop\n[Add your business postal address before sending]\nIf you would rather not receive another note, reply and I will close the loop.";

function conceptPreviewSentence(previewLink: string, lead = "I put together a short concept showing the idea") {
  return previewLink ? `${lead}: ${previewLink}` : `${lead}.`;
}

export function generateOutreach(prospect: Prospect, previewLink = ""): OutreachDraft {
  if (prospect.prospectType === "no_website_social_only") {
    const playbook = contractorPlaybooks[prospect.trade];
    const publicPresence = prospect.profileUrl ? "your public business profile" : "public business listings";
    const activityProof = prospect.reviewCount > 0
      ? `${prospect.reviewCount} public reviews`
      : "an active local business presence";
    const previewSentence = conceptPreviewSentence(previewLink, "I put together a short concept for an online home you would control");
    return {
      subjects: [
        `A website concept for ${prospect.businessName}`,
        `Own the online home for ${prospect.businessName}`,
        `Turn ${prospect.city} searches into direct inquiries`,
      ],
      concise: `Hi ${prospect.businessName} team,\n\nI noticed your business shows up locally through ${publicPresence} while researching ${prospect.trade.toLowerCase()} businesses serving ${prospect.city}.\n\nOne thing that already works well: ${activityProof} gives homeowners a reason to take a closer look.\n\nOne missed opportunity: I could not find a dedicated website where customers can view services, proof, and estimate options in one place.\n\n${previewSentence}\n\nIf the direction feels useful, would you be open to a quick 10-minute call next week?\n\n${complianceFooter}`,
      detailed: `Hi ${prospect.businessName} team,\n\nI noticed your business shows up locally through ${publicPresence} while researching local ${prospect.trade.toLowerCase()} businesses in ${prospect.city}.\n\nOne thing that already works well: ${activityProof} gives the business visible local credibility.\n\nOne missed opportunity: I could not find a dedicated website where customers can view services, proof, and estimate options in one place.\n\nI made a simple concept centered on ${playbook.services.join(", ")}, a clear service area, space for real project proof, and a direct "${playbook.primaryCta}" action. The goal is to give ${prospect.businessName} an online home it controls instead of relying entirely on a social profile or third-party listing.\n\n${previewSentence}\n\nIf the direction feels useful, would you be open to a quick 10-minute call next week?\n\n${complianceFooter}`,
      followUps: [
        `Hi again,\n\nI wanted to follow up on the website concept I shared for ${prospect.businessName}. It is designed to turn local searches into direct inquiries while keeping your public profiles working alongside an owned site.\n\n${conceptPreviewSentence(previewLink, "Here is the concept again")}\n\nWould a quick 10-minute call next week be useful?\n\n${complianceFooter}`,
        `Hi again,\n\nLast note from me about the website concept in my earlier email. The main idea is a simple online home that you control, with services, local proof, and one clear estimate path.\n\n${conceptPreviewSentence(previewLink, "You can review the concept here")}\n\nIf the timing is not right, no problem. I will close the loop.\n\n${complianceFooter}`,
      ],
      approved: false,
      generatedAt: now(),
    };
  }
  const analysis = prospect.analysis ?? analyzeProspect(prospect);
  const playbook = contractorPlaybooks[prospect.trade];
  const { strength, opportunity } = strongestAndWeakestObservation(analysis);
  const goal = outreachGoal(prospect);
  const previewSentence = conceptPreviewSentence(previewLink);
  return {
    subjects: [
      `A website idea for ${prospect.businessName}`,
      `${prospect.trade} website notes for ${prospect.city}`,
      `A clearer quote path for ${prospect.businessName}`,
    ],
    concise: `Hi ${prospect.businessName} team,\n\nI reviewed your website while looking at ${prospect.trade.toLowerCase()} businesses serving ${prospect.city}.\n\nOne thing that already works well: ${strength}\n\nOne missed opportunity: ${opportunity}\n\n${previewSentence}\n\nThe idea is to ${goal}. If the direction feels useful, would you be open to a quick 10-minute call next week?\n\n${complianceFooter}`,
    detailed: `Hi ${prospect.businessName} team,\n\nI took a careful look at your website while researching ${prospect.trade.toLowerCase()} companies serving ${prospect.city}.\n\nOne thing that already works well: ${strength}\n\nOne missed opportunity: ${opportunity}\n\nI made a business-specific concept centered on ${playbook.services.join(", ")}, useful local proof, and a shorter "${playbook.primaryCta}" path. The goal is to ${goal} without losing what already works on the current site.\n\n${previewSentence}\n\nIf the direction feels useful, would you be open to a quick 10-minute call next week?\n\n${complianceFooter}`,
    followUps: [
      `Hi again,\n\nI wanted to follow up on the website concept I shared for ${prospect.businessName}. The main idea is a clearer estimate path supported by useful local proof.\n\n${conceptPreviewSentence(previewLink, "Here is the concept again")}\n\nWould a quick 10-minute call next week be useful?\n\n${complianceFooter}`,
      `Hi again,\n\nLast note from me about the website concept in my earlier email. I think the clearer estimate path could help ${prospect.businessName} turn more local visitors into inquiries.\n\n${conceptPreviewSentence(previewLink, "You can review the concept here")}\n\nIf the timing is not right, no problem. I will close the loop.\n\n${complianceFooter}`,
    ],
    approved: false,
    generatedAt: now(),
  };
}

export function generatePreview(prospect: Prospect): PreviewConcept {
  const trade = prospect.trade.toLowerCase();
  const playbook = contractorPlaybooks[prospect.trade];
  const styleProfile = generateProspectStyleProfile(prospect);
  const heroHeadlines: Record<TradeCategory, string> = {
    Roofing: "Roofing work that protects your home and earns your confidence.",
    HVAC: "Comfort restored with clear service and practical options.",
    Landscaping: "Outdoor spaces planned for the way you want to live.",
    Plumbing: "Straight answers and dependable help for plumbing problems.",
    Electrical: "Safe, clear electrical work for homes and growing needs.",
    "Power Washing": "A cleaner property, with the difference easy to see.",
    "General Contractor": "Thoughtful construction work, from first conversation to finished space.",
  };
  const trustItems = [
    `Serving ${prospect.city}, ${prospect.state}`,
    prospect.phone ? "Direct phone contact" : "Clear contact path",
    "Services explained clearly",
    "Simple estimate next step",
  ];
  const noWebsiteProspect = prospect.prospectType === "no_website_social_only";
  return {
    direction: `A clean, local-first ${trade} website that feels like ${prospect.businessName}: ${styleProfile.tone.replace("-", " ")}, clear, and easy to hire.`,
    visualStyleDirection: `${styleProfile.name}. ${playbook.visualCue} Use ${styleProfile.primaryColor} as the restrained primary brand color and ${styleProfile.accentColor} only for focused emphasis.`,
    hero: `${prospect.businessName} serves ${prospect.serviceArea || `${prospect.city}, ${prospect.state}`} with a clearer path from service need to direct contact.`,
    heroHeadline: heroHeadlines[prospect.trade],
    heroSupporting: `${prospect.businessName} provides ${playbook.services.join(", ")} across ${prospect.serviceArea || `${prospect.city}, ${prospect.state}`}.`,
    serviceHighlights: playbook.services.map(titleCase),
    trustItems,
    styleProfile,
    homepageStructure: [
      `Simple, business-specific hero with "${styleProfile.ctaLabel}"`,
      `${playbook.services.join(", ")} organized by homeowner need`,
      noWebsiteProspect ? "Supported public business details and clearly labeled proof placeholders" : `Decision-stage proof: ${playbook.trustProof.join(", ")}`,
      noWebsiteProspect ? "A project-proof section ready for verified photos and facts" : "Recent local work with scope and outcome",
      "Service areas, practical FAQs, and lead form",
    ],
    ctaStrategy: `Use one primary action, "${styleProfile.ctaLabel}," supported by a persistent mobile call action.`,
    servicePageStructure: ["Homeowner problem and service fit", "Scope, options, and what is included", "Relevant local project proof", "Process, trust proof, and FAQs", styleProfile.ctaLabel],
    portfolioDirection: noWebsiteProspect
      ? "Reserve a clearly labeled project-proof section for verified photos, locations, scope, and outcomes supplied by the business."
      : "Use labeled project photos with location, scope, and a short outcome instead of an unlabeled gallery.",
    trustStrategy: noWebsiteProspect
      ? "Use only supported public business details, then label any future proof, certification, or review areas as content the business must verify."
      : `Place ${playbook.trustProof.join(", ")} beside the decisions they support.`,
    leadCaptureStrategy: `Keep the first step focused on ${playbook.leadDetails.join(", ")} and contact details.`,
    generatedAt: now(),
  };
}

export function withAnalysis(prospect: Prospect): Prospect {
  const analysis = analyzeProspect(prospect);
  const switchingFromPresenceGap = prospect.prospectType === "no_website_social_only";
  return {
    ...prospect,
    prospectType: "redesign",
    classification: "website_redesign",
    websiteStatus: "usable",
    websiteStatusDetail: "Website analysis completed successfully.",
    websiteAnalysisAttemptedAt: analysis.analyzedAt,
    analysis,
    outreach: switchingFromPresenceGap ? undefined : prospect.outreach,
    preview: switchingFromPresenceGap ? undefined : prospect.preview,
    priorityScore: calculatePriority(analysis, prospect.sizeIndicator, prospect.serviceArea),
    status: prospect.status === "New" ? "Reviewed" : prospect.status,
    activities: [activity("analysis", `Website analysis completed with a score of ${analysis.overallScore}.`), ...prospect.activities],
  };
}

export function withPresenceGapReview(
  prospect: Prospect,
  websiteStatus: Exclude<WebsiteAvailabilityStatus, "unknown" | "usable"> = prospect.website ? "broken_website" : "no_owned_website",
  websiteStatusDetail = websiteAvailabilityLabels[websiteStatus],
): Prospect {
  const switchingToPresenceGap = prospect.prospectType !== "no_website_social_only";
  const classification = classifyProspectPresence({ ...prospect, website: "" });
  const reviewed = {
    ...prospect,
    prospectType: "no_website_social_only" as const,
    classification,
    analysis: undefined,
    outreach: switchingToPresenceGap ? undefined : prospect.outreach,
    preview: switchingToPresenceGap ? undefined : prospect.preview,
    websiteStatus,
    websiteStatusDetail,
    websiteAnalysisAttemptedAt: now(),
    status: prospect.status === "New" ? "Reviewed" as const : prospect.status,
  };
  return {
    ...reviewed,
    recommendedContactMethod: recommendProspectContactMethod(reviewed),
    priorityScore: calculatePriority(undefined, reviewed.sizeIndicator, reviewed.serviceArea),
    activities: [activity("analysis", `${websiteStatusDetail} Presence Gap analysis is ready.`), ...prospect.activities],
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

type CreateProspectInput = Omit<
  Prospect,
  "id" | "createdAt" | "priorityScore" | "notes" | "activities" | "profileUrl" | "prospectType" | "classification" | "contactFormUrl" | "address" | "rating" | "reviewCount" | "recentReviewCount" | "sourceConfidence" | "activitySignals" | "recommendedContactMethod" | "inactive" | "websiteStatus" | "websiteStatusDetail" | "websiteAnalysisAttemptedAt"
> & Partial<Pick<Prospect, "profileUrl" | "prospectType" | "classification" | "contactFormUrl" | "address" | "rating" | "reviewCount" | "recentReviewCount" | "sourceConfidence" | "activitySignals" | "recommendedContactMethod" | "inactive" | "websiteStatus" | "websiteStatusDetail" | "websiteAnalysisAttemptedAt">>;

export function createProspect(input: CreateProspectInput): Prospect {
  const createdAt = now();
  const prospect: Prospect = {
    ...input,
    profileUrl: input.profileUrl ?? "",
    prospectType: input.prospectType ?? "redesign",
    classification: input.classification ?? "not_enough_contact_info",
    contactFormUrl: input.contactFormUrl ?? "",
    address: input.address ?? "",
    rating: input.rating ?? 0,
    reviewCount: input.reviewCount ?? 0,
    recentReviewCount: input.recentReviewCount ?? 0,
    sourceConfidence: input.sourceConfidence ?? 0,
    activitySignals: input.activitySignals ?? [],
    recommendedContactMethod: input.recommendedContactMethod ?? "needs_manual_contact_research",
    inactive: input.inactive ?? false,
    websiteStatus: input.websiteStatus ?? (input.website ? "unknown" : "no_owned_website"),
    websiteStatusDetail: input.websiteStatusDetail ?? "",
    websiteAnalysisAttemptedAt: input.websiteAnalysisAttemptedAt ?? "",
    id: crypto.randomUUID(),
    createdAt,
    priorityScore: calculatePriority(undefined, input.sizeIndicator, input.serviceArea),
    notes: [],
    activities: [{ id: crypto.randomUUID(), type: "created", label: "Prospect added to the discovery queue.", at: createdAt }],
  };
  prospect.classification = input.classification ?? classifyProspectPresence(prospect);
  prospect.recommendedContactMethod = input.recommendedContactMethod ?? recommendProspectContactMethod(prospect);
  return prospect;
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
  profileUrl: "",
  prospectType: "redesign",
  classification: "website_redesign",
  phone,
  email,
  contactFormUrl: "",
  address: "",
  city,
  state,
  trade: trade as TradeCategory,
  status: "New",
  serviceArea: `${city} and nearby communities`,
  sizeIndicator: sizeIndicator as Prospect["sizeIndicator"],
  priorityScore: calculatePriority(undefined, sizeIndicator as Prospect["sizeIndicator"], `${city} and nearby communities`),
  rating: 0,
  reviewCount: 0,
  recentReviewCount: 0,
  sourceConfidence: 0,
  activitySignals: [],
  recommendedContactMethod: email ? "send_email" : "call_first",
  inactive: false,
  websiteStatus: "unknown",
  websiteStatusDetail: "",
  websiteAnalysisAttemptedAt: "",
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
