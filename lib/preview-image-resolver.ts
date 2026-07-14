import {
  displayTradeCategory,
  normalizeTradeCategory,
  titleCaseLocation,
  type Prospect,
  type TradeCategory,
} from "@/lib/prospect-engine";

export type PreviewImageSlot =
  | "hero"
  | "service"
  | "gallery"
  | "beforeAfter"
  | "process"
  | "cta";

export type PreviewImageSource =
  | "business-photo"
  | "configured-stock-provider"
  | "curated-trade-library"
  | "neutral-fallback";

export type PreviewImageIntent = {
  id: string;
  slot: PreviewImageSlot;
  section: string;
  serviceTitle?: string;
  query: string;
  keywords: string[];
  purpose: string;
};

export type ResolvedPreviewImage = {
  id: string;
  slot: PreviewImageSlot;
  section: string;
  serviceTitle?: string;
  src: string;
  alt: string;
  source: PreviewImageSource;
  intent: PreviewImageIntent;
};

export type PreviewImageSet = {
  hero: ResolvedPreviewImage;
  services: [ResolvedPreviewImage, ResolvedPreviewImage, ResolvedPreviewImage];
  gallery: [ResolvedPreviewImage, ResolvedPreviewImage, ResolvedPreviewImage];
  beforeAfter: ResolvedPreviewImage;
  process: ResolvedPreviewImage;
  cta: ResolvedPreviewImage;
  intents: PreviewImageIntent[];
  sourceStatus: string;
  providerStatus: "not configured" | "configured";
  warnings: string[];
};

type ServiceInput = {
  title: string;
  description: string;
};

type CatalogSlot = "hero" | "service" | "detail" | "support" | "proof";

type CatalogEntry = {
  slug: string;
  tradeKeywords: string[];
  slotKeywords: Record<CatalogSlot, string[]>;
};

