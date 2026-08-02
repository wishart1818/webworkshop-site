export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "manual_lovable_permission_first_v4";

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
  structureRule: "Keep the first touch consistent. Mention a prospect detail only when it is verified, specific, naturally relevant to why a website could help, and supported by saved evidence.",
  firstTouchRules: [
    "Never include a preview link in first-touch email, contact-form draft, Facebook DM, or Instagram DM.",
    "Ask whether the prospect wants Brendan to create a preview; never imply that one is already built.",
    "Do not invent weaknesses, praise, review themes, services, or unsupported claims.",
    "Do not force personalization. A clean factual fallback is better than an irrelevant detail.",
    "Use the saved trade and market as the safe contextual fallback when both are available.",
    "Use could make it easier for people to call or request a quote, never guaranteed-results language.",
    "Use the business-team greeting unless a person's name was independently verified.",
    "Keep the greeting, CTA, closing, and opt-out structure stable.",
  ],
  allowedReasons: [
    "a dedicated website could not be found with sufficient evidence",
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
    return "I couldn't find a dedicated website for your business. I had an idea for what one could look like and how it could make it easier for people to call or request a quote.";
  }
  return "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.";
}

export function webworkshopYesReply(_previewLink = "") {
  void _previewLink;
  return [
    "Absolutely - I'll put together a quick preview and send it over once it's ready.",
    "",
    "I'll keep it focused on your actual services and make sure it works well on both desktop and mobile.",
  ].join("\n");
}

function webworkshopTradeLabel(trade: string) {
  const value = trade.trim();
  if (!value) return "";
  if (/^hvac$/i.test(value)) return "HVAC";
  return value.toLowerCase();
}

export function webworkshopFirstTouchOpening(trade: string, city: string) {
  const tradeLabel = webworkshopTradeLabel(trade);
  const cityLabel = city.trim();
  if (tradeLabel && cityLabel) {
    return `I came across your ${tradeLabel} business while looking at companies around ${cityLabel}.`;
  }
  if (tradeLabel) return `I came across your ${tradeLabel} business.`;
  if (cityLabel) return `I came across your business while looking at companies around ${cityLabel}.`;
  return "I came across your business.";
}

export function webworkshopFirstEmail({
  businessName,
  trade,
  city,
  kind,
  footer,
  factualMiddleLine,
}: {
  businessName: string;
  trade: string;
  city: string;
  kind: "no_website" | "has_website";
  footer: string;
  factualMiddleLine?: string;
}) {
  return [
    `Hi ${businessName} team,`,
    "",
    webworkshopFirstTouchOpening(trade, city),
    "",
    factualMiddleLine || webworkshopPreviewValueLine(kind),
    "",
    "Would you like me to put together a quick preview?",
    "",
    footer,
  ].join("\n");
}

export function webworkshopFirstDm(businessName: string, kind: "no_website" | "has_website") {
  const reason = kind === "no_website"
    ? "I couldn't find a dedicated website for the business and had an idea for what one could look like."
    : "I had a simple website idea that could make it easier for people to see what you do and request a quote.";
  return `Hey, how's it going? I came across ${businessName}. ${reason} Would you like me to put together a quick preview?`;
}

export function webworkshopSofterFirstDm(businessName: string, kind: "no_website" | "has_website") {
  const reason = kind === "no_website"
    ? "I couldn't find a dedicated website and had an idea for what one could look like."
    : "I had a quick website idea for the business.";
  return `Hey, how's it going? I came across ${businessName}. ${reason} Would you like me to put together a preview?`;
}

export function webworkshopLoomScript(context: string) {
  return [
    "Hey, I just wanted to walk you through this quick.",
    "",
    `${context} and built this preview around the business's verified services and contact details.`,
    "",
    "The main idea is making the page cleaner and making it easier for people to call or request a quote.",
    "",
    "This isn't live or anything, just a concept. If you like the direction, I can send over the next steps and pricing.",
  ].join("\n");
}

export function webworkshopLoomSendMessage(previewLink: string) {
  return [
    "Sounds good - here's the Loom and preview:",
    "",
    "Loom walkthrough:",
    "[LOOM LINK]",
    "",
    "Preview:",
    previewLink || "[PUBLIC PREVIEW LINK]",
    "",
    "It's a quick concept built around the business's verified services and making it easier for people to call or request a quote.",
  ].join("\n");
}

export function webworkshopPricingReply() {
  return [
    "If you like the direction, pricing for this type of site is $1,000 total.",
    "",
    "$500 to start, then $500 once it's finished and ready to go live.",
    "",
    "After that, hosting and small updates are $49/month.",
  ].join("\n");
}

export function webworkshopHigherSupportReply() {
  return "For a little more ongoing help with changes and support, I can also do $79/month.";
}

export function webworkshopStarterPageReply() {
  return "To start smaller, I can also do a simple starter page for $500.";
}

export function webworkshopFollowUpAfterLoom() {
  return [
    "Hey, just wanted to follow up on that preview I sent over.",
    "",
    "No worries either way. Just figured I'd check.",
  ].join("\n");
}

export function webworkshopNotInterestedReply() {
  return "No worries at all, appreciate you checking it out.";
}
