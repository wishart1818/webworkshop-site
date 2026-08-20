export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "verified_rebuild_permission_first_v8";

export const webworkshopOutreachStyleGuide = {
  voice: [
    "friendly",
    "confident",
    "conversational",
    "short",
    "direct",
    "not salesy",
    "not corporate",
    "not AI sounding",
    "permission-first",
    "one simple CTA",
    "written like Brendan personally reaching out to a local business owner",
  ],
  structureRule: "Keep the first touch consistent. State what Brendan builds, use only verified website status, explain the practical goal, and ask permission to show what the new site could look like.",
  firstTouchRules: [
    "Never include a preview link in first-touch email, contact-form draft, Facebook DM, or Instagram DM.",
    "Ask whether the prospect is interested in seeing what a new or refreshed website could look like; never imply that one is already built.",
    "Do not invent weaknesses, praise, review themes, services, or unsupported claims.",
    "Use the no-website version only when the absence of a full dedicated website is sufficiently verified.",
    "Route uncertain website status to manual review instead of claiming that the business has no website.",
    "Use the refreshed-site version only for a qualified website-refresh opportunity.",
    "Use saved trade and market as the safe contextual fallback when both are available.",
    "Say designed to help bring in more calls and quote requests; never guarantee results.",
    "Mention that Brendan is based in Findlay only for Findlay-area or Northwest Ohio prospects.",
    "Use a verified first name when available. Otherwise use the clean verified business name plus team.",
    "Keep the CTA, closing, and opt-out structure stable.",
  ],
  allowedReasons: [
    "a full dedicated website could not be found with sufficient evidence",
    "a qualified existing website refresh opportunity",
    "a clearly verified website problem",
    "a verified weak quote-request flow",
    "a verified weak portfolio or recent-work presentation",
    "a verified weak trust or contact path",
  ],
} as const;

export function webworkshopOptOutLine() {
  return "If you'd rather not hear from me again, just let me know.";
}

export function webworkshopOptOutPattern() {
  return /would rather not receive another note|rather not hear from me again|close the loop|unsubscribe|opt[- ]?out/i;
}

export function webworkshopPreviewValueLine(kind: "no_website" | "has_website") {
  if (kind === "no_website") {
    return "I can build you a modern website from the ground up that clearly presents your services and makes it easier for customers to call or request a quote.";
  }
  return "I can rebuild your current website with a more modern design that better represents your business and makes your services, contact information, and quote request easier for customers to find.";
}

export function webworkshopYesReply(_previewLink = "") {
  void _previewLink;
  return [
    "Sounds good - I'll put together a website concept and send you a quick video walkthrough when it's ready.",
    "",
    "I'll base it on your actual services and contact information and make sure it works well on both desktop and mobile.",
  ].join("\n");
}

function webworkshopTradeLabel(trade: string) {
  const value = trade.trim();
  if (!value) return "";
  if (/^hvac$/i.test(value)) return "HVAC";
  if (/^pressure washing$/i.test(value)) return "pressure-washing";
  return value.toLowerCase();
}

const findlayAreaCities = new Set([
  "findlay",
  "toledo",
  "sylvania",
  "perrysburg",
  "maumee",
  "bowling green",
  "lima",
  "tiffin",
  "fostoria",
  "fremont",
  "defiance",
  "napoleon",
  "oregon",
  "waterville",
  "rossford",
  "northwood",
  "monroe",
  "adrian",
]);

function normalizedCityName(city: string) {
  return city.trim().toLowerCase().split(",")[0]?.trim() ?? "";
}

export function webworkshopShouldMentionFindlay(city: string) {
  return findlayAreaCities.has(normalizedCityName(city));
}

export function webworkshopFirstTouchOpening(trade: string, city: string, businessName = "your business") {
  const tradeLabel = webworkshopTradeLabel(trade);
  const cityLabel = city.trim();
  const name = businessName.trim() || "your business";
  if (tradeLabel && cityLabel) {
    return `I came across ${name} while looking at ${tradeLabel} businesses around ${cityLabel}.`;
  }
  if (tradeLabel) return `I came across ${name} while looking at ${tradeLabel} businesses.`;
  if (cityLabel) return `I came across ${name} while looking at local service businesses around ${cityLabel}.`;
  return `I came across ${name}.`;
}


const unsafeRecipientFirstNames = new Set([
  "admin",
  "billing",
  "booking",
  "contact",
  "customer",
  "hello",
  "info",
  "manager",
  "none",
  "office",
  "owner",
  "quotes",
  "sales",
  "service",
  "staff",
  "support",
  "team",
  "unknown",
]);

