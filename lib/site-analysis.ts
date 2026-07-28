import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  activity,
  calculatePriority,
  displayStateCode,
  prospectBestManualContactMethod,
  prospectContactConfidence,
  prospectEmailNeedsManualVerification,
  reconcileProspectContactRouting,
  recommendProspectContactMethod,
  withPresenceGapReview,
  scoreLabels,
  type Analysis,
  type ContactRouteEvidence,
  type Prospect,
  type ProspectFitDisposition,
  type ScoreKey,
  type WebsiteAvailabilityStatus,
  type WebsiteVerificationAttempt,
  type WebsiteVerificationFailureCategory,
  type WebsiteVerificationReport,
} from "@/lib/prospect-engine";

const userAgent = "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)";
const browserCompatibleUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const maxResponseBytes = 2_000_000;
const maxVerificationAttempts = 8;
const maxContactPages = 8;
const globalAnalysis = globalThis as typeof globalThis & { analyzedHosts?: Map<string, number> };

type DnsLookup = (hostname: string) => Promise<Array<{ address: string }>>;
type RobotsPolicy = (url: URL) => Promise<boolean>;

export type WebsiteVerificationDependencies = {
  fetch?: typeof fetch;
  lookup?: DnsLookup;
  robotsPolicy?: RobotsPolicy;
  now?: () => Date;
};

export type WebsiteAnalysisFailure = {
  status: Exclude<WebsiteAvailabilityStatus, "unknown" | "usable" | "no_owned_website">;
  detail: string;
};

export function classifyWebsiteAnalysisFailure(error: unknown): WebsiteAnalysisFailure | null {
  const message = error instanceof Error ? error.message : String(error);
  const signals = `${error instanceof Error ? error.name : ""} ${message}`.toLowerCase();
  if (/website returned http (?:404|410)\b/.test(signals)) return { status: "inconclusive", detail: "One inactive response was recorded; confirmation is required." };
  if (/website returned http 400\b/.test(signals)) return { status: "invalid_website", detail: message };
  if (/website returned http (?:403|429)\b|captcha|challenge|bot.block|robots\.txt does not allow/.test(signals)) {
    return { status: "crawler_blocked", detail: "The website did not allow automated verification. Manual review is required." };
  }
  if (/website returned http (?:408|5\d\d)\b|timeout|abort|fetch failed|enotfound|econnrefused|econnreset|network|dns/.test(signals)) {
    return { status: "temporarily_unavailable", detail: "The website was temporarily unavailable to the verifier. No absence or broken-site conclusion was made." };
  }
  if (/invalid redirect|redirected too many times/.test(signals)) {
    return { status: "inconclusive", detail: message };
  }
  if (/only http|credentials cannot|unsupported port|local websites|private or unsupported|invalid url|failed to parse url/.test(signals)) {
    return { status: "invalid_website", detail: message };
  }
  return null;
}

export function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function defaultLookup(hostname: string) {
  return lookup(hostname, { all: true });
}

async function assertPublicUrl(value: string, lookupAddresses: DnsLookup = defaultLookup) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites can be analyzed.");
  if (url.username || url.password) throw new Error("Website URLs with credentials cannot be analyzed.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Website URL uses an unsupported port.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local websites cannot be analyzed.");

  const addresses = await lookupAddresses(url.hostname);
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Website resolves to a private or unsupported network address.");
  }
  return url;
}

