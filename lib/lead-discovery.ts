import { tradeCategories, type TradeCategory } from "@/lib/prospect-engine";

export type DiscoveredLead = {
  businessName: string;
  website: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  trade: TradeCategory;
  serviceArea: string;
};

export type DiscoveryDiagnostics = {
  rawProviderCount: number;
  afterDistanceFilteringCount: number;
  afterDuplicateFilteringCount: number;
  afterQualificationFilteringCount: number;
  returnedCount: number;
  radiusKm: number;
  categorySignals: string[];
};

export type DiscoveryResult = {
  leads: DiscoveredLead[];
  diagnostics: DiscoveryDiagnostics;
};

export type OverpassElement = {
  id?: number;
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type TradeDiscoverySignals = {
  exactCrafts: string[];
  namePattern: string;
};

const descriptiveTradeTags = ["name", "operator", "website", "contact:website"] as const;

const signalsByTrade: Record<TradeCategory, TradeDiscoverySignals> = {
  Roofing: { exactCrafts: ["roofer"], namePattern: "roof|roofing" },
  HVAC: { exactCrafts: ["hvac"], namePattern: "hvac|heating|cooling|air conditioning" },
  Landscaping: { exactCrafts: ["landscaper"], namePattern: "landscap|lawn care|lawn service" },
  Plumbing: { exactCrafts: ["plumber"], namePattern: "plumb" },
  Electrical: { exactCrafts: ["electrician"], namePattern: "electric" },
  "Power Washing": { exactCrafts: [], namePattern: "power wash|pressure wash|soft wash" },
  "General Contractor": { exactCrafts: ["builder"], namePattern: "general contractor|construction|remodel" },
};

const globalDiscovery = globalThis as typeof globalThis & { lastDiscoveryAt?: number };

function validTrade(value: unknown): value is TradeCategory {
  return typeof value === "string" && tradeCategories.includes(value as TradeCategory);
}

function normalizeWebsite(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported website protocol.");
  return url.href;
}

function websiteKey(value: string) {
  return new URL(normalizeWebsite(value)).hostname.replace(/^www\./, "").toLowerCase();
}

function elementCoordinates(element: OverpassElement) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;
}

