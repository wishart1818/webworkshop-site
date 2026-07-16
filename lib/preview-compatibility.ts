import {
  displayTradeCategory,
  normalizeTradeCategory,
  previewRenderPlan,
  type PreviewConcept,
  type PreviewRenderPlan,
  type PreviewSectionDecision,
  type PreviewSectionId,
  type Prospect,
  type TradeCategory,
} from "@/lib/prospect-engine";
import {
  assessSemanticImage,
  resolvePreviewImages,
  type PreviewImageIntent,
  type PreviewImageSet,
  type PreviewImageSlot,
  type PreviewImageSource,
  type ResolvedPreviewImage,
} from "@/lib/preview-image-resolver";

type CompatibilitySuccess = {
  ok: true;
  preview: PreviewConcept;
  legacyFields: string[];
};

type CompatibilityFailure = {
  ok: false;
  message: string;
};

export type PreviewCompatibilityResult = CompatibilitySuccess | CompatibilityFailure;

const imageSources = new Set<PreviewImageSource>([
  "business-photo",
  "configured-stock-provider",
  "curated-stock-photo-library",
  "curated-trade-library",
  "neutral-fallback",
]);
const imageSlots = new Set<PreviewImageSlot>(["hero", "service", "gallery", "beforeAfter", "process", "cta"]);
const sectionIds = new Set<PreviewSectionId>(["hero", "trust", "services", "featured-service", "project-proof", "gallery", "process", "service-area", "faq", "final-cta", "footer"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function safeImageUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const source = value.trim();
  if (source.startsWith("/")) return source;
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function compatibleIntent(value: unknown, fallback: PreviewImageIntent, slot: PreviewImageSlot): PreviewImageIntent {
  if (!isRecord(value)) return { ...fallback, slot };
  const intendedSlot = imageSlots.has(value.slot as PreviewImageSlot) ? value.slot as PreviewImageSlot : slot;
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : fallback.id,
    slot: intendedSlot,
    section: typeof value.section === "string" && value.section.trim() ? value.section : fallback.section,
    serviceTitle: typeof value.serviceTitle === "string" && value.serviceTitle.trim() ? value.serviceTitle : fallback.serviceTitle,
    query: typeof value.query === "string" && value.query.trim() ? value.query : fallback.query,
    keywords: strings(value.keywords).length ? strings(value.keywords) : fallback.keywords,
    purpose: typeof value.purpose === "string" && value.purpose.trim() ? value.purpose : fallback.purpose,
  };
}

function compatibleImage(
  value: unknown,
  fallback: ResolvedPreviewImage,
  trade: TradeCategory,
  slot: PreviewImageSlot,
): ResolvedPreviewImage {
  if (!isRecord(value)) return fallback;
  const src = safeImageUrl(value.src);
  if (!src) return fallback;
  const source = imageSources.has(value.source as PreviewImageSource) ? value.source as PreviewImageSource : fallback.source;
  const intent = compatibleIntent(value.intent, fallback.intent, slot);
  const section = typeof value.section === "string" && value.section.trim() ? value.section : intent.section;
  const serviceTitle = typeof value.serviceTitle === "string" && value.serviceTitle.trim() ? value.serviceTitle : intent.serviceTitle;
  const alt = typeof value.alt === "string" && value.alt.trim() ? value.alt : `${displayTradeCategory(trade)} service`;
  const semanticKeywords = [...new Set([...intent.keywords, section, serviceTitle ?? "", alt].filter(Boolean))];
  const semantic = assessSemanticImage(trade, { ...intent, keywords: semanticKeywords }, src, source, {
    keywords: semanticKeywords,
    context: isRecord(value.metadata) && ["residential", "commercial", "mixed", "unknown"].includes(String(value.metadata.context))
      ? value.metadata.context as ResolvedPreviewImage["metadata"]["context"]
      : "unknown",
    kind: isRecord(value.metadata) && ["photo", "illustration", "abstract", "unknown"].includes(String(value.metadata.kind))
      ? value.metadata.kind as ResolvedPreviewImage["metadata"]["kind"]
      : source === "curated-trade-library" || source === "neutral-fallback" ? "illustration" : "photo",
  });
  const semanticStatus = ["accepted", "uncertain", "rejected"].includes(String(value.semanticStatus))
    ? value.semanticStatus as ResolvedPreviewImage["semanticStatus"]
    : semantic.semanticStatus;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const context = ["residential", "commercial", "mixed", "unknown"].includes(String(metadata.context))
    ? metadata.context as ResolvedPreviewImage["metadata"]["context"]
    : semantic.metadata.context;
  const kind = ["photo", "illustration", "abstract", "unknown"].includes(String(metadata.kind))
    ? metadata.kind as ResolvedPreviewImage["metadata"]["kind"]
    : semantic.metadata.kind;
  const confidence = ["high", "medium", "low"].includes(String(metadata.confidence))
    ? metadata.confidence as ResolvedPreviewImage["metadata"]["confidence"]
    : semantic.metadata.confidence;
  const cropSuitability = ["suitable", "uncertain", "unsuitable"].includes(String(metadata.cropSuitability))
    ? metadata.cropSuitability as ResolvedPreviewImage["metadata"]["cropSuitability"]
    : "uncertain";
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : fallback.id,
    slot: imageSlots.has(value.slot as PreviewImageSlot) ? value.slot as PreviewImageSlot : slot,
    section,
    serviceTitle,
    src,
    alt,
    source,
    intent,
    semanticStatus,
    semanticReasons: strings(value.semanticReasons).length ? strings(value.semanticReasons) : semantic.semanticReasons,
    metadata: {
      trade: normalizeTradeCategory(typeof metadata.trade === "string" ? metadata.trade : trade) ?? trade,
      supportedServices: strings(metadata.supportedServices).length ? strings(metadata.supportedServices) : semanticKeywords,
      intendedSections: Array.isArray(metadata.intendedSections)
        ? metadata.intendedSections.filter((item): item is PreviewImageSlot => imageSlots.has(item as PreviewImageSlot))
        : [slot],
      context,
      kind,
      confidence,
      cropSuitability,
      usagePath: typeof metadata.usagePath === "string" && metadata.usagePath.trim() ? metadata.usagePath : source,
    },
  };
}

