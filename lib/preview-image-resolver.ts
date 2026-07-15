import type { Prospect, PreviewConcept, TradeCategory } from "@/lib/prospect-engine";

const tradeCategories = [
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

function normalizeTradeCategory(value: string): TradeCategory | undefined {
  const normalized = value.trim().toLowerCase().replace(/&/g, "and");
  if (normalized === "hvac") return "HVAC";
  if (normalized === "power washing" || normalized === "pressure washing") return "Pressure Washing";
  return tradeCategories.find((trade) => trade.toLowerCase() === normalized);
}

function displayTradeCategory(value: string) {
  return normalizeTradeCategory(value)?.replace("HVAC", "HVAC") ?? value;
}

function titleCaseLocation(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (character) => character.toUpperCase());
}

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
  | "curated-stock-photo-library"
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
  resolvedAt?: string;
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

type CuratedStockPhoto = {
  id?: string;
  src?: string;
  keywords: string[];
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

function unsplashPhoto(id: string) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1800&q=82`;
}

const curatedStockCatalog: Partial<Record<TradeCategory, CuratedStockPhoto[]>> = {
  "Pressure Washing": [
    {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Concrete_Cleaning_with_a_Surface_Cleaner.jpg/900px-Concrete_Cleaning_with_a_Surface_Cleaner.jpg",
      keywords: ["pressure washing", "concrete cleaning", "driveway cleaning", "walkway cleaning", "residential concrete", "surface cleaner", "water spray", "verified exterior cleaning photo"],
    },
    {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/ArborBay2.jpg/900px-ArborBay2.jpg",
      keywords: ["soft washing", "roof cleaning", "residential roof", "roofline", "soft-wash system", "exterior cleaning", "verified exterior cleaning photo"],
    },
  ],
  Roofing: [
    { id: "photo-1635424824849-1b09bdcc55b1", keywords: ["roofer", "roof inspection", "shingles"] },
    { id: "photo-1635424709845-3a85ad5e1f5e", keywords: ["roofing crew", "roof repair", "roofline"] },
    { id: "photo-1632759145355-b0c7f70a2558", keywords: ["roof", "shingles", "home exterior"] },
    { id: "photo-1599139574071-585d8cf395f0", keywords: ["shingle roof", "roof detail", "exterior"] },
    { id: "photo-1600573472550-8090b5e0745e", keywords: ["finished home", "roofline", "residential exterior"] },
  ],
  HVAC: [
    { id: "photo-1718203862467-c33159fdc504", keywords: ["outdoor AC condenser", "hvac equipment", "cooling"] },
    { id: "photo-1700124113583-81aa99ea2aa2", keywords: ["HVAC unit", "air conditioner", "service"] },
    { id: "photo-1581092160562-40aa08e78837", keywords: ["technician tools", "maintenance", "mechanical service"] },
    { id: "photo-1581091226825-a6a2a5aee158", keywords: ["technician", "service call", "equipment"] },
    { id: "photo-1600566752355-35792bedcfea", keywords: ["home comfort", "interior", "thermostat-ready home"] },
  ],
  Landscaping: [
    { id: "photo-1734079692160-fcbe4be6ab96", keywords: ["landscaping worker", "wheelbarrow", "lawn"] },
    { id: "photo-1734303023491-db8037a21f09", keywords: ["landscaping crew", "lawn care", "outdoor space"] },
    { id: "photo-1558904541-efa843a96f01", keywords: ["garden bed", "planting", "landscape"] },
    { id: "photo-1598902108854-10e335adac99", keywords: ["lawn", "yard", "garden maintenance"] },
    { id: "photo-1629219519687-f9a4eb7d3b1c", keywords: ["patio", "hardscape", "outdoor living"] },
  ],
  Plumbing: [
    { id: "photo-1676210134188-4c05dd172f89", keywords: ["plumber", "under-sink", "repair"] },
    { id: "photo-1676210133055-eab6ef033ce3", keywords: ["plumber", "pipes", "sink repair"] },
    { id: "photo-1542013936693-884638332954", keywords: ["faucet", "fixture", "water"] },
    { id: "photo-1585704032915-c3400ca199e7", keywords: ["tools", "repair", "service call"] },
    { id: "photo-1607472586893-edb57bdc0e39", keywords: ["bathroom fixture", "plumbing", "sink"] },
  ],
  Electrical: [
    { id: "photo-1621905252507-b35492cc74b4", keywords: ["electrician", "breaker panel", "wiring"] },
    { id: "photo-1509391366360-2e959784a276", keywords: ["electrical", "solar panel", "power"] },
    { id: "photo-1518770660439-4636190af475", keywords: ["circuit", "wiring", "technical detail"] },
    { id: "photo-1558618666-fcd25c85cd64", keywords: ["lighting", "installation", "interior"] },
    { id: "photo-1581092160562-40aa08e78837", keywords: ["tools", "technician", "safe work"] },
  ],
  Concrete: [
    { id: "photo-1621947081720-86970823b77a", keywords: ["concrete", "driveway", "finished surface"] },
    { id: "photo-1599995903128-531fc7fb694b", keywords: ["concrete", "walkway", "patio"] },
    { id: "photo-1590644365607-1c5a939a6f38", keywords: ["concrete", "surface", "flatwork"] },
    { id: "photo-1597007066704-67bf2068d5b5", keywords: ["driveway", "home exterior", "concrete"] },
    { id: "photo-1600585154340-be6161a56a0c", keywords: ["house", "driveway", "residential exterior"] },
  ],
  Painting: [
    { id: "photo-1742900280861-32bed068938b", keywords: ["exterior painting", "ladder", "paint roller"] },
    { id: "photo-1717281234297-3def5ae3eee1", keywords: ["interior painter", "wall painting", "prep"] },
    { id: "photo-1589939705384-5185137a7f0f", keywords: ["paint roller", "wall", "interior painting"] },
    { id: "photo-1562259949-e8e7689d7828", keywords: ["paint", "roller", "home improvement"] },
    { id: "photo-1503387762-592deb58ef4e", keywords: ["interior", "wall finish", "painting"] },
  ],
  Cleaning: [
    { id: "photo-1581578731548-c64695cc6952", keywords: ["cleaning", "supplies", "interior"] },
    { id: "photo-1563453392212-326f5e854473", keywords: ["cleaning service", "home", "surface"] },
    { id: "photo-1528744598421-b7b93e12df44", keywords: ["clean interior", "home", "room"] },
    { id: "photo-1584622650111-993a426fbf0a", keywords: ["bathroom", "clean surface", "home"] },
    { id: "photo-1593702288056-7927b7c52dd8", keywords: ["cleaning tools", "home care", "equipment"] },
  ],
  "Tree Service": [
    { id: "photo-1520412099551-62b6bafeb5bb", keywords: ["tree", "trimming", "outdoor"] },
    { id: "photo-1513836279014-a89f7a76ae86", keywords: ["trees", "canopy", "tree care"] },
    { id: "photo-1597520425495-3f081d8dcc98", keywords: ["chainsaw", "tree work", "equipment"] },
    { id: "photo-1523712999610-f77fbcfc3843", keywords: ["tree", "yard", "cleanup"] },
    { id: "photo-1448375240586-882707db888b", keywords: ["trees", "outdoor", "service area"] },
  ],
  Fencing: [
    { id: "photo-1564013799919-ab600027ffc6", keywords: ["yard", "fence", "home exterior"] },
    { id: "photo-1593604572571-e01c35fce4aa", keywords: ["wood fence", "yard", "privacy"] },
    { id: "photo-1600607687939-ce8a6c25118c", keywords: ["home exterior", "gate", "yard"] },
    { id: "photo-1600566753190-17f0baa2a6c3", keywords: ["backyard", "fence", "outdoor"] },
    { id: "photo-1600585154340-be6161a56a0c", keywords: ["residential exterior", "property", "yard"] },
  ],
  Flooring: [
    { id: "photo-1600121848594-d8644e57abab", keywords: ["flooring", "wood floor", "room"] },
    { id: "photo-1586023492125-27b2c045efd7", keywords: ["finished floor", "living room", "interior"] },
    { id: "photo-1513694203232-719a280e022f", keywords: ["wood floor", "interior", "room"] },
    { id: "photo-1616046229478-9901c5536a45", keywords: ["floor", "home interior", "installation context"] },
    { id: "photo-1600210492486-724fe5c67fb0", keywords: ["interior", "flooring", "finished room"] },
  ],
  Remodeling: [
    { id: "photo-1600566753086-00f18fb6b3ea", keywords: ["kitchen remodel", "interior", "home update"] },
    { id: "photo-1600585154526-990dced4db0d", keywords: ["bathroom", "remodel", "interior"] },
    { id: "photo-1600607687920-4e2a09cf159d", keywords: ["home interior", "renovation", "finished room"] },
    { id: "photo-1600566752355-35792bedcfea", keywords: ["living space", "home update", "interior"] },
    { id: "photo-1600585154340-be6161a56a0c", keywords: ["home exterior", "project", "residential"] },
  ],
  "General Contractor": [
    { id: "photo-1503387762-592deb58ef4e", keywords: ["construction", "tools", "project"] },
    { id: "photo-1541888946425-d81bb19240f5", keywords: ["construction site", "equipment", "building"] },
    { id: "photo-1504307651254-35680f356dfd", keywords: ["contractor", "construction", "planning"] },
    { id: "photo-1581092160562-40aa08e78837", keywords: ["tools", "technician", "work"] },
    { id: "photo-1600585154340-be6161a56a0c", keywords: ["home exterior", "project", "residential"] },
  ],
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

function serviceCatalogSlot(trade: TradeCategory, serviceTitle: string, index: number): CatalogSlot {
  const title = serviceTitle.toLowerCase();
  if (trade === "Pressure Washing") {
    if (/house|siding|exterior/.test(title)) return "service";
    if (/concrete|driveway|walk|patio|paver/.test(title)) return "support";
    if (/roof|soft/.test(title)) return "detail";
  }
  if (trade === "Landscaping") {
    if (/install|plant|bed|mulch/.test(title)) return "service";
    if (/season|maintenance|lawn/.test(title)) return "detail";
    if (/hardscape|patio|outdoor/.test(title)) return "support";
  }
  if (trade === "Roofing") {
    if (/repair|leak|shingle/.test(title)) return "service";
    if (/replacement|material/.test(title)) return "detail";
    if (/storm|inspection/.test(title)) return "support";
  }
  if (trade === "HVAC") {
    if (/repair|heating|cooling/.test(title)) return "service";
    if (/install|system/.test(title)) return "detail";
    if (/maintenance|tune/.test(title)) return "support";
  }
  return (["service", "detail", "support"] as const)[index] ?? "service";
}

function serviceSpecificKeywords(trade: TradeCategory, serviceTitle: string) {
  const title = serviceTitle.toLowerCase();
  if (trade === "Pressure Washing") {
    if (/house|siding|exterior/.test(title)) return ["house washing", "siding", "exterior wall cleaning"];
    if (/concrete|driveway|walk|patio|paver/.test(title)) return ["driveway cleaning", "concrete surface", "walkway wash"];
    if (/roof|soft/.test(title)) return ["roof soft washing", "roofline", "low-pressure cleaning"];
  }
  if (/emergency/.test(title)) return ["urgent service", "service call", "technician"];
  if (/maintenance|tune/.test(title)) return ["maintenance", "inspection", "equipment check"];
  return [];
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

function seededIndex(seed: string, length: number) {
  if (length <= 0) return 0;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

function curatedStockSources(trade: TradeCategory, prospect: Prospect) {
  const photos = curatedStockCatalog[trade] ?? curatedStockCatalog["General Contractor"] ?? [];
  const start = seededIndex(`${prospect.businessName}|${prospect.city}|${trade}`, photos.length);
  const ordered = [...photos.slice(start), ...photos.slice(0, start)];
  return ordered.map((photo) => ({
    src: safeImageUrl(photo.src ?? (photo.id ? unsplashPhoto(photo.id) : "")),
    keywords: photo.keywords,
  })).filter((photo) => photo.src);
}

function textTokens(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function serviceNeedKeywords(trade: TradeCategory, intent: PreviewImageIntent) {
  const service = (intent.serviceTitle ?? intent.section).toLowerCase();
  if (trade === "Pressure Washing") {
    if (/house|siding|exterior/.test(service)) return ["house", "siding", "exterior", "residential", "home", "brick", "stucco"];
    if (/concrete|driveway|walk|patio|paver/.test(service)) return ["concrete", "driveway", "walkway", "patio", "paver", "residential"];
    if (/roof|soft/.test(service)) return ["roof", "soft", "roofline", "residential"];
    if (intent.slot === "hero") return ["residential", "exterior", "home", "clean", "driveway"];
  }
  return [];
}

function photoRelevanceScore(trade: TradeCategory, intent: PreviewImageIntent, photo: { src: string; keywords: string[] }, usedSources: Set<string>) {
  const desired = textTokens([...intent.keywords, ...serviceNeedKeywords(trade, intent), intent.section, intent.serviceTitle ?? ""].join(" "));
  const available = textTokens(photo.keywords.join(" "));
  let score = usedSources.has(photo.src) ? -12 : 0;
  for (const token of desired) {
    if (available.has(token)) score += 3;
  }
  const service = (intent.serviceTitle ?? intent.section).toLowerCase();
  const keywords = photo.keywords.join(" ").toLowerCase();
  if (trade === "Pressure Washing") {
    if (/municipal|street|sidewalk|commercial surface|industrial/.test(keywords)) score -= 30;
    if (/architecture|interior|room|pool|luxury house|real estate|landscaping/.test(keywords)) score -= 36;
    if (/house|siding|exterior/.test(service) && /house washing|siding washing|siding cleaning|residential siding|home exterior cleaning/.test(keywords)) score += 18;
    if (/house|siding|exterior/.test(service) && !/house washing|siding washing|siding cleaning|water spray|pressure washing/.test(keywords)) score -= 24;
    if (/concrete|driveway|walk|patio|paver/.test(service) && /concrete cleaning|driveway cleaning|walkway cleaning|patio cleaning|surface cleaner|pressure washing/.test(keywords)) score += 20;
    if (/roof|soft/.test(service) && /roof cleaning|soft washing|soft-wash|roofline/.test(keywords)) score += 20;
    if (intent.slot === "hero") {
      if (/pressure washing|exterior cleaning|driveway cleaning|concrete cleaning|house washing|siding cleaning|soft washing|roof cleaning/.test(keywords)) score += 22;
      if (/driveway|patio|walkway/.test(keywords)) score += 8;
      if (/roof|roofline|soft washing/.test(keywords)) score -= 4;
    }
  }
  return score;
}

function selectCuratedStockPhoto(
  trade: TradeCategory,
  intent: PreviewImageIntent,
  curatedStockPhotos: Array<{ src: string; keywords: string[] }>,
  usedSources: Set<string>,
  seed: string,
) {
  const scored = curatedStockPhotos
    .map((photo, index) => ({ photo, index, score: photoRelevanceScore(trade, intent, photo, usedSources) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (intent.slot === "hero") {
    const bestScore = scored[0]?.score ?? 0;
    const acceptableHero = scored
      .filter((candidate) => candidate.score >= Math.max(6, bestScore - 22))
      .sort((a, b) => a.index - b.index);
    const heroPool = acceptableHero.filter((candidate) => !usedSources.has(candidate.photo.src));
    const selectedPool = heroPool.length ? heroPool : acceptableHero;
    const selected = selectedPool[seededIndex(seed, selectedPool.length)] ?? selectedPool[0];
    return selected?.photo
      ?? curatedStockPhotos[0];
  }
  return scored.find((candidate) => !usedSources.has(candidate.photo.src) || candidate.score > 0)?.photo
    ?? curatedStockPhotos.find((photo) => !usedSources.has(photo.src))
    ?? curatedStockPhotos[0];
}

function selectConfiguredImage(images: string[], index: number, usedSources: Set<string>) {
  if (!images.length) return "";
  const start = index % images.length;
  const ordered = [...images.slice(start), ...images.slice(0, start)];
  return ordered.find((src) => !usedSources.has(src)) ?? ordered[0] ?? "";
}

function sourceForIndex(
  prospect: Prospect,
  trade: TradeCategory,
  intent: PreviewImageIntent,
  catalogEntry: CatalogEntry,
  catalogSlot: CatalogSlot,
  index: number,
  businessPhotos: string[],
  stockPhotos: string[],
  curatedStockPhotos: Array<{ src: string; keywords: string[] }>,
  usedSources: Set<string>,
): ResolvedPreviewImage {
  const businessPhoto = selectConfiguredImage(businessPhotos, index, usedSources);
  if (businessPhoto) {
    usedSources.add(businessPhoto);
    return imageFrom(prospect, intent, businessPhoto, "business-photo");
  }
  const stockPhoto = selectConfiguredImage(stockPhotos, index, usedSources);
  if (stockPhoto) {
    usedSources.add(stockPhoto);
    return imageFrom(prospect, intent, stockPhoto, "configured-stock-provider");
  }
  const curatedStockPhoto = selectCuratedStockPhoto(trade, intent, curatedStockPhotos, usedSources, `${prospect.businessName}|${prospect.city}|${prospect.state}|${intent.id}|${index}`);
  if (curatedStockPhoto?.src) {
    usedSources.add(curatedStockPhoto.src);
    const curatedIntent = {
      ...intent,
      keywords: curatedStockPhoto.keywords,
    };
    return imageFrom(prospect, curatedIntent, curatedStockPhoto.src, "curated-stock-photo-library");
  }
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
  const curatedStockPhotos = curatedStockSources(trade, prospect);
  const providerStatus = stockPhotos.length ? "configured" : "not configured";
  const usedSources = new Set<string>();

  const heroIntent = buildIntent(trade, prospect, "Hero", "hero", "hero");
  const serviceIntents = services.map((service, index) => {
    const slot = serviceCatalogSlot(trade, service.title, index);
    const intent = buildIntent(trade, prospect, service.title, "service", slot, service.title);
    return { ...intent, keywords: [...new Set([...serviceSpecificKeywords(trade, service.title), ...intent.keywords])] };
  }) as [PreviewImageIntent, PreviewImageIntent, PreviewImageIntent];
  const proofIntent = buildIntent(trade, prospect, "Service results", "gallery", "proof");
  const beforeAfterIntent = buildIntent(trade, prospect, "Comparison", "beforeAfter", "proof", services[0].title);
  const processIntent = buildIntent(trade, prospect, "Process", "process", "support");
  const ctaIntent = buildIntent(trade, prospect, "Quote request", "cta", "detail");

  const hero = sourceForIndex(prospect, trade, heroIntent, entry, "hero", 0, businessPhotos, stockPhotos, curatedStockPhotos, usedSources);
  const resolvedServices = serviceIntents.map((intent, index) => {
    const slot = serviceCatalogSlot(trade, services[index].title, index);
    return sourceForIndex(prospect, trade, intent, entry, slot, index + 1, businessPhotos, stockPhotos, curatedStockPhotos, usedSources);
  }) as [ResolvedPreviewImage, ResolvedPreviewImage, ResolvedPreviewImage];
  const gallery = [
    sourceForIndex(prospect, trade, buildIntent(trade, prospect, "Gallery detail", "gallery", "detail"), entry, "detail", 4, businessPhotos, stockPhotos, curatedStockPhotos, usedSources),
    sourceForIndex(prospect, trade, buildIntent(trade, prospect, "Gallery equipment", "gallery", "support"), entry, "support", 5, businessPhotos, stockPhotos, curatedStockPhotos, usedSources),
    sourceForIndex(prospect, trade, proofIntent, entry, "proof", 6, businessPhotos, stockPhotos, curatedStockPhotos, usedSources),
  ] as [ResolvedPreviewImage, ResolvedPreviewImage, ResolvedPreviewImage];
  const beforeAfter = sourceForIndex(prospect, trade, beforeAfterIntent, entry, "proof", 7, businessPhotos, stockPhotos, curatedStockPhotos, usedSources);
  const process = sourceForIndex(prospect, trade, processIntent, entry, "support", 8, businessPhotos, stockPhotos, curatedStockPhotos, usedSources);
  const cta = sourceForIndex(prospect, trade, ctaIntent, entry, "detail", 9, businessPhotos, stockPhotos, curatedStockPhotos, usedSources);
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
        : curatedStockPhotos.length
          ? "curated stock photo library"
          : "curated trade fallback library",
    providerStatus,
    warnings,
    resolvedAt: new Date().toISOString(),
  };
}

export function attachResolvedPreviewImages(
  prospect: Prospect,
  preview: PreviewConcept,
  environment: NodeJS.ProcessEnv = process.env,
): PreviewConcept {
  const services = [
    { title: preview.serviceHighlights?.[0] ?? displayTradeCategory(prospect.trade), description: "Primary service." },
    { title: preview.serviceHighlights?.[1] ?? "Service planning", description: "Secondary service." },
    { title: preview.serviceHighlights?.[2] ?? "Estimate request", description: "Supporting service." },
  ] as const;
  const resolvedImages = resolvePreviewImages(prospect, services, environment);
  return {
    ...preview,
    creativeBrief: preview.creativeBrief
      ? {
          ...preview.creativeBrief,
          imagerySource: resolvedImages.sourceStatus === "approved business photos"
            ? "business assets"
            : resolvedImages.sourceStatus === "configured stock provider"
              ? "configured stock provider"
              : resolvedImages.sourceStatus === "curated stock photo library"
                ? "curated stock photo library"
                : "trade photo library",
          imageIntents: resolvedImages.intents.map((intent) => `${intent.section}: ${intent.query}`),
        }
      : preview.creativeBrief,
    artDirection: preview.artDirection
      ? {
          ...preview.artDirection,
          imageryPlan: resolvedImages.intents.map((intent) => `${intent.slot}: ${intent.query}`),
          qaWarnings: [...new Set([...(preview.artDirection.qaWarnings ?? []), ...resolvedImages.warnings])],
        }
      : preview.artDirection,
    resolvedImages,
  };
}

export function validatePreviewImages(images: readonly ResolvedPreviewImage[]) {
  const warnings: string[] = [];
  const bySrc = new Map<string, number>();
  for (const image of images) bySrc.set(image.src, (bySrc.get(image.src) ?? 0) + 1);
  const maxReuse = Math.max(...bySrc.values(), 0);
  if (maxReuse > Math.ceil(images.length / 2)) warnings.push("One image is used across too much of the preview.");
  if (maxReuse > 2) warnings.push("The preview repeats one image more than twice.");
  if (images[0]?.source === "neutral-fallback") warnings.push("Hero image resolved to a neutral fallback.");
  if (images[0]?.source === "curated-trade-library") warnings.push("Hero image resolved to illustration fallback instead of photography.");
  if (images.some((image) => !safeImageUrl(image.src))) warnings.push("One or more preview image URLs are unsafe.");
  if (images.some((image) => image.source === "neutral-fallback")) warnings.push("A photographic image was unavailable for at least one section.");
  if (images.some((image) => image.source === "curated-trade-library")) warnings.push("One or more sections used illustration fallback instead of photography.");
  for (const image of images) {
    const service = image.serviceTitle?.toLowerCase() ?? "";
    const blob = `${image.src} ${image.intent.keywords.join(" ")}`.toLowerCase();
    const pressureWashingContext = /pressure washing|house washing|concrete cleaning|soft washing|exterior cleaning/.test(blob);
    if (pressureWashingContext && /municipal|street cleaning|street sweeper|commercial surface|industrial/.test(blob)) {
      warnings.push(`${image.section} image reads as municipal, industrial, or street-cleaning instead of residential exterior cleaning.`);
    }
    if (/concrete|driveway|patio|paver/.test(service) && !/concrete|driveway|walkway|patio|paver/.test(blob)) warnings.push(`${image.serviceTitle} image does not clearly match concrete or driveway cleaning.`);
    if (/house|siding/.test(service) && !/house|siding|exterior/.test(blob)) warnings.push(`${image.serviceTitle} image does not clearly match house washing.`);
    if (/roof|soft/.test(service) && !/roof|soft/.test(blob)) warnings.push(`${image.serviceTitle} image does not clearly match roof or soft washing.`);
    if (pressureWashingContext && image.slot === "hero" && !/pressure washing|exterior cleaning|driveway cleaning|concrete cleaning|house washing|siding cleaning|soft washing|roof cleaning|surface cleaner/.test(blob)) {
      warnings.push("Pressure washing hero image reads as generic property photography instead of exterior cleaning.");
    }
    if (pressureWashingContext && /architecture|interior|room|pool|luxury house|real estate|landscaping/.test(blob)) {
      warnings.push(`${image.section} image reads as architecture, interior, pool, landscaping, or real-estate photography instead of exterior cleaning.`);
    }
  }
  return {
    ok: warnings.length === 0,
    warnings,
    distinctImageCount: bySrc.size,
    repeatedImageCount: [...bySrc.values()].filter((count) => count > 1).length,
  };
}

export function isPublicPreviewImageRelevant(image: ResolvedPreviewImage, trade: string) {
  const normalizedTrade = normalizeTradeCategory(trade) ?? "General Contractor";
  if (normalizedTrade !== "Pressure Washing") return true;
  const service = image.serviceTitle?.toLowerCase() ?? image.section.toLowerCase();
  const blob = `${image.src} ${image.intent.keywords.join(" ")}`.toLowerCase();
  if (/municipal|street cleaning|street-cleaning|street sweeper|commercial surface|industrial|architecture|interior|room|pool|luxury house|real estate|landscaping/.test(blob)) {
    return false;
  }
  if (image.slot === "hero") {
    return /pressure washing|exterior cleaning|driveway cleaning|concrete cleaning|house washing|siding cleaning|soft washing|roof cleaning|surface cleaner/.test(blob);
  }
  if (/house|siding|exterior/.test(service)) return /house washing|siding cleaning|siding washing|residential siding|home exterior cleaning/.test(blob);
  if (/concrete|driveway|walk|patio|paver/.test(service)) return /concrete cleaning|driveway cleaning|walkway cleaning|patio cleaning|surface cleaner/.test(blob);
  if (/roof|soft/.test(service)) return /roof cleaning|soft washing|soft-wash|roofline/.test(blob);
  return /pressure washing|exterior cleaning|driveway cleaning|concrete cleaning|house washing|siding cleaning|soft washing|roof cleaning|surface cleaner/.test(blob);
}

export function previewImageCatalogSlugs() {
  return Object.fromEntries(Object.entries(catalog).map(([trade, entry]) => [trade, entry.slug])) as Record<TradeCategory, string>;
}
