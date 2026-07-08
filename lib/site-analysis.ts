import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  displayStateCode,
  prospectBestManualContactMethod,
  prospectContactConfidence,
  prospectEmailNeedsManualVerification,
  recommendProspectContactMethod,
  scoreLabels,
  type Analysis,
  type Prospect,
  type ScoreKey,
  type WebsiteAvailabilityStatus,
} from "@/lib/prospect-engine";

const userAgent = "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)";
const maxResponseBytes = 2_000_000;
const globalAnalysis = globalThis as typeof globalThis & { analyzedHosts?: Map<string, number> };

export type WebsiteAnalysisFailure = {
  status: Exclude<WebsiteAvailabilityStatus, "unknown" | "usable" | "no_owned_website">;
  detail: string;
};

export function classifyWebsiteAnalysisFailure(error: unknown): WebsiteAnalysisFailure | null {
  const message = error instanceof Error ? error.message : String(error);
  const signals = `${error instanceof Error ? error.name : ""} ${message}`.toLowerCase();
  if (/website returned http 404\b/.test(signals)) return { status: "http_404", detail: "Website returned HTTP 404." };
  if (/website returned http 410\b/.test(signals)) return { status: "inactive_website", detail: "Website returned HTTP 410 and appears inactive." };
  if (/website returned http 400\b/.test(signals)) return { status: "invalid_website", detail: message };
  if (/website returned http (?:408|5\d\d)\b|invalid redirect|redirected too many times/.test(signals)) {
    return { status: "broken_website", detail: message };
  }
  if (/only http|credentials cannot|unsupported port|local websites|private or unsupported|invalid url|failed to parse url/.test(signals)) {
    return { status: "invalid_website", detail: message };
  }
  if (/timeout|abort|fetch failed|enotfound|econnrefused|econnreset|network|dns/.test(signals)) {
    return { status: "unreachable_website", detail: "Website could not be reached and appears broken or inactive." };
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

async function assertPublicUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites can be analyzed.");
  if (url.username || url.password) throw new Error("Website URLs with credentials cannot be analyzed.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Website URL uses an unsupported port.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local websites cannot be analyzed.");

  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Website resolves to a private or unsupported network address.");
  }
  return url;
}

