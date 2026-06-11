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

type OverpassElement = {
  tags?: Record<string, string>;
};

const craftByTrade: Record<TradeCategory, string> = {
  Roofing: "roofer",
  HVAC: "hvac",
  Landscaping: "landscaper",
  Plumbing: "plumber",
  Electrical: "electrician",
  "Power Washing": "cleaning",
  "General Contractor": "builder",
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

export async function discoverContractors(input: {
  city: string;
  state: string;
  trade: TradeCategory;
  radiusKm: number;
  limit?: number;
}): Promise<DiscoveredLead[]> {
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

  const craft = craftByTrade[input.trade];
  const radiusMeters = input.radiusKm * 1_000;
  const query = `[out:json][timeout:20];nwr["craft"="${craft}"](around:${radiusMeters},${latitude},${longitude});out tags center ${Math.max(40, limit * 2)};`;
  const discoveryResponse = await fetch(overpassUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!discoveryResponse.ok) throw new Error("Business discovery provider could not complete the search.");
  const payload = (await discoveryResponse.json()) as { elements?: OverpassElement[] };

  const seen = new Set<string>();
  return (payload.elements ?? [])
    .flatMap((element): DiscoveredLead[] => {
      const tags = element.tags ?? {};
      const rawWebsite = tags.website || tags["contact:website"];
      const businessName = tags.name?.trim();
      if (!businessName || !rawWebsite) return [];
      try {
        const website = normalizeWebsite(rawWebsite);
        if (seen.has(website)) return [];
        seen.add(website);
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
    })
    .slice(0, limit);
}

export function resetDiscoveryThrottleForTests() {
  globalDiscovery.lastDiscoveryAt = undefined;
}
