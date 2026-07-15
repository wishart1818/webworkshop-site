import {
  prospectStatuses,
  prospectTypes,
  websiteAvailabilityStatuses,
  prospectClassifications,
  recommendedContactMethods,
  manualContactMethods,
  contactConfidenceLevels,
  classifyProspectPresence,
  displayStateCode,
  inferOutreachCopyVersion,
  outreachDraftLooksCurrent,
  normalizeTradeCategory,
  recommendProspectContactMethod,
  scoreLabels,
  prospectBestManualContactMethod,
  prospectContactConfidence,
  titleCaseLocation,
  type Activity,
  type Analysis,
  type OutreachDraft,
  type PreviewConcept,
  type PreviewArtDirection,
  type PreviewCreativeBrief,
  type PreviewLayoutDirection,
  type PreviewQualityScore,
  type PreviewStyleProfile,
  type Prospect,
  type ProspectStatus,
  type ProspectType,
  type WebsiteAvailabilityStatus,
  type ProspectClassification,
  type RecommendedContactMethod,
  type ManualContactMethod,
  type ContactConfidence,
  type ScoreKey,
} from "@/lib/prospect-engine";
import type { PreviewImageIntent, PreviewImageSet, PreviewImageSlot, PreviewImageSource, ResolvedPreviewImage } from "@/lib/preview-image-resolver";

type ValidationResult = { ok: true; value: Prospect } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, maxLength: number, required = true) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${field} is required.`);
  if (result.length > maxLength) throw new Error(`${field} is too long.`);
  return result;
}

function dateText(value: unknown, field: string) {
  const result = text(value, field, 100);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a valid date.`);
  return new Date(result).toISOString();
}

