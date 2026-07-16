import {
  WEBWORKSHOP_OUTREACH_COPY_VERSION,
  webworkshopFirstDm,
  webworkshopFirstEmail,
  webworkshopOptOutLine,
  webworkshopPreviewValueLine,
  webworkshopYesReply,
} from "@/lib/outreach-style-guide";
import { attachResolvedPreviewImages, isPublicPreviewImageRelevant, type PreviewImageSet } from "@/lib/preview-image-resolver";

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
  "Plumbing",
  "Electrical",
  "Landscaping",
  "Pressure Washing",
  "Painting",
  "Concrete",
  "Cleaning",
  "Tree Service",
  "Fencing",
  "Flooring",
  "Remodeling",
  "General Contractor",
] as const;

export type ProspectStatus = (typeof prospectStatuses)[number];
export type TradeCategory = (typeof tradeCategories)[number];
export const allCoreServiceTradesOption = "All Core Service Trades" as const;
export const coreServiceTrades = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Landscaping",
  "Pressure Washing",
  "Painting",
  "Concrete",
  "Cleaning",
  "Tree Service",
  "Fencing",
  "Flooring",
  "Remodeling",
] as const satisfies readonly TradeCategory[];
export type TopProspectTradeSelection = TradeCategory | typeof allCoreServiceTradesOption;

export function normalizeTradeCategory(value: unknown): TradeCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "power washing") return "Pressure Washing";
  return tradeCategories.find((trade) => trade.toLowerCase() === normalized) ?? null;
}

export function displayTradeCategory(value: unknown) {
  return normalizeTradeCategory(value) ?? (typeof value === "string" ? value.trim() : "");
}

export function titleCaseLocation(value: string) {
  return value.trim().toLowerCase().replace(/\b([a-z])/g, (character) => character.toUpperCase());
}

export function displayStateCode(value: string) {
  return value.trim().toUpperCase();
}

function prospectTrade(prospect: Pick<Prospect, "trade">) {
  return normalizeTradeCategory(prospect.trade) ?? "General Contractor";
}
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
  "message_on_social",
  "verify_email_manually",
  "call_first",
  "needs_manual_contact_research",
  "do_not_contact",
] as const;
export type RecommendedContactMethod = (typeof recommendedContactMethods)[number];
export const manualContactMethods = [
  "email",
  "quote_form",
  "contact_form",
  "facebook",
  "instagram",
  "linkedin",
  "phone_only",
  "unknown",
] as const;
export type ManualContactMethod = (typeof manualContactMethods)[number];
export const contactConfidenceLevels = ["high", "medium", "low"] as const;
export type ContactConfidence = (typeof contactConfidenceLevels)[number];
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
  outreachCopyVersion: string;
  outreachCopyGeneratedAt: string;
  lastRegeneratedAt?: string;
};

export type PreviewConcept = {
  previewVersion?: "v2" | "v3";
  creativeBrief?: PreviewCreativeBrief;
  businessProfile?: PreviewBusinessProfile;
  regenerationFeedbackHistory?: string[];
  layoutDirection?: PreviewLayoutDirection;
  resolvedImages?: PreviewImageSet;
  direction: string;
  visualStyleDirection: string;
  artDirection?: PreviewArtDirection;
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
  qualityScore?: PreviewQualityScore;
  generatedAt: string;
};

export type PreviewLayoutDirection =
  | "split-photo"
  | "full-bleed-photo"
  | "image-led-grid"
  | "dark-premium"
  | "light-editorial"
  | "bold-local-service";

export type PreviewCreativeBrief = {
  businessName: string;
  trade: TradeCategory;
  city: string;
  serviceArea: string;
  phone: string;
  verifiedEmailOrContactPath: string;
  existingWebsite: string;
  services: string[];
  primaryService: string;
  secondaryServices: string[];
  customerAudience: "residential" | "commercial" | "mixed";
  websiteCondition: string;
  logoStatus: "not available" | "available";
  logoSource: "not found" | "website" | "business asset" | "operator supplied";
  brandColorSource: PreviewStyleProfile["brandSource"];
  brandingSource: "detected cue" | "trade fallback";
  imagerySource: "curated stock photo library" | "trade photo library" | "business assets" | "configured stock provider";
  reviewSignal: "not used" | "public rating count only";
  factualPublicProof: string[];
  contactDetails: string[];
  businessTone: PreviewStyleProfile["tone"];
  likelyCustomerType: string;
  visualDirection: string;
  heroComposition: PreviewArtDirection["heroTreatment"];
  typographyDirection: string;
  sectionDensity: PreviewArtDirection["layoutRhythm"];
  imageIntents: string[];
  copyRestrictions: string[];
  ctaStrategy: string;
};

export type PreviewFactConfidence = "verified" | "inferred" | "unavailable";

export type PreviewResearchFact = {
  label: string;
  value: string;
  source: string;
  confidence: PreviewFactConfidence;
};

export type PreviewBusinessProfile = {
  officialBusinessName: string;
  trade: TradeCategory;
  primaryMarket: string;
  verifiedServiceArea: string;
  verifiedPhone: PreviewResearchFact;
  verifiedPublicEmailOrContactPath: PreviewResearchFact;
  officialWebsite: PreviewResearchFact;
  officialSocialProfiles: PreviewResearchFact[];
  customerType: PreviewCreativeBrief["customerAudience"];
  verifiedServices: string[];
  primaryService: string;
  secondaryServices: string[];
  logo: {
    status: "available" | "wordmark_fallback";
    url: string;
    source: "website" | "business asset" | "operator supplied" | "social profile" | "wordmark fallback";
    confidence: PreviewFactConfidence;
    note: string;
  };
  businessPhotoSources: PreviewResearchFact[];
  detectedBrandColors: PreviewResearchFact[];
  brandPersonality: string;
  recurringPublicReviewThemes: PreviewResearchFact[];
  realDifferentiators: PreviewResearchFact[];
  currentWebsiteWeaknesses: PreviewResearchFact[];
  recommendedDesignDirection: string;
  sourceFacts: PreviewResearchFact[];
  confidenceSummary: string;
  uncertainFactsExcluded: string[];
};

