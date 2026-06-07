import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  scoreLabels,
  type Analysis,
  type Prospect,
  type ScoreKey,
} from "@/lib/prospect-engine";

const userAgent = "WebWorkshopProspectEngine/1.0 (+https://webworkshop.dev)";
const maxResponseBytes = 2_000_000;
const globalAnalysis = globalThis as typeof globalThis & { analyzedHosts?: Map<string, number> };

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
  const lines = robots.split(/\r?\n/).map((line) => line.split("#")[0].trim());
  let applies = false;
  const disallowed: string[] = [];
  for (const line of lines) {
    const [rawKey, ...parts] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = parts.join(":").trim();
    if (key === "user-agent") applies = value === "*" || value.toLowerCase().includes("webworkshopprospectengine");
    if (applies && key === "disallow" && value) disallowed.push(value);
  }
  return disallowed.some((path) => path === "/" || pathname.startsWith(path));
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