function stringArray(value: unknown, field: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} must be a valid list.`);
  return value.map((item) => text(item, field, maxLength));
}

function analysisValue(value: unknown): Analysis | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.scores)) throw new Error("Analysis must be a valid object.");
  const scores = {} as Record<ScoreKey, number>;
  for (const key of Object.keys(scoreLabels) as ScoreKey[]) {
    const score = Number(value.scores[key]);
    if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error("Analysis scores must be integers from 0 to 100.");
    scores[key] = score;
  }
  const overallScore = Number(value.overallScore);
  if (!Number.isInteger(overallScore) || overallScore < 0 || overallScore > 100) throw new Error("Analysis overall score must be an integer from 0 to 100.");
  const opportunityRating = text(value.opportunityRating, "Opportunity rating", 20) as Analysis["opportunityRating"];
  if (!["High", "Medium", "Low"].includes(opportunityRating)) throw new Error("Opportunity rating is not supported.");
  return {
    overallScore,
    opportunityRating,
    scores,
    strengths: stringArray(value.strengths, "Analysis strengths", 20, 1000),
    weaknesses: stringArray(value.weaknesses, "Analysis weaknesses", 20, 1000),
    summary: text(value.summary, "Analysis summary", 5000),
    redesignDirection: text(value.redesignDirection, "Redesign direction", 5000),
    analyzedAt: dateText(value.analyzedAt, "Analysis date"),
  };
}

function outreachValue(value: unknown): OutreachDraft | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.approved !== "boolean") throw new Error("Outreach draft must be a valid object.");
  const generatedAt = dateText(value.generatedAt, "Outreach generated date");
  const draft = {
    subjects: stringArray(value.subjects, "Outreach subjects", 10, 300),
    concise: text(value.concise, "Concise outreach", 20_000),
    detailed: text(value.detailed, "Detailed outreach", 40_000),
    followUps: stringArray(value.followUps, "Outreach follow-ups", 10, 20_000),
    approved: value.approved,
    generatedAt,
    outreachCopyVersion: typeof value.outreachCopyVersion === "string" && value.outreachCopyVersion.trim() ? value.outreachCopyVersion.trim() : "",
    outreachCopyGeneratedAt: typeof value.outreachCopyGeneratedAt === "string" && value.outreachCopyGeneratedAt.trim()
      ? dateText(value.outreachCopyGeneratedAt, "Outreach copy generated date")
      : generatedAt,
  };
  const outreachCopyVersion = inferOutreachCopyVersion(draft);
  const current = outreachDraftLooksCurrent({ ...draft, outreachCopyVersion });
  return {
    ...draft,
    approved: current ? draft.approved : false,
    outreachCopyVersion,
  };
}

function styleProfileValue(value: unknown): PreviewStyleProfile | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview style profile must be a valid object.");
  const color = (input: unknown, field: string) => {
    const result = text(input, field, 7);
    if (!/^#[0-9a-f]{6}$/i.test(result)) throw new Error(`${field} must be a six-digit hex color.`);
    return result;
  };
  const font = (input: unknown, field: string) => {
    const result = text(input, field, 200);
    if (!/^[A-Za-z0-9'", -]+$/.test(result)) throw new Error(`${field} contains unsupported characters.`);
    return result;
  };
  const tone = text(value.tone, "Preview tone", 30) as PreviewStyleProfile["tone"];
  if (!["practical", "modern-practical", "local-family", "premium-craft", "high-trust"].includes(tone)) {
    throw new Error("Preview tone is not supported.");
  }
  const layoutStyle = text(value.layoutStyle, "Preview layout style", 30) as PreviewStyleProfile["layoutStyle"];
  if (!["trust-led", "service-led", "project-led", "clean-split"].includes(layoutStyle)) {
    throw new Error("Preview layout style is not supported.");
  }
  const brandSource = text(value.brandSource, "Preview brand source", 30) as PreviewStyleProfile["brandSource"];
  if (!["business-name cue", "website-domain cue", "trade fallback"].includes(brandSource)) {
    throw new Error("Preview brand source is not supported.");
  }
  return {
    name: text(value.name, "Preview style name", 160),
    primaryColor: color(value.primaryColor, "Preview primary color"),
    accentColor: color(value.accentColor, "Preview accent color"),
    surfaceColor: color(value.surfaceColor, "Preview surface color"),
    softSurfaceColor: color(value.softSurfaceColor, "Preview soft surface color"),
    inkColor: color(value.inkColor, "Preview ink color"),
    mutedTextColor: color(value.mutedTextColor, "Preview muted text color"),
    borderColor: color(value.borderColor, "Preview border color"),
    typographyStyle: text(value.typographyStyle, "Preview typography style", 500),
    headingFont: font(value.headingFont, "Preview heading font"),
    bodyFont: font(value.bodyFont, "Preview body font"),
    tone,
    layoutStyle,
    ctaLabel: text(value.ctaLabel, "Preview CTA label", 100),
    styleReason: text(value.styleReason, "Preview style reason", 1000),
    brandSource,
  };
}

function artDirectionValue(value: unknown): PreviewArtDirection | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview art direction must be a valid object.");
  const heroTreatment = text(value.heroTreatment, "Preview hero treatment", 40) as PreviewArtDirection["heroTreatment"];
  if (!["photo-led-overlap", "service-command", "proof-forward", "clean-editorial"].includes(heroTreatment)) {
    throw new Error("Preview hero treatment is not supported.");
  }
  const layoutRhythm = text(value.layoutRhythm, "Preview layout rhythm", 40) as PreviewArtDirection["layoutRhythm"];
  if (!["bold-asymmetric", "service-dense", "proof-led", "calm-premium"].includes(layoutRhythm)) {
    throw new Error("Preview layout rhythm is not supported.");
  }
  const cardStyle = text(value.cardStyle, "Preview card style", 40) as PreviewArtDirection["cardStyle"];
  if (!["layered-photo-cards", "technical-service-panels", "material-sample-cards", "clean-proof-tiles"].includes(cardStyle)) {
    throw new Error("Preview card style is not supported.");
  }
  return {
    name: text(value.name, "Preview art direction name", 160),
    visualVoice: text(value.visualVoice, "Preview visual voice", 500),
    heroTreatment,
    layoutRhythm,
    cardStyle,
    imageTreatment: text(value.imageTreatment, "Preview image treatment", 1000),
    sectionFlow: text(value.sectionFlow, "Preview section flow", 1000),
    ctaTreatment: text(value.ctaTreatment, "Preview CTA treatment", 1000),
    interactiveFeatures: value.interactiveFeatures === undefined ? [] : stringArray(value.interactiveFeatures, "Preview interaction features", 20, 200),
    imageryPlan: value.imageryPlan === undefined ? [] : stringArray(value.imageryPlan, "Preview imagery plan", 20, 200),
    qaWarnings: value.qaWarnings === undefined ? [] : stringArray(value.qaWarnings, "Preview QA warnings", 20, 500),
    reviewNotes: value.reviewNotes === undefined ? [] : stringArray(value.reviewNotes, "Preview art direction notes", 12, 500),
  };
}

function creativeBriefValue(value: unknown): PreviewCreativeBrief | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview creative brief must be a valid object.");
  const trade = normalizeTradeCategory(text(value.trade, "Preview brief trade", 40));
  if (!trade) throw new Error("Preview brief trade is not supported.");
  const logoStatus = text(value.logoStatus, "Preview logo status", 30) as PreviewCreativeBrief["logoStatus"];
  if (!["not available", "available"].includes(logoStatus)) throw new Error("Preview logo status is not supported.");
  const brandColorSource = text(value.brandColorSource, "Preview brand color source", 30) as PreviewStyleProfile["brandSource"];
  if (!["business-name cue", "website-domain cue", "trade fallback"].includes(brandColorSource)) {
    throw new Error("Preview brand color source is not supported.");
  }
  const brandingSource = text(value.brandingSource, "Preview branding source", 30) as PreviewCreativeBrief["brandingSource"];
  if (!["detected cue", "trade fallback"].includes(brandingSource)) throw new Error("Preview branding source is not supported.");
  const imagerySource = text(value.imagerySource, "Preview imagery source", 40) as PreviewCreativeBrief["imagerySource"];
  if (!["curated stock photo library", "trade photo library", "business assets", "configured stock provider"].includes(imagerySource)) throw new Error("Preview imagery source is not supported.");
  const reviewSignal = text(value.reviewSignal, "Preview review signal", 40) as PreviewCreativeBrief["reviewSignal"];
  if (!["not used", "public rating count only"].includes(reviewSignal)) throw new Error("Preview review signal is not supported.");
  const businessTone = text(value.businessTone, "Preview business tone", 30) as PreviewStyleProfile["tone"];
  if (!["practical", "modern-practical", "local-family", "premium-craft", "high-trust"].includes(businessTone)) {
    throw new Error("Preview business tone is not supported.");
  }
  const logoSource = text(value.logoSource ?? "not found", "Preview logo source", 40) as PreviewCreativeBrief["logoSource"];
  if (!["not found", "website", "business asset", "operator supplied"].includes(logoSource)) throw new Error("Preview logo source is not supported.");
  const customerAudience = text(value.customerAudience ?? "residential", "Preview customer audience", 30) as PreviewCreativeBrief["customerAudience"];
  if (!["residential", "commercial", "mixed"].includes(customerAudience)) throw new Error("Preview customer audience is not supported.");
  const heroComposition = text(value.heroComposition ?? "clean-editorial", "Preview hero composition", 40) as PreviewArtDirection["heroTreatment"];
  if (!["photo-led-overlap", "service-command", "proof-forward", "clean-editorial"].includes(heroComposition)) throw new Error("Preview hero composition is not supported.");
  const sectionDensity = text(value.sectionDensity ?? "calm-premium", "Preview section density", 40) as PreviewArtDirection["layoutRhythm"];
  if (!["bold-asymmetric", "service-dense", "proof-led", "calm-premium"].includes(sectionDensity)) throw new Error("Preview section density is not supported.");
  const services = stringArray(value.services, "Preview brief services", 12, 200);
  return {
    businessName: text(value.businessName, "Preview brief business name", 160),
    trade,
    city: text(value.city, "Preview brief city", 120),
    serviceArea: text(value.serviceArea, "Preview brief service area", 500),
    phone: text(value.phone ?? "not confirmed", "Preview brief phone", 120),
    verifiedEmailOrContactPath: text(value.verifiedEmailOrContactPath ?? "not confirmed", "Preview brief contact path", 240),
    existingWebsite: text(value.existingWebsite ?? "not found", "Preview brief website", 2048),
    services,
    primaryService: text(value.primaryService ?? services[0] ?? "Primary service", "Preview primary service", 200),
    secondaryServices: value.secondaryServices === undefined ? services.slice(1) : stringArray(value.secondaryServices, "Preview secondary services", 12, 200),
    customerAudience,
    websiteCondition: text(value.websiteCondition, "Preview brief website condition", 500),
    logoStatus,
    logoSource,
    brandColorSource,
    brandingSource,
    imagerySource,
    reviewSignal,
    factualPublicProof: value.factualPublicProof === undefined ? [] : stringArray(value.factualPublicProof, "Preview factual public proof", 12, 240),
    contactDetails: stringArray(value.contactDetails, "Preview brief contact details", 12, 200),
    businessTone,
    likelyCustomerType: text(value.likelyCustomerType, "Preview likely customer type", 500),
    visualDirection: text(value.visualDirection, "Preview visual direction", 500),
    heroComposition,
    typographyDirection: text(value.typographyDirection ?? "Strong contractor typography", "Preview typography direction", 240),
    sectionDensity,
    imageIntents: value.imageIntents === undefined ? [] : stringArray(value.imageIntents, "Preview image intents", 20, 300),
    copyRestrictions: value.copyRestrictions === undefined ? [] : stringArray(value.copyRestrictions, "Preview copy restrictions", 20, 300),
    ctaStrategy: text(value.ctaStrategy, "Preview CTA strategy", 1000),
  };
}

function scoreValue(input: unknown, field: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${field} must be a score from 0 to 100.`);
  return Math.round(value);
}