function compatibleImageList(value: unknown, fallbacks: ResolvedPreviewImage[], trade: TradeCategory, slot: PreviewImageSlot) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const fallback = fallbacks[index] ?? fallbacks[0];
    if (!fallback || !isRecord(item) || !safeImageUrl(item.src)) return [];
    return [compatibleImage(item, fallback, trade, slot)];
  });
}

function compatibleImageSet(value: unknown, fallback: PreviewImageSet, trade: TradeCategory, legacyFields: string[]): PreviewImageSet | null {
  if (value === undefined || value === null) {
    legacyFields.push("resolvedImages");
    return fallback;
  }
  if (!isRecord(value) || !isRecord(value.hero) || !safeImageUrl(value.hero.src)) return null;
  const hero = compatibleImage(value.hero, fallback.hero, trade, "hero");
  const services = compatibleImageList(value.services, fallback.services, trade, "service");
  const gallery = compatibleImageList(value.gallery, fallback.gallery, trade, "gallery");
  if (!Array.isArray(value.heroCandidates)) legacyFields.push("resolvedImages.heroCandidates");
  if (!Array.isArray(value.omittedAssets)) legacyFields.push("resolvedImages.omittedAssets");
  if (!Array.isArray(value.services)) legacyFields.push("resolvedImages.services");
  if (!Array.isArray(value.gallery)) legacyFields.push("resolvedImages.gallery");
  const heroCandidates = Array.isArray(value.heroCandidates)
    ? compatibleImageList(value.heroCandidates, [hero, ...fallback.heroCandidates], trade, "hero")
    : [hero];
  return {
    hero,
    heroCandidates: heroCandidates.length ? heroCandidates : [hero],
    services,
    gallery,
    beforeAfter: compatibleImage(value.beforeAfter, fallback.beforeAfter, trade, "beforeAfter"),
    process: compatibleImage(value.process, fallback.process, trade, "process"),
    cta: compatibleImage(value.cta, fallback.cta, trade, "cta"),
    intents: Array.isArray(value.intents)
      ? value.intents.flatMap((intent, index) => {
          const fallbackIntent = fallback.intents[index];
          if (!fallbackIntent) return [];
          return [compatibleIntent(intent, fallbackIntent, fallbackIntent.slot)];
        })
      : [],
    sourceStatus: typeof value.sourceStatus === "string" && value.sourceStatus.trim() ? value.sourceStatus : fallback.sourceStatus,
    providerStatus: value.providerStatus === "configured" ? "configured" : "not configured",
    warnings: strings(value.warnings),
    omittedAssets: Array.isArray(value.omittedAssets)
      ? value.omittedAssets.flatMap((asset) => isRecord(asset) && safeImageUrl(asset.src)
        ? [{ src: safeImageUrl(asset.src), reason: typeof asset.reason === "string" ? asset.reason : "Legacy image omitted from public placement." }]
        : [])
      : [],
    resolvedAt: typeof value.resolvedAt === "string" ? value.resolvedAt : undefined,
  };
}

