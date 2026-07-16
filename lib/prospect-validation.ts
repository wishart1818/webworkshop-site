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
  type PreviewBusinessProfile,
  type PreviewCreativeBrief,
  type PreviewFactConfidence,
  type PreviewFactProvenance,
  type PreviewLayoutDirection,
  type PreviewQualityScore,
  type PreviewRenderPlan,
  type PreviewResearchFact,
  type PreviewServiceFidelityResult,
  type PreviewServiceHierarchyItem,
  type PreviewVisualAssetQa,
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
  if (!["official website", "business-name cue", "website-domain cue", "trade fallback"].includes(brandSource)) {
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
  if (!["official website", "business-name cue", "website-domain cue", "trade fallback"].includes(brandColorSource)) {
    throw new Error("Preview brand color source is not supported.");
  }
  const brandingSource = text(value.brandingSource, "Preview branding source", 30) as PreviewCreativeBrief["brandingSource"];
  if (!["verified official source", "inferred cue", "detected cue", "trade fallback"].includes(brandingSource)) throw new Error("Preview branding source is not supported.");
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

function previewFactConfidenceValue(value: unknown, field: string): PreviewFactConfidence {
  const confidence = text(value, field, 20) as PreviewFactConfidence;
  if (!["verified", "inferred", "unavailable"].includes(confidence)) throw new Error(`${field} is not supported.`);
  return confidence;
}

function previewFactProvenanceValue(value: unknown, field: string): PreviewFactProvenance | undefined {
  if (value === undefined) return undefined;
  const provenance = text(value, field, 50) as PreviewFactProvenance;
  if (!["verified official source", "verified provider source", "inferred creative direction", "trade fallback", "unavailable"].includes(provenance)) {
    throw new Error(`${field} is not supported.`);
  }
  return provenance;
}

function previewResearchFactValue(value: unknown, field: string): PreviewResearchFact {
  if (!isRecord(value)) throw new Error(`${field} must be a valid object.`);
  return {
    label: text(value.label, `${field} label`, 120),
    value: text(value.value, `${field} value`, 2048),
    source: text(value.source, `${field} source`, 240),
    confidence: previewFactConfidenceValue(value.confidence, `${field} confidence`),
    provenance: previewFactProvenanceValue(value.provenance, `${field} provenance`),
  };
}

function previewResearchFactArray(value: unknown, field: string, maxItems = 24) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} must be a valid list.`);
  return value.map((item, index) => previewResearchFactValue(item, `${field} ${index + 1}`));
}

function previewBusinessProfileValue(value: unknown): PreviewBusinessProfile | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview business profile must be a valid object.");
  const trade = normalizeTradeCategory(text(value.trade, "Preview business profile trade", 40));
  if (!trade) throw new Error("Preview business profile trade is not supported.");
  const customerType = text(value.customerType, "Preview business profile customer type", 30) as PreviewCreativeBrief["customerAudience"];
  if (!["residential", "commercial", "mixed"].includes(customerType)) throw new Error("Preview business profile customer type is not supported.");
  const logo = value.logo;
  if (!isRecord(logo)) throw new Error("Preview business profile logo must be a valid object.");
  const logoStatus = text(logo.status, "Preview business profile logo status", 30) as PreviewBusinessProfile["logo"]["status"];
  if (!["available", "wordmark_fallback"].includes(logoStatus)) throw new Error("Preview business profile logo status is not supported.");
  const logoSource = text(logo.source, "Preview business profile logo source", 40) as PreviewBusinessProfile["logo"]["source"];
  if (!["website", "business asset", "operator supplied", "social profile", "wordmark fallback"].includes(logoSource)) throw new Error("Preview business profile logo source is not supported.");
  const logoUrl = text(logo.url ?? "", "Preview business profile logo URL", 2048, false);
  if (logoUrl) previewImageUrl(logoUrl, "Preview business profile logo URL");
  const verifiedServices = stringArray(value.verifiedServices, "Preview business profile verified services", 12, 200);
  return {
    officialBusinessName: text(value.officialBusinessName, "Preview business profile business name", 160),
    trade,
    primaryMarket: text(value.primaryMarket, "Preview business profile market", 160),
    verifiedServiceArea: text(value.verifiedServiceArea, "Preview business profile service area", 500),
    verifiedPhone: previewResearchFactValue(value.verifiedPhone, "Preview business profile phone"),
    verifiedPublicEmailOrContactPath: previewResearchFactValue(value.verifiedPublicEmailOrContactPath, "Preview business profile contact path"),
    officialWebsite: previewResearchFactValue(value.officialWebsite, "Preview business profile website"),
    officialSocialProfiles: previewResearchFactArray(value.officialSocialProfiles, "Preview business profile social profiles", 8),
    customerType,
    verifiedServices,
    primaryService: text(value.primaryService ?? verifiedServices[0] ?? "Primary service", "Preview business profile primary service", 200),
    secondaryServices: value.secondaryServices === undefined ? verifiedServices.slice(1) : stringArray(value.secondaryServices, "Preview business profile secondary services", 12, 200),
    logo: {
      status: logoStatus,
      url: logoUrl,
      source: logoSource,
      confidence: previewFactConfidenceValue(logo.confidence, "Preview business profile logo confidence"),
      provenance: previewFactProvenanceValue(logo.provenance, "Preview business profile logo provenance"),
      note: text(logo.note, "Preview business profile logo note", 500),
    },
    businessPhotoSources: previewResearchFactArray(value.businessPhotoSources, "Preview business profile photo sources", 12),
    detectedBrandColors: previewResearchFactArray(value.detectedBrandColors, "Preview business profile brand colors", 8),
    brandPersonality: text(value.brandPersonality, "Preview business profile brand personality", 500),
    recurringPublicReviewThemes: previewResearchFactArray(value.recurringPublicReviewThemes, "Preview business profile review themes", 8),
    realDifferentiators: previewResearchFactArray(value.realDifferentiators, "Preview business profile differentiators", 12),
    currentWebsiteWeaknesses: previewResearchFactArray(value.currentWebsiteWeaknesses, "Preview business profile website weaknesses", 12),
    recommendedDesignDirection: text(value.recommendedDesignDirection, "Preview business profile design direction", 500),
    sourceFacts: previewResearchFactArray(value.sourceFacts, "Preview business profile source facts", 24),
    confidenceSummary: text(value.confidenceSummary, "Preview business profile confidence summary", 500),
    uncertainFactsExcluded: value.uncertainFactsExcluded === undefined ? [] : stringArray(value.uncertainFactsExcluded, "Preview business profile excluded facts", 20, 500),
    researchStatus: value.researchStatus === undefined ? undefined : (() => {
      const status = text(value.researchStatus, "Preview business profile research status", 30) as PreviewBusinessProfile["researchStatus"];
      if (!["succeeded", "timed_out", "failed", "not_applicable"].includes(status ?? "")) throw new Error("Preview business profile research status is not supported.");
      return status;
    })(),
    researchNote: value.researchNote === undefined ? undefined : text(value.researchNote, "Preview business profile research note", 500),
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
  const intent = previewImageIntentValue(value.intent);
  const semanticStatus = ["accepted", "uncertain", "rejected"].includes(String(value.semanticStatus))
    ? value.semanticStatus as ResolvedPreviewImage["semanticStatus"]
    : source === "curated-trade-library" || source === "neutral-fallback" ? "rejected" : "uncertain";
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const trade = normalizeTradeCategory(typeof metadata.trade === "string" ? metadata.trade : "") ?? "General Contractor";
  const context = ["residential", "commercial", "mixed", "unknown"].includes(String(metadata.context)) ? metadata.context as ResolvedPreviewImage["metadata"]["context"] : "unknown";
  const kind = ["photo", "illustration", "abstract", "unknown"].includes(String(metadata.kind)) ? metadata.kind as ResolvedPreviewImage["metadata"]["kind"] : "unknown";
  const confidence = ["high", "medium", "low"].includes(String(metadata.confidence)) ? metadata.confidence as ResolvedPreviewImage["metadata"]["confidence"] : "low";
  const cropSuitability = ["suitable", "uncertain", "unsuitable"].includes(String(metadata.cropSuitability)) ? metadata.cropSuitability as ResolvedPreviewImage["metadata"]["cropSuitability"] : "uncertain";
  return {
    id: text(value.id, "Resolved preview image ID", 120),
    slot,
    section: text(value.section, "Resolved preview image section", 160),
    serviceTitle: value.serviceTitle === undefined ? undefined : text(value.serviceTitle, "Resolved preview image service title", 160, false),
    src: previewImageUrl(value.src, "Resolved preview image URL"),
    alt: text(value.alt, "Resolved preview image alt text", 500),
    source,
    intent,
    semanticStatus,
    semanticReasons: value.semanticReasons === undefined ? [] : stringArray(value.semanticReasons, "Resolved preview image semantic reasons", 10, 300),
    metadata: {
      trade,
      supportedServices: metadata.supportedServices === undefined ? intent.keywords : stringArray(metadata.supportedServices, "Resolved preview image supported services", 24, 120),
      intendedSections: metadata.intendedSections === undefined ? [slot] : stringArray(metadata.intendedSections, "Resolved preview image intended sections", 8, 30) as PreviewImageSlot[],
      context,
      kind,
      confidence,
      cropSuitability,
      usagePath: typeof metadata.usagePath === "string" ? text(metadata.usagePath, "Resolved preview image usage path", 160) : source,
    },
  };
}

function imageList(value: unknown, field: string): ResolvedPreviewImage[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error(`${field} must be a valid image list.`);
  return value.map(resolvedPreviewImageValue);
}

function previewImageSetValue(value: unknown): PreviewImageSet | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview resolved images must be a valid object.");
  const providerStatus = text(value.providerStatus ?? "not configured", "Preview image provider status", 30) as PreviewImageSet["providerStatus"];
  if (!["not configured", "configured"].includes(providerStatus)) throw new Error("Preview image provider status is not supported.");
  const intents = Array.isArray(value.intents) ? value.intents.slice(0, 20).map(previewImageIntentValue) : [];
  const hero = resolvedPreviewImageValue(value.hero);
  return {
    hero,
    heroCandidates: value.heroCandidates === undefined ? [hero] : imageList(value.heroCandidates, "Preview hero candidates"),
    services: imageList(value.services, "Preview service images"),
    gallery: imageList(value.gallery, "Preview gallery images"),
    beforeAfter: resolvedPreviewImageValue(value.beforeAfter),
    process: resolvedPreviewImageValue(value.process),
    cta: resolvedPreviewImageValue(value.cta),
    intents,
    sourceStatus: text(value.sourceStatus ?? "not recorded", "Preview image source status", 120),
    providerStatus,
    warnings: value.warnings === undefined ? [] : stringArray(value.warnings, "Preview image warnings", 20, 500),
    omittedAssets: Array.isArray(value.omittedAssets) ? value.omittedAssets.slice(0, 30).map((asset, index) => {
      if (!isRecord(asset)) throw new Error(`Preview omitted asset ${index + 1} must be valid.`);
      return { src: previewImageUrl(asset.src, `Preview omitted asset ${index + 1} URL`), reason: text(asset.reason, `Preview omitted asset ${index + 1} reason`, 500) };
    }) : [],
    resolvedAt: value.resolvedAt === undefined ? undefined : dateText(value.resolvedAt, "Preview images resolved date"),
  };
}

const previewSectionIds = ["hero", "trust", "services", "featured-service", "project-proof", "gallery", "process", "service-area", "faq", "final-cta", "footer"] as const;

function previewRenderPlanValue(value: unknown): PreviewRenderPlan | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview render plan must be a valid object.");
  if (value.version !== "render-plan-v1") throw new Error("Preview render plan version is not supported.");
  const direction = text(value.direction, "Preview render plan direction", 40) as PreviewRenderPlan["direction"];
  if (!["service-command", "project-showcase", "trust-led-local"].includes(direction)) throw new Error("Preview render plan direction is not supported.");
  const heroVariant = text(value.heroVariant, "Preview render plan hero variant", 40) as PreviewRenderPlan["heroVariant"];
  if (!["compact-service", "image-led", "local-proof"].includes(heroVariant)) throw new Error("Preview render plan hero variant is not supported.");
  const servicePresentation = text(value.servicePresentation, "Preview render plan service presentation", 50) as PreviewRenderPlan["servicePresentation"];
  if (!["balanced-grid", "featured-plus-secondary", "compact-list", "image-led-services", "alternating-service-spotlights"].includes(servicePresentation)) {
    throw new Error("Preview render plan service presentation is not supported.");
  }
  const density = text(value.density, "Preview render plan density", 20) as PreviewRenderPlan["density"];
  if (!["compact", "balanced", "spacious"].includes(density)) throw new Error("Preview render plan density is not supported.");
  const imageStrategy = text(value.imageStrategy, "Preview render plan image strategy", 40) as PreviewRenderPlan["imageStrategy"];
  if (!["business-photo-led", "trade-photo-led", "restrained-imagery"].includes(imageStrategy)) throw new Error("Preview render plan image strategy is not supported.");
  const trustStrategy = text(value.trustStrategy, "Preview render plan trust strategy", 40) as PreviewRenderPlan["trustStrategy"];
  if (!["verified-proof", "compact-local-facts", "contact-first"].includes(trustStrategy)) throw new Error("Preview render plan trust strategy is not supported.");
  const orderedSections = stringArray(value.orderedSections, "Preview render plan ordered sections", 16, 40) as PreviewRenderPlan["orderedSections"];
  if (orderedSections.some((id) => !previewSectionIds.includes(id))) throw new Error("Preview render plan section is not supported.");
  if (!Array.isArray(value.sectionDecisions) || value.sectionDecisions.length > 16) throw new Error("Preview render plan section decisions must be a valid list.");
  const sectionDecisions = value.sectionDecisions.map((decision, index) => {
    if (!isRecord(decision)) throw new Error(`Preview render plan section decision ${index + 1} must be a valid object.`);
    const id = text(decision.id, `Preview render plan section decision ${index + 1} ID`, 40) as PreviewRenderPlan["sectionDecisions"][number]["id"];
    const status = text(decision.status, `Preview render plan section decision ${index + 1} status`, 20) as PreviewRenderPlan["sectionDecisions"][number]["status"];
    if (!previewSectionIds.includes(id)) throw new Error("Preview render plan section decision ID is not supported.");
    if (!["required", "optional", "omitted"].includes(status)) throw new Error("Preview render plan section decision status is not supported.");
    return { id, status, reason: text(decision.reason, `Preview render plan section decision ${index + 1} reason`, 500) };
  });
  if (!isRecord(value.ctaStrategy)) throw new Error("Preview render plan CTA strategy must be a valid object.");
  const placement = text(value.ctaStrategy.placement, "Preview render plan CTA placement", 40) as PreviewRenderPlan["ctaStrategy"]["placement"];
  if (!["header-and-hero", "hero-and-final", "persistent"].includes(placement)) throw new Error("Preview render plan CTA placement is not supported.");
  if (typeof value.ctaStrategy.phonePriority !== "boolean") throw new Error("Preview render plan phone priority must be true or false.");
  const headerTreatment = text(value.headerTreatment, "Preview render plan header treatment", 40) as PreviewRenderPlan["headerTreatment"];
  if (!["official-logo", "structured-wordmark", "compact-wordmark"].includes(headerTreatment)) throw new Error("Preview render plan header treatment is not supported.");
  if (!isRecord(value.inputs)) throw new Error("Preview render plan inputs must be a valid object.");
  const count = (input: unknown, field: string) => {
    const result = Number(input);
    if (!Number.isInteger(result) || result < 0 || result > 100) throw new Error(`${field} must be a safe count.`);
    return result;
  };
  const flag = (input: unknown, field: string) => {
    if (typeof input !== "boolean") throw new Error(`${field} must be true or false.`);
    return input;
  };
  return {
    version: "render-plan-v1",
    direction,
    selectionRationale: text(value.selectionRationale, "Preview render plan selection rationale", 1000),
    heroVariant,
    servicePresentation,
    orderedSections,
    sectionDecisions,
    density,
    imageStrategy,
    trustStrategy,
    ctaStrategy: {
      label: text(value.ctaStrategy.label, "Preview render plan CTA label", 100),
      phonePriority: value.ctaStrategy.phonePriority,
      placement,
    },
    headerTreatment,
    pageMode: value.pageMode === "concise" ? "concise" : "full",
    copyStrategy: isRecord(value.copyStrategy) && ["direct-service", "visual-results", "local-assurance"].includes(String(value.copyStrategy.voice))
      ? { voice: value.copyStrategy.voice as PreviewRenderPlan["copyStrategy"]["voice"], variant: Math.max(0, Math.min(2, Number(value.copyStrategy.variant) || 0)) }
      : { voice: direction === "service-command" ? "direct-service" : direction === "project-showcase" ? "visual-results" : "local-assurance", variant: 0 },
    mobilePriorities: stringArray(value.mobilePriorities, "Preview render plan mobile priorities", 10, 300),
    avoidPatterns: stringArray(value.avoidPatterns, "Preview render plan avoid patterns", 12, 200),
    inputs: {
      usableImageCount: count(value.inputs.usableImageCount, "Preview render plan usable image count"),
      businessPhotoCount: count(value.inputs.businessPhotoCount, "Preview render plan business photo count"),
      verifiedServiceCount: count(value.inputs.verifiedServiceCount, "Preview render plan verified service count"),
      verifiedTrustFactCount: count(value.inputs.verifiedTrustFactCount, "Preview render plan verified trust fact count"),
      officialLogoAvailable: flag(value.inputs.officialLogoAvailable, "Preview render plan official logo availability"),
      verifiedBrandColorsAvailable: flag(value.inputs.verifiedBrandColorsAvailable, "Preview render plan verified brand-color availability"),
      usableContactPath: flag(value.inputs.usableContactPath, "Preview render plan usable contact path"),
    },
  };
}

function previewServiceHierarchyValue(value: unknown): PreviewServiceHierarchyItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) throw new Error("Preview service hierarchy must be a valid list.");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Preview service ${index + 1} must be valid.`);
    const role = text(item.role, `Preview service ${index + 1} role`, 20) as PreviewServiceHierarchyItem["role"];
    const confidence = text(item.confidence, `Preview service ${index + 1} confidence`, 20) as PreviewServiceHierarchyItem["confidence"];
    const provenance = text(item.provenance, `Preview service ${index + 1} provenance`, 40) as PreviewServiceHierarchyItem["provenance"];
    if (!["primary", "secondary", "specialty"].includes(role)) throw new Error("Preview service role is not supported.");
    if (!["verified", "inferred"].includes(confidence)) throw new Error("Preview service confidence is not supported.");
    if (!["verified official source", "verified provider source", "trade fallback"].includes(provenance)) throw new Error("Preview service provenance is not supported.");
    const displayPriority = Number(item.displayPriority);
    if (!Number.isInteger(displayPriority) || displayPriority < 1 || displayPriority > 20) throw new Error("Preview service priority must be valid.");
    return {
      title: text(item.title, `Preview service ${index + 1} title`, 160),
      description: text(item.description, `Preview service ${index + 1} description`, 1000),
      role,
      confidence,
      provenance,
      source: text(item.source, `Preview service ${index + 1} source`, 300),
      displayPriority,
      imageAvailable: Boolean(item.imageAvailable),
    };
  });
}