export type PreviewQualityScore = {
  heroImpact?: number;
  imageQuality?: number;
  imageSectionRelevance?: number;
  branding?: number;
  colorUsage?: number;
  logoUsage?: number;
  layoutVariety?: number;
  typography?: number;
  ctaProminence?: number;
  publicLinkHealth?: number;
  factualSafety?: number;
  contentPolish?: number;
  visualPolish: number;
  businessSpecificity: number;
  clarity: number;
  mobileResponsiveness: number;
  conversionStrength: number;
  safetyTruthfulness: number;
  overall: number;
  status?: "Send-worthy / polished" | "Needs visual review" | "Needs regeneration" | "Blocked by factual or technical issue";
  notes: string[];
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

export type PreviewArtDirection = {
  name: string;
  visualVoice: string;
  heroTreatment: "photo-led-overlap" | "service-command" | "proof-forward" | "clean-editorial";
  layoutRhythm: "bold-asymmetric" | "service-dense" | "proof-led" | "calm-premium";
  cardStyle: "layered-photo-cards" | "technical-service-panels" | "material-sample-cards" | "clean-proof-tiles";
  imageTreatment: string;
  sectionFlow: string;
  ctaTreatment: string;
  interactiveFeatures: string[];
  imageryPlan: string[];
  qaWarnings: string[];
  reviewNotes: string[];
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
  contactPageUrl: string;
  contactFormUrl: string;
  quoteFormUrl: string;
  contactFormDetected: boolean;
  quoteFormDetected: boolean;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  xUrl: string;
  youtubeUrl: string;
  contactPersonName: string;
  contactConfidence: ContactConfidence;
  bestManualContactMethod: ManualContactMethod;
  contactDiscoveryNotes: string[];
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
  "Pressure Washing": {
    homeownerNeed: "see the likely transformation and request a fast property quote",
    primaryCta: "Request a washing quote",
    services: ["house washing", "concrete cleaning", "roof and soft washing"],
    trustProof: ["before-and-after results", "surface-safe process", "insured service"],
    leadDetails: ["property address", "surfaces to clean", "approximate size", "property photos"],
    visualCue: "Make before-and-after comparisons the visual system, supported by crisp surface detail.",
  },
  Painting: {
    homeownerNeed: "compare scope, color direction, and timing before requesting an estimate",
    primaryCta: "Request a painting estimate",
    services: ["interior painting", "exterior painting", "cabinet and trim painting"],
    trustProof: ["prep process", "clean job sites", "finished-room examples"],
    leadDetails: ["project address", "rooms or exterior areas", "target timing", "optional inspiration photos"],
    visualCue: "Use clean before-and-after room or exterior photography, simple color guidance, and careful prep details.",
  },
  Concrete: {
    homeownerNeed: "understand concrete options and get a clear quote for durable work",
    primaryCta: "Request a concrete estimate",
    services: ["driveways", "patios and walkways", "flatwork repair"],
    trustProof: ["site preparation", "finish options", "completed local flatwork"],
    leadDetails: ["property address", "project type", "approximate dimensions", "access notes"],
    visualCue: "Use sturdy material detail, finished slabs, clean edges, and practical process cues.",
  },
  Cleaning: {
    homeownerNeed: "book reliable cleaning with clear scope, frequency, and expectations",
    primaryCta: "Request cleaning service",
    services: ["recurring cleaning", "deep cleaning", "move-in and move-out cleaning"],
    trustProof: ["checklists", "arrival expectations", "before-and-after details"],
    leadDetails: ["service address", "cleaning type", "property size", "preferred schedule"],
    visualCue: "Keep the design bright, simple, and organized around trust, checklists, and easy booking.",
  },
  "Tree Service": {
    homeownerNeed: "get safe tree help with enough detail to request the right crew",
    primaryCta: "Request tree service",
    services: ["tree trimming", "tree removal", "storm cleanup"],
    trustProof: ["safety process", "cleanup expectations", "equipment and crew readiness"],
    leadDetails: ["property address", "tree concern", "urgency", "optional tree photos"],
    visualCue: "Use grounded outdoor imagery, safety-first language, and clear storm-response or cleanup details.",
  },
  Fencing: {
    homeownerNeed: "choose the right fence type and request a scoped property estimate",
    primaryCta: "Request a fencing estimate",
    services: ["privacy fencing", "fence repair", "gates and access"],
    trustProof: ["material options", "property-line planning", "finished fence examples"],
    leadDetails: ["property address", "fence type", "approximate linear feet", "gate needs"],
    visualCue: "Show clean boundary lines, material samples, and finished-yard context without looking overdesigned.",
  },
  Flooring: {
    homeownerNeed: "compare flooring options and request an installation or refinishing quote",
    primaryCta: "Request a flooring estimate",
    services: ["floor installation", "hardwood refinishing", "floor repair"],
    trustProof: ["material guidance", "room preparation", "finished floor examples"],
    leadDetails: ["property address", "rooms involved", "flooring type", "target timing"],
    visualCue: "Use warm interior surfaces, material closeups, and simple before-and-after room context.",
  },
  Remodeling: {
    homeownerNeed: "judge project fit and start a well-scoped home improvement conversation",
    primaryCta: "Discuss a remodeling project",
    services: ["kitchen remodeling", "bath remodeling", "basement and interior updates"],
    trustProof: ["project process", "finished-space portfolio", "communication expectations"],
    leadDetails: ["property address", "project type", "target timing", "budget range"],
    visualCue: "Use practical finished-space photography, material details, and a clear planning process.",
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
  "Pressure Washing": [
    { label: "Crisp blue and aqua", primaryColor: "#17648b", accentColor: "#22a3a6", surfaceColor: "#ffffff", softSurfaceColor: "#edf7fa", inkColor: "#172830", mutedTextColor: "#536b76", borderColor: "#d1e3e9" },
    { label: "Ocean navy and clean cyan", primaryColor: "#244b70", accentColor: "#2b9eb3", surfaceColor: "#ffffff", softSurfaceColor: "#eff5f8", inkColor: "#192630", mutedTextColor: "#586b79", borderColor: "#d5e0e6" },
  ],
  Painting: [
    { label: "Painter navy and warm clay", primaryColor: "#2f4658", accentColor: "#c8744f", surfaceColor: "#ffffff", softSurfaceColor: "#f7f3ef", inkColor: "#20262b", mutedTextColor: "#62676b", borderColor: "#ded8d1" },
    { label: "Soft charcoal and color pop", primaryColor: "#3b4248", accentColor: "#b46f9b", surfaceColor: "#ffffff", softSurfaceColor: "#f6f2f5", inkColor: "#24272a", mutedTextColor: "#65636a", borderColor: "#dfd8de" },
  ],
  Concrete: [
    { label: "Concrete graphite and rust", primaryColor: "#3d464b", accentColor: "#b55f37", surfaceColor: "#ffffff", softSurfaceColor: "#f3f3f1", inkColor: "#23272a", mutedTextColor: "#60666a", borderColor: "#d9d9d5" },
    { label: "Steel gray and safety gold", primaryColor: "#46515a", accentColor: "#c79325", surfaceColor: "#ffffff", softSurfaceColor: "#f3f5f5", inkColor: "#23292d", mutedTextColor: "#5f686d", borderColor: "#d9dfe1" },
  ],
  Cleaning: [
    { label: "Fresh blue and mint", primaryColor: "#1f6382", accentColor: "#45a987", surfaceColor: "#ffffff", softSurfaceColor: "#eef8f5", inkColor: "#17262d", mutedTextColor: "#53696f", borderColor: "#d2e5e3" },
    { label: "Clean navy and sky", primaryColor: "#244f73", accentColor: "#5aa8d6", surfaceColor: "#ffffff", softSurfaceColor: "#f0f7fb", inkColor: "#182631", mutedTextColor: "#566a76", borderColor: "#d5e3eb" },
  ],
  "Tree Service": [
    { label: "Forest and bark", primaryColor: "#345a3e", accentColor: "#9a6738", surfaceColor: "#fffefa", softSurfaceColor: "#f1f5ef", inkColor: "#202a22", mutedTextColor: "#5d695d", borderColor: "#d8dfd5" },
    { label: "Deep green and amber", primaryColor: "#2f5947", accentColor: "#c18a2c", surfaceColor: "#ffffff", softSurfaceColor: "#f1f6f1", inkColor: "#1f2a25", mutedTextColor: "#5b695f", borderColor: "#d5dfd8" },
  ],
  Fencing: [
    { label: "Fence cedar and navy", primaryColor: "#394c59", accentColor: "#a56a3b", surfaceColor: "#ffffff", softSurfaceColor: "#f5f2ee", inkColor: "#20282d", mutedTextColor: "#60686c", borderColor: "#ded9d3" },
    { label: "Charcoal and cedar", primaryColor: "#3d4244", accentColor: "#b8793e", surfaceColor: "#ffffff", softSurfaceColor: "#f4f2ef", inkColor: "#242728", mutedTextColor: "#626561", borderColor: "#dedad3" },
  ],
  Flooring: [
    { label: "Walnut and slate", primaryColor: "#3f4b55", accentColor: "#a87443", surfaceColor: "#ffffff", softSurfaceColor: "#f5f1ec", inkColor: "#25282a", mutedTextColor: "#625f59", borderColor: "#dfd8cf" },
    { label: "Warm wood and cream", primaryColor: "#5a4635", accentColor: "#b77b3d", surfaceColor: "#fffefa", softSurfaceColor: "#f6f1e9", inkColor: "#2b251f", mutedTextColor: "#6a6258", borderColor: "#e2d8ca" },
  ],
  Remodeling: [
    { label: "Remodel slate and brass", primaryColor: "#344858", accentColor: "#b8833b", surfaceColor: "#ffffff", softSurfaceColor: "#f4f3f0", inkColor: "#20272d", mutedTextColor: "#60676d", borderColor: "#dbd9d3" },
    { label: "Modern charcoal and clay", primaryColor: "#373d40", accentColor: "#b76c4a", surfaceColor: "#ffffff", softSurfaceColor: "#f5f2ef", inkColor: "#232627", mutedTextColor: "#64635f", borderColor: "#ded9d4" },
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
  const trade = prospectTrade(prospect);
  if (["Landscaping", "Pressure Washing", "General Contractor", "Painting", "Fencing", "Flooring", "Remodeling"].includes(trade)) return "project-led";
  if (["HVAC", "Plumbing", "Cleaning", "Tree Service"].includes(trade)) return "service-led";
  if (trade === "Roofing") return stableIndex(prospect.businessName, 2) ? "trust-led" : "clean-split";
  return "clean-split";
}

function previewCta(prospect: Prospect) {
  const trade = prospectTrade(prospect);
  if (trade === "Roofing") return /storm|damage|repair/i.test(prospect.businessName) ? "Schedule an inspection" : "Request an estimate";
  if (trade === "HVAC") return "Schedule service";
  if (trade === "Landscaping") return "Get a free quote";
  if (trade === "Plumbing") return "Request service";
  if (trade === "Electrical") return "Request an estimate";
  if (trade === "Pressure Washing") return "Get a free quote";
  if (trade === "Painting") return "Request a painting estimate";
  if (trade === "Concrete") return "Request an estimate";
  if (trade === "Cleaning") return "Request cleaning service";
  if (trade === "Tree Service") return "Request tree service";
  if (trade === "Fencing") return "Request a fencing estimate";
  if (trade === "Flooring") return "Request a flooring estimate";
  if (trade === "Remodeling") return "Discuss your project";
  return "Discuss your project";
}

export function generateProspectStyleProfile(prospect: Prospect): PreviewStyleProfile {
  const hostname = websiteHostname(prospect.website);
  const record = prospectRecord(prospect);
  const researchedColors = stringListFromUnknown(record.previewBrandColors).filter((color) => /^#[0-9a-f]{6}$/i.test(color));
  const nameCue = brandCuePalettes.find(({ pattern }) => pattern.test(prospect.businessName));
  const domainCue = nameCue
    ? undefined
    : brandCuePalettes.find(({ pattern }) => pattern.test(hostname.replaceAll(/[-_.]/g, " ")));
  const selectedCue = nameCue ?? domainCue;
  const trade = prospectTrade(prospect);
  const tradePalettes = tradePreviewPalettes[trade];
  const fallbackPalette = selectedCue?.palette ?? tradePalettes[stableIndex(`${prospect.businessName}${hostname}`, tradePalettes.length)];
  const palette = researchedColors[0]
    ? {
        ...fallbackPalette,
        label: `${prospect.businessName} website palette`,
        primaryColor: researchedColors[0],
        accentColor: researchedColors[1] ?? fallbackPalette.accentColor,
      }
    : fallbackPalette;
  const tone = previewTone(prospect);
  const typography = tone === "premium-craft"
    ? { typographyStyle: "Craft-led serif headings with plainspoken sans-serif body copy", headingFont: "Georgia, 'Times New Roman', serif", bodyFont: "Arial, Helvetica, sans-serif" }
    : tone === "local-family"
      ? { typographyStyle: "Friendly humanist sans-serif with approachable, sturdy headings", headingFont: "'Trebuchet MS', Arial, sans-serif", bodyFont: "Arial, Helvetica, sans-serif" }
      : { typographyStyle: "Clear, sturdy sans-serif with compact high-trust headings", headingFont: "Arial, Helvetica, sans-serif", bodyFont: "Arial, Helvetica, sans-serif" };
  const brandSource: PreviewStyleProfile["brandSource"] = researchedColors[0] ? "website-domain cue" : nameCue ? "business-name cue" : domainCue ? "website-domain cue" : "trade fallback";
  const reason = researchedColors[0]
    ? `Colors extracted from the official ${hostname || "business"} website informed the palette; the ${displayTradeCategory(trade).toLowerCase()} category informed the layout and service treatment.`
    : selectedCue
    ? `${titleCase(selectedCue.cue)} informed the palette; the ${displayTradeCategory(trade).toLowerCase()} category informed the trust, service, and layout treatment.`
    : `No recognizable color cue was available, so the palette and layout use a restrained ${displayTradeCategory(trade).toLowerCase()} direction suited to a ${tone.replace("-", " ")} local business.`;

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

function previewArtDirection(prospect: Prospect, styleProfile: PreviewStyleProfile): PreviewArtDirection {
  const trade = prospectTrade(prospect);
  const displayTrade = displayTradeCategory(trade).toLowerCase();
  const city = titleCaseLocation(prospect.city);
  const serviceCue = contractorPlaybooks[trade].services.slice(0, 2).join(" and ");
  const highProof = prospect.reviewCount >= 20 || prospect.sizeIndicator === "Established";
  const heroTreatment: PreviewArtDirection["heroTreatment"] = styleProfile.layoutStyle === "project-led"
    ? "photo-led-overlap"
    : highProof || styleProfile.layoutStyle === "trust-led"
      ? "proof-forward"
      : styleProfile.layoutStyle === "service-led"
        ? "service-command"
        : "clean-editorial";
  const layoutRhythm: PreviewArtDirection["layoutRhythm"] = heroTreatment === "photo-led-overlap"
    ? "bold-asymmetric"
    : heroTreatment === "service-command"
      ? "service-dense"
      : heroTreatment === "proof-forward"
        ? "proof-led"
        : "calm-premium";
  const cardStyle: PreviewArtDirection["cardStyle"] = heroTreatment === "service-command"
    ? "technical-service-panels"
    : heroTreatment === "proof-forward"
      ? "clean-proof-tiles"
      : trade === "Concrete" || trade === "Flooring" || trade === "Painting" || trade === "Remodeling"
        ? "material-sample-cards"
        : "layered-photo-cards";
  const voiceByTone: Record<PreviewStyleProfile["tone"], string> = {
    practical: "sturdy, direct, and easy to hire",
    "modern-practical": "crisp, current, and locally credible",
    "local-family": "warm, approachable, and owner-operated",
    "premium-craft": "polished, material-aware, and higher-end",
    "high-trust": "established, proof-forward, and reassuring",
  };

  return {
    name: `${displayTradeCategory(trade)} ${heroTreatment.replaceAll("-", " ")} direction`,
    visualVoice: voiceByTone[styleProfile.tone],
    heroTreatment,
    layoutRhythm,
    cardStyle,
    imageTreatment: `Lead with a large ${displayTrade} hero photo, then rotate distinct service, detail, support, and proof images so the first visible sections never repeat the same visual.`,
    sectionFlow: `Open with the strongest service visual, move into ${serviceCue}, then show practical service details and a ${city} estimate CTA.`,
    ctaTreatment: `Use "${styleProfile.ctaLabel}" as a high-contrast primary action with a phone option kept visible on mobile.`,
    interactiveFeatures: [
      "sticky header",
      "service jump links",
      "FAQ accordion",
      "gallery lightbox",
      "before-after style slider",
      "quote form browser validation",
      "sticky mobile quote CTA",
    ],
    imageryPlan: [
      "hero photo",
      "service photo",
      "detail photo",
      "support photo",
      "proof photo",
    ],
    qaWarnings: [],
    reviewNotes: [
      "Avoid WebWorkshop dark-green styling inside the concept.",
      "Use representative trade photos only; label sample proof until the business supplies verified work.",
      "Keep services, proof, and contact sections visually different so the page feels custom, not block-stacked.",
    ],
  };
}

function prospectAudience(prospect: Prospect): PreviewCreativeBrief["customerAudience"] {
  const text = `${prospect.businessName} ${prospect.serviceArea} ${prospect.websiteStatusDetail}`.toLowerCase();
  if (/commercial|business|office|parking lot|retail|facility|restaurant|warehouse/.test(text)) return /home|residential/.test(text) ? "mixed" : "commercial";
  return "residential";
}

function verifiedContactPath(prospect: Prospect) {
  if (prospect.email) return `public email: ${prospect.email}`;
  if (prospect.quoteFormUrl) return "quote form";
  if (prospect.contactFormUrl) return "contact form";
  if (prospect.facebookUrl) return "Facebook";
  if (prospect.instagramUrl) return "Instagram";
  if (prospect.linkedinUrl) return "LinkedIn";
  if (prospect.phone) return "phone only";
  return "not confirmed";
}

function previewImageIntentSummary(trade: TradeCategory, services: readonly string[]) {
  const displayTrade = displayTradeCategory(trade).toLowerCase();
  return [
    `Hero: strong ${displayTrade} service photo matched to the primary service.`,
    ...services.slice(0, 3).map((service) => `Service: ${service} gets its own matching section image.`),
    "Process: equipment, team, or service-call context.",
    "Proof/CTA: result-oriented trade photo without invented project claims.",
  ];
}

function researchFact(label: string, value: string, source: string, confidence: PreviewFactConfidence): PreviewResearchFact {
  return { label, value: value.trim(), source, confidence };
}

function safePublicAssetUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("/prospect-assets/") || trimmed.startsWith("/engine-preview-assets/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.username || url.password) return "";
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((param) => url.searchParams.delete(param));
    return url.href;
  } catch {
    return "";
  }
}

function prospectRecord(prospect: Prospect) {
  return prospect as unknown as Record<string, unknown>;
}

function stringListFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function prospectLogo(prospect: Prospect): PreviewBusinessProfile["logo"] {
  const record = prospectRecord(prospect);
  const candidates: Array<{ value: unknown; source: PreviewBusinessProfile["logo"]["source"] }> = [
    { value: record.logoUrl, source: "business asset" },
    { value: record.businessLogoUrl, source: "business asset" },
    { value: record.logo, source: "business asset" },
    { value: record.websiteLogoUrl, source: "website" },
    { value: record.profileImageUrl, source: "social profile" },
    { value: record.socialProfileImageUrl, source: "social profile" },
    { value: record.operatorLogoUrl, source: "operator supplied" },
  ];
  for (const candidate of candidates) {
    const url = safePublicAssetUrl(candidate.value);
    if (url) {
      return {
        status: "available",
        url,
        source: candidate.source,
        confidence: candidate.source === "operator supplied" || (candidate.source === "website" && record.previewResearchVerified === true) ? "verified" : "inferred",
        note: `Logo/profile image detected from ${candidate.source}.`,
      };
    }
  }
  return {
    status: "wordmark_fallback",
    url: "",
    source: "wordmark fallback",
    confidence: "unavailable",
    note: "No legitimate logo asset was available, so the preview uses a text wordmark instead of inventing a logo.",
  };
}

function prospectBusinessPhotos(prospect: Prospect) {
  const record = prospectRecord(prospect);
  const raw = [
    ...stringListFromUnknown(record.approvedPreviewPhotos),
    ...stringListFromUnknown(record.approvedBusinessPhotos),
    ...stringListFromUnknown(record.businessPhotos),
    ...stringListFromUnknown(record.photoUrls),
  ];
  for (const value of [record.approvedPreviewPhotos, record.approvedBusinessPhotos, record.businessPhotos, record.photoUrls]) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).src === "string") raw.push((item as Record<string, unknown>).src as string);
    }
  }
  return [...new Set(raw.map(safePublicAssetUrl).filter(Boolean))];
}

