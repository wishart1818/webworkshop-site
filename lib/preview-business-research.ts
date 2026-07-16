import { displayTradeCategory, normalizeTradeCategory, researchFact, type PreviewResearchFact, type Prospect } from "@/lib/prospect-engine";
import { fetchPublicResearchDocument } from "@/lib/site-analysis";

export type PreviewPhotoResearchCandidate = {
  src: string;
  alt: string;
  service: string;
  sourcePage: string;
};

export type PreviewBusinessResearch = {
  websiteUrl: string;
  officialBusinessName: string;
  officialPhone: string;
  officialEmail: string;
  logoUrl: string;
  brandColors: string[];
  services: string[];
  tagline: string;
  differentiators: PreviewResearchFact[];
  reviewFacts: PreviewResearchFact[];
  photos: PreviewPhotoResearchCandidate[];
  sourceFacts: PreviewResearchFact[];
};

export type PreviewResearchStatus = "succeeded" | "timed_out" | "failed" | "not_applicable";

export type PreviewResearchOutcome = {
  prospect: Prospect;
  status: PreviewResearchStatus;
  note: string;
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

function firstMetaContent(html: string, key: string) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((candidate) => new RegExp(`(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(candidate));
  return tag ? plainText(attribute(tag, "content")) : "";
}

function officialBusinessName(html: string) {
  const socialName = firstMetaContent(html, "og:site_name");
  if (socialName && socialName.length <= 160) return socialName;
  return "";
}

function officialContacts(html: string, pageUrl: string) {
  const phoneMatch = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']tel:([^"']+)["'][^>]*>/gi)][0];
  const emailMatch = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']mailto:([^"'?]+)[^"']*["'][^>]*>/gi)][0];
  const phone = decodeURIComponent(phoneMatch?.[1] ?? "").replace(/[^+\d]/g, "").trim();
  const email = decodeURIComponent(emailMatch?.[1] ?? "").trim().toLowerCase();
  return {
    phone: phone.length >= 10 && phone.length <= 16 ? phone : "",
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    sourceLocation: pageUrl,
  };
}

function extractVerifiedDifferentiators(html: string, pageUrl: string, researchedAt: string) {
  const text = plainText(html);
  const patterns: Array<{ label: string; value: string; pattern: RegExp }> = [
    { label: "Licensed and insured", value: "Licensed and insured", pattern: /\blicensed\s+(?:and|&)\s+insured\b/i },
    { label: "Locally owned", value: "Locally owned", pattern: /\blocally[- ]owned\b/i },
    { label: "Family owned", value: "Family owned", pattern: /\bfamily[- ]owned\b/i },
    { label: "Veteran owned", value: "Veteran owned", pattern: /\bveteran[- ]owned\b/i },
    { label: "Free estimates", value: "Free estimates", pattern: /\bfree estimates?\b/i },
    { label: "Emergency service", value: "Emergency service available", pattern: /\b(?:24\s*\/\s*7\s+)?emergency service\b/i },
    { label: "Warranty", value: "Warranty available", pattern: /\b(?:workmanship|service|labor) warranty\b/i },
    { label: "Guarantee", value: "Service guarantee", pattern: /\b(?:satisfaction|service|workmanship) guarantee(?:d)?\b/i },
  ];
  const facts = patterns.filter((item) => item.pattern.test(text)).map((item) => researchFact(
    item.label,
    item.value,
    "official website",
    "verified",
    "verified official source",
    { factType: item.label === "Warranty" ? "warranty" : item.label === "Guarantee" ? "guarantee" : item.label.includes("owned") ? "ownership" : item.label.includes("Licensed") ? "license" : "differentiator", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt },
  ));
  const years = text.match(/\b(?:serving|in business|experience)[^.!?]{0,40}\b(\d{1,3})\+?\s+years\b/i);
  if (years?.[1]) facts.push(researchFact("Years in business", `${years[1]} years`, "official website", "verified", "verified official source", {
    factType: "years_in_business", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt,
  }));
  return facts.slice(0, 10);
}

function extractOfficialReviewFacts(html: string, pageUrl: string, researchedAt: string) {
  const facts: PreviewResearchFact[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root = JSON.parse(decodeHtml(match[1] ?? ""));
      const queue: unknown[] = [root];
      while (queue.length) {
        const value = queue.shift();
        if (Array.isArray(value)) { queue.push(...value); continue; }
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        if (String(record["@type"] ?? "").toLowerCase() === "aggregaterating") {
          const rating = Number(record.ratingValue);
          const count = Number(record.reviewCount ?? record.ratingCount);
          if (Number.isFinite(rating) && rating >= 1 && rating <= 5) facts.push(researchFact("Review rating", rating.toFixed(1), "official website structured data", "verified", "verified official source", {
            factType: "review_rating", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt,
          }));
          if (Number.isInteger(count) && count > 0) facts.push(researchFact("Review count", String(count), "official website structured data", "verified", "verified official source", {
            factType: "review_count", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt,
          }));
        }
        queue.push(...Object.values(record));
      }
    } catch {
      // Invalid third-party structured data is ignored rather than treated as proof.
    }
  }
  return facts.slice(0, 2);
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

const identityNoise = new Set([
  "and", "company", "co", "corp", "corporation", "inc", "llc", "ltd", "services", "service",
  "the", "of", "home", "local", "roofing", "landscaping", "hvac", "heating", "cooling", "plumbing",
  "electrical", "painting", "cleaning", "pressure", "washing", "contractor", "construction",
]);

function identityTokens(value: string) {
  return value.toLowerCase().replace(/&amp;|&/g, " and ").split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !identityNoise.has(token));
}

export function officialWebsiteMatchesProspect(prospect: Pick<Prospect, "businessName" | "trade">, html: string, pageUrl: string) {
  const businessTokens = [...new Set(identityTokens(prospect.businessName))];
  const domainTokens = identityTokens(new URL(pageUrl).hostname.replace(/^www\./, ""));
  const visibleTokens = new Set(identityTokens(plainText(html).slice(0, 80_000)));
  const domainMatches = businessTokens.filter((token) => domainTokens.includes(token));
  const visibleMatches = businessTokens.filter((token) => visibleTokens.has(token));
  if (!businessTokens.length) return plainText(html).toLowerCase().includes(displayTradeCategory(normalizeTradeCategory(prospect.trade) ?? "General Contractor").toLowerCase());
  return domainMatches.length >= 1 || visibleMatches.length >= Math.min(2, businessTokens.length);
}

export function extractPreviewBusinessResearch(html: string, pageUrl: string, trade: string, stylesheets: string[] = []): PreviewBusinessResearch {
  const researchedAt = new Date().toISOString();
  const services = extractServices(html, pageUrl);
  const logoUrl = extractLogo(html, pageUrl);
  const tagline = extractTagline(html);
  const name = officialBusinessName(html);
  const contacts = officialContacts(html, pageUrl);
  const brandColors = extractBrandColors(html, ...stylesheets);
  const photos = extractImages(html, pageUrl, trade).filter((photo) => photo.src !== logoUrl);
  const differentiators = extractVerifiedDifferentiators(html, pageUrl, researchedAt);
  const reviewFacts = extractOfficialReviewFacts(html, pageUrl, researchedAt);
  const sourceFacts: PreviewResearchFact[] = [
    researchFact("Official website research", pageUrl, "official website", "verified", "verified official source", { factType: "website", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt }),
    name ? researchFact("Official business name", name, "official website", "verified", "verified official source", { factType: "business_name", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt }) : null,
    contacts.phone ? researchFact("Official phone", contacts.phone, "official website", "verified", "verified official source", { factType: "phone", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt }) : null,
    contacts.email ? researchFact("Official public email", contacts.email, "official website", "verified", "verified official source", { factType: "contact_path", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt }) : null,
    tagline ? researchFact("Official tagline", tagline, "official website", "verified", "verified official source", { factType: "tagline", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt }) : null,
    ...services.map((service) => researchFact("Verified service", service, "official website", "verified", "verified official source", { factType: "service", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt })),
    logoUrl ? researchFact("Official logo", logoUrl, "official website", "verified", "verified official source", { factType: "logo", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt }) : null,
    brandColors.length ? researchFact("Official website palette", brandColors.join(", "), "official website stylesheet", "verified", "verified official source", { factType: "brand_color", sourceType: "official_website", sourceLocation: pageUrl, verificationStatus: "verified", researchedAt }) : null,
    ...differentiators,
    ...reviewFacts,
  ].filter((fact): fact is PreviewResearchFact => Boolean(fact));
  return { websiteUrl: pageUrl, officialBusinessName: name, officialPhone: contacts.phone, officialEmail: contacts.email, logoUrl, brandColors, services, tagline, differentiators, reviewFacts, photos, sourceFacts };
}

function withResearchStatus(prospect: Prospect, status: PreviewResearchStatus, note: string) {
  return {
    ...prospect,
    previewResearchStatus: status,
    previewResearchNote: note,
  } as Prospect;
}

export async function researchProspectForPreviewOutcome(prospect: Prospect): Promise<PreviewResearchOutcome> {
  if (!prospect.website?.trim()) {
    const note = "No public website was available for bounded preview research.";
    return { prospect: withResearchStatus(prospect, "not_applicable", note), status: "not_applicable", note };
  }
  try {
    const document = await fetchPublicResearchDocument(prospect.website);
    if (!officialWebsiteMatchesProspect(prospect, document.text, document.url.href)) {
      const note = "The provider website could not be reconciled confidently with the business identity, so it was not treated as an official source.";
      return { prospect: withResearchStatus(prospect, "failed", note), status: "failed", note };
    }
    const stylesheetUrls = extractStylesheets(document.text, document.url.href);
    const stylesheetDocuments = await Promise.all(stylesheetUrls.map(async (url) => {
      try {
        return (await fetchPublicResearchDocument(url)).text;
      } catch {
        return "";
      }
    }));
    const research = extractPreviewBusinessResearch(document.text, document.url.href, prospect.trade, stylesheetDocuments);
    const note = "Official website research completed within the bounded preview-preparation step.";
    const researchedProspect = {
      ...prospect,
      website: document.url.href,
      websiteLogoUrl: research.logoUrl,
      previewBrandColors: research.brandColors,
      verifiedPreviewServices: research.services,
      approvedPreviewPhotos: research.photos,
      previewResearchFacts: research.sourceFacts,
      previewResearchVerified: true,
      previewResearchStatus: "succeeded",
      previewResearchNote: note,
    } as Prospect;
    return { prospect: researchedProspect, status: "succeeded", note };
  } catch (error) {
    const signal = `${error instanceof Error ? error.name : ""} ${error instanceof Error ? error.message : ""}`.toLowerCase();
    const status: PreviewResearchStatus = /timeout|abort/.test(signal) ? "timed_out" : "failed";
    const note = status === "timed_out"
      ? "Official website research reached its time limit; provider facts and honest fallbacks were retained."
      : "Official website research was unavailable; provider facts and honest fallbacks were retained.";
    return { prospect: withResearchStatus(prospect, status, note), status, note };
  }
}

export async function researchProspectForPreview(prospect: Prospect) {
  return (await researchProspectForPreviewOutcome(prospect)).prospect;
}
