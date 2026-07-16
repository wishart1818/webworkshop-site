import { displayTradeCategory, normalizeTradeCategory, type PreviewResearchFact, type Prospect } from "@/lib/prospect-engine";
import { fetchPublicResearchDocument } from "@/lib/site-analysis";

export type PreviewPhotoResearchCandidate = {
  src: string;
  alt: string;
  service: string;
  sourcePage: string;
};

export type PreviewBusinessResearch = {
  websiteUrl: string;
  logoUrl: string;
  brandColors: string[];
  services: string[];
  tagline: string;
  photos: PreviewPhotoResearchCandidate[];
  sourceFacts: PreviewResearchFact[];
};

const genericImageSignals = /(?:avatar|icon|favicon|sprite|payment|badge|social|author|pixel|tracking|placeholder)/i;
const serviceImageSignals = /(?:wash|clean|roof|siding|house|driveway|concrete|patio|deck|fence|gutter|window|landscap|lawn|garden|plant|hvac|furnace|condenser|thermostat|duct|plumb|pipe|sink|water-heater|electric|panel|wiring|lighting|paint|tree|floor|remodel|project|gallery|crew|technician)/i;

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function plainText(value: string) {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return decodeHtml(match?.[1] ?? "").trim();
}

function safeSameOriginUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin || !["http:", "https:"].includes(url.protocol)) return "";
    if (url.pathname === "/_next/image") {
      const optimizedAsset = url.searchParams.get("url");
      if (optimizedAsset) {
        const assetUrl = new URL(optimizedAsset, url.origin);
        if (assetUrl.origin === base.origin && ["http:", "https:"].includes(assetUrl.protocol)) {
          assetUrl.hash = "";
          return assetUrl.href;
        }
      }
    }
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function imageServiceLabel(blob: string, trade: string) {
  const lower = blob.toLowerCase();
  if (/house|siding|stucco|brick|exterior/.test(lower)) return "House Washing";
  if (/driveway|concrete|walkway|patio|paver/.test(lower)) return "Concrete Cleaning";
  if (/roof|soft[- ]?wash|shingle/.test(lower)) return "Roof Cleaning";
  if (/deck|fence/.test(lower)) return "Deck & Fence Cleaning";
  if (/gutter/.test(lower)) return "Gutter Cleaning";
  if (/window/.test(lower)) return "Window Cleaning";
  if (/furnace|heating|air-handler/.test(lower)) return "Heating Service";
  if (/condenser|air-condition|cooling|heat-pump/.test(lower)) return "Cooling Service";
  if (/thermostat|duct|vent|hvac/.test(lower)) return "HVAC Service";
  if (/landscap|lawn|garden|plant|hardscape/.test(lower)) return "Landscaping";
  if (/plumb|pipe|sink|fixture|water-heater/.test(lower)) return "Plumbing";
  if (/electric|panel|wiring|lighting|outlet/.test(lower)) return "Electrical";
  return displayTradeCategory(normalizeTradeCategory(trade) ?? "General Contractor");
}

function extractImages(html: string, pageUrl: string, trade: string) {
  const candidates: PreviewPhotoResearchCandidate[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const rawSrc = attribute(tag, "src") || attribute(tag, "data-src") || attribute(tag, "data-lazy-src");
    const src = safeSameOriginUrl(rawSrc, pageUrl);
    const alt = attribute(tag, "alt");
    const descriptor = `${src} ${alt} ${attribute(tag, "class")}`;
    if (!src || genericImageSignals.test(descriptor) || !serviceImageSignals.test(descriptor)) continue;
    candidates.push({ src, alt: alt || imageServiceLabel(descriptor, trade), service: imageServiceLabel(descriptor, trade), sourcePage: pageUrl });
  }
  const metaImage = html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i)?.[0];
  if (metaImage) {
    const src = safeSameOriginUrl(attribute(metaImage, "content"), pageUrl);
    if (src && !genericImageSignals.test(src)) candidates.unshift({ src, alt: `${displayTradeCategory(normalizeTradeCategory(trade) ?? "General Contractor")} service`, service: displayTradeCategory(normalizeTradeCategory(trade) ?? "General Contractor"), sourcePage: pageUrl });
  }
  return [...new Map(candidates.map((candidate) => [candidate.src, candidate])).values()].slice(0, 12);
}

function extractLogo(html: string, pageUrl: string) {
  const logoTag = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]).find((tag) => /logo|brand|wordmark/i.test(`${attribute(tag, "src")} ${attribute(tag, "alt")} ${attribute(tag, "class")}`));
  if (logoTag) return safeSameOriginUrl(attribute(logoTag, "src") || attribute(logoTag, "data-src"), pageUrl);
  const iconTag = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((tag) => /(?:apple-touch-icon|icon)/i.test(attribute(tag, "rel")));
  return iconTag ? safeSameOriginUrl(attribute(iconTag, "href"), pageUrl) : "";
}