function previewQualityValue(value: unknown): PreviewQualityScore | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview quality score must be a valid object.");
  const status = value.status === undefined ? undefined : text(value.status, "Preview quality status", 60) as PreviewQualityScore["status"];
  if (status && !["Send-worthy / polished", "Needs visual review", "Needs regeneration", "Blocked by factual or technical issue"].includes(status)) throw new Error("Preview quality status is not supported.");
  return {
    heroImpact: value.heroImpact === undefined ? undefined : scoreValue(value.heroImpact, "Preview hero impact"),
    imageQuality: value.imageQuality === undefined ? undefined : scoreValue(value.imageQuality, "Preview image quality"),
    imageSectionRelevance: value.imageSectionRelevance === undefined ? undefined : scoreValue(value.imageSectionRelevance, "Preview image section relevance"),
    branding: value.branding === undefined ? undefined : scoreValue(value.branding, "Preview branding"),
    colorUsage: value.colorUsage === undefined ? undefined : scoreValue(value.colorUsage, "Preview color usage"),
    logoUsage: value.logoUsage === undefined ? undefined : scoreValue(value.logoUsage, "Preview logo usage"),
    layoutVariety: value.layoutVariety === undefined ? undefined : scoreValue(value.layoutVariety, "Preview layout variety"),
    typography: value.typography === undefined ? undefined : scoreValue(value.typography, "Preview typography"),
    ctaProminence: value.ctaProminence === undefined ? undefined : scoreValue(value.ctaProminence, "Preview CTA prominence"),
    publicLinkHealth: value.publicLinkHealth === undefined ? undefined : scoreValue(value.publicLinkHealth, "Preview public link health"),
    factualSafety: value.factualSafety === undefined ? undefined : scoreValue(value.factualSafety, "Preview factual safety"),
    contentPolish: value.contentPolish === undefined ? undefined : scoreValue(value.contentPolish, "Preview content polish"),
    visualPolish: scoreValue(value.visualPolish, "Preview visual polish"),
    businessSpecificity: scoreValue(value.businessSpecificity, "Preview business specificity"),
    clarity: scoreValue(value.clarity, "Preview clarity"),
    mobileResponsiveness: scoreValue(value.mobileResponsiveness, "Preview mobile responsiveness"),
    conversionStrength: scoreValue(value.conversionStrength, "Preview conversion strength"),
    safetyTruthfulness: scoreValue(value.safetyTruthfulness, "Preview safety truthfulness"),
    overall: scoreValue(value.overall, "Preview overall quality"),
    status,
    notes: value.notes === undefined ? [] : stringArray(value.notes, "Preview quality notes", 12, 500),
  };
}