async function fetchPublicPage(value: string) {
  let url = await assertPublicUrl(value);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": userAgent, Accept: "text/html,text/plain;q=0.8,*/*;q=0.2" },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website returned an invalid redirect.");
      url = await assertPublicUrl(new URL(location, url).href);
      continue;
    }
    return { response, url };
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

async function assertRobotsAllowed(url: URL) {
  try {
    const { response } = await fetchPublicPage(new URL("/robots.txt", url.origin).href);
    if (!response.ok) return;
    const robots = await readLimitedText(response);
    if (robotsDisallows(robots, url.pathname || "/")) throw new Error("Website robots.txt does not allow analysis of this page.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("robots.txt does not allow")) throw error;
  }
}

export type ContactDiscoveryPage = {
  url: string;
  html: string;
};

export type ContactDiscoveryResult = Pick<
  Prospect,
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
>;

const contactPathSignals = [
  "contact",
  "contact-us",
  "about",
  "about-us",
  "services",
  "locations",
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
  if (/@(?:example|test)\./i.test(lower)) return false;
  if (/^(?:test|example|no-?reply|noreply|do-?not-?reply|donotreply|wordpress|wp)@/i.test(lower)) return false;
  return true;
}

function bestEmail(emails: string[], existing: Partial<Prospect>) {
  const unique = [...new Set(emails.map((email) => email.toLowerCase()).filter(emailAllowed))];
  return unique.find((email) => !/^privacy@/i.test(email) && !prospectEmailNeedsManualVerification({ ...existing, email }))
    ?? unique.find((email) => !/^privacy@/i.test(email))
    ?? unique[0]
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
  const hasFields = /\b(?:name|email|phone|message|quote|estimate|service|project|address)\b/i.test(text)
    && (/<(?:input|textarea|select)\b/i.test(html) || /\b(?:submit|send|request quote|get estimate|contact us|book|schedule)\b/i.test(text));
  return hasForm && hasFields;
}

function detectContactPerson(text: string) {
  const match = text.match(/\b(?:owner|founder|manager|contact)\s*:?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/);
  return match?.[1] ?? "";
}

export function extractContactDiscoveryFromPages(baseWebsite: string, pages: ContactDiscoveryPage[], existing: Partial<Prospect> = {}): ContactDiscoveryResult {
  const baseOrigin = new URL(baseWebsite).origin;
  const pageUrls = pages.map((page) => page.url);
  const emails: string[] = [];
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
  let contactPersonName = "";
  const notes: string[] = [];

  for (const page of pages) {
    const text = cleanHtmlText(page.html);
    if (new URL(page.url).origin !== baseOrigin) continue;
    const lower = text.toLowerCase();
    const links = extractLinks(page.html, page.url);
    for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) emails.push(email);
    for (const match of page.html.matchAll(/href\s*=\s*["']mailto:([^?"']+)/gi)) {
      if (match[1]) emails.push(decodeURIComponent(match[1]));
    }
    for (const link of links) {
      if (/facebook\.com|fb\.com/i.test(link) && !facebookUrl) facebookUrl = cleanSocialUrl(link);
      if (/instagram\.com/i.test(link) && !instagramUrl) instagramUrl = cleanSocialUrl(link);
      if (/linkedin\.com/i.test(link) && !linkedinUrl) linkedinUrl = cleanSocialUrl(link);
      if (/(?:^|\/\/)(?:www\.)?(?:x|twitter)\.com/i.test(link) && !xUrl) xUrl = cleanSocialUrl(link);
      if (/youtube\.com|youtu\.be/i.test(link) && !youtubeUrl) youtubeUrl = cleanSocialUrl(link);
    }
    if (!contactPageUrl && pageLooksLikeContact(page.url, lower)) contactPageUrl = page.url;
    const hasDetectedForm = detectForm(page.html, lower);
    if (hasDetectedForm && pageLooksLikeQuote(page.url, lower)) {
      quoteFormDetected = true;
      quoteFormUrl ||= page.url;
    } else if (hasDetectedForm) {
      contactFormDetected = true;
      contactFormUrl ||= page.url;
    }
    contactPersonName ||= detectContactPerson(text);
  }

  if (!contactPageUrl) {
    contactPageUrl = pageUrls.find((url) => /contact/i.test(url)) ?? "";
  }
  if (quoteFormUrl) notes.push("Quote/request estimate form detected; form was not submitted.");
  if (contactFormUrl) notes.push("Contact form detected; form was not submitted.");
  if (facebookUrl || instagramUrl || linkedinUrl) notes.push("Public social profile link found on scanned website pages.");

  const email = existing.email || bestEmail(emails, existing);
  const result = {
    email,
    contactPageUrl,
    contactFormUrl: existing.contactFormUrl || contactFormUrl,
    quoteFormUrl,
    contactFormDetected,
    quoteFormDetected,
    facebookUrl,
    instagramUrl,
    linkedinUrl,
    xUrl,
    youtubeUrl,
    contactPersonName,
    contactConfidence: "low" as const,
    bestManualContactMethod: "unknown" as const,
    contactDiscoveryNotes: notes,
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
  for (let index = 0; index < queue.length && fetched.length < 10; index += 1) {
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
  return {
    ...updated,
    classification: prospect.classification === "website_redesign" ? prospect.classification : prospect.classification,
    recommendedContactMethod: recommendProspectContactMethod(updated),
  };
}

function countMatches(value: string, expression: RegExp) {
  return value.match(expression)?.length ?? 0;
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function analyzePublicWebsite(prospect: Prospect): Promise<Analysis> {
  const requestedUrl = await assertPublicUrl(prospect.website);
  const analyzedHosts = globalAnalysis.analyzedHosts ?? new Map<string, number>();
  globalAnalysis.analyzedHosts = analyzedHosts;
  const lastAnalyzedAt = analyzedHosts.get(requestedUrl.hostname) ?? 0;
  if (Date.now() - lastAnalyzedAt < 10_000) {
    throw new Error("Please wait before analyzing this website again.");
  }
  analyzedHosts.set(requestedUrl.hostname, Date.now());
  await assertRobotsAllowed(requestedUrl);
  const { response, url } = await fetchPublicPage(requestedUrl.href);
  if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) throw new Error("Website homepage did not return HTML.");

  const html = await readLimitedText(response);
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