function serviceNameFromPath(value: string) {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean);
    const serviceIndex = segments.findIndex((segment) => /^services?$/i.test(segment));
    const slug = serviceIndex >= 0 ? segments[serviceIndex + 1] : "";
    if (!slug) return "";
    const aliases: Record<string, string> = {
      "house-wash": "House Washing",
      "house-washing": "House Washing",
      "roof-cleaning": "Roof Cleaning",
      "driveway-concrete": "Driveway & Concrete Cleaning",
      "concrete-cleaning": "Concrete Cleaning",
      "deck-fence": "Deck & Fence Cleaning",
      "gutter-cleaning": "Gutter Cleaning",
      "window-cleaning": "Window Cleaning",
      "soft-wash": "Soft Washing",
    };
    return aliases[slug.toLowerCase()] ?? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  } catch {
    return "";
  }
}

function extractServices(html: string, pageUrl: string) {
  const services: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = safeSameOriginUrl(decodeHtml(match[1] ?? ""), pageUrl);
    if (!href || !/\/services?\//i.test(new URL(href).pathname)) continue;
    const service = serviceNameFromPath(href);
    if (service) services.push(service);
  }
  return [...new Set(services)].slice(0, 8);
}

function extractTagline(html: string) {
  const heroMatch = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>([\s\S]{0,1800})/i);
  if (!heroMatch) return "";
  for (const paragraph of heroMatch[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const value = plainText(paragraph[1]);
    if (value.length >= 28 && value.length <= 190 && !/enter your|first name|please enter/i.test(value)) return value;
  }
  return "";
}

function colorMetrics(hex: string) {
  const value = hex.slice(1);
  const expanded = value.length === 3 ? value.split("").map((part) => part + part).join("") : value.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { saturation: max === 0 ? 0 : (max - min) / max, luminance: (0.2126 * r) + (0.7152 * g) + (0.0722 * b) };
}

function extractBrandColors(...documents: string[]) {
  const counts = new Map<string, number>();
  for (const document of documents) {
    for (const match of document.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
      const raw = match[0].toLowerCase();
      const normalized = raw.length === 4 ? `#${raw.slice(1).split("").map((part) => part + part).join("")}` : raw.slice(0, 7);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  const candidates = [...counts].map(([hex, count]) => ({ hex, count, ...colorMetrics(hex) }))
    .filter((color) => color.saturation >= 0.2 && color.luminance > 0.06 && color.luminance < 0.9)
    .sort((a, b) => (b.count + b.saturation * 8) - (a.count + a.saturation * 8));
  const primary = candidates.find((color) => color.luminance < 0.5) ?? candidates[0];
  const accent = candidates.find((color) => color.hex !== primary?.hex && Math.abs(color.luminance - (primary?.luminance ?? 0)) > 0.12) ?? candidates.find((color) => color.hex !== primary?.hex);
  return [primary?.hex, accent?.hex].filter((value): value is string => Boolean(value));
}

function extractStylesheets(html: string, pageUrl: string) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /stylesheet/i.test(attribute(tag, "rel")))
    .map((tag) => safeSameOriginUrl(attribute(tag, "href"), pageUrl))
    .filter(Boolean)
    .slice(0, 1);
}

export function extractPreviewBusinessResearch(html: string, pageUrl: string, trade: string, stylesheets: string[] = []): PreviewBusinessResearch {
  const services = extractServices(html, pageUrl);
  const logoUrl = extractLogo(html, pageUrl);
  const tagline = extractTagline(html);
  const brandColors = extractBrandColors(html, ...stylesheets);
  const photos = extractImages(html, pageUrl, trade).filter((photo) => photo.src !== logoUrl);
  const sourceFacts: PreviewResearchFact[] = [
    { label: "Official website research", value: pageUrl, source: "official website", confidence: "verified" },
    tagline ? { label: "Official tagline", value: tagline, source: "official website", confidence: "verified" } : null,
    ...services.map((service) => ({ label: "Verified service", value: service, source: "official website", confidence: "verified" } as PreviewResearchFact)),
    logoUrl ? { label: "Official logo", value: logoUrl, source: "official website", confidence: "verified" } : null,
    brandColors.length ? { label: "Official website palette", value: brandColors.join(", "), source: "official website stylesheet", confidence: "verified" } : null,
  ].filter((fact): fact is PreviewResearchFact => Boolean(fact));
  return { websiteUrl: pageUrl, logoUrl, brandColors, services, tagline, photos, sourceFacts };
}

export async function researchProspectForPreview(prospect: Prospect) {
  if (!prospect.website?.trim()) return prospect;
  try {
    const document = await fetchPublicResearchDocument(prospect.website);
    const stylesheetUrls = extractStylesheets(document.text, document.url.href);
    const stylesheetDocuments = await Promise.all(stylesheetUrls.map(async (url) => {
      try {
        return (await fetchPublicResearchDocument(url)).text;
      } catch {
        return "";
      }
    }));
    const research = extractPreviewBusinessResearch(document.text, document.url.href, prospect.trade, stylesheetDocuments);
    return {
      ...prospect,
      website: document.url.href,
      websiteLogoUrl: research.logoUrl,
      previewBrandColors: research.brandColors,
      verifiedPreviewServices: research.services,
      approvedPreviewPhotos: research.photos,
      previewResearchFacts: research.sourceFacts,
      previewResearchVerified: true,
    } as Prospect;
  } catch {
    return prospect;
  }
}