function compatibleSections(value: unknown, fallback: PreviewSectionDecision[]) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value.flatMap((item): PreviewSectionDecision[] => {
    if (!isRecord(item) || !sectionIds.has(item.id as PreviewSectionId)) return [];
    const status = ["required", "optional", "omitted"].includes(String(item.status)) ? item.status as PreviewSectionDecision["status"] : "optional";
    return [{ id: item.id as PreviewSectionId, status, reason: typeof item.reason === "string" ? item.reason : "Legacy preview section retained for compatibility." }];
  });
  return normalized.length ? normalized : fallback;
}

function compatibleRenderPlan(prospect: Prospect, preview: PreviewConcept, value: unknown, legacyFields: string[]): PreviewRenderPlan {
  const derived = previewRenderPlan(prospect, { ...preview, renderPlan: undefined });
  if (!isRecord(value)) {
    legacyFields.push("renderPlan");
    return derived;
  }
  if (value.pageMode !== "concise" && value.pageMode !== "full") legacyFields.push("renderPlan.pageMode");
  if (!isRecord(value.copyStrategy)) legacyFields.push("renderPlan.copyStrategy");
  const direction = ["service-command", "project-showcase", "trust-led-local"].includes(String(value.direction))
    ? value.direction as PreviewRenderPlan["direction"]
    : derived.direction;
  const copyVoice = isRecord(value.copyStrategy) && ["direct-service", "visual-results", "local-assurance"].includes(String(value.copyStrategy.voice))
    ? value.copyStrategy.voice as PreviewRenderPlan["copyStrategy"]["voice"]
    : derived.copyStrategy.voice;
  return {
    ...derived,
    version: value.version === "render-plan-v1" ? "render-plan-v1" : derived.version,
    direction,
    selectionRationale: typeof value.selectionRationale === "string" ? value.selectionRationale : derived.selectionRationale,
    heroVariant: ["image-led", "compact-service", "local-proof"].includes(String(value.heroVariant)) ? value.heroVariant as PreviewRenderPlan["heroVariant"] : derived.heroVariant,
    servicePresentation: ["balanced-grid", "featured-plus-secondary", "compact-list", "image-led-services", "alternating-service-spotlights"].includes(String(value.servicePresentation))
      ? value.servicePresentation as PreviewRenderPlan["servicePresentation"]
      : derived.servicePresentation,
    orderedSections: Array.isArray(value.orderedSections)
      ? value.orderedSections.filter((item): item is PreviewSectionId => sectionIds.has(item as PreviewSectionId))
      : derived.orderedSections,
    sectionDecisions: compatibleSections(value.sectionDecisions, derived.sectionDecisions),
    density: ["compact", "balanced", "spacious"].includes(String(value.density)) ? value.density as PreviewRenderPlan["density"] : derived.density,
    imageStrategy: ["business-photo-led", "trade-photo-led", "restrained-imagery"].includes(String(value.imageStrategy))
      ? value.imageStrategy as PreviewRenderPlan["imageStrategy"]
      : derived.imageStrategy,
    trustStrategy: ["verified-proof", "compact-local-facts", "contact-first"].includes(String(value.trustStrategy))
      ? value.trustStrategy as PreviewRenderPlan["trustStrategy"]
      : derived.trustStrategy,
    ctaStrategy: isRecord(value.ctaStrategy)
      ? {
          label: typeof value.ctaStrategy.label === "string" && value.ctaStrategy.label.trim() ? value.ctaStrategy.label : derived.ctaStrategy.label,
          phonePriority: typeof value.ctaStrategy.phonePriority === "boolean" ? value.ctaStrategy.phonePriority : derived.ctaStrategy.phonePriority,
          placement: ["persistent", "hero-and-final", "header-and-hero"].includes(String(value.ctaStrategy.placement))
            ? value.ctaStrategy.placement as PreviewRenderPlan["ctaStrategy"]["placement"]
            : derived.ctaStrategy.placement,
        }
      : derived.ctaStrategy,
    headerTreatment: ["official-logo", "structured-wordmark", "compact-wordmark"].includes(String(value.headerTreatment))
      ? value.headerTreatment as PreviewRenderPlan["headerTreatment"]
      : derived.headerTreatment,
    pageMode: value.pageMode === "concise" ? "concise" : value.pageMode === "full" ? "full" : derived.pageMode,
    copyStrategy: {
      voice: copyVoice,
      variant: isRecord(value.copyStrategy) ? Math.max(0, Math.min(2, Number(value.copyStrategy.variant) || 0)) : derived.copyStrategy.variant,
    },
    mobilePriorities: strings(value.mobilePriorities).length ? strings(value.mobilePriorities) : derived.mobilePriorities,
    avoidPatterns: strings(value.avoidPatterns).length ? strings(value.avoidPatterns) : derived.avoidPatterns,
    inputs: isRecord(value.inputs) ? { ...derived.inputs, ...value.inputs } as PreviewRenderPlan["inputs"] : derived.inputs,
  };
}