function previewResearchFacts(prospect: Prospect) {
  const value = prospectRecord(prospect).previewResearchFacts;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.label !== "string" || typeof record.value !== "string" || typeof record.source !== "string") return [];
    const confidence = record.confidence === "verified" || record.confidence === "inferred" || record.confidence === "unavailable" ? record.confidence : "inferred";
    return [researchFact(record.label, record.value, record.source, confidence)];
  }).slice(0, 18);
}

function detectedBrandColorFacts(styleProfile: PreviewStyleProfile): PreviewResearchFact[] {
  const confidence: PreviewFactConfidence = styleProfile.brandSource === "trade fallback" ? "inferred" : "verified";
  return [
    researchFact("Primary color", styleProfile.primaryColor, styleProfile.brandSource, confidence),
    researchFact("Accent color", styleProfile.accentColor, styleProfile.brandSource, confidence),
    researchFact("Surface color", styleProfile.surfaceColor, styleProfile.brandSource, confidence),
  ];
}

function officialSocialProfiles(prospect: Prospect): PreviewResearchFact[] {
  return [
    prospect.facebookUrl ? researchFact("Facebook", prospect.facebookUrl, "website/contact discovery", "verified") : null,
    prospect.instagramUrl ? researchFact("Instagram", prospect.instagramUrl, "website/contact discovery", "verified") : null,
    prospect.linkedinUrl ? researchFact("LinkedIn", prospect.linkedinUrl, "website/contact discovery", "verified") : null,
    prospect.xUrl ? researchFact("X/Twitter", prospect.xUrl, "website/contact discovery", "verified") : null,
    prospect.youtubeUrl ? researchFact("YouTube", prospect.youtubeUrl, "website/contact discovery", "verified") : null,
  ].filter((item): item is PreviewResearchFact => Boolean(item));
}

function previewWeaknessFacts(prospect: Prospect, noWebsiteProspect: boolean): PreviewResearchFact[] {
  if (noWebsiteProspect) {
    return [researchFact("Owned website", "No full owned website was found in discovery.", "prospect classification", "verified")];
  }
  const facts: PreviewResearchFact[] = [];
  if (prospect.websiteStatusDetail) facts.push(researchFact("Website condition", prospect.websiteStatusDetail, "website scan", "verified"));
  const analysis = prospect.analysis;
  if (analysis) {
    const weakLabels = (Object.entries(analysis.scores) as Array<[ScoreKey, number]>)
      .filter(([, score]) => score < 60)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map(([key]) => scoreLabels[key]);
    for (const label of weakLabels) facts.push(researchFact("Website improvement area", label, "website analysis", "verified"));
  }
  return facts;
}

function businessDifferentiatorFacts(prospect: Prospect): PreviewResearchFact[] {
  const facts = [
    prospect.phone ? researchFact("Direct phone", prospect.phone, "provider/contact discovery", "verified") : null,
    prospect.email ? researchFact("Public email", prospect.email, "website/contact discovery", "verified") : null,
    prospect.quoteFormDetected ? researchFact("Quote form", prospect.quoteFormUrl || "Quote form detected", "website scan", "verified") : null,
    prospect.contactFormDetected ? researchFact("Contact form", prospect.contactFormUrl || "Contact form detected", "website scan", "verified") : null,
    prospect.reviewCount > 0 ? researchFact("Public review count", `${prospect.reviewCount} reviews recorded`, "provider result", "verified") : null,
    prospect.rating > 0 ? researchFact("Public rating", `${prospect.rating} rating recorded`, "provider result", "verified") : null,
    prospect.address ? researchFact("Public address", prospect.address, "provider result", "verified") : null,
  ].filter((item): item is PreviewResearchFact => Boolean(item));
  return facts.slice(0, 8);
}

function reviewThemeFacts(prospect: Prospect): PreviewResearchFact[] {
  const themes = prospect.activitySignals.filter((signal) => /review|recent|rating|active|photo/i.test(signal)).slice(0, 3);
  if (themes.length) return themes.map((theme) => researchFact("Public activity signal", theme, "provider/activity signal", "inferred"));
  if (prospect.reviewCount > 0) {
    return [researchFact("Review signal", `${prospect.reviewCount} public reviews are recorded. No review text is quoted or invented.`, "provider result", "verified")];
  }
  return [];
}

function customerTypeLabel(audience: PreviewCreativeBrief["customerAudience"], trade: TradeCategory) {
  if (audience === "commercial") return `Local commercial property owners looking for ${displayTradeCategory(trade).toLowerCase()} help.`;
  if (audience === "mixed") return `Local homeowners and commercial property owners looking for ${displayTradeCategory(trade).toLowerCase()} help.`;
  return `Local homeowners and property owners looking for ${displayTradeCategory(trade).toLowerCase()} help.`;
}