export function webworkshopRecipientFirstName(value?: string) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized || /@|https?:\/\//i.test(normalized)) return "";
  const withoutTitle = normalized.replace(/^(?:(?:mr|mrs|ms|miss|dr)\.?\s+)+/i, "");
  const candidate = withoutTitle.split(/[\s,(/&]+/)[0]?.replace(/[^\p{L}'’\-]/gu, "") ?? "";
  if (candidate.length < 2 || candidate.length > 40) return "";
  if (unsafeRecipientFirstNames.has(candidate.toLowerCase())) return "";
  if (candidate === candidate.toUpperCase()) {
    return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
  }
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

export function webworkshopCleanBusinessName(value: string) {
  const cleaned = value.trim()
    .replace(/\s+/g, " ")
    .replace(/(?:,?\s+)(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?)$/i, "")
    .trim();
  return cleaned || value.trim() || "there";
}

export function webworkshopFirstEmail({
  businessName,
  trade,
  city,
  kind,
  footer,
  factualMiddleLine,
  rebuildSolutionLine,
  recipientName,
}: {
  businessName: string;
  trade: string;
  city: string;
  kind: "no_website" | "has_website";
  footer: string;
  factualMiddleLine?: string;
  rebuildSolutionLine?: string;
  recipientName?: string;
}) {
  const verifiedRecipientFirstName = webworkshopRecipientFirstName(recipientName);
  const greeting = verifiedRecipientFirstName
    ? `Hi ${verifiedRecipientFirstName},`
    : `Hi ${webworkshopCleanBusinessName(businessName)} team,`;
  const introduction = webworkshopShouldMentionFindlay(city)
    ? "I'm Brendan, based in Findlay, and I build websites for local service businesses."
    : "I'm Brendan, and I build websites for local service businesses.";
  const valueLine = rebuildSolutionLine?.trim() || webworkshopPreviewValueLine(kind);
  const optionalFact = factualMiddleLine?.trim() && factualMiddleLine.trim() !== valueLine
    ? factualMiddleLine.trim()
    : "";

  return [
    greeting,
    "",
    `${introduction} ${webworkshopFirstTouchOpening(trade, city, businessName)}`,
    "",
    optionalFact,
    optionalFact ? "" : "",
    valueLine,
    "",
    "Would you be interested in seeing what that could look like?",
    "",
    footer,
  ].filter((line, index, lines) => line !== "" || index === 1 || lines[index - 1] !== "").join("\n");
}

export function webworkshopFirstDm(
  businessName: string,
  kind: "no_website" | "has_website",
  observation = "",
  rebuildSolution = "",
) {
  const offer = rebuildSolution.trim() || webworkshopPreviewValueLine(kind);
  const businessReference = /[.!?]$/.test(businessName.trim()) ? businessName.trim() : `${businessName.trim()}.`;
  return `Hey, how's it going? I came across ${businessReference} ${observation.trim() ? `${observation.trim()} ` : ""}${offer} Would you be interested in seeing what that could look like?`;
}

export function webworkshopSofterFirstDm(businessName: string, kind: "no_website" | "has_website") {
  const offer = kind === "no_website"
    ? `I couldn't find a dedicated website linked from the business's public profiles. ${webworkshopPreviewValueLine("no_website")}`
    : webworkshopPreviewValueLine("has_website");
  const businessReference = /[.!?]$/.test(businessName.trim()) ? businessName.trim() : `${businessName.trim()}.`;
  return `Hey, how's it going? I came across ${businessReference} ${offer} Would you be interested in seeing what that could look like?`;
}

export function webworkshopLoomScript(context: string) {
  return [
    "Start on camera: Hey, Brendan here. Thanks for letting me put this together.",
    "",
    `${context} and built this website concept around the business's verified services and contact details.`,
    "",
    "Walk through the main page, services, mobile view, call button, and quote-request path.",
    "",
    "The main goal is to give the business a more modern website and make it easier for customers to call or request a quote.",
    "",
    "This is not live yet. If you like the direction, we can talk about finishing it and getting it set up for the business.",
  ].join("\n");
}

export function webworkshopLoomSendMessage(previewLink: string) {
  return [
    "Hi there,",
    "",
    "Thanks again for getting back to me. I put together the website concept and recorded a quick walkthrough of it.",
    "",
    "Video walkthrough:",
    "[LOOM LINK]",
    "",
    "Website:",
    previewLink || "[PUBLIC PREVIEW LINK]",
    "",
    "Take a look when you get a chance and let me know what you think. If you like the direction, we can talk about getting it finished and set up for your business.",
    "",
    "Thanks,",
    "Brendan",
  ].join("\n");
}

export function webworkshopPricingReply() {
  return [
    "If you'd like to use the website, the one-time price is $1,000.",
    "",
    "$500 to start, then $500 once it's finished and ready to go live.",
    "",
    "If you'd like ongoing edits and maintenance after launch, I also offer an optional $49/month plan.",
  ].join("\n");
}

export function webworkshopHigherSupportReply() {
  return "For more ongoing help with changes and support, I can also do an optional $79/month plan.";
}

export function webworkshopStarterPageReply() {
  return "To start smaller, I can also do a simple starter page for $500.";
}

export function webworkshopFollowUpAfterLoom() {
  return [
    "Hey, just wanted to follow up on the website and video I sent over.",
    "",
    "No worries either way. Just figured I'd check what you thought.",
  ].join("\n");
}

export function webworkshopNotInterestedReply() {
  return "No worries at all, appreciate you checking it out.";
}
