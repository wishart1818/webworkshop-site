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
    return "I noticed you don't have a website, so I put together a quick preview showing what yours could look like and how it could help get you more calls and quote requests.";
  }
  return "I put together a quick preview showing what your website could look like with a cleaner, more modern design and how it could help get you more calls and quote requests.";
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
