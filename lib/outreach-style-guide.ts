export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "standardized_permission_first_v2";

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
  structureRule: "Keep 90-95% of the first-touch structure consistent. Personalize only the factual reason sentence.",
  firstTouchRules: [
    "Never include a preview link in first-touch email, contact-form draft, Facebook DM, or Instagram DM.",
    "Ask permission before sending the preview.",
    "Do not invent weaknesses or unsupported claims.",
    "Use help get you more calls and quote requests, never will get you more calls.",
    "Keep the greeting, CTA, closing, and opt-out structure stable.",
  ],
  allowedReasons: [
    "no website",
    "clearly outdated website",
    "weak quote-request flow",
    "weak portfolio or recent-work presentation",
    "weak trust signals",
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
    return "I noticed you don't have a website, so I put together a quick preview showing what yours could look like and how it could help you get more calls and quote requests.";
  }
  return "I put together a quick preview showing what your website could look like with a cleaner, more modern design and how it could help you get more calls and quote requests.";
}

export function webworkshopYesReply(previewLink: string) {
  return [
    "Sounds good - here's the preview:",
    "",
    previewLink || "[PUBLIC PREVIEW LINK]",
    "",
    "It's just a quick concept, but I built it around making the page look cleaner and helping get more calls and quote requests.",
    "",
    "If you like it, I can send over the simple pricing/options.",
  ].join("\n");
}

export function webworkshopFirstTouchOpening(trade: string, city: string) {
  return `I was looking at ${trade} businesses around the ${city} area and came across your business.`;
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
    "Want me to send it over?",
    "",
    footer,
  ].join("\n");
}

export function webworkshopFirstDm(businessName: string, kind: "no_website" | "has_website") {
  if (kind === "no_website") {
    return `Hey, how's it going? I came across ${businessName} and noticed I couldn't find a full website, so I made a quick preview of what one could look like. It's built to help get you more calls and quote requests. Want to see it?`;
  }
  return `Hey, how's it going? I came across ${businessName} and made a quick website preview for you. It's built to look cleaner and help get you more calls and quote requests. Want to see it?`;
}

export function webworkshopSofterFirstDm(businessName: string, kind: "no_website" | "has_website") {
  if (kind === "no_website") {
    return `Hey, how's it going? I came across ${businessName} and couldn't find a full website. I made a quick preview of what one could look like. Want to see it?`;
  }
  return `Hey, how's it going? I came across ${businessName} and made a quick website preview showing how the page could be cleaner and make it easier for people to call or request a quote. Want to see it?`;
}

export function webworkshopLoomScript(context: string) {
  return [
    "Hey, I just wanted to walk you through this quick.",
    "",
    `${context} and put together a simple preview for you.`,
    "",
    "The main idea is making the page cleaner and helping people call or request a quote.",
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
    "It's just a quick concept, but I built it around making the page look cleaner and helping get more calls and quote requests.",
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
  return "If you want a little more ongoing help with changes and support, I can also do $79/month.";
}

export function webworkshopStarterPageReply() {
  return "If you want to start smaller, I can also do a simple starter page for $500.";
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