function buildPreviewBusinessProfile(
  prospect: Prospect,
  styleProfile: PreviewStyleProfile,
  services: string[],
  serviceArea: string,
  artDirection: PreviewArtDirection,
  noWebsiteProspect: boolean,
): PreviewBusinessProfile {
  const trade = prospectTrade(prospect);
  const market = `${titleCaseLocation(prospect.city)}, ${displayStateCode(prospect.state)}`;
  const audience = prospectAudience(prospect);
  const logo = prospectLogo(prospect);
  const photoSources = prospectBusinessPhotos(prospect);
  const socialProfiles = officialSocialProfiles(prospect);
  const differentiators = businessDifferentiatorFacts(prospect);
  const researchedFacts = previewResearchFacts(prospect);
  const websiteWeaknesses = previewWeaknessFacts(prospect, noWebsiteProspect);
  const sourceFacts = [
    researchFact("Business name", prospect.businessName, "provider result", "verified"),
    researchFact("Trade", displayTradeCategory(trade), "provider result", "verified"),
    researchFact("Market", market, "provider result", "verified"),
    researchFact("Service area", serviceArea, prospect.serviceArea ? "prospect record" : "city/state fallback", prospect.serviceArea ? "verified" : "inferred"),
    prospect.website ? researchFact("Official website", prospect.website, "provider result", "verified") : researchFact("Official website", "Not found", "discovery", "unavailable"),
    ...differentiators,
    ...socialProfiles,
    ...researchedFacts,
  ].slice(0, 18);
  return {
    officialBusinessName: prospect.businessName,
    trade,
    primaryMarket: market,
    verifiedServiceArea: serviceArea,
    verifiedPhone: prospect.phone
      ? researchFact("Phone", prospect.phone, "provider/contact discovery", "verified")
      : researchFact("Phone", "Not confirmed", "contact discovery", "unavailable"),
    verifiedPublicEmailOrContactPath: researchFact("Best contact path", verifiedContactPath(prospect), "contact discovery", verifiedContactPath(prospect) === "not confirmed" ? "unavailable" : "verified"),
    officialWebsite: prospect.website
      ? researchFact("Website", prospect.website, "provider result", "verified")
      : researchFact("Website", "Not found", "discovery", "unavailable"),
    officialSocialProfiles: socialProfiles,
    customerType: audience,
    verifiedServices: services,
    primaryService: services[0] ?? displayTradeCategory(trade),
    secondaryServices: services.slice(1),
    logo,
    businessPhotoSources: photoSources.map((photo) => researchFact("Approved business photo", photo, "prospect photo source", "verified")).slice(0, 6),
    detectedBrandColors: detectedBrandColorFacts(styleProfile),
    brandPersonality: `${styleProfile.tone.replace("-", " ")} contractor style with ${artDirection.visualVoice.toLowerCase()}`,
    recurringPublicReviewThemes: reviewThemeFacts(prospect),
    realDifferentiators: differentiators,
    currentWebsiteWeaknesses: websiteWeaknesses,
    recommendedDesignDirection: `${artDirection.name}: ${artDirection.visualVoice}`,
    sourceFacts,
    confidenceSummary: sourceFacts.some((fact) => fact.confidence === "verified")
      ? "Built from verified provider/contact records plus inferred design choices where branding was unavailable."
      : "Limited public data was available; the preview avoids unsupported claims and uses trade-specific fallback direction.",
    uncertainFactsExcluded: [
      "Reviews, testimonials, certifications, insurance, licenses, years in business, guarantees, financing, awards, and project outcomes are excluded unless verified.",
      photoSources.length ? "Business photos are used only when supplied as approved public assets." : "No approved business photos were available, so imagery uses vetted trade-relevant stock or fewer image sections.",
    ],
  };
}

function businessSpecificHeroHeadline(profile: PreviewBusinessProfile) {
  const officialTagline = profile.sourceFacts.find((fact) => fact.label === "Official tagline" && fact.confidence === "verified")?.value;
  if (officialTagline) return officialTagline;
  const market = profile.primaryMarket.replace(/,\s*[A-Z]{2}$/i, "");
  switch (profile.trade) {
    case "Pressure Washing":
      return `Exterior cleaning for ${market} homes from ${profile.officialBusinessName}.`;
    case "Landscaping":
      return `Landscaping for ${market} outdoor spaces from ${profile.officialBusinessName}.`;
    case "Roofing":
      return `Roofing help for ${market} homeowners from ${profile.officialBusinessName}.`;
    case "HVAC":
      return `Heating and cooling service for ${market} homes from ${profile.officialBusinessName}.`;
    case "Plumbing":
      return `Plumbing service for ${market} homes from ${profile.officialBusinessName}.`;
    case "Electrical":
      return `Electrical help for ${market} properties from ${profile.officialBusinessName}.`;
    default:
      return `${displayTradeCategory(profile.trade)} service for ${market} from ${profile.officialBusinessName}.`;
  }
}

function choosePreviewLayoutDirection(prospect: Prospect, artDirection: PreviewArtDirection): PreviewLayoutDirection {
  const optionsByHero: Record<PreviewArtDirection["heroTreatment"], PreviewLayoutDirection[]> = {
    "photo-led-overlap": ["split-photo", "full-bleed-photo", "image-led-grid", "bold-local-service"],
    "service-command": ["image-led-grid", "split-photo", "light-editorial", "bold-local-service"],
    "proof-forward": ["full-bleed-photo", "image-led-grid", "dark-premium", "split-photo"],
    "clean-editorial": ["light-editorial", "split-photo", "image-led-grid", "bold-local-service"],
  };
  const options = optionsByHero[artDirection.heroTreatment] ?? ["split-photo", "image-led-grid", "light-editorial"];
  const index = seededScore(`${prospect.businessName}|${prospect.trade}|${prospect.city}|${artDirection.name}`, options.length);
  return options[index] ?? "split-photo";
}