async function fetchPublicPage(
  value: string,
  options: {
    browserCompatible?: boolean;
    fetchImpl?: typeof fetch;
    lookupAddresses?: DnsLookup;
    onRedirectTarget?: (url: URL) => Promise<void>;
  } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupAddresses = options.lookupAddresses ?? defaultLookup;
  let url = await assertPublicUrl(value, lookupAddresses);
  const redirectChain: string[] = [];
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      headers: {
        "User-Agent": options.browserCompatible ? browserCompatibleUserAgent : userAgent,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.2",
        ...(options.browserCompatible ? {
          "Accept-Language": "en-US,en;q=0.8",
          "Cache-Control": "no-cache",
        } : {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website returned an invalid redirect.");
      const redirectUrl = await assertPublicUrl(new URL(location, url).href, lookupAddresses);
      await options.onRedirectTarget?.(redirectUrl);
      url = redirectUrl;
      redirectChain.push(url.href);
      continue;
    }
    return { response, url, redirectChain };
  }
  throw new Error("Website redirected too many times.");
}

async function readLimitedText(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxResponseBytes) throw new Error("Website response is too large to analyze safely.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      throw new Error("Website response is too large to analyze safely.");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export function robotsDisallows(robots: string, pathname: string) {
  const lines = robots.split(/\r?\n/).map((line) => line.split("#")[0].trim()).filter(Boolean);
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; pattern: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; pattern: string }> };
  for (const line of lines) {
    const [rawKey, ...parts] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = parts.join(":").trim();
    if (key === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && group.agents.length && value) {
      group.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  if (group.agents.length) groups.push(group);

  const matchingGroups = groups.map((candidate) => ({
    ...candidate,
    specificity: Math.max(...candidate.agents.map((agent) => agent === "*" ? 0 : "webworkshopprospectengine".startsWith(agent) ? agent.length : -1)),
  })).filter(({ specificity }) => specificity >= 0);
  const highestSpecificity = Math.max(...matchingGroups.map(({ specificity }) => specificity), -1);
  const matchingRules = matchingGroups
    .filter(({ specificity }) => specificity === highestSpecificity)
    .flatMap(({ rules }) => rules)
    .filter(({ pattern }) => {
      const anchored = pattern.endsWith("$");
      const source = pattern
        .replace(/\$$/, "")
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${source}${anchored ? "$" : ""}`).test(pathname);
    })
    .sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));

  return matchingRules[0] ? !matchingRules[0].allow : false;
}

async function assertRobotsAllowed(
  url: URL,
  options: {
    fetchImpl?: typeof fetch;
    lookupAddresses?: DnsLookup;
  } = {},
) {
  try {
    const { response } = await fetchPublicPage(new URL("/robots.txt", url.origin).href, options);
    if (!response.ok) return true;
    const robots = await readLimitedText(response);
    if (robotsDisallows(robots, url.pathname || "/")) throw new Error("Website robots.txt does not allow analysis of this page.");
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("robots.txt does not allow")) throw error;
    return true;
  }
}

export async function fetchPublicResearchDocument(value: string) {
  const requestedUrl = await assertPublicUrl(value);
  await assertRobotsAllowed(requestedUrl);
  const { response, url } = await fetchPublicPage(requestedUrl.href);
  if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/css") && !contentType.includes("text/plain")) {
    throw new Error("Website research resource did not return HTML or CSS.");
  }
  return { text: await readLimitedText(response), url };
}

export type ContactDiscoveryPage = {
  url: string;
  html: string;
};

export type ContactDiscoveryResult = Pick<
  Prospect,
  | "phone"
  | "email"
  | "contactPageUrl"
  | "contactFormUrl"
  | "quoteFormUrl"
  | "contactFormDetected"
  | "quoteFormDetected"
  | "facebookUrl"
  | "instagramUrl"
  | "linkedinUrl"
  | "xUrl"
  | "youtubeUrl"
  | "contactPersonName"
  | "contactConfidence"
  | "bestManualContactMethod"
  | "contactDiscoveryNotes"
  | "contactEvidence"
>;

const contactPathSignals = [
  "contact",
  "contact-us",
  "about",
  "about-us",
  "services",
  "locations",
  "service-area",
  "service-areas",
  "areas-we-serve",
  "request-a-quote",
  "quote",
  "free-estimate",
  "estimate",
  "get-a-quote",
  "schedule",
  "booking",
  "book-now",
];

function cleanHtmlText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSocialUrl(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function extractLinks(html: string, baseUrl: string) {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || /^(?:tel|javascript):/i.test(href)) continue;
    try {
      links.push(new URL(href, baseUrl).href);
    } catch {
      // Ignore malformed links from old contractor sites.
    }
  }
  return [...new Set(links)];
}

function emailAllowed(value: string) {
  const lower = value.toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(lower)) return false;
  if (/@(?:example|test|invalid|localhost)\./i.test(lower)) return false;
  if (/^(?:test|example|no-?reply|noreply|do-?not-?reply|donotreply|wordpress|wp)@/i.test(lower)) return false;
  if (/\.(?:png|jpe?g|gif|webp|svg|css|js)$/i.test(lower)) return false;
  return true;
}

function normalizedBusinessHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function emailDomain(value: string) {
  return value.toLowerCase().split("@")[1]?.replace(/^www\./, "") ?? "";
}

function emailDomainMatchesWebsite(email: string, website: string) {
  const websiteHost = normalizedBusinessHostname(website);
  const domain = emailDomain(email);
  return Boolean(websiteHost && domain && (domain === websiteHost || websiteHost.endsWith(`.${domain}`) || domain.endsWith(`.${websiteHost}`)));
}

function commonPublicMailbox(value: string) {
  return /^(?:info|contact|office|hello|sales|estimate|estimates|support|service|quotes?|booking)@/i.test(value);
}

const commonFreeEmailDomains = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"]);

function likelyVendorEmail(value: string) {
  return /(?:wix|squarespace|wordpress|godaddy|cloudflare|mailchimp|hubspot|shopify|theme|template|analytics|sentry|google)\b/i.test(value);
}

function contactEvidenceRank(item: ContactRouteEvidence) {
  const confidenceScore = item.confidence === "high" ? 30 : item.confidence === "medium" ? 20 : 10;
  const methodScore: Partial<Record<ContactRouteEvidence["extractionMethod"], number>> = {
    mailto: 30,
    json_ld: 28,
    tel: 28,
    form_markup: 28,
    same_origin_link: 24,
    visible_text: 18,
    metadata: 16,
    existing_provider: 10,
  };
  let sourceScore = 0;
  try {
    sourceScore = /(?:contact|quote|estimate|booking|schedule)/i.test(new URL(item.sourceUrl).pathname) ? 5 : 0;
  } catch {
    sourceScore = 0;
  }
  return confidenceScore + (methodScore[item.extractionMethod] ?? 0) + sourceScore + (item.domainMatchesBusiness ? 50 : 0);
}

function bestEmail(evidence: ContactRouteEvidence[], existing: Partial<Prospect>) {
  const unique = [...new Map(
    evidence
      .filter((item) => item.kind === "email" && emailAllowed(item.value))
      .map((item) => [item.value.toLowerCase(), item]),
  ).values()];
  const rank = (item: ContactRouteEvidence) => {
    let score = item.domainMatchesBusiness ? 100 : 0;
    if (item.extractionMethod === "mailto") score += 25;
    if (item.extractionMethod === "json_ld") score += 22;
    if (commonPublicMailbox(item.value)) score += 15;
    if (commonFreeEmailDomains.has(emailDomain(item.value))) score += 8;
    if (/^privacy@/i.test(item.value)) score -= 30;
    if (likelyVendorEmail(item.value)) score -= 100;
    if (prospectEmailNeedsManualVerification({ ...existing, email: item.value })) score -= 40;
    return score;
  };
  return unique.sort((a, b) => rank(b) - rank(a))[0]?.value.toLowerCase()
    ?? "";
}

function pageLooksLikeContact(url: string, text: string) {
  return /contact|about|location|service/i.test(new URL(url).pathname)
    || /\b(contact us|get in touch|request information|office|service area)\b/i.test(text);
}

function pageLooksLikeQuote(url: string, text: string) {
  return /quote|estimate|schedule|booking|book-now|request-a-quote|free-estimate/i.test(new URL(url).pathname)
    || /\b(request (a )?(quote|estimate)|get (a )?(quote|estimate)|free estimate|schedule service|book now)\b/i.test(text);
}

function detectForm(html: string, text: string) {
  const hasForm = /<form\b/i.test(html);
  const hasFields = (
    /\b(?:name|email|phone|message|quote|estimate|service|project|address)\b/i.test(text)
    || /<(?:input|textarea|select)\b[^>]*(?:name|id|type)\s*=\s*["'][^"']*(?:name|email|phone|message|quote|estimate|service|project|address)/i.test(html)
  )
    && (/<(?:input|textarea|select)\b/i.test(html) || /\b(?:submit|send|request quote|get estimate|contact us|book|schedule)\b/i.test(text));
  return hasForm && hasFields;
}

function visiblePhoneNumbers(text: string) {
  return [...new Set(text.match(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/g) ?? [])];
}

function jsonLdContactValues(html: string) {
  const emails: string[] = [];
  const phones: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const payload = JSON.parse(match[1] ?? "null");
      const visit = (value: unknown, depth = 0) => {
        if (depth > 8 || value === null || value === undefined) return;
        if (Array.isArray(value)) {
          value.forEach((item) => visit(item, depth + 1));
          return;
        }
        if (typeof value !== "object") return;
        for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
          if (typeof candidate === "string" && /^(?:email)$/i.test(key)) emails.push(candidate.replace(/^mailto:/i, ""));
          if (typeof candidate === "string" && /^(?:telephone|phone)$/i.test(key)) phones.push(candidate.replace(/^tel:/i, ""));
          visit(candidate, depth + 1);
        }
      };
      visit(payload);
    } catch {
      // Invalid structured data is ignored; it is never treated as contact proof.
    }
  }
  return { emails, phones };
}

function metadataContactValues(html: string) {
  const emails: string[] = [];
  const phones: string[] = [];
  const attribute = (tag: string, name: string) => (
    tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]?.trim() ?? ""
  );
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (
      attribute(tag, "name")
      || attribute(tag, "property")
      || attribute(tag, "itemprop")
    ).toLowerCase();
    const content = attribute(tag, "content");
    if (!content) continue;
    if (/^(?:email|contact:email|business:contact_data:email|og:email)$/.test(key)) {
      emails.push(content.replace(/^mailto:/i, ""));
    }
    if (/^(?:telephone|phone|contact:phone_number|business:contact_data:phone_number|og:phone_number)$/.test(key)) {
      phones.push(content.replace(/^tel:/i, ""));
    }
  }
  return { emails, phones };
}

export function extractContactDiscoveryFromPages(baseWebsite: string, pages: ContactDiscoveryPage[], existing: Partial<Prospect> = {}): ContactDiscoveryResult {
  const baseOrigin = new URL(baseWebsite).origin;
  const pageUrls = pages.map((page) => page.url);
  const discoveredAt = new Date().toISOString();
  const evidence: ContactRouteEvidence[] = [];
  let contactPageUrl = "";
  let contactFormUrl = "";
  let quoteFormUrl = "";
  let contactFormDetected = false;
  let quoteFormDetected = false;
  let facebookUrl = "";
  let instagramUrl = "";
  let linkedinUrl = "";
  let xUrl = "";
  let youtubeUrl = "";
  let phone = existing.phone ?? "";
  const notes: string[] = [];

  const addEvidence = (
    kind: ContactRouteEvidence["kind"],
    value: string,
    sourceUrl: string,
    extractionMethod: ContactRouteEvidence["extractionMethod"],
    confidence: ContactRouteEvidence["confidence"],
  ) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    if (kind === "email" && !emailAllowed(cleaned)) return;
    let normalizedSourceUrl = baseWebsite;
    try {
      const parsedSource = new URL(sourceUrl);
      if (["http:", "https:"].includes(parsedSource.protocol)) normalizedSourceUrl = parsedSource.href;
    } catch {
      // Existing provider evidence without a valid public source falls back to the verified website URL.
    }
    const domainMatchesBusiness = kind === "email"
      ? emailDomainMatchesWebsite(cleaned, baseWebsite)
      : normalizedBusinessHostname(normalizedSourceUrl) === normalizedBusinessHostname(baseWebsite);
    const needsManualEmailVerification = kind === "email"
      && prospectEmailNeedsManualVerification({
        businessName: existing.businessName,
        website: baseWebsite,
        email: cleaned,
      });
    if (
      kind === "email"
      && !domainMatchesBusiness
      && !commonFreeEmailDomains.has(emailDomain(cleaned))
      && needsManualEmailVerification
    ) return;
    if (kind === "email" && likelyVendorEmail(cleaned)) return;
    const candidate: ContactRouteEvidence = {
      kind,
      value: cleaned,
      sourceUrl: normalizedSourceUrl,
      extractionMethod,
      confidence,
      domainMatchesBusiness,
      discoveredAt,
    };
    const existingIndex = evidence.findIndex(
      (item) => item.kind === kind && item.value.toLowerCase() === cleaned.toLowerCase(),
    );
    if (existingIndex >= 0) {
      if (contactEvidenceRank(candidate) > contactEvidenceRank(evidence[existingIndex]!)) {
        evidence[existingIndex] = candidate;
      }
      return;
    }
    evidence.push(candidate);
  };

  for (const item of existing.contactEvidence ?? []) {
    // Prior evidence is retained only as low-confidence provider context until
    // the current bounded crawl observes the same contact route again.
    addEvidence(item.kind, item.value, item.sourceUrl, "existing_provider", "low");
  }
  if (existing.phone) addEvidence("phone", existing.phone, baseWebsite, "existing_provider", "medium");
  if (existing.contactPageUrl) addEvidence("contact_page", existing.contactPageUrl, existing.contactPageUrl, "existing_provider", "medium");
  if (existing.contactFormUrl) addEvidence("contact_form", existing.contactFormUrl, existing.contactFormUrl, "existing_provider", "medium");
  if (existing.quoteFormUrl) addEvidence("quote_form", existing.quoteFormUrl, existing.quoteFormUrl, "existing_provider", "medium");
  if (existing.facebookUrl) addEvidence("facebook", existing.facebookUrl, baseWebsite, "existing_provider", "medium");
  if (existing.instagramUrl) addEvidence("instagram", existing.instagramUrl, baseWebsite, "existing_provider", "medium");
  if (existing.linkedinUrl) addEvidence("linkedin", existing.linkedinUrl, baseWebsite, "existing_provider", "medium");
  if (existing.xUrl) addEvidence("x", existing.xUrl, baseWebsite, "existing_provider", "medium");
  if (existing.youtubeUrl) addEvidence("youtube", existing.youtubeUrl, baseWebsite, "existing_provider", "medium");

  for (const page of pages) {
    const text = cleanHtmlText(page.html);
    if (new URL(page.url).origin !== baseOrigin) continue;
    const lower = text.toLowerCase();
    const links = extractLinks(page.html, page.url);
    for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) {
      addEvidence("email", email, page.url, "visible_text", emailDomainMatchesWebsite(email, baseWebsite) ? "high" : "medium");
    }
    for (const match of page.html.matchAll(/href\s*=\s*["']mailto:([^?"']+)/gi)) {
      if (match[1]) {
        const email = decodeURIComponent(match[1]);
        addEvidence("email", email, page.url, "mailto", emailDomainMatchesWebsite(email, baseWebsite) ? "high" : "medium");
      }
    }
    for (const match of page.html.matchAll(/href\s*=\s*["']tel:([^"']+)/gi)) {
      if (match[1]) addEvidence("phone", decodeURIComponent(match[1]), page.url, "tel", "high");
    }
    for (const candidate of visiblePhoneNumbers(text)) {
      addEvidence("phone", candidate, page.url, "visible_text", "medium");
    }
    const structured = jsonLdContactValues(page.html);
    for (const email of structured.emails) {
      addEvidence("email", email, page.url, "json_ld", emailDomainMatchesWebsite(email, baseWebsite) ? "high" : "medium");
    }
    for (const candidate of structured.phones) {
      addEvidence("phone", candidate, page.url, "json_ld", "high");
    }
    const metadata = metadataContactValues(page.html);
    for (const email of metadata.emails) {
      addEvidence("email", email, page.url, "metadata", emailDomainMatchesWebsite(email, baseWebsite) ? "high" : "medium");
    }
    for (const candidate of metadata.phones) {
      addEvidence("phone", candidate, page.url, "metadata", "medium");
    }
    for (const link of links) {
      if (/facebook\.com|fb\.com/i.test(link) && !facebookUrl) {
        facebookUrl = cleanSocialUrl(link);
        addEvidence("facebook", facebookUrl, page.url, "same_origin_link", "high");
      }
      if (/instagram\.com/i.test(link) && !instagramUrl) {
        instagramUrl = cleanSocialUrl(link);
        addEvidence("instagram", instagramUrl, page.url, "same_origin_link", "high");
      }
      if (/linkedin\.com/i.test(link) && !linkedinUrl) {
        linkedinUrl = cleanSocialUrl(link);
        addEvidence("linkedin", linkedinUrl, page.url, "same_origin_link", "high");
      }
      if (/(?:^|\/\/)(?:www\.)?(?:x|twitter)\.com/i.test(link) && !xUrl) {
        xUrl = cleanSocialUrl(link);
        addEvidence("x", xUrl, page.url, "same_origin_link", "high");
      }
      if (/youtube\.com|youtu\.be/i.test(link) && !youtubeUrl) {
        youtubeUrl = cleanSocialUrl(link);
        addEvidence("youtube", youtubeUrl, page.url, "same_origin_link", "high");
      }
    }
    if (!contactPageUrl && pageLooksLikeContact(page.url, lower)) {
      contactPageUrl = page.url;
      addEvidence("contact_page", page.url, page.url, "same_origin_link", "high");
    }
    const hasDetectedForm = detectForm(page.html, lower);
    if (hasDetectedForm && pageLooksLikeQuote(page.url, lower)) {
      quoteFormDetected = true;
      quoteFormUrl ||= page.url;
      addEvidence("quote_form", page.url, page.url, "form_markup", "high");
    } else if (hasDetectedForm) {
      contactFormDetected = true;
      contactFormUrl ||= page.url;
      addEvidence("contact_form", page.url, page.url, "form_markup", "high");
    }
  }

  if (!contactPageUrl) {
    contactPageUrl = pageUrls.find((url) => /contact/i.test(url)) ?? "";
  }
  if (quoteFormUrl) notes.push("Quote/request estimate form detected; form was not submitted.");
  if (contactFormUrl) notes.push("Contact form detected; form was not submitted.");
  if (facebookUrl || instagramUrl || linkedinUrl) notes.push("Public social profile link found on scanned website pages.");

  if (existing.email && emailAllowed(existing.email)) {
    addEvidence(
      "email",
      existing.email,
      existing.contactPageUrl || baseWebsite,
      "existing_provider",
      "low",
    );
  }
  const email = bestEmail(evidence, existing);
  phone ||= evidence.find((item) => item.kind === "phone")?.value ?? "";
  const result = {
    phone,
    email,
    contactPageUrl: existing.contactPageUrl || contactPageUrl,
    contactFormUrl: existing.contactFormUrl || contactFormUrl,
    quoteFormUrl: existing.quoteFormUrl || quoteFormUrl,
    contactFormDetected: Boolean(existing.contactFormDetected || contactFormDetected),
    quoteFormDetected: Boolean(existing.quoteFormDetected || quoteFormDetected),
    facebookUrl: existing.facebookUrl || facebookUrl,
    instagramUrl: existing.instagramUrl || instagramUrl,
    linkedinUrl: existing.linkedinUrl || linkedinUrl,
    xUrl: existing.xUrl || xUrl,
    youtubeUrl: existing.youtubeUrl || youtubeUrl,
    contactPersonName: existing.contactPersonName ?? "",
    contactConfidence: "low" as const,
    bestManualContactMethod: "unknown" as const,
    contactDiscoveryNotes: notes,
    contactEvidence: evidence,
  };
  return {
    ...result,
    contactConfidence: prospectContactConfidence({ ...existing, ...result }),
    bestManualContactMethod: prospectBestManualContactMethod({ ...existing, ...result }),
  };
}

function likelyContactPageUrl(value: string) {
  try {
    const path = new URL(value).pathname.toLowerCase();
    return contactPathSignals.some((signal) => path.includes(signal));
  } catch {
    return false;
  }
}

export async function discoverWebsiteContactPaths(prospect: Prospect): Promise<Prospect> {
  if (!prospect.website) return prospect;
  const root = await assertPublicUrl(prospect.website);
  const candidates = new Set<string>([root.href]);
  for (const path of contactPathSignals) candidates.add(new URL(`/${path}`, root.origin).href);
  const fetched: ContactDiscoveryPage[] = [];
  const queue = [...candidates];
  for (let index = 0; index < queue.length && index < 10; index += 1) {
    const candidate = queue[index];
    try {
      const pageUrl = await assertPublicUrl(candidate);
      if (pageUrl.origin !== root.origin) continue;
      await assertRobotsAllowed(pageUrl);
      const { response, url } = await fetchPublicPage(pageUrl.href);
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) continue;
      const html = await readLimitedText(response);
      fetched.push({ url: url.href, html });
      if (fetched.length === 1) {
        for (const link of extractLinks(html, url.href)) {
          const parsed = new URL(link);
          if (parsed.origin === root.origin && likelyContactPageUrl(parsed.href) && !candidates.has(parsed.href)) {
            candidates.add(parsed.href);
            queue.push(parsed.href);
          }
        }
      }
    } catch {
      // Contact discovery is enrichment only; failed auxiliary pages should not block analysis.
    }
  }
  const discovery = extractContactDiscoveryFromPages(root.href, fetched, prospect);
  const updated = {
    ...prospect,
    ...discovery,
    state: displayStateCode(prospect.state),
  };
  return reconcileProspectContactRouting({
    ...updated,
    recommendedContactMethod: recommendProspectContactMethod(updated),
  }, discovery.contactEvidence.filter((item) => item.kind === "email").map((item) => item.value));
}

function countMatches(value: string, expression: RegExp) {
  return value.match(expression)?.length ?? 0;
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function analyzeWebsiteHtml(prospect: Prospect, html: string, finalUrl: string): Analysis {
  const url = new URL(finalUrl);
  const lower = html.toLowerCase();
  const text = lower.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
  const imageCount = countMatches(lower, /<img\b/g);
  const ctaCount = countMatches(text, /\b(request (a )?(quote|estimate)|get (a )?(quote|estimate)|schedule|book|call now|contact us)\b/g);
  const trustCount = countMatches(text, /\b(review|testimonial|licensed|insured|warranty|guarantee|years of experience|locally owned)\b/g);
  const portfolioCount = countMatches(text, /\b(projects?|portfolio|gallery|recent work|before and after|our work)\b/g);
  const serviceCount = countMatches(text, /\b(services?|repair|replacement|installation|maintenance|inspection)\b/g);

  const scores: Record<ScoreKey, number> = {
    mobileExperience: boundedScore((lower.includes('name="viewport"') ? 72 : 24) + (lower.includes("@media") ? 18 : 0) + (lower.includes("width=device-width") ? 10 : 0)),
    visualDesign: boundedScore(32 + Math.min(imageCount, 8) * 5 + (lower.includes("<style") || lower.includes('rel="stylesheet"') ? 18 : 0) + (lower.includes("<section") ? 10 : 0)),
    ctaStrength: boundedScore(24 + Math.min(ctaCount, 4) * 18 + (lower.includes("tel:") ? 8 : 0)),
    trustSignals: boundedScore(20 + Math.min(trustCount, 6) * 11 + (lower.includes("schema.org") ? 10 : 0)),
    contactAccessibility: boundedScore(20 + (lower.includes("tel:") ? 28 : 0) + (lower.includes("mailto:") ? 18 : 0) + (lower.includes("<form") ? 24 : 0)),
    portfolioQuality: boundedScore(20 + Math.min(portfolioCount, 4) * 15 + Math.min(imageCount, 6) * 4),
    brandingQuality: boundedScore(25 + (lower.includes("<title") ? 18 : 0) + (lower.includes("logo") ? 18 : 0) + (lower.includes('rel="icon') ? 12 : 0) + (lower.includes('name="description"') ? 15 : 0)),
    conversionReadiness: boundedScore(20 + Math.min(ctaCount, 3) * 15 + (lower.includes("<form") ? 25 : 0) + Math.min(serviceCount, 4) * 5),
    technicalQuality: boundedScore(20 + (url.protocol === "https:" ? 20 : 0) + (lower.includes("<title") ? 15 : 0) + (lower.includes('name="description"') ? 15 : 0) + (lower.includes("<h1") ? 15 : 0) + (lower.includes("<html lang=") ? 10 : 0)),
  };

  const keys = Object.keys(scores) as ScoreKey[];
  const overallScore = Math.round(keys.reduce((sum, key) => sum + scores[key], 0) / keys.length);
  const ranked = [...keys].sort((a, b) => scores[b] - scores[a]);
  const strengths = ranked.slice(0, 2).map((key) => `${scoreLabels[key]} is a relative strength at ${scores[key]}/100.`);
  const weaknesses = ranked.slice(-3).reverse().map((key) => `${scoreLabels[key]} is a conversion opportunity at ${scores[key]}/100.`);

  return {
    overallScore,
    opportunityRating: overallScore < 55 ? "High" : overallScore < 72 ? "Medium" : "Low",
    scores,
    strengths,
    weaknesses,
    summary: `The homepage returned successfully and showed ${ctaCount} clear call-to-action signal${ctaCount === 1 ? "" : "s"}, ${trustCount} trust signal${trustCount === 1 ? "" : "s"}, and ${portfolioCount} portfolio or recent-work signal${portfolioCount === 1 ? "" : "s"}.`,
    redesignDirection: `Build a mobile-first ${prospect.trade.toLowerCase()} site that preserves the strongest existing signals while improving ${ranked.slice(-2).map((key) => scoreLabels[key].toLowerCase()).join(" and ")}.`,
    analyzedAt: new Date().toISOString(),
  };
}

type VerificationAttemptResult = {
  attempt: WebsiteVerificationAttempt;
  html: string;
  meaningful: boolean;
  usableSignals: string[];
  definitiveInactive: boolean;
};

function verificationNow(dependencies: WebsiteVerificationDependencies) {
  return dependencies.now?.() ?? new Date();
}

function safeFailureCategory(error: unknown): WebsiteVerificationFailureCategory {
  const signals = `${error instanceof Error ? error.name : ""} ${error instanceof Error ? error.message : String(error)}`.toLowerCase();
  if (/robots\.txt does not allow/.test(signals)) return "robots_block";
  if (/timeout|abort/.test(signals)) return "timeout";
  if (/enotfound|dns/.test(signals)) return "dns";
  if (/econn|connection|fetch failed|network/.test(signals)) return "connection";
  if (/redirect/.test(signals)) return "redirect";
  if (/only http|credentials|unsupported port|invalid url|failed to parse/.test(signals)) return "invalid_url";
  if (/private|localhost|unsupported network/.test(signals)) return "unsafe_url";
  return "unknown";
}

function looksBotBlocked(status: number, html: string) {
  return [403, 429].includes(status)
    || /\b(?:captcha|checking your browser|verify you are human|access denied|request blocked|bot detection|cloudflare ray id|cf-chl|akamai reference|incapsula incident)\b/i.test(html);
}

function looksDefinitivelyInactive(html: string) {
  const text = cleanHtmlText(html);
  return /\b(?:domain (?:is )?(?:for sale|not configured|has expired|parked)|parked domain|website (?:is )?(?:suspended|disabled|under construction)|account suspended|site not found|this site can(?:not|'t) be reached|there is nothing here yet|hosting account has expired|future home of)\b/i.test(text);
}

function inspectMeaningfulBusinessHtml(html: string, businessName: string) {
  const text = cleanHtmlText(html);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
  const errorLike = looksBotBlocked(200, html)
    || looksDefinitivelyInactive(html)
    || /\b(?:internal server error|bad gateway|service unavailable|gateway timeout|error 5\d\d|default web site page|coming soon)\b/i.test(`${title} ${text.slice(0, 1200)}`);
  const normalizedBusiness = businessName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const signals = [
    title.length >= 4 && !/\b(?:error|not found|for sale|coming soon)\b/i.test(title) ? "meaningful page title" : "",
    text.length >= 250 ? "meaningful visible content" : "",
    normalizedBusiness.length >= 4 && normalizedText.includes(normalizedBusiness) ? "business name" : "",
    /<(?:nav|header)\b/i.test(html) || /\b(?:home|services|about|contact)\b/i.test(text) ? "navigation" : "",
    /\b(?:service|repair|installation|cleaning|roofing|landscaping|heating|cooling|plumbing|electrical|painting|concrete)\b/i.test(text) ? "service content" : "",
    /href\s*=\s*["']tel:/i.test(html) ? "click-to-call" : "",
    /href\s*=\s*["']mailto:/i.test(html) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ? "public email" : "",
    /<form\b/i.test(html) ? "contact or quote form" : "",
    /name\s*=\s*["']viewport["']/i.test(html) ? "mobile viewport" : "",
    /<img\b/i.test(html) ? "business imagery" : "",
    /schema\.org|application\/ld\+json/i.test(html) ? "structured business data" : "",
    /facebook\.com|instagram\.com|linkedin\.com/i.test(html) ? "social links" : "",
  ].filter(Boolean);
  const meaningful = !errorLike
    && text.length >= 120
    && (signals.length >= 4 || (signals.includes("business name") && signals.length >= 3));
  return { meaningful, signals, definitiveInactive: looksDefinitivelyInactive(html) };
}

function attemptCategory(status: number, contentType: string, html: string, meaningful: boolean): WebsiteVerificationFailureCategory {
  if (meaningful && status >= 200 && status < 300) return "none";
  if (looksBotBlocked(status, html)) return "bot_block";
  if ([404, 410].includes(status)) return "http_inactive";
  if ([408, 425, 500, 502, 503, 504, 507, 508].includes(status)) return "http_transient";
  if (status >= 400 && status < 500) return "http_client";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return "unsupported_content";
  return "empty_or_error_page";
}

function retryWithBrowserHeaders(category: WebsiteVerificationFailureCategory) {
  return ["bot_block", "http_transient", "timeout", "dns", "connection"].includes(category);
}

async function robotsAllowedFor(
  url: URL,
  dependencies: WebsiteVerificationDependencies,
  cache: Map<string, boolean>,
) {
  const cacheKey = `${url.origin}${url.pathname || "/"}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? false;
  try {
    const allowed = dependencies.robotsPolicy
      ? await dependencies.robotsPolicy(url)
      : await assertRobotsAllowed(url, {
        fetchImpl: dependencies.fetch,
        lookupAddresses: dependencies.lookup,
      });
    cache.set(cacheKey, allowed !== false);
    return allowed !== false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("robots.txt does not allow")) {
      cache.set(cacheKey, false);
      return false;
    }
    cache.set(cacheKey, true);
    return true;
  }
}

async function runVerificationAttempt(
  requestedUrl: string,
  businessName: string,
  browserCompatibleHeaders: boolean,
  dependencies: WebsiteVerificationDependencies,
  robotsCache: Map<string, boolean>,
): Promise<VerificationAttemptResult> {
  const startedAt = Date.now();
  const timestamp = verificationNow(dependencies).toISOString();
  let normalizedUrl = requestedUrl;
  try {
    const safeUrl = await assertPublicUrl(requestedUrl, dependencies.lookup ?? defaultLookup);
    normalizedUrl = safeUrl.href;
    const robotsAllowed = await robotsAllowedFor(safeUrl, dependencies, robotsCache);
    if (!robotsAllowed) {
      return {
        attempt: {
          requestedUrl,
          normalizedUrl,
          finalUrl: "",
          httpStatus: null,
          redirectChain: [],
          contentType: "",
          durationMs: Date.now() - startedAt,
          failureCategory: "robots_block",
          robotsAllowed: false,
          botBlocked: false,
          browserCompatibleHeaders,
          timestamp,
        },
        html: "",
        meaningful: false,
        usableSignals: [],
        definitiveInactive: false,
      };
    }
    const { response, url, redirectChain } = await fetchPublicPage(safeUrl.href, {
      browserCompatible: browserCompatibleHeaders,
      fetchImpl: dependencies.fetch,
      lookupAddresses: dependencies.lookup,
      onRedirectTarget: async (redirectUrl) => {
        if (!await robotsAllowedFor(redirectUrl, dependencies, robotsCache)) {
          throw new Error("Website robots.txt does not allow analysis of this page.");
        }
      },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const html = contentType.includes("text/html") || contentType.includes("application/xhtml+xml") || contentType.includes("text/plain")
      ? await readLimitedText(response)
      : "";
    const inspection = inspectMeaningfulBusinessHtml(html, businessName);
    const failureCategory = attemptCategory(response.status, contentType, html, inspection.meaningful);
    return {
      attempt: {
        requestedUrl,
        normalizedUrl,
        finalUrl: url.href,
        httpStatus: response.status,
        redirectChain,
        contentType,
        durationMs: Date.now() - startedAt,
        failureCategory,
        robotsAllowed: true,
        botBlocked: failureCategory === "bot_block",
        browserCompatibleHeaders,
        timestamp,
      },
      html,
      meaningful: failureCategory === "none",
      usableSignals: inspection.signals,
      definitiveInactive: inspection.definitiveInactive,
    };
  } catch (error) {
    const failureCategory = safeFailureCategory(error);
    return {
      attempt: {
        requestedUrl,
        normalizedUrl,
        finalUrl: "",
        httpStatus: null,
        redirectChain: [],
        contentType: "",
        durationMs: Date.now() - startedAt,
        failureCategory,
        robotsAllowed: failureCategory !== "robots_block",
        botBlocked: failureCategory === "bot_block",
        browserCompatibleHeaders,
        timestamp,
      },
      html: "",
      meaningful: false,
      usableSignals: [],
      definitiveInactive: false,
    };
  }
}

function websiteCandidateUrls(value: string) {
  const original = new URL(value);
  const candidates = new Set<string>([original.href]);
  const httpsRoot = new URL("/", original);
  httpsRoot.protocol = "https:";
  httpsRoot.port = "";
  candidates.add(httpsRoot.href);
  const alternate = new URL(httpsRoot);
  alternate.hostname = alternate.hostname.startsWith("www.")
    ? alternate.hostname.slice(4)
    : `www.${alternate.hostname}`;
  candidates.add(alternate.href);
  return [...candidates];
}

function equivalentOwnedHost(left: string, right: string) {
  const normalize = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  return normalize(left) === normalize(right);
}

async function canonicalUrlFromHtml(
  html: string,
  finalUrl: string,
  dependencies: WebsiteVerificationDependencies,
) {
  const href = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i)?.[1]
    ?? html.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*canonical[^"']*["']/i)?.[1]
    ?? "";
  if (!href) return finalUrl;
  try {
    const candidate = await assertPublicUrl(new URL(href, finalUrl).href, dependencies.lookup ?? defaultLookup);
    return equivalentOwnedHost(candidate.href, finalUrl) ? candidate.href : finalUrl;
  } catch {
    return finalUrl;
  }
}

function classifyVerification(
  results: VerificationAttemptResult[],
): Pick<WebsiteVerificationReport, "status" | "confidence" | "explanation"> {
  const attempts = results.map((result) => result.attempt);
  const distinctInactiveUrls = new Set(
    attempts.filter((attempt) => attempt.failureCategory === "http_inactive").map((attempt) => attempt.normalizedUrl),
  );
  if (distinctInactiveUrls.size >= 2) {
    return {
      status: "confirmed_inactive",
      confidence: "high",
      explanation: "Independent safe URL variants consistently returned HTTP 404 or 410.",
    };
  }
  const distinctDefinitivePages = new Set(
    results.filter((result) => result.definitiveInactive).map((result) => result.attempt.normalizedUrl),
  );
  if (distinctDefinitivePages.size >= 2) {
    return {
      status: "confirmed_broken",
      confidence: "high",
      explanation: "Independent safe URL variants consistently returned a definite inactive or unconfigured-site page.",
    };
  }
  if (attempts.length && attempts.every((attempt) => ["bot_block", "robots_block"].includes(attempt.failureCategory))) {
    return {
      status: "crawler_blocked",
      confidence: "medium",
      explanation: "The website blocked automated verification or disallowed the requested pages. No broken-site conclusion was made.",
    };
  }
  if (
    attempts.some((attempt) => ["http_transient", "timeout", "dns", "connection"].includes(attempt.failureCategory))
    && attempts.every((attempt) => ["http_transient", "timeout", "dns", "connection", "bot_block"].includes(attempt.failureCategory))
  ) {
    return {
      status: "temporarily_unavailable",
      confidence: "medium",
      explanation: "Only temporary server, DNS, connection, or crawler-specific failures were observed. The website was not classified as broken.",
    };
  }
  if (attempts.length && attempts.every((attempt) => ["invalid_url", "unsafe_url"].includes(attempt.failureCategory))) {
    return {
      status: "invalid_website",
      confidence: "high",
      explanation: "The stored website URL is invalid or cannot be safely verified.",
    };
  }
  return {
    status: "inconclusive",
    confidence: "low",
    explanation: "The bounded checks did not provide enough independent evidence to confirm a usable, broken, inactive, or absent website.",
  };
}

async function collectContactPages(
  rootUrl: string,
  initialPage: ContactDiscoveryPage,
  dependencies: WebsiteVerificationDependencies,
  robotsCache: Map<string, boolean>,
) {
  const root = new URL(rootUrl);
  const candidates = new Set<string>([initialPage.url]);
  for (const link of extractLinks(initialPage.html, initialPage.url)) {
    try {
      const parsed = new URL(link);
      if (parsed.origin === root.origin && likelyContactPageUrl(parsed.href)) candidates.add(parsed.href);
    } catch {
      // Malformed links are not contact evidence.
    }
  }
  for (const path of contactPathSignals) candidates.add(new URL(`/${path}`, root.origin).href);
  const pages = [initialPage];
  let attemptedPages = 0;
  for (const candidate of candidates) {
    if (candidate === initialPage.url) continue;
    if (attemptedPages >= maxContactPages) break;
    attemptedPages += 1;
    try {
      const safeUrl = await assertPublicUrl(candidate, dependencies.lookup ?? defaultLookup);
      if (safeUrl.origin !== root.origin || !await robotsAllowedFor(safeUrl, dependencies, robotsCache)) continue;
      const { response, url } = await fetchPublicPage(safeUrl.href, {
        fetchImpl: dependencies.fetch,
        lookupAddresses: dependencies.lookup,
        onRedirectTarget: async (redirectUrl) => {
          if (redirectUrl.origin !== root.origin) {
            throw new Error("Contact page redirected outside the verified website origin.");
          }
          if (!await robotsAllowedFor(redirectUrl, dependencies, robotsCache)) {
            throw new Error("Website robots.txt does not allow analysis of this page.");
          }
        },
      });
      if (url.origin !== root.origin) continue;
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) continue;
      pages.push({ url: url.href, html: await readLimitedText(response) });
    } catch {
      // Auxiliary contact-page failures never change the verified website result.
    }
  }
  return pages;
}

export type ProspectWebsiteVerificationResult = {
  prospect: Prospect;
  analysis?: Analysis;
  report: WebsiteVerificationReport;
};

function fitDispositionForVerifiedWebsite(
  analysis: Analysis,
  prospect: Prospect,
  usableSignals: string[],
): ProspectFitDisposition {
  const signals = new Set(usableSignals);
  const hasContactPath = Boolean(
    prospect.contactFormDetected
    || prospect.quoteFormDetected
    || prospect.email
    || prospect.phone,
  );
  const establishedSignals = [
    signals.has("meaningful page title"),
    signals.has("navigation"),
    signals.has("service content"),
    signals.has("mobile viewport"),
    hasContactPath,
    signals.has("business imagery") || signals.has("structured business data"),
  ].filter(Boolean).length;
  if (establishedSignals >= 5) return "confirmed_usable_not_fit";

  const severeDefects = [
    !signals.has("navigation"),
    !signals.has("service content"),
    !signals.has("mobile viewport"),
    !hasContactPath,
    analysis.scores.technicalQuality <= 30,
  ].filter(Boolean).length;
  if (severeDefects >= 2) return "genuine_redesign_opportunity";
  if (severeDefects === 1 && analysis.overallScore < 60) return "weak_redesign_opportunity";
  return "manual_review_required";
}

const discoveryAbsenceSources = new Set(["osm", "google", "bing", "yelp", "yellowPages"]);
const authoritativeAbsenceSources = new Set(["google", "bing", "yelp"]);

function officialSocialProfileStored(prospect: Prospect) {
  const values = [
    prospect.profileUrl,
    prospect.facebookUrl,
    prospect.instagramUrl,
    prospect.linkedinUrl,
  ].filter(Boolean);
  return values.some((value) => {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      return [
        "facebook.com",
        "instagram.com",
        "linkedin.com",
        "x.com",
        "twitter.com",
        "youtube.com",
      ].some((domain) => host === domain || host.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  });
}

function boundedNoOwnedWebsiteEvidence(prospect: Prospect) {
  if (prospect.website.trim() || prospect.prospectType !== "no_website_social_only" || prospect.inactive) return [];
  const sources = [...new Set(prospect.activitySignals
    .filter((signal) => signal.startsWith("discovery_source:"))
    .map((signal) => signal.slice("discovery_source:".length))
    .filter((source) => discoveryAbsenceSources.has(source)))];
  const hasGroundedIdentity = Boolean(
    prospect.businessName.trim()
    && prospect.city.trim()
    && (prospect.phone.trim() || prospect.email.trim() || prospect.profileUrl.trim()),
  );
  if (!hasGroundedIdentity) return [];
  const multipleIndependentListings = sources.length >= 2 && prospect.sourceConfidence >= 36;
  const authoritativeListingAndSocial = sources.some((source) => authoritativeAbsenceSources.has(source))
    && officialSocialProfileStored(prospect)
    && prospect.sourceConfidence >= 22;
  return multipleIndependentListings || authoritativeListingAndSocial ? sources : [];
}

function noWebsiteReport(prospect: Prospect, dependencies: WebsiteVerificationDependencies): WebsiteVerificationReport {
  const checkedAt = verificationNow(dependencies).toISOString();
  const priorVerifiedAbsence = prospect.websiteVerification?.version === "website-verification-v1"
    && prospect.websiteVerification.status === "no_owned_website"
    && prospect.websiteVerification.confidence === "high";
  const boundedEvidence = boundedNoOwnedWebsiteEvidence(prospect);
  const verifiedAbsence = priorVerifiedAbsence || boundedEvidence.length > 0;
  const evidenceDetail = boundedEvidence.length
    ? ` Independent provider evidence: ${boundedEvidence.join(", ")}.`
    : "";
  return {
    version: "website-verification-v1",
    status: verifiedAbsence ? "no_owned_website" : "inconclusive",
    confidence: verifiedAbsence ? "high" : "low",
    canonicalUrl: "",
    attempts: [],
    usableSignals: [],
    explanation: verifiedAbsence
      ? `Verified bounded public research found no owned business website.${evidenceDetail}`.trim()
      : "No owned website URL is stored, but absence has not been independently verified.",
    checkedAt,
  };
}

export async function verifyProspectWebsite(
  prospect: Prospect,
  dependencies: WebsiteVerificationDependencies = {},
): Promise<ProspectWebsiteVerificationResult> {
  if (!prospect.website.trim()) {
    const report = noWebsiteReport(prospect, dependencies);
    const reviewed = report.status === "no_owned_website"
      ? withPresenceGapReview(prospect, "no_owned_website", report.explanation)
      : {
          ...prospect,
          websiteStatus: "inconclusive" as const,
          websiteStatusDetail: report.explanation,
          websiteAnalysisAttemptedAt: report.checkedAt,
          recommendedContactMethod: "needs_manual_contact_research" as const,
        };
    const updated = { ...reviewed, websiteVerification: report, fitDisposition: "manual_review_required" as const };
    return { prospect: updated, report };
  }

  const robotsCache = new Map<string, boolean>();
  let candidates: string[];
  try {
    candidates = websiteCandidateUrls(prospect.website);
  } catch {
    const checkedAt = verificationNow(dependencies).toISOString();
    const report: WebsiteVerificationReport = {
      version: "website-verification-v1",
      status: "invalid_website",
      confidence: "high",
      canonicalUrl: "",
      attempts: [],
      usableSignals: [],
      explanation: "The stored website URL is invalid and requires manual correction.",
      checkedAt,
    };
    return {
      prospect: {
        ...prospect,
        websiteStatus: report.status,
        websiteStatusDetail: report.explanation,
        websiteAnalysisAttemptedAt: checkedAt,
        websiteVerification: report,
        fitDisposition: "manual_review_required",
        recommendedContactMethod: "needs_manual_contact_research",
      },
      report,
    };
  }

  const results: VerificationAttemptResult[] = [];
  let successful: VerificationAttemptResult | undefined;
  for (const candidate of candidates) {
    if (results.length >= maxVerificationAttempts) break;
    const crawlerResult = await runVerificationAttempt(candidate, prospect.businessName, false, dependencies, robotsCache);
    results.push(crawlerResult);
    if (crawlerResult.meaningful) {
      successful = crawlerResult;
      break;
    }
    if (results.length < maxVerificationAttempts && retryWithBrowserHeaders(crawlerResult.attempt.failureCategory)) {
      const browserResult = await runVerificationAttempt(candidate, prospect.businessName, true, dependencies, robotsCache);
      results.push(browserResult);
      if (browserResult.meaningful) {
        successful = browserResult;
        break;
      }
    }
  }

  const checkedAt = verificationNow(dependencies).toISOString();
  if (successful) {
    const finalUrl = successful.attempt.finalUrl || successful.attempt.normalizedUrl;
    const canonicalUrl = await canonicalUrlFromHtml(successful.html, finalUrl, dependencies);
    const pages = await collectContactPages(
      canonicalUrl,
      { url: canonicalUrl, html: successful.html },
      dependencies,
      robotsCache,
    );
    const contact = extractContactDiscoveryFromPages(canonicalUrl, pages, prospect);
    const contactProspect = reconcileProspectContactRouting({
      ...prospect,
      ...contact,
      contactPersonName: prospect.contactPersonName,
      website: canonicalUrl,
      websiteStatus: "usable",
      websiteStatusDetail: "A meaningful public business website was verified.",
      websiteAnalysisAttemptedAt: checkedAt,
      prospectType: "redesign",
      classification: "website_redesign",
      inactive: false,
    }, contact.contactEvidence.filter((item) => item.kind === "email").map((item) => item.value));
    const analysis = analyzeWebsiteHtml(contactProspect, successful.html, finalUrl);
    const switchingFromPresenceGap = prospect.prospectType === "no_website_social_only";
    const report: WebsiteVerificationReport = {
      version: "website-verification-v1",
      status: "usable",
      confidence: "high",
      canonicalUrl,
      attempts: results.map((result) => result.attempt),
      usableSignals: successful.usableSignals,
      explanation: "A meaningful public business website was verified. Earlier transient or crawler-specific failures, if any, did not override the successful evidence.",
      checkedAt,
    };
    const updated = {
      ...contactProspect,
      websiteStatus: "usable" as const,
      websiteStatusDetail: report.explanation,
      websiteVerification: report,
      websiteAnalysisAttemptedAt: checkedAt,
      analysis,
      outreach: switchingFromPresenceGap ? undefined : prospect.outreach,
      preview: switchingFromPresenceGap ? undefined : prospect.preview,
      priorityScore: calculatePriority(analysis, prospect.sizeIndicator, prospect.serviceArea),
      status: prospect.status === "New" ? "Reviewed" as const : prospect.status,
      fitDisposition: fitDispositionForVerifiedWebsite(analysis, contactProspect, successful.usableSignals),
      activities: [activity("analysis", `Website verified as usable after ${results.length} bounded attempt${results.length === 1 ? "" : "s"}; contact paths were refreshed. Nothing was sent.`), ...prospect.activities],
    };
    return { prospect: updated, analysis, report };
  }

  const classification = classifyVerification(results);
  const report: WebsiteVerificationReport = {
    version: "website-verification-v1",
    ...classification,
    canonicalUrl: "",
    attempts: results.map((result) => result.attempt),
    usableSignals: [],
    checkedAt,
  };
  if (report.status === "confirmed_broken" || report.status === "confirmed_inactive") {
    const presenceGap = withPresenceGapReview(prospect, report.status, report.explanation);
    return {
      prospect: {
        ...presenceGap,
        websiteVerification: report,
        fitDisposition: "manual_review_required",
      },
      report,
    };
  }
  return {
    prospect: {
      ...prospect,
      prospectType: "redesign",
      classification: "website_redesign",
      websiteStatus: report.status,
      websiteStatusDetail: report.explanation,
      websiteAnalysisAttemptedAt: checkedAt,
      websiteVerification: report,
      fitDisposition: "manual_review_required",
      recommendedContactMethod: "needs_manual_contact_research",
      status: prospect.status === "New" ? "Reviewed" : prospect.status,
      activities: [activity("analysis", `${report.explanation} Manual review is required. Nothing was sent.`), ...prospect.activities],
    },
    report,
  };
}

export async function analyzePublicWebsite(prospect: Prospect): Promise<Analysis> {
  const requestedUrl = await assertPublicUrl(prospect.website);
  const analyzedHosts = globalAnalysis.analyzedHosts ?? new Map<string, number>();
  globalAnalysis.analyzedHosts = analyzedHosts;
  const lastAnalyzedAt = analyzedHosts.get(requestedUrl.hostname) ?? 0;
  if (Date.now() - lastAnalyzedAt < 10_000) throw new Error("Please wait before analyzing this website again.");
  analyzedHosts.set(requestedUrl.hostname, Date.now());
  const result = await verifyProspectWebsite(prospect);
  if (!result.analysis) throw new Error(result.report.explanation);
  return result.analysis;
}