export function distanceKm(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function discoveryCategorySignals(trade: TradeCategory) {
  const signals = signalsByTrade[trade];
  return [
    ...signals.exactCrafts.map((craft) => `craft=${craft}`),
    ...descriptiveTradeTags.map((tag) => `${tag}~${signals.namePattern}`),
  ];
}

export function buildTradeDiscoveryQuery(trade: TradeCategory, radiusMeters: number, latitude: number, longitude: number) {
  const signals = signalsByTrade[trade];
  const selectors = [
    ...signals.exactCrafts.map((craft) => `nwr["craft"="${craft}"](around:${radiusMeters},${latitude},${longitude});`),
    ...descriptiveTradeTags.map((tag) => `nwr["${tag}"~"${signals.namePattern}",i](around:${radiusMeters},${latitude},${longitude});`),
  ];
  return `[out:json][timeout:30];(${selectors.join("")});out tags center;`;
}

export function inactivePublicRecord(tags: Record<string, string>) {
  return Boolean(
    tags.disused
    || tags.abandoned
    || tags["disused:craft"]
    || tags["abandoned:craft"]
    || tags["was:craft"]
    || tags.end_date
    || /^(closed|permanently closed)$/i.test(tags.opening_hours?.trim() ?? ""),
  );
}

export function processDiscoveryElements(input: {
  elements: OverpassElement[];
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit: number;
}): DiscoveryResult {
  const withinRadius = input.elements.filter((element) => {
    const coordinates = elementCoordinates(element);
    return !coordinates
      || distanceKm(input.latitude, input.longitude, coordinates.latitude, coordinates.longitude) <= input.radiusKm;
  });
  const seen = new Set<string>();
  const unique = withinRadius.filter((element, index) => {
    const rawWebsite = element.tags?.website || element.tags?.["contact:website"];
    let key = `${element.type ?? "record"}:${element.id ?? index}`;
    if (rawWebsite) {
      try {
        key = `website:${websiteKey(rawWebsite)}`;
      } catch {
        // Keep malformed websites long enough for the qualification stage to count them.
      }
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const qualified = unique.flatMap((element): DiscoveredLead[] => {
    const tags = element.tags ?? {};
    if (inactivePublicRecord(tags)) return [];
    const rawWebsite = tags.website || tags["contact:website"];
    const businessName = tags.name?.trim();
    if (!businessName || !rawWebsite) return [];
    try {
      const website = normalizeWebsite(rawWebsite);
      const taggedState = tags["addr:state"]?.trim() ?? "";
      return [{
        businessName,
        website,
        phone: tags.phone || tags["contact:phone"] || "",
        email: tags.email || tags["contact:email"] || "",
        city: tags["addr:city"] || input.city.trim(),
        state: (/^[A-Za-z]{2}$/.test(taggedState) ? taggedState : input.state).toUpperCase(),
        trade: input.trade,
        serviceArea: `${input.city.trim()} and nearby communities`,
      }];
    } catch {
      return [];
    }
  });
  const leads = qualified.slice(0, input.limit);
  return {
    leads,
    diagnostics: {
      rawProviderCount: input.elements.length,
      afterDistanceFilteringCount: withinRadius.length,
      afterDuplicateFilteringCount: unique.length,
      afterQualificationFilteringCount: qualified.length,
      returnedCount: leads.length,
      radiusKm: input.radiusKm,
      categorySignals: discoveryCategorySignals(input.trade),
    },
  };
}

export function discoveryLeadsFromJson(value: unknown): DiscoveredLead[] {
  if (Array.isArray(value)) return value as DiscoveredLead[];
  if (!value || typeof value !== "object" || !("leads" in value)) return [];
  return Array.isArray(value.leads) ? value.leads as DiscoveredLead[] : [];
}

export function discoveryDiagnosticsFromJson(value: unknown): DiscoveryDiagnostics | null {
  if (!value || Array.isArray(value) || typeof value !== "object" || !("diagnostics" in value)) return null;
  const diagnostics = value.diagnostics;
  if (!diagnostics || Array.isArray(diagnostics) || typeof diagnostics !== "object") return null;
  const candidate = diagnostics as Partial<DiscoveryDiagnostics>;
  return typeof candidate.rawProviderCount === "number"
    && typeof candidate.afterDistanceFilteringCount === "number"
    && typeof candidate.afterDuplicateFilteringCount === "number"
    && typeof candidate.afterQualificationFilteringCount === "number"
    && typeof candidate.returnedCount === "number"
    && typeof candidate.radiusKm === "number"
    && Array.isArray(candidate.categorySignals)
    ? candidate as DiscoveryDiagnostics
    : null;
}

export async function discoverContractorsWithDiagnostics(input: {
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit?: number;
}): Promise<DiscoveryResult> {
  if (!validTrade(input.trade)) throw new Error("Trade category is not supported.");
  if (!input.city.trim() || !/^[A-Za-z .'-]{2,100}$/.test(input.city.trim())) throw new Error("Enter a valid city.");
  if (!/^[A-Za-z]{2}$/.test(input.state.trim())) throw new Error("Enter a two-letter state code.");
  if (![10, 25, 50].includes(input.radiusKm)) throw new Error("Discovery radius is not supported.");
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 25)));

  const now = Date.now();
  if (globalDiscovery.lastDiscoveryAt && now - globalDiscovery.lastDiscoveryAt < 5_000) {
    throw new Error("Please wait a few seconds before running another discovery search.");
  }
  globalDiscovery.lastDiscoveryAt = now;

  const nominatimUrl = process.env.NOMINATIM_API_URL?.trim() || "https://nominatim.openstreetmap.org/search";
  const overpassUrl = process.env.OVERPASS_API_URL?.trim() || "https://overpass-api.de/api/interpreter";
  const headers = {
    "User-Agent": "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)",
    Accept: "application/json",
  };

  const geocodeUrl = new URL(nominatimUrl);
  geocodeUrl.searchParams.set("q", `${input.city}, ${input.state}, USA`);
  geocodeUrl.searchParams.set("format", "jsonv2");
  geocodeUrl.searchParams.set("limit", "1");
  geocodeUrl.searchParams.set("countrycodes", "us");
  const geocodeResponse = await fetch(geocodeUrl, { headers, signal: AbortSignal.timeout(12_000) });
  if (!geocodeResponse.ok) throw new Error("Location provider could not complete the search.");
  const locations = (await geocodeResponse.json()) as Array<{ lat?: string; lon?: string }>;
  const latitude = Number(locations[0]?.lat);
  const longitude = Number(locations[0]?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Location could not be found.");

  const radiusMeters = input.radiusKm * 1_000;
  const query = buildTradeDiscoveryQuery(input.trade, radiusMeters, latitude, longitude);
  const discoveryResponse = await fetch(overpassUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(35_000),
  });
  if (!discoveryResponse.ok) throw new Error("Business discovery provider could not complete the search.");
  const payload = (await discoveryResponse.json()) as { elements?: OverpassElement[] };

  return processDiscoveryElements({
    elements: payload.elements ?? [],
    latitude,
    longitude,
    city: input.city,
    state: input.state,
    trade: input.trade,
    radiusKm: input.radiusKm,
    limit,
  });
}

export async function discoverContractors(input: {
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit?: number;
}): Promise<DiscoveredLead[]> {
  return (await discoverContractorsWithDiagnostics(input)).leads;
}

export function resetDiscoveryThrottleForTests() {
  globalDiscovery.lastDiscoveryAt = undefined;
}