function boundedQuality(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function previewQualityNotes(score: Omit<PreviewQualityScore, "overall" | "notes">) {
  const notes: string[] = [];
  if (score.visualPolish >= 85) notes.push("Uses prospect palette, imagery guidance, varied sections, and stronger CTA treatment.");
  if (score.businessSpecificity >= 85) notes.push("Includes business name, trade, services, city, and a prospect-specific style rationale.");
  if (score.safetyTruthfulness >= 90) notes.push("Avoids unsupported claims and labels proof/photo areas as verification-ready or sample content.");
  return notes;
}

export function scorePreviewQuality(prospect: Prospect, preview: PreviewConcept): PreviewQualityScore {
  const searchable = [
    preview.direction,
    preview.visualStyleDirection,
    preview.artDirection?.name,
    preview.artDirection?.visualVoice,
    preview.artDirection?.heroTreatment,
    preview.artDirection?.layoutRhythm,
    preview.artDirection?.cardStyle,
    preview.artDirection?.imageTreatment,
    preview.artDirection?.sectionFlow,
    preview.artDirection?.ctaTreatment,
    ...(preview.artDirection?.interactiveFeatures ?? []),
    ...(preview.artDirection?.imageryPlan ?? []),
    ...(preview.artDirection?.qaWarnings ?? []),
    ...(preview.artDirection?.reviewNotes ?? []),
    preview.creativeBrief?.businessName,
    preview.creativeBrief?.trade,
    preview.creativeBrief?.city,
    preview.creativeBrief?.serviceArea,
    preview.creativeBrief?.websiteCondition,
    preview.creativeBrief?.businessTone,
    preview.creativeBrief?.likelyCustomerType,
    preview.creativeBrief?.visualDirection,
    preview.creativeBrief?.ctaStrategy,
    preview.businessProfile?.officialBusinessName,
    preview.businessProfile?.primaryMarket,
    preview.businessProfile?.verifiedServiceArea,
    preview.businessProfile?.logo.status,
    preview.businessProfile?.logo.source,
    preview.businessProfile?.logo.note,
    preview.businessProfile?.brandPersonality,
    preview.businessProfile?.recommendedDesignDirection,
    preview.businessProfile?.confidenceSummary,
    ...(preview.businessProfile?.verifiedServices ?? []),
    ...(preview.businessProfile?.sourceFacts ?? []).map((fact) => `${fact.label} ${fact.value} ${fact.source} ${fact.confidence}`),
    ...(preview.businessProfile?.currentWebsiteWeaknesses ?? []).map((fact) => `${fact.label} ${fact.value}`),
    ...(preview.businessProfile?.realDifferentiators ?? []).map((fact) => `${fact.label} ${fact.value}`),
    ...(preview.businessProfile?.uncertainFactsExcluded ?? []),
    preview.layoutDirection,
    preview.resolvedImages?.sourceStatus,
    preview.resolvedImages?.hero.source,
    preview.resolvedImages?.hero.src,
    ...((preview.resolvedImages?.services ?? []).map((image) => `${image.source} ${image.src} ${image.intent.query}`)),
    ...((preview.resolvedImages?.gallery ?? []).map((image) => `${image.source} ${image.src} ${image.intent.query}`)),
    preview.hero,
    preview.heroHeadline,
    preview.heroSupporting,
    preview.homepageStructure.join(" "),
    preview.ctaStrategy,
    preview.servicePageStructure.join(" "),
    preview.portfolioDirection,
    preview.trustStrategy,
    preview.leadCaptureStrategy,
    preview.styleProfile?.name,
    preview.styleProfile?.styleReason,
  ].filter(Boolean).join(" ");
  const mentionsBusiness = searchable.includes(prospect.businessName);
  const trade = prospectTrade(prospect);
  const mentionsTrade = new RegExp(displayTradeCategory(trade), "i").test(searchable);
  const mentionsCity = new RegExp(`\\b${prospect.city}\\b`, "i").test(searchable);
  const hasStyleProfile = Boolean(preview.styleProfile);
  const hasBusinessProfile = Boolean(preview.businessProfile);
  const sourceFactCount = preview.businessProfile?.sourceFacts?.length ?? 0;
  const hasArtDirection = Boolean(preview.artDirection);
  const hasTradeServices = (preview.serviceHighlights?.length ?? 0) >= 3;
  const hasImageDirection = /photo|image|visual|material|outdoor|service|project|before-and-after|sample/i.test(searchable);
  const hasStrongHeroVisual = /hero photo|large .* hero|photo-led|strongest service visual|attention-grabbing/i.test(searchable);
  const hasSectionVariety = /distinct service|detail, support, and proof|visually different|proof layout|bold asymmetric|service dense|proof led/i.test(searchable);
  const hasMobile = /mobile|persistent mobile|phone action/i.test(searchable);
  const hasInteractiveFeatures = (preview.artDirection?.interactiveFeatures?.length ?? 0) >= 5
    || /FAQ accordion|gallery lightbox|before-after style slider|quote form browser validation|sticky mobile quote CTA/i.test(searchable);
  const hasImageryPlan = (preview.artDirection?.imageryPlan?.length ?? 0) >= 5;
  const imageList = preview.resolvedImages ? [
    preview.resolvedImages.hero,
    ...preview.resolvedImages.services,
    ...preview.resolvedImages.gallery,
    preview.resolvedImages.beforeAfter,
    preview.resolvedImages.process,
    preview.resolvedImages.cta,
  ] : [];
  const qualityImageList = displayTradeCategory(trade) === "Pressure Washing"
    ? imageList.filter((image) => isPublicPreviewImageRelevant(image, trade))
    : imageList;
  const photoLedImageCount = qualityImageList.filter((image) => ["business-photo", "configured-stock-provider", "curated-stock-photo-library"].includes(image.source)).length;
  const illustrationFallbackUsed = qualityImageList.some((image) => image.source === "curated-trade-library" || image.source === "neutral-fallback");
  const uniqueImageCount = new Set(qualityImageList.map((image) => image.src)).size;
  const requiredPhotoCount = displayTradeCategory(trade) === "Pressure Washing" ? 2 : 6;
  const requiredUniqueImageCount = displayTradeCategory(trade) === "Pressure Washing" ? 2 : 5;
  const limitedReliableImagery = displayTradeCategory(trade) === "Pressure Washing" && imageList.length > 0 && photoLedImageCount < 3;
  const hasCta = Boolean(preview.styleProfile?.ctaLabel) && searchable.includes(preview.styleProfile?.ctaLabel ?? "");
  const hasBrandingSource = Boolean(preview.creativeBrief?.brandingSource && preview.creativeBrief?.brandColorSource);
  const hasLogoDecision = Boolean(preview.businessProfile?.logo.status || (preview.creativeBrief?.logoStatus && preview.creativeBrief?.logoSource));
  const hasSectionImageIntents = (preview.creativeBrief?.imageIntents?.length ?? 0) >= 5;
  const weakImagery = /repeated placeholder art|abstract visual panel|generic filler|same image repeated|random stock|placeholder-led|weak filler|does not clearly match|municipal|street-cleaning|street cleaning|industrial/i.test(searchable) || illustrationFallbackUsed || (qualityImageList.length > 0 && photoLedImageCount < requiredPhotoCount) || (qualityImageList.length > 0 && uniqueImageCount < requiredUniqueImageCount);
  const repeatedStructure = /three identical cards|same structure repeated|block-stacked|template/i.test(searchable);
  const ignoredBrand = /ignored brand|same palette for every business/i.test(searchable);
  const publicCandidateCopy = [
    preview.hero,
    preview.heroHeadline,
    preview.heroSupporting,
    ...(preview.serviceHighlights ?? []),
    ...(preview.trustItems ?? []),
    preview.ctaStrategy,
  ].filter(Boolean).join(" ");
  const internalPublicLanguage = /representative image direction|replace with verified|proof concept|generator notes|internal QA|include only if verified|contact options|quote requests easy to find|quote path|quote-path|website structure|customer navigation|conversion design|clear surface details|service-area copy|contact visibility|photos should look|service detail|property context|finished look|image-selection strategy/i.test(publicCandidateCopy);
  const missingBusinessBranding = !hasStyleProfile || !hasArtDirection || !hasBusinessProfile;
  const unsupportedClaim = /\b(award-winning|certified|licensed|insured|warrant(?:y|ies)|guarantee|guarantees|five-star|best rated|family-owned|locally owned for \d+ years)\b/i.test(searchable)
    && !/\bverified|verification-ready|only when verified|supplied by the business|sample\b/i.test(searchable);

  const detailed = {
    heroImpact: boundedQuality(60 + (hasStrongHeroVisual ? 18 : 0) + (hasImageDirection ? 8 : 0) + (photoLedImageCount >= requiredPhotoCount ? 10 : 0) + (hasCta ? 5 : 0) - (weakImagery ? 25 : 0)),
    imageQuality: boundedQuality(58 + (hasImageryPlan ? 10 : 0) + (hasSectionImageIntents ? 10 : 0) + (photoLedImageCount >= requiredPhotoCount ? 16 : 0) + (uniqueImageCount >= requiredUniqueImageCount ? 8 : 0) - (weakImagery ? 28 : 0)),
    imageSectionRelevance: boundedQuality(62 + (hasSectionImageIntents ? 14 : 0) + (hasTradeServices ? 8 : 0) + (photoLedImageCount >= requiredPhotoCount ? 10 : 0) - (weakImagery ? 22 : 0)),
    branding: boundedQuality(62 + (hasStyleProfile ? 12 : 0) + (hasBrandingSource ? 10 : 0) + (mentionsBusiness ? 8 : 0) - (ignoredBrand ? 18 : 0)),
    colorUsage: boundedQuality(68 + (hasBrandingSource ? 12 : 0) + (hasStyleProfile ? 8 : 0) - (ignoredBrand ? 18 : 0)),
    logoUsage: boundedQuality(68 + (hasLogoDecision ? 12 : 0) + (preview.businessProfile?.logo.status === "available" || preview.creativeBrief?.logoStatus === "available" ? 4 : 0)),
    layoutVariety: boundedQuality(60 + (hasSectionVariety ? 18 : 0) + (preview.homepageStructure.length >= 5 ? 8 : 0) + (hasInteractiveFeatures ? 5 : 0) - (repeatedStructure ? 24 : 0)),
    typography: boundedQuality(72 + (preview.styleProfile?.typographyStyle ? 12 : 0) + (preview.heroHeadline && preview.heroHeadline.length < 86 ? 6 : 0)),
    ctaProminence: boundedQuality(66 + (hasCta ? 16 : 0) + (preview.artDirection?.ctaTreatment ? 8 : 0) + (prospect.phone ? 4 : 0)),
    publicLinkHealth: boundedQuality(84 + (preview.previewVersion === "v3" ? 6 : 0)),
    factualSafety: boundedQuality(unsupportedClaim || internalPublicLanguage ? 45 : 90 + (prospect.reviewCount > 0 ? 3 : 0)),
    contentPolish: boundedQuality(68 + (preview.heroHeadline ? 7 : 0) + (preview.heroSupporting ? 7 : 0) + (hasTradeServices ? 8 : 0) - (internalPublicLanguage ? 30 : 0)),
  };
  const base = {
    visualPolish: boundedQuality((detailed.heroImpact + detailed.imageQuality + detailed.layoutVariety + detailed.typography) / 4),
    businessSpecificity: boundedQuality(55 + (mentionsBusiness ? 12 : 0) + (mentionsTrade ? 10 : 0) + (mentionsCity ? 8 : 0) + (hasTradeServices ? 7 : 0) + (hasArtDirection ? 5 : 0) + (hasBusinessProfile ? 8 : 0) + (sourceFactCount >= 4 ? 6 : 0) - (missingBusinessBranding ? 14 : 0)),
    clarity: boundedQuality(75 + (preview.heroHeadline ? 6 : 0) + (preview.heroSupporting ? 5 : 0) + (preview.servicePageStructure.length >= 5 ? 5 : 0) + (preview.artDirection?.sectionFlow ? 4 : 0)),
    mobileResponsiveness: boundedQuality(74 + (hasMobile ? 12 : 0) + (hasCta ? 6 : 0) + (hasInteractiveFeatures ? 5 : 0)),
    conversionStrength: boundedQuality(70 + (hasCta ? 12 : 0) + (prospect.phone ? 5 : 0) + (/lead form|estimate|quote|inspection|service/i.test(searchable) ? 7 : 0) + (preview.artDirection?.ctaTreatment ? 5 : 0)),
    safetyTruthfulness: detailed.factualSafety,
  };
  const notes = previewQualityNotes(base);
  if (weakImagery) notes.push("Flag: imagery sounds generic, random, repeated, or placeholder-led.");
  if (limitedReliableImagery) notes.push("Note: pressure-washing preview uses a lower-image layout because only limited reliable service photos are available.");
  if (illustrationFallbackUsed) notes.push("Flag: one or more public preview images resolved to illustration fallback instead of photography.");
  if (qualityImageList.length > 0 && uniqueImageCount < requiredUniqueImageCount) notes.push("Flag: preview repeats too many images across visible sections.");
  if (!hasStrongHeroVisual) notes.push("Flag: hero needs a stronger trade-relevant visual direction.");
  if (!hasSectionVariety) notes.push("Flag: section rhythm needs more visual variety.");
  if (!hasBusinessProfile) notes.push("Flag: preview is missing a structured business research profile.");
  if (sourceFactCount < 4) notes.push("Flag: research profile needs more source-backed business facts.");
  if (!hasInteractiveFeatures) notes.push("Flag: preview needs mobile-friendly interactions such as FAQ, gallery, form validation, or sticky CTA.");
  if (internalPublicLanguage) notes.push("Flag: public preview must not expose internal generator or verification wording.");
  if (missingBusinessBranding) notes.push("Flag: prospect-specific style and art direction metadata is missing.");
  if (repeatedStructure) notes.push("Flag: layout appears too repetitive or template-like.");
  if (ignoredBrand) notes.push("Flag: branding appears ignored or too generic.");
  if (unsupportedClaim) notes.push("Flag: factual or trust claim needs verification before this can be send-worthy.");
  const overall = boundedQuality((base.visualPolish + base.businessSpecificity + base.clarity + base.mobileResponsiveness + base.conversionStrength + base.safetyTruthfulness) / 6);
  const status: PreviewQualityScore["status"] = unsupportedClaim || internalPublicLanguage
    ? "Blocked by factual or technical issue"
    : hasBusinessProfile && sourceFactCount >= 4 && overall >= 85 && detailed.imageQuality >= 78 && detailed.layoutVariety >= 78
      ? "Send-worthy / polished"
      : overall >= 76
        ? "Needs visual review"
        : "Needs regeneration";
  return {
    ...detailed,
    ...base,
    overall,
    status,
    notes,
  };
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
  const basis = `${prospect.businessName}${prospect.website}${displayTradeCategory(prospectTrade(prospect))}`;
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
    redesignDirection: `Build a mobile-first ${displayTradeCategory(prospectTrade(prospect)).toLowerCase()} site around service urgency, recent work, service-area proof, and one clear estimate path.`,
    analyzedAt: now(),
  };
}

function isFacebookProfile(value: string) {
  return /(?:^|\/\/)(?:www\.)?(?:facebook|fb)\.com\//i.test(value);
}

function isSocialProfile(value: string) {
  return /(?:^|\/\/)(?:www\.)?(?:facebook|fb|instagram|linkedin|x|twitter)\.com\//i.test(value);
}

function isInstagramProfile(value: string) {
  return /(?:^|\/\/)(?:www\.)?instagram\.com\//i.test(value);
}

function emailParts(value: string) {
  const [local = "", domain = ""] = value.toLowerCase().split("@");
  return { local, domain };
}