export function normalizePreviewForRender(prospect: Prospect, value: unknown): PreviewCompatibilityResult {
  if (!isRecord(value)) return { ok: false, message: "This preview record is malformed and could not be displayed safely." };
  const legacy = value as unknown as PreviewConcept;
  const requiredStrings = [legacy.direction, legacy.hero, legacy.heroHeadline, legacy.heroSupporting, legacy.ctaStrategy, legacy.leadCaptureStrategy];
  const requiredLists = [legacy.serviceHighlights, legacy.trustItems, legacy.homepageStructure, legacy.servicePageStructure];
  if (requiredStrings.some((field) => typeof field !== "string") || requiredLists.some((field) => !Array.isArray(field))) {
    return { ok: false, message: "This preview record is incomplete and could not be displayed safely." };
  }
  const serviceTitles = Array.isArray(legacy.serviceHierarchy)
    ? legacy.serviceHierarchy.flatMap((service) => isRecord(service) && typeof service.title === "string" ? [service.title] : [])
    : strings(legacy.serviceHighlights);
  const fallbackServices = (serviceTitles.length ? serviceTitles : [displayTradeCategory(prospect.trade)])
    .map((title) => ({ title, description: `Request an estimate for ${title.toLowerCase()}.` }));
  const fallbackImages = resolvePreviewImages(prospect, fallbackServices);
  const legacyFields: string[] = [];
  const images = compatibleImageSet(legacy.resolvedImages, fallbackImages, normalizeTradeCategory(prospect.trade) ?? "General Contractor", legacyFields);
  if (!images) return { ok: false, message: "This preview has malformed saved image data and could not be displayed safely." };
  const normalizedBase: PreviewConcept = {
    ...legacy,
    resolvedImages: images,
    serviceHierarchy: Array.isArray(legacy.serviceHierarchy) ? legacy.serviceHierarchy : undefined,
    serviceFidelity: isRecord(legacy.serviceFidelity) ? legacy.serviceFidelity : undefined,
    visualAssetQa: isRecord(legacy.visualAssetQa) ? legacy.visualAssetQa : undefined,
  };
  const renderPlan = compatibleRenderPlan(prospect, normalizedBase, legacy.renderPlan, legacyFields);
  return {
    ok: true,
    preview: { ...normalizedBase, renderPlan },
    legacyFields: [...new Set(legacyFields)],
  };
}