const catalog: Record<TradeCategory, CatalogEntry> = {
  Roofing: {
    slug: "roofing",
    tradeKeywords: ["roof", "shingles", "inspection", "gutter", "exterior"],
    slotKeywords: {
      hero: ["roofline", "home exterior", "shingle roof"],
      service: ["roof repair", "shingles", "flashing"],
      detail: ["roof materials", "repair detail", "surface"],
      support: ["roof inspection", "gutter edge", "exterior detail"],
      proof: ["finished roof", "inspection", "roof surface"],
    },
  },
  HVAC: {
    slug: "hvac",
    tradeKeywords: ["hvac", "heating", "cooling", "furnace", "ac condenser"],
    slotKeywords: {
      hero: ["outdoor ac condenser", "home comfort", "hvac service"],
      service: ["furnace", "air handler", "technician tools"],
      detail: ["ductwork", "vent", "thermostat"],
      support: ["service call", "technician", "ac condenser"],
      proof: ["thermostat", "vent", "home comfort"],
    },
  },
  Landscaping: {
    slug: "landscaping",
    tradeKeywords: ["landscaping", "lawn", "planting", "patio", "outdoor"],
    slotKeywords: {
      hero: ["lawn", "planting beds", "outdoor space"],
      service: ["mulch", "edging", "planting"],
      detail: ["lawn detail", "garden bed", "landscape work"],
      support: ["patio edge", "finished yard", "outdoor living"],
      proof: ["finished patio", "shrubs", "outdoor space"],
    },
  },
  Plumbing: {
    slug: "plumbing",
    tradeKeywords: ["plumbing", "pipes", "water heater", "sink", "fixtures"],
    slotKeywords: {
      hero: ["under-sink service", "pipes", "repair tools"],
      service: ["water heater", "pipe fittings", "service tools"],
      detail: ["fixture", "repair access", "supply lines"],
      support: ["drain lines", "tools", "service call"],
      proof: ["drain trap", "supply lines", "clean repair"],
    },
  },
  Electrical: {
    slug: "electrical",
    tradeKeywords: ["electrical", "breaker panel", "wiring", "lighting", "electrician"],
    slotKeywords: {
      hero: ["breaker panel", "residential electrical", "insulated tools"],
      service: ["panel service", "tools", "safe work"],
      detail: ["wiring", "panel detail", "circuit work"],
      support: ["lighting install", "fixture", "electrical upgrade"],
      proof: ["lighting", "tools", "clean work area"],
    },
  },
  "Pressure Washing": {
    slug: "power-washing",
    tradeKeywords: ["pressure washing", "siding", "driveway", "soft washing", "exterior cleaning"],
    slotKeywords: {
      hero: ["pressure washer", "exterior cleaning", "spray equipment"],
      service: ["house washing", "siding wash", "exterior surface"],
      detail: ["spray equipment", "siding", "surface cleaning"],
      support: ["driveway cleaning", "walkway", "concrete wash"],
      proof: ["clean driveway", "exterior surface", "before after"],
    },
  },
  Painting: {
    slug: "painting",
    tradeKeywords: ["painting", "roller", "trim", "paint prep", "room refresh"],
    slotKeywords: {
      hero: ["roller", "wall finish", "trim"],
      service: ["paint tray", "trim", "prep"],
      detail: ["surface prep", "finish work", "paint detail"],
      support: ["refreshed room", "trim detail", "interior"],
      proof: ["finish detail", "roller", "clean trim"],
    },
  },
  Concrete: {
    slug: "concrete",
    tradeKeywords: ["concrete", "driveway", "patio", "walkway", "flatwork"],
    slotKeywords: {
      hero: ["driveway", "walkway", "flatwork"],
      service: ["trowel", "surface finish", "concrete detail"],
      detail: ["finishing", "clean edge", "flatwork"],
      support: ["walkway", "completed surface", "patio"],
      proof: ["driveway", "finished concrete", "walkway"],
    },
  },
  Cleaning: {
    slug: "cleaning",
    tradeKeywords: ["cleaning", "clean interior", "supplies", "equipment", "room"],
    slotKeywords: {
      hero: ["clean interior", "organized service", "equipment"],
      service: ["cleaning supplies", "clean room", "equipment"],
      detail: ["detail cleaning", "organized work", "supplies"],
      support: ["refreshed interior", "clean surfaces", "room"],
      proof: ["fresh interior", "cleaning equipment", "finished clean"],
    },
  },
  "Tree Service": {
    slug: "tree-service",
    tradeKeywords: ["tree service", "trimming", "removal", "cleanup", "equipment"],
    slotKeywords: {
      hero: ["tree care", "trimming", "outdoor equipment"],
      service: ["tree trimming", "removal equipment", "cleanup"],
      detail: ["limb trimming", "safety", "tree work"],
      support: ["equipment", "cleanup", "yard"],
      proof: ["trimming", "yard cleanup", "equipment"],
    },
  },
  Fencing: {
    slug: "fencing",
    tradeKeywords: ["fencing", "fence panels", "gate", "yard", "boundary"],
    slotKeywords: {
      hero: ["fence panels", "gate", "yard boundary"],
      service: ["gate", "fence line", "materials"],
      detail: ["fence materials", "installation", "posts"],
      support: ["finished yard", "gate", "privacy fence"],
      proof: ["installed fence", "gate", "yard"],
    },
  },
  Flooring: {
    slug: "flooring",
    tradeKeywords: ["flooring", "hardwood", "tile", "plank", "installation"],
    slotKeywords: {
      hero: ["hardwood planks", "tile", "installation"],
      service: ["tile", "planks", "tools"],
      detail: ["material texture", "floor install", "detail"],
      support: ["finished floor", "room", "surface"],
      proof: ["installed floor", "tile", "plank detail"],
    },
  },
  Remodeling: {
    slug: "remodeling",
    tradeKeywords: ["remodeling", "kitchen", "bath", "materials", "interior"],
    slotKeywords: {
      hero: ["kitchen", "bath", "room planning"],
      service: ["bath", "kitchen", "room improvement"],
      detail: ["materials", "planning", "detail"],
      support: ["finished interior", "updated room", "remodel"],
      proof: ["kitchen", "bath", "material detail"],
    },
  },
  "General Contractor": {
    slug: "general-contractor",
    tradeKeywords: ["construction", "framing", "materials", "blueprint", "project"],
    slotKeywords: {
      hero: ["framing", "materials", "project planning"],
      service: ["blueprint", "framing", "build process"],
      detail: ["construction detail", "materials", "framing"],
      support: ["planning", "build", "site work"],
      proof: ["materials", "framing", "project context"],
    },
  },
};

function safeImageUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/engine-preview-assets/")) return trimmed;
  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("/prospect-assets/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((param) => url.searchParams.delete(param));
    return url.toString();
  } catch {
    return "";
  }
}

function approvedBusinessPhotos(prospect: Prospect) {
  const record = prospect as unknown as Record<string, unknown>;
  const raw = [
    record.approvedPreviewPhotos,
    record.approvedBusinessPhotos,
    record.businessPhotos,
    record.photoUrls,
  ].flatMap((value) => Array.isArray(value) ? value : []);
  return [...new Set(raw.map(safeImageUrl).filter(Boolean))];
}

function configuredStockImages(environment: NodeJS.ProcessEnv) {
  const raw = environment.PREVIEW_STOCK_IMAGE_MANIFEST_JSON || environment.PREVIEW_STOCK_IMAGE_MANIFEST || "";
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(safeImageUrl).filter(Boolean))];
  } catch {
    return [];
  }
}

function curatedPhoto(slug: string, slot: CatalogSlot) {
  return `/engine-preview-assets/trade-photos/${slug}-${slot}.jpg`;
}

function buildIntent(
  trade: TradeCategory,
  prospect: Prospect,
  section: string,
  slot: PreviewImageSlot,
  catalogSlot: CatalogSlot,
  serviceTitle = "",
): PreviewImageIntent {
  const displayTrade = displayTradeCategory(trade);
  const city = titleCaseLocation(prospect.city);
  const entry = catalog[trade];
  const keywords = [...new Set([serviceTitle, ...entry.tradeKeywords, ...entry.slotKeywords[catalogSlot]].filter(Boolean))];
  const regionalPhrase = city ? ` near ${city}` : "";
  return {
    id: `${slot}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    slot,
    section,
    serviceTitle,
    query: `${keywords.slice(0, 4).join(" ")}${regionalPhrase}`,
    keywords,
    purpose: `${section} image for ${serviceTitle || displayTrade}`,
  };
}

function imageAlt(prospect: Prospect, intent: PreviewImageIntent) {
  const city = titleCaseLocation(prospect.city);
  const service = intent.serviceTitle || displayTradeCategory(prospect.trade);
  const details = intent.keywords
    .filter((keyword) => keyword && keyword.toLowerCase() !== service.toLowerCase())
    .slice(-3)
    .join(", ");
  return `${service} service photo${details ? ` with ${details}` : ""}${city ? ` for ${city} customers` : ""}`;
}

function imageFrom(
  prospect: Prospect,
  intent: PreviewImageIntent,
  src: string,
  source: PreviewImageSource,
): ResolvedPreviewImage {
  return {
    id: intent.id,
    slot: intent.slot,
    section: intent.section,
    serviceTitle: intent.serviceTitle,
    src,
    alt: imageAlt(prospect, intent),
    source,
    intent,
  };
}

function sourceForIndex(
  prospect: Prospect,
  intent: PreviewImageIntent,
  catalogEntry: CatalogEntry,
  catalogSlot: CatalogSlot,
  index: number,
  businessPhotos: string[],
  stockPhotos: string[],
): ResolvedPreviewImage {
  const businessPhoto = businessPhotos[index % Math.max(1, businessPhotos.length)];
  if (businessPhoto) return imageFrom(prospect, intent, businessPhoto, "business-photo");
  const stockPhoto = stockPhotos[index % Math.max(1, stockPhotos.length)];
  if (stockPhoto) return imageFrom(prospect, intent, stockPhoto, "configured-stock-provider");
  return imageFrom(prospect, intent, curatedPhoto(catalogEntry.slug, catalogSlot), "curated-trade-library");
}

export function resolvePreviewImages(
  prospect: Prospect,
  services: readonly [ServiceInput, ServiceInput, ServiceInput],
  environment: NodeJS.ProcessEnv = process.env,
): PreviewImageSet {
  const trade = normalizeTradeCategory(prospect.trade) ?? "General Contractor";
  const entry = catalog[trade];
  const businessPhotos = approvedBusinessPhotos(prospect);
  const stockPhotos = configuredStockImages(environment);
  const providerStatus = stockPhotos.length ? "configured" : "not configured";

  const heroIntent = buildIntent(trade, prospect, "Hero", "hero", "hero");
  const serviceIntents = services.map((service, index) => {
    const slot = (["service", "detail", "support"] as const)[index] ?? "service";
    return buildIntent(trade, prospect, service.title, "service", slot, service.title);
  }) as [PreviewImageIntent, PreviewImageIntent, PreviewImageIntent];
  const proofIntent = buildIntent(trade, prospect, "Service results", "gallery", "proof");
  const beforeAfterIntent = buildIntent(trade, prospect, "Comparison", "beforeAfter", "proof", services[0].title);
  const processIntent = buildIntent(trade, prospect, "Process", "process", "support");
  const ctaIntent = buildIntent(trade, prospect, "Quote request", "cta", "detail");

  const hero = sourceForIndex(prospect, heroIntent, entry, "hero", 0, businessPhotos, stockPhotos);
  const resolvedServices = serviceIntents.map((intent, index) => {
    const slot = (["service", "detail", "support"] as const)[index] ?? "service";
    return sourceForIndex(prospect, intent, entry, slot, index + 1, businessPhotos, stockPhotos);
  }) as [ResolvedPreviewImage, ResolvedPreviewImage, ResolvedPreviewImage];
  const gallery = [
    sourceForIndex(prospect, buildIntent(trade, prospect, "Gallery detail", "gallery", "detail"), entry, "detail", 4, businessPhotos, stockPhotos),
    sourceForIndex(prospect, buildIntent(trade, prospect, "Gallery equipment", "gallery", "support"), entry, "support", 5, businessPhotos, stockPhotos),
    sourceForIndex(prospect, proofIntent, entry, "proof", 6, businessPhotos, stockPhotos),
  ] as [ResolvedPreviewImage, ResolvedPreviewImage, ResolvedPreviewImage];
  const beforeAfter = sourceForIndex(prospect, beforeAfterIntent, entry, "proof", 7, businessPhotos, stockPhotos);
  const process = sourceForIndex(prospect, processIntent, entry, "support", 8, businessPhotos, stockPhotos);
  const cta = sourceForIndex(prospect, ctaIntent, entry, "detail", 9, businessPhotos, stockPhotos);
  const all = [hero, ...resolvedServices, ...gallery, beforeAfter, process, cta];
  const warnings = validatePreviewImages(all).warnings;

  return {
    hero,
    services: resolvedServices,
    gallery,
    beforeAfter,
    process,
    cta,
    intents: [heroIntent, ...serviceIntents, proofIntent, beforeAfterIntent, processIntent, ctaIntent],
    sourceStatus: businessPhotos.length
      ? "approved business photos"
      : stockPhotos.length
        ? "configured stock provider"
        : "curated trade photo library",
    providerStatus,
    warnings,
  };
}

export function validatePreviewImages(images: readonly ResolvedPreviewImage[]) {
  const warnings: string[] = [];
  const bySrc = new Map<string, number>();
  for (const image of images) bySrc.set(image.src, (bySrc.get(image.src) ?? 0) + 1);
  const maxReuse = Math.max(...bySrc.values(), 0);
  if (maxReuse > Math.ceil(images.length / 2)) warnings.push("One image is used across too much of the preview.");
  if (images[0]?.source === "neutral-fallback") warnings.push("Hero image resolved to a neutral fallback.");
  if (images.some((image) => !safeImageUrl(image.src))) warnings.push("One or more preview image URLs are unsafe.");
  if (images.some((image) => image.source === "neutral-fallback")) warnings.push("A photographic image was unavailable for at least one section.");
  return {
    ok: warnings.length === 0,
    warnings,
    distinctImageCount: bySrc.size,
    repeatedImageCount: [...bySrc.values()].filter((count) => count > 1).length,
  };
}

export function previewImageCatalogSlugs() {
  return Object.fromEntries(Object.entries(catalog).map(([trade, entry]) => [trade, entry.slug])) as Record<TradeCategory, string>;
}