function identityTokensForContact(value: string) {
  return value.toLowerCase()
    .replace(/\b(llc|inc|company|co|corp|corporation|services?|service|the|and|of|for|a|an)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function rootDomain(value: string) {
  if (!value) return "";
  try {
    const hostname = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
    const parts = hostname.split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : hostname;
  } catch {
    return value.replace(/^www\./, "").toLowerCase();
  }
}

export function prospectEmailNeedsManualVerification(input: Partial<Pick<Prospect, "businessName" | "website" | "email">>) {
  if (!input.email) return false;
  const { local, domain } = emailParts(input.email);
  if (!local || !domain) return true;
  if (/^(?:no-?reply|noreply|do-?not-?reply|donotreply|wordpress|wp|example|test|privacy)$/i.test(local)) return true;
  if (/(?:totalwp|wp[-.]?theme|wordpress|themeforest|template|demo|staging|developer|webdesigner|webmaster|hosting|wpengine)/i.test(domain)) return true;
  const websiteDomain = rootDomain(input.website ?? "");
  if (websiteDomain && domain === websiteDomain) return false;
  const businessTokens = identityTokensForContact(input.businessName ?? "");
  const domainTokens = identityTokensForContact(domain.replace(/\.[a-z.]+$/i, ""));
  if (!websiteDomain && businessTokens.length === 0) return false;
  return !businessTokens.some((token) => domainTokens.some((domainToken) => domainToken === token || domainToken.includes(token)));
}

function hasUsableEmail(input: Partial<Pick<Prospect, "businessName" | "website" | "email">>) {
  return Boolean(input.email) && !prospectEmailNeedsManualVerification(input);
}

function hasAnyWrittenContactPath(input: Partial<Pick<Prospect, "businessName" | "website" | "email" | "contactFormUrl" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "profileUrl">>) {
  return Boolean(
    hasUsableEmail(input)
    || input.contactFormUrl
    || input.quoteFormUrl
    || input.facebookUrl
    || input.instagramUrl
    || input.linkedinUrl
    || isSocialProfile(input.profileUrl ?? ""),
  );
}

export function prospectBestManualContactMethod(input: Partial<Pick<Prospect, "businessName" | "website" | "email" | "contactFormUrl" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "profileUrl" | "phone">>): ManualContactMethod {
  if (hasUsableEmail(input)) return "email";
  if (input.quoteFormUrl) return "quote_form";
  if (input.contactFormUrl) return "contact_form";
  if (input.facebookUrl || isFacebookProfile(input.profileUrl ?? "")) return "facebook";
  if (input.instagramUrl || isInstagramProfile(input.profileUrl ?? "")) return "instagram";
  if (input.linkedinUrl) return "linkedin";
  if (input.phone) return "phone_only";
  return "unknown";
}

export function prospectContactConfidence(input: Partial<Pick<Prospect, "businessName" | "website" | "email" | "contactFormUrl" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "phone">>): ContactConfidence {
  if (hasUsableEmail(input) || input.quoteFormUrl || input.contactFormUrl) return "high";
  if (input.facebookUrl || input.instagramUrl || input.linkedinUrl) return "medium";
  return input.phone ? "low" : "low";
}

export function classifyProspectPresence(input: Pick<Prospect, "website" | "profileUrl" | "phone" | "email" | "contactFormUrl"> & Partial<Pick<Prospect, "businessName" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl">>): ProspectClassification {
  if (input.website) return "website_redesign";
  if (isSocialProfile(input.profileUrl)) return "social_only";
  if (input.profileUrl) return "listing_only";
  if (input.phone && !hasAnyWrittenContactPath(input)) return "phone_only";
  if (input.phone || hasAnyWrittenContactPath(input)) return "no_website";
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

export const OUTREACH_COPY_VERSION = WEBWORKSHOP_OUTREACH_COPY_VERSION;
export const LEGACY_OUTREACH_COPY_VERSION = "legacy_unversioned";
export const PREVIEW_GENERATOR_VERSION = "photo-led-v3";

export function outreachDraftLooksCurrent(outreach: Pick<OutreachDraft, "concise" | "detailed" | "followUps" | "outreachCopyVersion">, environment: NodeJS.ProcessEnv = process.env) {
  const firstTouch = outreach.concise ?? "";
  const combined = [firstTouch, outreach.detailed, ...(outreach.followUps ?? [])].join("\n");
  const address = webworkshopPostalAddress(environment);
  return outreach.outreachCopyVersion === OUTREACH_COPY_VERSION
    && !/https?:\/\/|\/p\/|\/engine(?:\/|$)/i.test(firstTouch)
    && !/\b10[-\s]?minute call\b/i.test(combined)
    && !/\[[^\]]*(postal address|before sending|placeholder|insert)[^\]]*\]/i.test(combined)
    && !/\bwill get you more calls\b/i.test(combined)
    && /want me to send it over|would you like me to send it over|would you want me to send it over|want to see it/i.test(firstTouch)
    && /would rather not receive another note|rather not hear from me again|close the loop/i.test(combined)
    && (!address || combined.includes(address));
}

export function inferOutreachCopyVersion(outreach: Pick<OutreachDraft, "concise" | "detailed" | "followUps"> & Partial<Pick<OutreachDraft, "outreachCopyVersion">>, environment: NodeJS.ProcessEnv = process.env) {
  const candidate = {
    ...outreach,
    outreachCopyVersion: outreach.outreachCopyVersion || LEGACY_OUTREACH_COPY_VERSION,
  };
  return outreachDraftLooksCurrent(candidate, environment) ? OUTREACH_COPY_VERSION : candidate.outreachCopyVersion === OUTREACH_COPY_VERSION ? OUTREACH_COPY_VERSION : LEGACY_OUTREACH_COPY_VERSION;
}

export function prospectHasUnusableWebsite(prospect: Pick<Prospect, "prospectType" | "websiteStatus">) {
  return prospect.prospectType === "no_website_social_only"
    || !["unknown", "usable"].includes(prospect.websiteStatus);
}

export function prospectPresenceLabels(prospect: Pick<Prospect, "websiteStatus" | "classification" | "email" | "contactFormUrl" | "recommendedContactMethod"> & Partial<Pick<Prospect, "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "bestManualContactMethod">>) {
  const labels: string[] = [];
  if (prospect.websiteStatus === "no_owned_website" || prospect.classification === "no_website") labels.push("No website found");
  if (["invalid_website", "http_404", "unreachable_website", "broken_website", "inactive_website"].includes(prospect.websiteStatus)) labels.push("Broken website");
  if (prospect.classification === "listing_only" || prospect.classification === "social_only") labels.push("Listing only");
  if (prospect.classification === "phone_only") labels.push("Phone only");
  if (prospect.classification === "phone_only" || prospect.recommendedContactMethod === "call_first") labels.push("Phone-only / written outreach blocked");
  if (prospect.recommendedContactMethod === "needs_manual_contact_research") labels.push("Needs manual contact research");
  if (prospect.email) labels.push("Public email available");
  if (prospect.contactFormUrl) labels.push("Contact form found");
  if (prospect.quoteFormUrl) labels.push("Quote form found");
  if (prospect.facebookUrl) labels.push("Facebook found");
  if (prospect.instagramUrl) labels.push("Instagram found");
  if (prospect.facebookUrl || prospect.instagramUrl || prospect.linkedinUrl || prospect.recommendedContactMethod === "message_on_facebook" || prospect.recommendedContactMethod === "message_on_social") labels.push("Social outreach path found");
  return [...new Set(labels)];
}

export function recommendProspectContactMethod(input: Pick<Prospect, "classification" | "profileUrl" | "phone" | "email" | "contactFormUrl" | "inactive"> & Partial<Pick<Prospect, "businessName" | "website" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl">>): RecommendedContactMethod {
  if (input.inactive || input.classification === "national_large_brand" || input.classification === "duplicate_bad_fit") return "do_not_contact";
  if (hasUsableEmail(input)) return "send_email";
  if (input.quoteFormUrl || input.contactFormUrl) return "submit_contact_form";
  if (input.facebookUrl || isFacebookProfile(input.profileUrl)) return "message_on_facebook";
  if (input.instagramUrl || input.linkedinUrl || isInstagramProfile(input.profileUrl)) return "message_on_social";
  if (input.email) return "verify_email_manually";
  if (input.phone) return "needs_manual_contact_research";
  return "do_not_contact";
}

export function prospectContactMethodIsUsable(input: Pick<Prospect, "recommendedContactMethod" | "profileUrl" | "phone" | "email" | "contactFormUrl"> & Partial<Pick<Prospect, "businessName" | "website" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl">>) {
  if (input.recommendedContactMethod === "send_email") return hasUsableEmail(input);
  if (input.recommendedContactMethod === "submit_contact_form") return Boolean(input.quoteFormUrl || input.contactFormUrl);
  if (input.recommendedContactMethod === "message_on_facebook") return Boolean(input.facebookUrl || isFacebookProfile(input.profileUrl));
  if (input.recommendedContactMethod === "message_on_social") return Boolean(input.instagramUrl || input.linkedinUrl || isSocialProfile(input.profileUrl));
  if (input.recommendedContactMethod === "call_first") return Boolean(input.phone);
  return false;
}

export function prospectWrittenContactMethodIsUsable(input: Pick<Prospect, "recommendedContactMethod" | "profileUrl" | "email" | "contactFormUrl"> & Partial<Pick<Prospect, "businessName" | "website" | "quoteFormUrl" | "facebookUrl" | "instagramUrl" | "linkedinUrl">>) {
  if (input.recommendedContactMethod === "send_email") return hasUsableEmail(input);
  if (input.recommendedContactMethod === "submit_contact_form") return Boolean(input.quoteFormUrl || input.contactFormUrl);
  if (input.recommendedContactMethod === "message_on_facebook") return Boolean(input.facebookUrl || isFacebookProfile(input.profileUrl));
  if (input.recommendedContactMethod === "message_on_social") return Boolean(input.instagramUrl || input.linkedinUrl || isSocialProfile(input.profileUrl));
  return false;
}

export function webworkshopPostalAddress(environment: NodeJS.ProcessEnv = process.env) {
  return environment.WEBWORKSHOP_POSTAL_ADDRESS?.trim() || environment.OUTREACH_POSTAL_ADDRESS?.trim() || "";
}

export function outreachComplianceFooter(environment: NodeJS.ProcessEnv = process.env) {
  const address = webworkshopPostalAddress(environment);
  return [
    "Thanks,",
    "",
    "Brendan",
    "WebWorkshop",
    ...(address ? ["", address] : []),
    "",
    webworkshopOptOutLine(),
  ].join("\n");
}

function localTradePhrase(prospect: Prospect) {
  return {
    trade: displayTradeCategory(prospectTrade(prospect)).toLowerCase(),
    city: titleCaseLocation(prospect.city),
  };
}

function simplePreviewIdea() {
  return webworkshopPreviewValueLine("has_website");
}

function noWebsiteFirstTouchIdea() {
  return webworkshopPreviewValueLine("no_website");
}

function askToSendPreview() {
  return "Want me to send it over?";
}

function socialManualMethod(method: string) {
  return ["facebook", "instagram", "linkedin"].includes(method);
}

function noOwnedWebsiteProspect(prospect: Prospect) {
  return prospect.prospectType === "no_website_social_only"
    || prospect.classification === "no_website"
    || prospect.classification === "social_only"
    || prospect.classification === "listing_only"
    || prospect.websiteStatus === "no_owned_website"
    || (!prospect.website && Boolean(prospect.profileUrl || prospect.facebookUrl || prospect.instagramUrl || prospect.linkedinUrl));
}

function contactPathCouldBeClearer(prospect: Prospect) {
  const scores = prospect.analysis?.scores;
  if (!scores) return false;
  return scores.ctaStrength <= 55 || scores.contactAccessibility <= 55 || scores.conversionReadiness <= 55;
}

function firstTouchEmailReason(prospect: Prospect) {
  return localTradePhrase(prospect);
}

function firstTouchMiddleLine(prospect: Prospect) {
  if (noOwnedWebsiteProspect(prospect)) return noWebsiteFirstTouchIdea();
  if (contactPathCouldBeClearer(prospect)) return simplePreviewIdea();
  return simplePreviewIdea();
}

function firstTouchDmReason(prospect: Prospect) {
  return webworkshopFirstDm(prospect.businessName, noOwnedWebsiteProspect(prospect) ? "no_website" : "has_website");
}

export function firstTouchEmailDraft(prospect: Prospect, footer: string) {
  const { trade, city } = firstTouchEmailReason(prospect);
  return webworkshopFirstEmail({
    businessName: prospect.businessName,
    trade,
    city,
    kind: noOwnedWebsiteProspect(prospect) ? "no_website" : "has_website",
    footer,
    factualMiddleLine: firstTouchMiddleLine(prospect),
  });
}

export function generateOutreach(prospect: Prospect, previewLink = "", environment: NodeJS.ProcessEnv = process.env): OutreachDraft {
  const complianceFooter = outreachComplianceFooter(environment);
  const generatedAt = now();
  const manualMethod = prospect.bestManualContactMethod || prospectBestManualContactMethod(prospect);
  const draftLabel = manualMethod === "quote_form"
    ? "quote/request estimate form"
    : manualMethod === "contact_form"
      ? "contact form"
      : manualMethod === "facebook"
        ? "Facebook DM"
        : manualMethod === "instagram"
          ? "Instagram DM"
          : manualMethod === "linkedin"
            ? "LinkedIn message"
            : "email";
  if (prospect.prospectType !== "no_website_social_only" && !prospect.email && ["quote_form", "contact_form", "facebook", "instagram", "linkedin"].includes(manualMethod)) {
    const trade = prospectTrade(prospect);
    const isSocial = socialManualMethod(manualMethod);
    const firstDraft = isSocial
      ? firstTouchDmReason(prospect)
      : firstTouchEmailDraft(prospect, complianceFooter);
    const detailedDraft = `${webworkshopYesReply(previewLink)}\n\n${complianceFooter}`;
    return {
      subjects: [
        `Quick website preview for ${prospect.businessName}`,
        `${displayTradeCategory(trade)} website idea for ${titleCaseLocation(prospect.city)}`,
        `More calls and quote requests for ${prospect.businessName}`,
      ],
      concise: firstDraft,
      detailed: detailedDraft,
      followUps: [
        `Hi again,\n\nJust following up on the ${draftLabel} note I sent about the quick website preview. It's built to look cleaner and help get you more calls and quote requests.\n\n${askToSendPreview()}\n\n${complianceFooter}`,
        `Hi again,\n\nLast note from me. If this is not useful or timing is off, no problem. I will close the loop.\n\n${complianceFooter}`,
      ],
      approved: false,
      generatedAt,
      outreachCopyVersion: OUTREACH_COPY_VERSION,
      outreachCopyGeneratedAt: generatedAt,
    };
  }
  if (prospect.prospectType === "no_website_social_only") {
    return {
      subjects: [
        `Quick website preview for ${prospect.businessName}`,
        `Own the online home for ${prospect.businessName}`,
        `Turn ${titleCaseLocation(prospect.city)} searches into direct inquiries`,
      ],
      concise: firstTouchEmailDraft(prospect, complianceFooter),
      detailed: `${webworkshopYesReply(previewLink)}\n\n${complianceFooter}`,
      followUps: [
        `Hi again,\n\nJust wanted to follow up on the website preview I mentioned. It's built to look cleaner and help get you more calls and quote requests.\n\n${askToSendPreview()}\n\n${complianceFooter}`,
        `Hi again,\n\nLast note from me. If this is not useful or timing is off, no problem. I will close the loop.\n\n${complianceFooter}`,
      ],
      approved: false,
      generatedAt,
      outreachCopyVersion: OUTREACH_COPY_VERSION,
      outreachCopyGeneratedAt: generatedAt,
    };
  }
  const trade = prospectTrade(prospect);
  return {
    subjects: [
      `Quick website preview for ${prospect.businessName}`,
      `${displayTradeCategory(trade)} website notes for ${titleCaseLocation(prospect.city)}`,
      `More calls and quote requests for ${prospect.businessName}`,
    ],
    concise: firstTouchEmailDraft(prospect, complianceFooter),
    detailed: `${webworkshopYesReply(previewLink)}\n\n${complianceFooter}`,
    followUps: [
      `Hi again,\n\nJust wanted to follow up on the preview I mentioned. It's built to look cleaner and help get you more calls and quote requests.\n\n${askToSendPreview()}\n\n${complianceFooter}`,
      `Hi again,\n\nLast note from me. If this is not useful or timing is off, no problem. I will close the loop.\n\n${complianceFooter}`,
    ],
    approved: false,
    generatedAt,
    outreachCopyVersion: OUTREACH_COPY_VERSION,
    outreachCopyGeneratedAt: generatedAt,
  };
}

export function generatePreview(prospect: Prospect): PreviewConcept {
  const trade = prospectTrade(prospect);
  const displayTrade = displayTradeCategory(trade);
  const tradeLower = displayTrade.toLowerCase();
  const playbook = contractorPlaybooks[trade];
  const styleProfile = generateProspectStyleProfile(prospect);
  const displayCity = prospect.city.trim().toLowerCase().replace(/\b([a-z])/g, (character) => character.toUpperCase());
  const displayState = prospect.state.trim().toUpperCase();
  const escapedCity = prospect.city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const serviceArea = prospect.serviceArea
    ? escapedCity ? prospect.serviceArea.replace(new RegExp(escapedCity, "gi"), displayCity) : prospect.serviceArea
    : `${displayCity}, ${displayState}`;
  const artDirection = previewArtDirection(prospect, styleProfile);
  const layoutDirection = choosePreviewLayoutDirection(prospect, artDirection);
  const verifiedProofAreas = playbook.trustProof.map((item) => `verified ${item}`).join(", ");
  const contactDetails = [
    prospect.phone ? "phone" : "",
    prospect.email ? "email" : "",
    prospect.contactFormDetected ? "contact form" : "",
    prospect.quoteFormDetected ? "quote form" : "",
    prospect.facebookUrl ? "Facebook" : "",
    prospect.instagramUrl ? "Instagram" : "",
    prospect.linkedinUrl ? "LinkedIn" : "",
  ].filter(Boolean);
  const heroHeadlines: Record<TradeCategory, string> = {
    Roofing: "Roofing work that protects your home and earns your confidence.",
    HVAC: "Heating and cooling help without the runaround.",
    Plumbing: "Straight answers and dependable help for plumbing problems.",
    Electrical: "Safe, clear electrical work for homes and growing needs.",
    Landscaping: "Outdoor spaces planned for the way you want to live.",
    "Pressure Washing": "A cleaner property, with the difference easy to see.",
    Painting: "Painting projects made clearer from prep to final coat.",
    Concrete: "Durable concrete work planned with practical details.",
    Cleaning: "Reliable cleaning with clear scope and easy scheduling.",
    "Tree Service": "Tree care that starts with safety and clear next steps.",
    Fencing: "Fencing that fits your property, privacy, and plans.",
    Flooring: "Flooring updates planned with clean options and clear timing.",
    Remodeling: "Home updates shaped around practical plans and clear communication.",
    "General Contractor": "Thoughtful construction work, from first conversation to finished space.",
  };
  const noWebsiteProspect = prospect.prospectType === "no_website_social_only";
  const researchedServices = stringListFromUnknown(prospectRecord(prospect).verifiedPreviewServices).map(titleCase);
  const services = [...new Set([...researchedServices, ...playbook.services.map(titleCase)])].slice(0, researchedServices.length ? 6 : 3);
  const businessProfile = buildPreviewBusinessProfile(prospect, styleProfile, services, serviceArea, artDirection, noWebsiteProspect);
  const trustItems = [
    `Serving ${businessProfile.primaryMarket}`,
    prospect.phone ? `Call ${prospect.phone}` : businessProfile.verifiedPublicEmailOrContactPath.value !== "not confirmed" ? businessProfile.verifiedPublicEmailOrContactPath.value : "Request an estimate",
    businessProfile.verifiedServices.slice(0, 3).join(" | "),
    prospect.reviewCount > 0 && prospect.rating > 0 ? `${prospect.rating.toFixed(1)} rating from ${prospect.reviewCount} public reviews` : "",
  ].filter(Boolean);
  const preview: PreviewConcept = {
    previewVersion: "v3",
    businessProfile,
    creativeBrief: {
      businessName: prospect.businessName,
      trade,
      city: displayCity,
      serviceArea,
      phone: prospect.phone || "not confirmed",
      verifiedEmailOrContactPath: verifiedContactPath(prospect),
      existingWebsite: prospect.website || prospect.profileUrl || "not found",
      services,
      primaryService: services[0] ?? displayTrade,
      secondaryServices: services.slice(1),
      customerAudience: prospectAudience(prospect),
      websiteCondition: noWebsiteProspect ? "No owned website or social-only presence detected." : prospect.websiteStatusDetail || "Existing website available for redesign concept.",
      logoStatus: businessProfile.logo.status === "available" ? "available" : "not available",
      logoSource: businessProfile.logo.source === "wordmark fallback" || businessProfile.logo.source === "social profile" ? "not found" : businessProfile.logo.source,
      brandColorSource: styleProfile.brandSource,
      brandingSource: styleProfile.brandSource === "trade fallback" ? "trade fallback" : "detected cue",
      imagerySource: businessProfile.businessPhotoSources.length ? "business assets" : "curated stock photo library",
      reviewSignal: prospect.reviewCount > 0 ? "public rating count only" : "not used",
      factualPublicProof: businessProfile.realDifferentiators.map((fact) => `${fact.label}: ${fact.value}`),
      contactDetails: contactDetails.length ? contactDetails : ["contact path not confirmed"],
      businessTone: styleProfile.tone,
      likelyCustomerType: customerTypeLabel(businessProfile.customerType, trade),
      visualDirection: artDirection.visualVoice,
      heroComposition: artDirection.heroTreatment,
      typographyDirection: styleProfile.typographyStyle,
      sectionDensity: artDirection.layoutRhythm,
      imageIntents: previewImageIntentSummary(trade, services),
      copyRestrictions: [
        "Do not invent reviews, years, certifications, licenses, insurance, awards, guarantees, or project outcomes.",
        "Use customer-benefit copy when proof is unavailable.",
        "Keep internal QA and operator notes out of the public preview.",
      ],
      ctaStrategy: artDirection.ctaTreatment,
    },
    layoutDirection,
    direction: `A research-backed, local-first ${tradeLower} website concept for ${businessProfile.officialBusinessName}: ${businessProfile.recommendedDesignDirection}.`,
    visualStyleDirection: `${styleProfile.name}. ${playbook.visualCue} ${artDirection.imageTreatment} Use ${styleProfile.primaryColor} as the primary brand color and ${styleProfile.accentColor} only for focused emphasis. Keep the public page focused on verified services, service area, approved photos, and supported contact actions.`,
    artDirection,
    hero: `${businessProfile.officialBusinessName} handles ${businessProfile.verifiedServices.join(", ")} across ${businessProfile.verifiedServiceArea}.`,
    heroHeadline: businessSpecificHeroHeadline(businessProfile) || heroHeadlines[trade],
    heroSupporting: `${businessProfile.verifiedServices.slice(0, 4).join(", ")} for homes and properties across ${businessProfile.verifiedServiceArea}.`,
    serviceHighlights: businessProfile.verifiedServices,
    trustItems,
    styleProfile,
    homepageStructure: [
      `${artDirection.heroTreatment.replaceAll("-", " ")} hero with "${styleProfile.ctaLabel}", a strong trade photo, and practical service-area details`,
      `${playbook.services.join(", ")} organized with distinct service photos, card styles, and homeowner need`,
      noWebsiteProspect ? "Supported public business details with room for future proof once supplied" : `Support areas for ${verifiedProofAreas} without publishing claims until verified`,
      noWebsiteProspect ? "A service-photo gallery focused on common customer needs" : "A photo-led service gallery that avoids unverified project claims",
      `${artDirection.sectionFlow} Service areas, practical FAQs, and lead form`,
    ],
    ctaStrategy: artDirection.ctaTreatment,
    servicePageStructure: ["Homeowner problem and service fit", "Scope, options, and what is included", "Distinct photo slots for each core service", "Plain-language trust points and FAQs", styleProfile.ctaLabel],
    portfolioDirection: noWebsiteProspect
      ? "Reserve a clearly labeled project-proof section for verified photos, locations, scope, and outcomes supplied by the business."
      : "Use a clearly labeled sample layout for project photos until the business supplies verified location, scope, and outcome details.",
    trustStrategy: noWebsiteProspect
      ? "Use only supported public business details, then label any future proof, certification, or review areas as content the business must verify."
      : `Create spaces for ${verifiedProofAreas} beside the decisions they support, but include those claims only when the business verifies them.`,
    leadCaptureStrategy: `Keep the first step focused on ${playbook.leadDetails.join(", ")} and contact details.`,
    generatedAt: now(),
  };
  const previewWithImages = attachResolvedPreviewImages(prospect, preview);
  return {
    ...previewWithImages,
    qualityScore: scorePreviewQuality(prospect, previewWithImages),
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

function safePreviewFeedback(feedback: string) {
  return feedback
    .replace(/\b(award-winning|certified|licensed|insured|guarantee(?:d)?|five-star|best rated|family-owned|years in business)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function applyPreviewFeedback(preview: PreviewConcept, feedback: string): PreviewConcept {
  const safeFeedback = safePreviewFeedback(feedback);
  if (!safeFeedback) return preview;
  const lower = safeFeedback.toLowerCase();
  const artDirection = preview.artDirection ? { ...preview.artDirection } : undefined;
  let layoutDirection = preview.layoutDirection;
  if (artDirection) {
    if (/premium|upscale|dramatic|bold|cinematic|image-led|photo/.test(lower)) {
      artDirection.heroTreatment = "photo-led-overlap";
      artDirection.layoutRhythm = "bold-asymmetric";
      artDirection.cardStyle = "layered-photo-cards";
      artDirection.imageTreatment = "Use a more dramatic photo-led hero, larger imagery, deeper contrast, and fewer text-heavy blocks.";
      layoutDirection = "full-bleed-photo";
    }
    if (/darker|dark|black|moody/.test(lower)) {
      artDirection.ctaTreatment = "Use a high-contrast estimate CTA with a darker premium surface and a clear phone option.";
      layoutDirection = "dark-premium";
    }
    if (/concrete|driveway|roof|house wash|soft wash|equipment|landscap|hvac|plumb|electric|cleaning|painting|tree/.test(lower)) {
      artDirection.imageryPlan = [...new Set([...artDirection.imageryPlan, "operator-requested image emphasis"])];
    }
    artDirection.reviewNotes = [
      "Operator feedback was applied to art direction, layout, imagery, or tone while preserving factual-safety rules.",
      ...artDirection.reviewNotes,
    ].slice(0, 8);
  }
  return {
    ...preview,
    artDirection,
    layoutDirection,
    regenerationFeedbackHistory: [safeFeedback, ...(preview.regenerationFeedbackHistory ?? [])].slice(0, 8),
  };
}

export function regeneratePreview(prospect: Prospect, feedback = ""): Prospect {
  const blockReason = previewRegenerationBlockReason(prospect);
  if (blockReason) throw new Error(`Preview regeneration blocked: ${blockReason}.`);
  const generated = attachResolvedPreviewImages(prospect, applyPreviewFeedback(generatePreview(prospect), feedback));
  return {
    ...prospect,
    preview: {
      ...generated,
      qualityScore: scorePreviewQuality(prospect, generated),
    },
    activities: [
      activity("preview", feedback.trim() ? "Preview regenerated with operator feedback. Nothing was sent." : "Preview regenerated with the latest photo-led generator. Nothing was sent."),
      ...prospect.activities,
    ],
  };
}

export function previewRegenerationBlockReason(prospect: Prospect) {
  const status = prospect.status.toLowerCase();
  if (["contacted", "interested", "proposal sent", "closed won", "closed lost"].includes(status)) {
    return "prospect is already contacted, interested, sent, won, or closed";
  }
  if (prospect.recommendedContactMethod === "do_not_contact") {
    return "prospect is marked do not contact";
  }
  const historyText = [
    ...prospect.notes,
    ...prospect.activities.map((item) => `${item.type} ${item.label}`),
  ].join(" ").toLowerCase();
  if (/suppressed|opted out|opted-out|do not contact|bounced|complained|not interested|never contact|closed lost|sent email|email sent|prospect email sent|marked sent/.test(historyText)) {
    return "prospect has suppression, sent, bounce, complaint, or non-actionable history";
  }
  return "";
}

type CreateProspectInput = Omit<
  Prospect,
  "id" | "createdAt" | "priorityScore" | "notes" | "activities" | "profileUrl" | "prospectType" | "classification" | "contactPageUrl" | "contactFormUrl" | "quoteFormUrl" | "contactFormDetected" | "quoteFormDetected" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "xUrl" | "youtubeUrl" | "contactPersonName" | "contactConfidence" | "bestManualContactMethod" | "contactDiscoveryNotes" | "address" | "rating" | "reviewCount" | "recentReviewCount" | "sourceConfidence" | "activitySignals" | "recommendedContactMethod" | "inactive" | "websiteStatus" | "websiteStatusDetail" | "websiteAnalysisAttemptedAt"
> & Partial<Pick<Prospect, "profileUrl" | "prospectType" | "classification" | "contactPageUrl" | "contactFormUrl" | "quoteFormUrl" | "contactFormDetected" | "quoteFormDetected" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "xUrl" | "youtubeUrl" | "contactPersonName" | "contactConfidence" | "bestManualContactMethod" | "contactDiscoveryNotes" | "address" | "rating" | "reviewCount" | "recentReviewCount" | "sourceConfidence" | "activitySignals" | "recommendedContactMethod" | "inactive" | "websiteStatus" | "websiteStatusDetail" | "websiteAnalysisAttemptedAt">>;

export function createProspect(input: CreateProspectInput): Prospect {
  const createdAt = now();
  const trade = normalizeTradeCategory(input.trade) ?? "General Contractor";
  const city = titleCaseLocation(input.city);
  const state = displayStateCode(input.state);
  const escapedInputCity = input.city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const serviceArea = input.serviceArea
    ? escapedInputCity ? input.serviceArea.replace(new RegExp(escapedInputCity, "gi"), city) : input.serviceArea
    : `${city} and nearby communities`;
  const prospect: Prospect = {
    ...input,
    city,
    state,
    trade,
    serviceArea,
    profileUrl: input.profileUrl ?? "",
    prospectType: input.prospectType ?? "redesign",
    classification: input.classification ?? "not_enough_contact_info",
    contactPageUrl: input.contactPageUrl ?? "",
    contactFormUrl: input.contactFormUrl ?? "",
    quoteFormUrl: input.quoteFormUrl ?? "",
    contactFormDetected: input.contactFormDetected ?? Boolean(input.contactFormUrl),
    quoteFormDetected: input.quoteFormDetected ?? Boolean(input.quoteFormUrl),
    facebookUrl: input.facebookUrl ?? "",
    instagramUrl: input.instagramUrl ?? "",
    linkedinUrl: input.linkedinUrl ?? "",
    xUrl: input.xUrl ?? "",
    youtubeUrl: input.youtubeUrl ?? "",
    contactPersonName: input.contactPersonName ?? "",
    contactConfidence: input.contactConfidence ?? prospectContactConfidence(input),
    bestManualContactMethod: input.bestManualContactMethod ?? prospectBestManualContactMethod(input),
    contactDiscoveryNotes: input.contactDiscoveryNotes ?? [],
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
  prospect.bestManualContactMethod = input.bestManualContactMethod ?? prospectBestManualContactMethod(prospect);
  prospect.contactConfidence = input.contactConfidence ?? prospectContactConfidence(prospect);
  return prospect;
}

const seedCreatedAt = "2026-06-01T12:00:00.000Z";

export const seedProspects: Prospect[] = [
  ["Summit Ridge Roofing", "https://example.com/summit-roofing", "(419) 555-0142", "hello@example.com", "Findlay", "OH", "Roofing", "Established"],
  ["Northline Heating & Air", "https://example.com/northline-hvac", "(419) 555-0188", "", "Toledo", "OH", "HVAC", "Growing"],
  ["Evergreen Outdoor Works", "https://example.com/evergreen-outdoor", "(614) 555-0129", "office@example.com", "Dublin", "OH", "Landscaping", "Growing"],
  ["ClearFlow Plumbing", "https://example.com/clearflow", "(567) 555-0134", "", "Lima", "OH", "Plumbing", "Established"],
  ["BrightWire Electric", "https://example.com/brightwire", "(419) 555-0171", "service@example.com", "Perrysburg", "OH", "Electrical", "Small"],
  ["Freshline Pressure Washing", "https://example.com/freshline", "(419) 555-0160", "", "Bowling Green", "OH", "Pressure Washing", "Small"],
].map(([businessName, website, phone, email, city, state, trade, sizeIndicator], index) => ({
  id: `seed-prospect-${index + 1}`,
  businessName,
  website,
  profileUrl: "",
  prospectType: "redesign",
  classification: "website_redesign",
  phone,
  email,
  contactPageUrl: "",
  contactFormUrl: "",
  quoteFormUrl: "",
  contactFormDetected: false,
  quoteFormDetected: false,
  facebookUrl: "",
  instagramUrl: "",
  linkedinUrl: "",
  xUrl: "",
  youtubeUrl: "",
  contactPersonName: "",
  contactConfidence: email ? "high" : "low",
  bestManualContactMethod: email ? "email" : "phone_only",
  contactDiscoveryNotes: [],
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
  recommendedContactMethod: email ? "send_email" : "needs_manual_contact_research",
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