function previewImageUrl(value: unknown, field: string) {
  const url = text(value, field, 2048);
  if (url.startsWith("/engine-preview-assets/") || url.startsWith("/uploads/") || url.startsWith("/prospect-assets/")) return url;
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${field} must use HTTP or HTTPS.`);
  if (parsed.username || parsed.password) throw new Error(`${field} cannot include credentials.`);
  return parsed.href;
}

function previewImageIntentValue(value: unknown): PreviewImageIntent {
  if (!isRecord(value)) throw new Error("Preview image intent must be a valid object.");
  const slot = text(value.slot, "Preview image intent slot", 30) as PreviewImageSlot;
  if (!["hero", "service", "gallery", "beforeAfter", "process", "cta"].includes(slot)) throw new Error("Preview image intent slot is not supported.");
  return {
    id: text(value.id, "Preview image intent ID", 120),
    slot,
    section: text(value.section, "Preview image intent section", 160),
    serviceTitle: value.serviceTitle === undefined ? undefined : text(value.serviceTitle, "Preview image intent service title", 160, false),
    query: text(value.query, "Preview image intent query", 400),
    keywords: value.keywords === undefined ? [] : stringArray(value.keywords, "Preview image intent keywords", 24, 120),
    purpose: text(value.purpose, "Preview image intent purpose", 300),
  };
}

function resolvedPreviewImageValue(value: unknown): ResolvedPreviewImage {
  if (!isRecord(value)) throw new Error("Resolved preview image must be a valid object.");
  const slot = text(value.slot, "Resolved preview image slot", 30) as PreviewImageSlot;
  if (!["hero", "service", "gallery", "beforeAfter", "process", "cta"].includes(slot)) throw new Error("Resolved preview image slot is not supported.");
  const source = text(value.source, "Resolved preview image source", 60) as PreviewImageSource;
  if (!["business-photo", "configured-stock-provider", "curated-stock-photo-library", "curated-trade-library", "neutral-fallback"].includes(source)) throw new Error("Resolved preview image source is not supported.");
  return {
    id: text(value.id, "Resolved preview image ID", 120),
    slot,
    section: text(value.section, "Resolved preview image section", 160),
    serviceTitle: value.serviceTitle === undefined ? undefined : text(value.serviceTitle, "Resolved preview image service title", 160, false),
    src: previewImageUrl(value.src, "Resolved preview image URL"),
    alt: text(value.alt, "Resolved preview image alt text", 500),
    source,
    intent: previewImageIntentValue(value.intent),
  };
}

function imageTuple(value: unknown, field: string): [ResolvedPreviewImage, ResolvedPreviewImage, ResolvedPreviewImage] {
  if (!Array.isArray(value) || value.length < 3) throw new Error(`${field} must include three images.`);
  return [
    resolvedPreviewImageValue(value[0]),
    resolvedPreviewImageValue(value[1]),
    resolvedPreviewImageValue(value[2]),
  ];
}

function previewImageSetValue(value: unknown): PreviewImageSet | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview resolved images must be a valid object.");
  const providerStatus = text(value.providerStatus ?? "not configured", "Preview image provider status", 30) as PreviewImageSet["providerStatus"];
  if (!["not configured", "configured"].includes(providerStatus)) throw new Error("Preview image provider status is not supported.");
  const intents = Array.isArray(value.intents) ? value.intents.slice(0, 20).map(previewImageIntentValue) : [];
  return {
    hero: resolvedPreviewImageValue(value.hero),
    services: imageTuple(value.services, "Preview service images"),
    gallery: imageTuple(value.gallery, "Preview gallery images"),
    beforeAfter: resolvedPreviewImageValue(value.beforeAfter),
    process: resolvedPreviewImageValue(value.process),
    cta: resolvedPreviewImageValue(value.cta),
    intents,
    sourceStatus: text(value.sourceStatus ?? "not recorded", "Preview image source status", 120),
    providerStatus,
    warnings: value.warnings === undefined ? [] : stringArray(value.warnings, "Preview image warnings", 20, 500),
    resolvedAt: value.resolvedAt === undefined ? undefined : dateText(value.resolvedAt, "Preview images resolved date"),
  };
}

function previewValue(value: unknown): PreviewConcept | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview concept must be a valid object.");
  const layoutDirection = value.layoutDirection === undefined ? undefined : text(value.layoutDirection, "Preview layout direction", 40) as PreviewLayoutDirection;
  if (layoutDirection && !["split-photo", "full-bleed-photo", "image-led-grid", "dark-premium", "light-editorial", "bold-local-service"].includes(layoutDirection)) throw new Error("Preview layout direction is not supported.");
  return {
    previewVersion: value.previewVersion === "v3" ? "v3" : value.previewVersion === "v2" ? "v2" : undefined,
    creativeBrief: creativeBriefValue(value.creativeBrief),
    regenerationFeedbackHistory: value.regenerationFeedbackHistory === undefined ? undefined : stringArray(value.regenerationFeedbackHistory, "Preview regeneration feedback history", 8, 240),
    layoutDirection,
    resolvedImages: previewImageSetValue(value.resolvedImages),
    direction: text(value.direction, "Preview direction", 5000),
    visualStyleDirection: text(value.visualStyleDirection ?? "Practical contractor visual direction.", "Visual style direction", 5000),
    artDirection: artDirectionValue(value.artDirection),
    hero: text(value.hero, "Preview hero", 5000),
    heroHeadline: value.heroHeadline === undefined ? undefined : text(value.heroHeadline, "Preview hero headline", 500),
    heroSupporting: value.heroSupporting === undefined ? undefined : text(value.heroSupporting, "Preview hero supporting copy", 2000),
    serviceHighlights: value.serviceHighlights === undefined ? undefined : stringArray(value.serviceHighlights, "Preview service highlights", 12, 300),
    trustItems: value.trustItems === undefined ? undefined : stringArray(value.trustItems, "Preview trust items", 12, 300),
    styleProfile: styleProfileValue(value.styleProfile),
    homepageStructure: stringArray(value.homepageStructure, "Homepage structure", 20, 1000),
    ctaStrategy: text(value.ctaStrategy, "CTA strategy", 5000),
    servicePageStructure: stringArray(value.servicePageStructure, "Service page structure", 20, 1000),
    portfolioDirection: text(value.portfolioDirection, "Portfolio direction", 5000),
    trustStrategy: text(value.trustStrategy, "Trust strategy", 5000),
    leadCaptureStrategy: text(value.leadCaptureStrategy, "Lead capture strategy", 5000),
    qualityScore: previewQualityValue(value.qualityScore),
    generatedAt: dateText(value.generatedAt, "Preview generated date"),
  };
}

function activityValues(value: unknown): Activity[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error("Activities must be a valid list.");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("Activity must be a valid object.");
    const type = text(item.type, "Activity type", 30) as Activity["type"];
    if (!["created", "analysis", "outreach", "preview", "status", "note"].includes(type)) throw new Error("Activity type is not supported.");
    return {
      id: text(item.id, "Activity ID", 100),
      type,
      label: text(item.label, "Activity label", 1000),
      at: dateText(item.at, "Activity date"),
    };
  });
}

export function validateProspect(input: unknown): ValidationResult {
  try {
    if (!isRecord(input)) throw new Error("Prospect payload must be an object.");

    const prospectType = text(input.prospectType ?? "redesign", "Prospect type", 40) as ProspectType;
    if (!prospectTypes.includes(prospectType)) throw new Error("Prospect type is not supported.");
    const website = text(input.website ?? "", "Website", 2048, prospectType === "redesign");
    const profileUrl = text(input.profileUrl ?? "", "Profile URL", 2048, false);
    const validateUrl = (value: string, field: string) => {
      if (!value) return "";
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${field} must use HTTP or HTTPS.`);
      if (parsed.username || parsed.password) throw new Error(`${field} cannot include credentials.`);
      if (parsed.port && !["80", "443"].includes(parsed.port)) throw new Error(`${field} uses an unsupported port.`);
      return parsed.href;
    };
    const parsedWebsite = validateUrl(website, "Website");
    const parsedProfileUrl = validateUrl(profileUrl, "Profile URL");
    const parsedContactPageUrl = validateUrl(text(input.contactPageUrl ?? "", "Contact page URL", 2048, false), "Contact page URL");
    const parsedContactFormUrl = validateUrl(text(input.contactFormUrl ?? "", "Contact form URL", 2048, false), "Contact form URL");
    const parsedQuoteFormUrl = validateUrl(text(input.quoteFormUrl ?? "", "Quote form URL", 2048, false), "Quote form URL");
    const parsedFacebookUrl = validateUrl(text(input.facebookUrl ?? "", "Facebook URL", 2048, false), "Facebook URL");
    const parsedInstagramUrl = validateUrl(text(input.instagramUrl ?? "", "Instagram URL", 2048, false), "Instagram URL");
    const parsedLinkedinUrl = validateUrl(text(input.linkedinUrl ?? "", "LinkedIn URL", 2048, false), "LinkedIn URL");
    const parsedXUrl = validateUrl(text(input.xUrl ?? "", "X/Twitter URL", 2048, false), "X/Twitter URL");
    const parsedYoutubeUrl = validateUrl(text(input.youtubeUrl ?? "", "YouTube URL", 2048, false), "YouTube URL");

    const trade = normalizeTradeCategory(text(input.trade, "Trade", 40));
    if (!trade) throw new Error("Trade category is not supported.");

    const status = text(input.status, "Status", 40) as ProspectStatus;
    if (!prospectStatuses.includes(status)) throw new Error("Pipeline status is not supported.");

    const sizeIndicator = text(input.sizeIndicator, "Business size", 20) as Prospect["sizeIndicator"];
    if (!["Small", "Growing", "Established"].includes(sizeIndicator)) throw new Error("Business size is not supported.");

    const priorityScore = Number(input.priorityScore);
    if (!Number.isInteger(priorityScore) || priorityScore < 0 || priorityScore > 100) {
      throw new Error("Priority score must be an integer from 0 to 100.");
    }

    const email = text(input.email, "Email", 254, false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email must be valid.");
    const phone = text(input.phone, "Phone", 50, false);
    const contactFields = {
      website: parsedWebsite,
      profileUrl: parsedProfileUrl,
      phone,
      email,
      contactFormUrl: parsedContactFormUrl,
      quoteFormUrl: parsedQuoteFormUrl,
      facebookUrl: parsedFacebookUrl,
      instagramUrl: parsedInstagramUrl,
      linkedinUrl: parsedLinkedinUrl,
    };
    const classification = input.classification === undefined
      ? classifyProspectPresence(contactFields)
      : text(input.classification, "Prospect classification", 50) as ProspectClassification;
    if (!prospectClassifications.includes(classification)) throw new Error("Prospect classification is not supported.");
    const inactive = input.inactive === undefined ? false : input.inactive;
    if (typeof inactive !== "boolean") throw new Error("Inactive status must be true or false.");
    const websiteStatus = text(input.websiteStatus ?? (parsedWebsite ? "unknown" : "no_owned_website"), "Website status", 40) as WebsiteAvailabilityStatus;
    if (!websiteAvailabilityStatuses.includes(websiteStatus)) throw new Error("Website status is not supported.");
    const websiteAnalysisAttemptedAt = text(input.websiteAnalysisAttemptedAt ?? "", "Website analysis attempt date", 100, false);
    if (websiteAnalysisAttemptedAt && !Number.isFinite(Date.parse(websiteAnalysisAttemptedAt))) {
      throw new Error("Website analysis attempt date must be valid.");
    }
    const recommendedContactMethod = input.recommendedContactMethod === undefined
      ? recommendProspectContactMethod({ ...contactFields, classification, inactive })
      : text(input.recommendedContactMethod, "Recommended contact method", 60) as RecommendedContactMethod;
    if (!recommendedContactMethods.includes(recommendedContactMethod)) throw new Error("Recommended contact method is not supported.");
    const bestManualContactMethod = input.bestManualContactMethod === undefined
      ? prospectBestManualContactMethod(contactFields)
      : text(input.bestManualContactMethod, "Best manual contact method", 50) as ManualContactMethod;
    if (!manualContactMethods.includes(bestManualContactMethod)) throw new Error("Best manual contact method is not supported.");
    const contactConfidence = input.contactConfidence === undefined
      ? prospectContactConfidence(contactFields)
      : text(input.contactConfidence, "Contact confidence", 20) as ContactConfidence;
    if (!contactConfidenceLevels.includes(contactConfidence)) throw new Error("Contact confidence is not supported.");

    const scoreValue = (value: unknown, field: string, fallback = 0) => {
      const score = value === undefined ? fallback : Number(value);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`${field} must be between 0 and 100.`);
      return score;
    };
    const countValue = (value: unknown, field: string) => {
      const count = value === undefined ? 0 : Number(value);
      if (!Number.isInteger(count) || count < 0) throw new Error(`${field} must be a non-negative integer.`);
      return count;
    };

    return {
      ok: true,
      value: {
        id: text(input.id, "Prospect ID", 100),
        businessName: text(input.businessName, "Business name", 160),
        website: parsedWebsite,
        profileUrl: parsedProfileUrl,
        prospectType,
        classification,
        phone,
        email,
        contactPageUrl: parsedContactPageUrl,
        contactFormUrl: parsedContactFormUrl,
        quoteFormUrl: parsedQuoteFormUrl,
        contactFormDetected: Boolean(input.contactFormDetected ?? parsedContactFormUrl),
        quoteFormDetected: Boolean(input.quoteFormDetected ?? parsedQuoteFormUrl),
        facebookUrl: parsedFacebookUrl,
        instagramUrl: parsedInstagramUrl,
        linkedinUrl: parsedLinkedinUrl,
        xUrl: parsedXUrl,
        youtubeUrl: parsedYoutubeUrl,
        contactPersonName: text(input.contactPersonName ?? "", "Contact person", 160, false),
        contactConfidence,
        bestManualContactMethod,
        contactDiscoveryNotes: input.contactDiscoveryNotes === undefined ? [] : stringArray(input.contactDiscoveryNotes, "Contact discovery notes", 25, 500),
        address: text(input.address ?? "", "Address", 500, false),
        city: titleCaseLocation(text(input.city, "City", 100)),
        state: displayStateCode(text(input.state, "State", 2)),
        trade,
        status,
        serviceArea: text(input.serviceArea, "Service area", 300),
        sizeIndicator,
        priorityScore,
        rating: Math.min(5, scoreValue(input.rating, "Rating")),
        reviewCount: countValue(input.reviewCount, "Review count"),
        recentReviewCount: countValue(input.recentReviewCount, "Recent review count"),
        sourceConfidence: scoreValue(input.sourceConfidence, "Source confidence"),
        activitySignals: input.activitySignals === undefined ? [] : stringArray(input.activitySignals, "Activity signals", 50, 100),
        recommendedContactMethod,
        inactive,
        websiteStatus,
        websiteStatusDetail: text(input.websiteStatusDetail ?? "", "Website status detail", 1000, false),
        websiteAnalysisAttemptedAt: websiteAnalysisAttemptedAt ? new Date(websiteAnalysisAttemptedAt).toISOString() : "",
        notes: stringArray(input.notes, "Notes", 1000, 5000),
        activities: activityValues(input.activities),
        analysis: analysisValue(input.analysis),
        outreach: outreachValue(input.outreach),
        preview: previewValue(input.preview),
        createdAt: dateText(input.createdAt, "Created date"),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid prospect payload." };
  }
}