function previewServiceFidelityValue(value: unknown): PreviewServiceFidelityResult | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !["passed", "failed"].includes(String(value.status))) throw new Error("Preview service fidelity must be valid.");
  return {
    status: value.status as PreviewServiceFidelityResult["status"],
    groundedInput: stringArray(value.groundedInput, "Preview grounded services", 12, 160),
    savedServices: stringArray(value.savedServices, "Preview saved services", 12, 160),
    transformations: Array.isArray(value.transformations) ? value.transformations.slice(0, 12).map((item, index) => {
      if (!isRecord(item)) throw new Error(`Preview service transformation ${index + 1} must be valid.`);
      return {
        stage: text(item.stage, `Preview service transformation ${index + 1} stage`, 100),
        before: stringArray(item.before, `Preview service transformation ${index + 1} before`, 12, 160),
        after: stringArray(item.after, `Preview service transformation ${index + 1} after`, 12, 160),
        rule: text(item.rule, `Preview service transformation ${index + 1} rule`, 500),
      };
    }) : [],
  };
}

function previewVisualAssetQaValue(value: unknown): PreviewVisualAssetQa | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview visual asset QA must be valid.");
  const selectedHeroStatus = text(value.selectedHeroStatus, "Preview hero status", 20) as PreviewVisualAssetQa["selectedHeroStatus"];
  const cropSuitability = text(value.cropSuitability, "Preview crop suitability", 20) as PreviewVisualAssetQa["cropSuitability"];
  const semanticRelevance = text(value.semanticRelevance, "Preview semantic relevance", 20) as PreviewVisualAssetQa["semanticRelevance"];
  if (!["accepted", "replaced", "uncertain", "low-image", "blocked"].includes(selectedHeroStatus)) throw new Error("Preview hero status is not supported.");
  if (!["suitable", "uncertain", "unsuitable"].includes(cropSuitability)) throw new Error("Preview crop suitability is not supported.");
  if (!["accepted", "uncertain", "rejected"].includes(semanticRelevance)) throw new Error("Preview semantic relevance is not supported.");
  return {
    selectedHeroStatus,
    selectedHeroSource: text(value.selectedHeroSource, "Preview hero source", 120),
    brokenImage: Boolean(value.brokenImage),
    visuallyBlank: Boolean(value.visuallyBlank),
    cropSuitability,
    semanticRelevance,
    distinctMajorImageCount: Math.max(0, Number(value.distinctMajorImageCount) || 0),
    omittedUncertainAssets: value.omittedUncertainAssets === undefined ? [] : stringArray(value.omittedUncertainAssets, "Preview omitted uncertain assets", 30, 2048),
    criticalFailures: value.criticalFailures === undefined ? [] : stringArray(value.criticalFailures, "Preview critical asset failures", 20, 500),
    lowImageMode: Boolean(value.lowImageMode),
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
    businessProfile: previewBusinessProfileValue(value.businessProfile),
    renderPlan: previewRenderPlanValue(value.renderPlan),
    regenerationFeedbackHistory: value.regenerationFeedbackHistory === undefined ? undefined : stringArray(value.regenerationFeedbackHistory, "Preview regeneration feedback history", 8, 240),
    layoutDirection,
    resolvedImages: previewImageSetValue(value.resolvedImages),
    serviceHierarchy: previewServiceHierarchyValue(value.serviceHierarchy),
    serviceFidelity: previewServiceFidelityValue(value.serviceFidelity),
    visualAssetQa: previewVisualAssetQaValue(value.visualAssetQa),
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
    const approvedPreviewPhotos: Prospect["approvedPreviewPhotos"] = Array.isArray(input.approvedPreviewPhotos) ? input.approvedPreviewPhotos.slice(0, 30).flatMap((item, index): NonNullable<Prospect["approvedPreviewPhotos"]> => {
      if (typeof item === "string") return [previewImageUrl(item, `Approved preview photo ${index + 1}`)];
      if (!isRecord(item)) return [];
      return [{
        src: previewImageUrl(item.src, `Approved preview photo ${index + 1}`),
        alt: typeof item.alt === "string" ? text(item.alt, `Approved preview photo ${index + 1} alt`, 500, false) : undefined,
        service: typeof item.service === "string" ? text(item.service, `Approved preview photo ${index + 1} service`, 160, false) : undefined,
      }];
    }) : undefined;

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
        verifiedPreviewServices: input.verifiedPreviewServices === undefined ? undefined : stringArray(input.verifiedPreviewServices, "Verified preview services", 12, 160),
        providerPreviewServices: input.providerPreviewServices === undefined ? undefined : stringArray(input.providerPreviewServices, "Provider preview services", 12, 160),
        approvedPreviewPhotos,
        previewBrandColors: input.previewBrandColors === undefined ? undefined : stringArray(input.previewBrandColors, "Preview brand colors", 8, 20),
        websiteLogoUrl: input.websiteLogoUrl === undefined || String(input.websiteLogoUrl).trim() === "" ? undefined : previewImageUrl(input.websiteLogoUrl, "Website logo URL"),
        previewResearchFacts: input.previewResearchFacts === undefined ? undefined : previewResearchFactArray(input.previewResearchFacts, "Preview research facts", 30),
        previewResearchVerified: input.previewResearchVerified === undefined ? undefined : Boolean(input.previewResearchVerified),
        previewResearchStatus: ["succeeded", "timed_out", "failed", "not_applicable"].includes(String(input.previewResearchStatus)) ? input.previewResearchStatus as Prospect["previewResearchStatus"] : undefined,
        previewResearchNote: input.previewResearchNote === undefined ? undefined : text(input.previewResearchNote, "Preview research note", 1000, false),
        createdAt: dateText(input.createdAt, "Created date"),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid prospect payload." };
  }
}
