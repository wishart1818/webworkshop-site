from __future__ import annotations

from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    content = read(path)
    count = content.count(old)
    if count < minimum:
        raise RuntimeError(f"Expected at least {minimum} matches in {path}, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new))


def replace_regex(path: str, pattern: str, replacement: str, count: int = 1) -> None:
    content = read(path)
    updated, matches = re.subn(pattern, replacement, content, count=count, flags=re.S)
    if matches != count:
        raise RuntimeError(f"Expected {count} regex matches in {path}, found {matches}: {pattern[:120]!r}")
    write(path, updated)


OUTREACH_STYLE_GUIDE = r'''export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "manual_lovable_permission_first_v3";

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
  return [
    "Absolutely - I'll put together a quick preview and send it over once it's ready.",
    "",
    "I'll keep it focused on your actual services and make sure it works well on both desktop and mobile.",
  ].join("\n");
}

export function webworkshopFirstTouchOpening(_trade: string, _city: string) {
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
'''
write("lib/outreach-style-guide.ts", OUTREACH_STYLE_GUIDE)

# Prospect generation: truthful permission-first wording and an explicit uncertainty gate.
replace_once(
    "lib/prospect-engine.ts",
    '''function askToSendPreview() {\n  return "Want me to send it over?";\n}''',
    '''function askToCreatePreview() {\n  return "Would you like me to put together a quick preview?";\n}''',
)
replace_once(
    "lib/prospect-engine.ts",
    '''function contactPathCouldBeClearer(prospect: Prospect) {''',
    '''export function prospectWebsiteAbsenceNeedsManualReview(prospect: Prospect) {\n  if (!noOwnedWebsiteProspect(prospect)) return false;\n  if (prospect.websiteStatus === "no_owned_website") return false;\n  const verifiedAbsence = prospect.previewResearchFacts?.some((fact) => (\n    fact.factType === "website"\n    && fact.verificationStatus === "verified"\n    && fact.confidence === "verified"\n    && /no (?:owned |dedicated )?website|website not found|not found|unavailable/i.test(`${fact.label} ${fact.value}`)\n  ));\n  return !verifiedAbsence;\n}\n\nfunction contactPathCouldBeClearer(prospect: Prospect) {''',
)
replace_all("lib/prospect-engine.ts", "Quick website preview for ${prospect.businessName}", "Quick website idea for ${prospect.businessName}")
replace_all("lib/prospect-engine.ts", "More calls and quote requests for ${prospect.businessName}", "Website idea for ${prospect.businessName}")
replace_all("lib/prospect-engine.ts", "${askToSendPreview()}", "${askToCreatePreview()}")
replace_all("lib/prospect-engine.ts", "It's built to look cleaner and help get you more calls and quote requests.", "I would keep it focused on the business's real services and an easy call or quote-request path.")
replace_all("lib/prospect-engine.ts", "Just wanted to follow up on the website preview I mentioned.", "Just wanted to follow up on the website idea I mentioned.")
replace_all("lib/prospect-engine.ts", "Just wanted to follow up on the preview I mentioned.", "Just wanted to follow up on the website idea I mentioned.")
replace_all("lib/prospect-engine.ts", "Just following up on the ${draftLabel} note I sent about the quick website preview.", "Just following up on the ${draftLabel} note I sent about the website idea.")

# Email-quality review: first touch no longer depends on a prebuilt preview.
replace_once(
    "lib/top-prospects.ts",
    '''  prospectEmailNeedsManualVerification,\n  prospectWrittenContactMethodIsUsable,''',
    '''  prospectEmailNeedsManualVerification,\n  prospectWebsiteAbsenceNeedsManualReview,\n  prospectWrittenContactMethodIsUsable,''',
)
new_quality_function = r'''export function evaluateOutreachEmailQuality(
  prospect: Prospect,
  previewLink: string,
  outreachPreference: OutreachPreference = "written_only",
  environment: NodeJS.ProcessEnv = process.env,
): OutreachEmailQuality {
  void previewLink;
  const outreach = prospect.outreach;
  const drafts = outreach ? [outreach.concise, outreach.detailed, ...outreach.followUps] : [];
  const combined = drafts.join("\n");
  const firstTouch = outreach?.concise ?? "";
  const writtenContactReady = prospectHasWrittenContactMethod(prospect);
  const phoneOnlyBlocked = outreachPreference === "written_only"
    && !writtenContactReady
    && Boolean(prospect.phone || prospect.classification === "phone_only" || prospect.recommendedContactMethod === "call_first");
  const usableContactReady = outreachPreference === "phone_allowed"
    ? prospectContactMethodIsUsable(prospect)
    : writtenContactReady;
  const badFit = prospect.inactive
    || prospect.classification === "national_large_brand"
    || prospect.classification === "duplicate_bad_fit"
    || likelyNationalOrLargeBrand(prospect)
    || likelySupplierOrDistributor(prospect)
    || likelyInstitutionalOrNonBusiness(prospect)
    || websiteBusinessMismatch(prospect)
    || !hasClearLocalServiceIntent(prospect);
  const socialFirstDm = ["facebook", "instagram", "linkedin"].includes(prospect.bestManualContactMethod || "");
  const optOutPattern = webworkshopOptOutPattern();
  const senderPostalAddress = webworkshopPostalAddress(environment);
  const emailNeedsVerification = prospectEmailNeedsManualVerification(prospect)
    && !prospect.quoteFormUrl
    && !prospect.contactFormUrl
    && !prospect.facebookUrl
    && !prospect.instagramUrl
    && !prospect.linkedinUrl;
  const postalAddressReady = prospect.bestManualContactMethod !== "email" && prospect.recommendedContactMethod !== "send_email"
    ? true
    : Boolean(senderPostalAddress) && drafts.every((draft) => draft.includes(senderPostalAddress));
  const optOutReady = socialFirstDm
    ? drafts.length >= 4 && drafts.slice(1).every((draft) => optOutPattern.test(draft))
    : drafts.length >= 4 && drafts.every((draft) => optOutPattern.test(draft));
  const permissionCtaReady = /would you like me to (?:put together|create|make|build)(?: you)? (?:a )?(?:quick )?(?:website )?preview\?/i.test(firstTouch);
  const pastTensePreviewClaim = /\b(?:I|we)\s+(?:already\s+)?(?:built|made|created|finished|designed|put together)\b.{0,90}\b(?:preview|website|site|concept)\b/i.test(firstTouch);
  const firstTouchLinkFree = !/https?:\/\/|\/p\//i.test(firstTouch);
  const businessContextReady = Boolean(prospect.businessName) && firstTouch.toLowerCase().includes(prospect.businessName.toLowerCase());
  const relevantReasonReady = /couldn't find a dedicated website|website direction|website idea|easier for people to (?:see|call|request)|call or request a quote/i.test(firstTouch);
  const uncertainWebsiteAbsence = prospectWebsiteAbsenceNeedsManualReview(prospect);
  const unsupportedClaim = findUnsupportedClaim(combined);
  const checks: OutreachEmailQualityCheck[] = [
    {
      key: "truthful_permission_first",
      label: "First touch truthfully asks permission to create a preview",
      passed: Boolean(firstTouch) && permissionCtaReady && firstTouchLinkFree && !pastTensePreviewClaim,
      reason: "The first touch must ask whether Brendan should create a preview and must not imply that one already exists.",
      suggestion: "Use the permission-first manual Lovable template.",
    },
    {
      key: "business_context",
      label: "Outreach matches the current business identity",
      passed: businessContextReady,
    },
    {
      key: "relevant_reason",
      label: "Outreach gives a naturally relevant website reason",
      passed: relevantReasonReady,
      reason: "Do not add a random service, generic compliment, or unrelated fact simply to personalize the email.",
      suggestion: "Use a verified website-related reason or the clean fallback.",
    },
    {
      key: "website_absence_evidence",
      label: "Website-absence wording is supported by saved evidence",
      passed: !uncertainWebsiteAbsence,
      reason: "The system has a no-website signal but not enough verified evidence to queue the claim automatically.",
      suggestion: "Verify the official website status before approval.",
    },
    {
      key: "clear_cta",
      label: "Outreach includes a clear call to action",
      passed: permissionCtaReady,
    },
    {
      key: "no_internal_scores",
      label: "Outreach contains no internal score language",
      passed: drafts.length > 0
        && !/\b\d{1,3}\s*\/\s*100\b|\bscore(?:d)?(?:\s+of|:)?\s+\d{1,3}\b|\b(?:overall|website|opportunity|conversion readiness|mobile experience|trust signals|contactability|weighted sales)\s+score\b/i.test(combined),
    },
    {
      key: "opt_out",
      label: "Every applicable draft includes opt-out language",
      passed: optOutReady,
    },
    {
      key: "postal_address",
      label: "Sender postal address is configured",
      passed: drafts.length >= 4 && postalAddressReady && !/\[Add your business postal address before sending\]/i.test(combined),
      reason: "Set WEBWORKSHOP_POSTAL_ADDRESS before marking email outreach send-ready.",
      suggestion: "Add WEBWORKSHOP_POSTAL_ADDRESS in Vercel and redeploy.",
    },
    {
      key: "contact_quality",
      label: "Email address appears business-owned",
      passed: !emailNeedsVerification,
      reason: "The email looks like a theme, developer, noreply, or unrelated-domain address.",
      suggestion: "Verify the email manually or use a contact form/social path instead.",
    },
    {
      key: "written_contact_method",
      label: outreachPreference === "written_only" ? "A usable written contact method exists" : "A usable public contact method exists",
      passed: usableContactReady,
    },
    {
      key: "phone_only_blocked",
      label: "Phone-only leads are blocked from written outreach",
      passed: !phoneOnlyBlocked,
    },
    {
      key: "active_local_business",
      label: "Business appears active, local, and independently operated",
      passed: !badFit,
    },
    {
      key: "supported_facts_only",
      label: "Email avoids unsupported claims",
      passed: drafts.length > 0 && unsupportedClaim === null,
      phrase: unsupportedClaim?.phrase,
      reason: unsupportedClaim?.reason,
      suggestion: unsupportedClaim?.suggestion,
    },
  ];
  const issues = checks
    .filter((check) => !check.passed)
    .map((check) => check.phrase
      ? `${check.label}: "${check.phrase}" (${check.reason} Suggested replacement: ${check.suggestion}.)`
      : check.reason || check.label);
  const readinessLabel: SendReadinessLabel = issues.length === 0
    ? "Send-ready"
    : badFit
      ? "Bad fit"
      : !postalAddressReady
        ? "Needs sender postal address before sending"
        : emailNeedsVerification
          ? "Verify email manually"
          : phoneOnlyBlocked
            ? "Phone-only / written outreach blocked"
            : !writtenContactReady && outreachPreference === "written_only"
              ? "Missing written contact method"
              : checks.some((check) => check.key === "supported_facts_only" && !check.passed)
                ? "Unsupported claim"
                : "Needs review";
  return { ready: issues.length === 0, readinessLabel, checks, issues };
}

'''
replace_regex(
    "lib/top-prospects.ts",
    r'''export function evaluateOutreachEmailQuality\([\s\S]*?\n}\n\nexport function assertOutreachEmailReady''',
    new_quality_function + "export function assertOutreachEmailReady",
)

# Autonomous queue semantics.
replace_once(
    "lib/autonomous-growth.ts",
    '''  prospectEmailNeedsManualVerification,\n  prospectWrittenContactMethodIsUsable,''',
    '''  prospectEmailNeedsManualVerification,\n  prospectWebsiteAbsenceNeedsManualReview,\n  prospectWrittenContactMethodIsUsable,''',
)
replace_once("lib/autonomous-growth.ts", '  "Prospect Said Yes",\n  "Loom Needed",', '  "Prospect Said Yes",\n  "Preview Build Needed",\n  "Loom Needed",')
replace_once(
    "lib/autonomous-growth.ts",
    '''  if (!resultHasPublicPreview(item)) return "needsPreviewReview";''',
    '''  if (["Preview Build Needed", "Loom Needed", "Preview Needs Polish", "Ready for Loom"].includes(item.status) && !resultHasPublicPreview(item)) return "needsPreviewReview";''',
)
replace_once(
    "lib/autonomous-growth.ts",
    '''    /\/engine(?:\/|$)/i.test(item.previewLink) ? "Protected /engine preview links are blocked." : "",\n    !publicPreviewReady(item.previewLink) ? "Public /p/ preview link is missing from the outreach package." : "",''',
    '''    /\b(?:I|we)\s+(?:already\s+)?(?:built|made|created|finished|designed|put together)\b.{0,90}\b(?:preview|website|site|concept)\b/i.test(item.emailBody)\n      ? "First-touch email cannot imply that a preview is already built."\n      : "",''',
)
replace_once(
    "lib/autonomous-growth.ts",
    '''    !prospect.email ? "Public email is missing." : "",\n    !publicPreviewReady(previewLink) ? "Public /p/ preview link is missing." : "",\n    previewGate.status !== "Eligible" || previewGate.score < 85 ? "Preview quality gate did not pass." : "",\n    !emailQuality.ready ? `Email quality check is not send-ready: ${emailQuality.readinessLabel}.` : "",''',
    '''    !prospect.email ? "Public email is missing." : "",\n    prospectWebsiteAbsenceNeedsManualReview(prospect) ? "Website absence needs manual verification before approval." : "",\n    !emailQuality.ready ? `Email quality check is not send-ready: ${emailQuality.readinessLabel}.` : "",''',
)
replace_once(
    "lib/autonomous-growth.ts",
    '''}): AutoSendEligibility {\n  const env = outreachEnvironment(environment);''',
    '''}): AutoSendEligibility {\n  void previewGate;\n  void previewLink;\n  const env = outreachEnvironment(environment);''',
)
replace_regex(
    "lib/autonomous-growth.ts",
    r'''export function queueStatusForPackage\([\s\S]*?\n}\n\nconst contactedOrClosedStatuses''',
    r'''export function queueStatusForPackage({
  autoEligibility,
  emailQuality,
  previewGate,
  settings,
}: {
  autoEligibility: AutoSendEligibility;
  emailQuality: OutreachEmailQuality;
  previewGate: PreviewQualityGate;
  settings: AutonomousGrowthSettings;
}): OutreachQueueStatus {
  void previewGate;
  if (settings.mode === "off") return "Draft";
  if (autoEligibility.blockedReasons.some((reason) => /Phone-only leads never auto-send|Bad-fit|Do-not-contact/i.test(reason))) return "Blocked";
  if (!emailQuality.ready) return "Needs Review";
  if (settings.mode === "auto_email_pilot" && autoEligibility.eligible) return "Queued";
  if (settings.mode === "auto_email_pilot") return "Needs Review";
  return "Eligible";
}

const contactedOrClosedStatuses''',
)
replace_once("lib/autonomous-growth.ts", '  "Prospect Said Yes",\n  "Loom Needed",', '  "Prospect Said Yes",\n  "Preview Build Needed",\n  "Loom Needed",')
replace_once(
    "lib/autonomous-growth.ts",
    '''  if (!item.previewLink) return { eligible: true, reason: "preview missing" };\n  if (/\/engine(?:\/|$)/i.test(item.previewLink)) return { eligible: false, reason: "protected preview link" };\n  if (!/\/p\//i.test(item.previewLink)) return { eligible: true, reason: "preview missing" };''',
    '''  if (/\/engine(?:\/|$)/i.test(item.previewLink)) return { eligible: false, reason: "protected preview link" };''',
)
replace_once(
    "lib/autonomous-growth.ts",
    '''export function queueStatusAfterManualAction(status: OutreachQueueStatus): OutreachQueueStatus {\n  return status === "Prospect Said Yes" ? "Loom Needed" : status;\n}''',
    '''export function queueStatusAfterManualAction(status: OutreachQueueStatus): OutreachQueueStatus {\n  return status === "Prospect Said Yes" ? "Preview Build Needed" : status;\n}''',
)
replace_once(
    "lib/autonomous-growth.ts",
    '''  "Prospect Said Yes": ["Loom Needed", "Ready for Loom", "Pricing Requested", "Positive Reply", "Won", "Lost", "Not Interested"],\n  "Loom Needed": ["Preview Needs Polish", "Ready for Loom", "Loom Recorded", "Pricing Requested", "Lost", "Not Interested"],''',
    '''  "Prospect Said Yes": ["Preview Build Needed", "Lost", "Not Interested"],\n  "Preview Build Needed": ["Preview Needs Polish", "Ready for Loom", "Lost", "Not Interested"],\n  "Loom Needed": ["Preview Build Needed", "Preview Needs Polish", "Ready for Loom", "Lost", "Not Interested"],''',
)
replace_regex(
    "lib/autonomous-growth.ts",
    r'''export function rewriteOutreachWithFixes\(emailBody: string\) \{[\s\S]*?\n}\n\nexport function evaluateSelfReview''',
    r'''export function rewriteOutreachWithFixes(emailBody: string) {
  const optOut = emailBody.match(/Thanks,[\s\S]*?(?:If you would rather not receive another note, just reply and I will close the loop\.|If you'd rather not hear from me again, just let me know\.)/i)?.[0]
    ?? outreachComplianceFooter();
  const greeting = emailBody.split("\n").find((line) => /^Hi\b/i.test(line.trim()))?.trim() ?? "Hi there,";
  return [
    greeting,
    "",
    "I came across your business and had a simple website idea that could make it easier for people to see what you do and call or request a quote.",
    "",
    "Would you like me to put together a quick preview?",
    "",
    optOut,
  ].join("\n");
}

export function evaluateSelfReview''',
)
replace_regex(
    "lib/autonomous-growth.ts",
    r'''export function evaluateSelfReview\(\{[\s\S]*?\n}\n\nfunction casualDmBusinessContext''',
    r'''export function evaluateSelfReview({
  emailQuality,
  feedbackLabels = [],
  previewGate,
  prospect,
}: {
  emailQuality: OutreachEmailQuality;
  feedbackLabels?: readonly AutonomousFeedbackLabel[];
  previewGate: PreviewQualityGate;
  prospect: Prospect;
}) {
  void previewGate;
  const detectedIssues = new Set<string>(emailQuality.issues);
  const regenerationPlan: string[] = [];
  const rewritePlan = outreachRewritePlan(prospect.outreach?.concise ?? "", feedbackLabels);
  if (!prospectWrittenContactMethodIsUsable(prospect)) detectedIssues.add("Written contact method is weak or missing.");
  if (hasFeedback(feedbackLabels, "Bad lead")) detectedIssues.add("Manual feedback marked this as a bad lead.");
  if (hasFeedback(feedbackLabels, "Wrong contact")) detectedIssues.add("Manual feedback marked the contact as wrong.");
  let recommendedNextAction: AutonomousNextAction = "Needs Human Review";
  if (hasFeedback(feedbackLabels, "Never contact") || prospect.recommendedContactMethod === "do_not_contact") recommendedNextAction = "Never Contact";
  else if (hasFeedback(feedbackLabels, "Bad fit") || prospect.classification === "national_large_brand" || prospect.classification === "duplicate_bad_fit" || prospect.inactive) recommendedNextAction = "Bad Fit";
  else if (!emailQuality.ready || rewritePlan.length || hasFeedback(feedbackLabels, "Outreach sounded too AI-ish")) recommendedNextAction = "Rewrite Outreach";
  else if (hasFeedback(feedbackLabels, "Bad lead")) recommendedNextAction = "Skip";
  else if (hasFeedback(feedbackLabels, "Good lead") || emailQuality.ready) recommendedNextAction = "Keep";
  const reviewScore = Math.max(0, Math.min(100, Math.round(
    (emailQuality.ready ? 58 : 25)
    + (prospectWrittenContactMethodIsUsable(prospect) ? 24 : 5)
    + (prospect.sourceConfidence >= 70 ? 12 : prospect.sourceConfidence >= 40 ? 6 : 0)
    + (hasFeedback(feedbackLabels, "Good lead") ? 6 : 0)
    - (detectedIssues.size * 5),
  )));
  const improvementSuggestions = [
    ...rewritePlan,
    !prospectWrittenContactMethodIsUsable(prospect) ? "verify a usable written contact path before outreach" : "",
  ].filter(Boolean);
  return {
    reviewScore,
    reviewSummary: `${prospect.businessName} first-touch review: ${recommendedNextAction}. Email ${emailQuality.readinessLabel}; a preview is built manually only after interest.`,
    improvementSuggestions,
    detectedIssues: [...detectedIssues],
    recommendedNextAction,
    regenerationPlan,
    rewritePlan,
  };
}

function casualDmBusinessContext''',
)
replace_regex(
    "lib/autonomous-growth.ts",
    r'''function publicPreviewReady\(value: string\) \{[\s\S]*?\n}\n\nexport function evaluateAutoSendEligibility''',
    r'''function publicPreviewReady(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !["localhost", "127.0.0.1"].includes(url.hostname)
      && !url.pathname.startsWith("/engine");
  } catch {
    return false;
  }
}

export function evaluateAutoSendEligibility''',
)
replace_all("lib/autonomous-growth.ts", 'fix: "Generate the Outreach Package again so the prospect gets a safe /p/ link."', 'fix: "Build the preview manually in Lovable, QA it, then save its public HTTPS link."')
replace_all("lib/autonomous-growth.ts", '"Manual social outreach only"', '"Manual build and outreach only"')
replace_all("lib/autonomous-growth.ts", '"Do not automate Facebook, Instagram, contact forms, Loom recording, or Loom sending."', '"Do not automate Lovable building, Facebook, Instagram, contact forms, Loom recording, or Loom sending."')
replace_all("lib/autonomous-growth.ts", '"Generate a public /p/ preview first."', '"Save a legitimate public Lovable preview link first."')
replace_all("lib/autonomous-growth.ts", 'subject: `Loom needed: ${item.businessName}`', 'subject: `Manual preview build needed: ${item.businessName}`')
replace_all("lib/autonomous-growth.ts", '`${item.businessName} is ready for a manual Loom walkthrough.`', '`${item.businessName} requested a preview and is ready for a manual Lovable build.`')
replace_all("lib/autonomous-growth.ts", '"Record the walkthrough manually. Do not auto-send social DMs or Loom links."', '"Build and QA the preview manually, save the public link, then record and send the Loom manually."')

# Repository: remove automatic preview generation from the first-touch path.
for old in [
    'import { prepareProspectForPreview } from "@/lib/preview-preparation";\n',
    'import { createPublicPreviewToken } from "@/lib/public-preview-token";\n',
    'import { prepareTopProspectArtifactsWithResearch } from "@/lib/top-prospect-preview-preparation";\n',
]:
    replace_once("lib/autonomous-growth-repository.ts", old, "")
replace_regex(
    "lib/autonomous-growth-repository.ts",
    r'''function topProspectHasPublicPreview\(previewLink: string\) \{[\s\S]*?\n}\n\nfunction topProspectBackfillBlockedReason''',
    r'''function topProspectHasPublicPreview(previewLink: string) {
  try {
    const url = new URL(previewLink);
    return url.protocol === "https:"
      && !["localhost", "127.0.0.1"].includes(url.hostname)
      && !url.pathname.startsWith("/engine");
  } catch {
    return false;
  }
}

function topProspectBackfillBlockedReason''',
)
replace_regex(
    "lib/autonomous-growth-repository.ts",
    r'''async function syncTopProspectResultIntoQueue\([\s\S]*?\n}\n\nexport async function getAutonomousGrowthDashboard''',
    r'''async function syncTopProspectResultIntoQueue(
  result: TopProspectJob["results"][number],
  outreachPreference: OutreachPreference,
) {
  const previewLink = topProspectHasPublicPreview(result.previewLink) ? result.previewLink : "";
  const nowIso = new Date().toISOString();
  const prospect = reconcileProspectContactRouting(result.prospect);
  const outreach = {
    ...generateOutreach(prospect, previewLink),
    approved: false,
    lastRegeneratedAt: nowIso,
  };
  const preparedProspect: Prospect = {
    ...prospect,
    outreach,
    activities: [
      activity("outreach", "Permission-first first-touch package prepared. No preview was generated and nothing was sent."),
      ...prospect.activities,
    ],
  };
  const saved = hasDatabase ? await saveProspect(preparedProspect) : preparedProspect;
  if (hasDatabase) {
    const refreshed = await getProspectDatabase().topProspectResult.updateMany({
      where: { id: result.id, packageSentAt: null, NOT: { packageStatus: "SENT" } },
      data: {
        previewLink: previewLink || result.previewLink,
        packageStatus: "PACKAGE_GENERATED",
        packageGeneratedAt: new Date(),
        packageReviewedAt: null,
        packageApprovedAt: null,
        packageSentAt: null,
        packageSkippedAt: null,
      },
    });
    if (refreshed.count !== 1) throw new Error("The Top Prospect package changed before refresh completed.");
  }
  return upsertAutonomousQueueItemFromPackage({
    internalSmsEnabled: false,
    outreachPreference,
    previewLink,
    prospect: saved,
    sourceProvider: "Smart Backfill",
    topProspectResultId: result.id,
  });
}

export async function getAutonomousGrowthDashboard''',
)
replace_once("lib/autonomous-growth-repository.ts", '  "Prospect Said Yes",\n  "Loom Needed",', '  "Prospect Said Yes",\n  "Preview Build Needed",\n  "Loom Needed",')
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''    blockedReason: blockedReasonText(autoEligibility.blockedReasons, previewGate.reasons),\n    eligibilityReason: emailQuality.ready && previewGate.status === "Eligible"\n      ? `${prospect.trade} prospect has a public preview, send-safe copy, and a usable written contact path.`\n      : "Package generated, but review is required before any outreach.",''',
    '''    blockedReason: blockedReasonText(autoEligibility.blockedReasons, []),\n    eligibilityReason: emailQuality.ready\n      ? `${prospect.trade} prospect has send-safe permission-first copy and a usable written contact path. The preview will be built manually only after interest.`\n      : "First-touch package generated, but review is required before any outreach.",''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''    eligibilityReason: emailQuality.ready && previewGate.status === "Eligible"\n      ? `${prospect.trade} prospect has a public preview, send-safe copy, and a usable written contact path.`\n      : "Package generated, but review is required before any outreach.",\n    blockedReason: blockedReasonText(autoEligibility.blockedReasons, previewGate.reasons) || null,''',
    '''    eligibilityReason: emailQuality.ready\n      ? `${prospect.trade} prospect has send-safe permission-first copy and a usable written contact path. The preview will be built manually only after interest.`\n      : "First-touch package generated, but review is required before any outreach.",\n    blockedReason: blockedReasonText(autoEligibility.blockedReasons, []) || null,''',
)
replace_all("lib/autonomous-growth-repository.ts", "Review preview, copy, contact path, and approval gates.", "Review the exact copy, contact path, website evidence, and approval gates.")
replace_all("lib/autonomous-growth-repository.ts", "has a preview/package, but written outreach is blocked.", "has a first-touch package, but written outreach is blocked.")

manual_link_function = r'''
export async function setManualPreviewLink(id: string, previewLink: string) {
  if (!topProspectHasPublicPreview(previewLink)) {
    throw new Error("Enter a legitimate public HTTPS preview link. Localhost and protected /engine links are not allowed.");
  }
  const allowedStatuses = new Set<OutreachQueueStatus>(["Preview Build Needed", "Loom Needed", "Preview Needs Polish"]);
  const nowIso = new Date().toISOString();
  if (!hasDatabase) {
    const item = memoryQueue().find((entry) => entry.id === id);
    if (!item) return null;
    if (!allowedStatuses.has(item.status)) throw new Error(`A manual preview link cannot be added while status is ${item.status}.`);
    item.previewLink = previewLink.trim();
    item.status = "Preview Build Needed";
    item.recommendedNextAction = "Needs Human Review";
    item.notes = [item.notes, `Manual Lovable preview link saved on ${nowIso}. QA and Loom remain manual.`].filter(Boolean).join("\n");
    item.updatedAt = nowIso;
    await recordRunReview(memorySettings(), memoryQueue());
    return structuredClone(item);
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const current = await database.outreachQueueItem.findUnique({ where: { id } });
  if (!current) return null;
  const currentStatus = current.status as OutreachQueueStatus;
  if (!allowedStatuses.has(currentStatus)) throw new Error(`A manual preview link cannot be added while status is ${currentStatus}.`);
  const updated = await database.outreachQueueItem.updateMany({
    where: { id, status: current.status, updatedAt: current.updatedAt, sentDate: null },
    data: {
      previewLink: previewLink.trim(),
      status: "Preview Build Needed",
      recommendedNextAction: "Needs Human Review",
      notes: [current.notes ?? "", `Manual Lovable preview link saved on ${nowIso}. QA and Loom remain manual.`].filter(Boolean).join("\n"),
    },
  });
  if (updated.count !== 1) throw new Error("The queue item changed before the preview link was saved. Refresh and try again.");
  const row = await database.outreachQueueItem.findUniqueOrThrow({ where: { id } });
  const domain = queueToDomain(row);
  await recordLearningEvent(domain);
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return domain;
}

'''
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''export async function updateOutreachQueueStatus(id: string, status: OutreachQueueStatus) {''',
    manual_link_function + '''export async function updateOutreachQueueStatus(id: string, status: OutreachQueueStatus) {''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const nextStatus = queueStatusAfterManualAction(status);\n  const nowIso = new Date().toISOString();''',
    '''  const nextStatus = queueStatusAfterManualAction(status);\n  const nowIso = new Date().toISOString();''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''    if (!manualQueueStatusTransitionAllowed(item.status, status)) {\n      throw new Error(`Status cannot change from ${item.status} to ${status} through the general queue action.`);\n    }\n    const effectiveStatus = nextStatus;''',
    '''    if (!manualQueueStatusTransitionAllowed(item.status, status)) {\n      throw new Error(`Status cannot change from ${item.status} to ${status} through the general queue action.`);\n    }\n    if (status === "Ready for Loom" && !topProspectHasPublicPreview(item.previewLink)) {\n      throw new Error("Save and QA a legitimate public Lovable preview link before marking Ready for Loom.");\n    }\n    const effectiveStatus = nextStatus;''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  if (!manualQueueStatusTransitionAllowed(currentStatus, status)) {\n    throw new Error(`Status cannot change from ${currentStatus} to ${status} through the general queue action.`);\n  }\n  const now = new Date();''',
    '''  if (!manualQueueStatusTransitionAllowed(currentStatus, status)) {\n    throw new Error(`Status cannot change from ${currentStatus} to ${status} through the general queue action.`);\n  }\n  if (status === "Ready for Loom" && !topProspectHasPublicPreview(current.previewLink)) {\n    throw new Error("Save and QA a legitimate public Lovable preview link before marking Ready for Loom.");\n  }\n  const now = new Date();''',
)
replace_all("lib/autonomous-growth-repository.ts", 'effectiveStatus === "Loom Needed" || effectiveStatus === "Ready for Loom"', 'effectiveStatus === "Preview Build Needed" || effectiveStatus === "Loom Needed" || effectiveStatus === "Ready for Loom"')
replace_all("lib/autonomous-growth-repository.ts", "needs the manual preview, Loom, or pricing step.", "requested a preview and needs a manual Lovable build.")
replace_all("lib/autonomous-growth-repository.ts", "Open the queue, send the public preview manually, and prepare Loom if recommended.", "Recheck the business details, build and QA one polished Lovable site, save the public link, then record and send the Loom manually.")
replace_regex(
    "lib/autonomous-growth-repository.ts",
    r'''export async function createOrRefreshAutonomousReviewPackageForProspect\(prospectOrId: Prospect \| string\) \{[\s\S]*?\n}\n\nexport async function recordAutonomousFeedback''',
    r'''export async function createOrRefreshAutonomousReviewPackageForProspect(prospectOrId: Prospect | string) {
  const prospect = typeof prospectOrId === "string" ? await getProspect(prospectOrId) : prospectOrId;
  if (!prospect) return null;
  const existingQueueItem = await findExistingQueueItemForProspect(prospect.id);
  if (existingQueueItem && queueItemDraftMutationIsProtected(existingQueueItem)) return existingQueueItem;
  const previewInfo = await publicPreviewForProspect(prospect.id);
  const previewLink = topProspectHasPublicPreview(previewInfo.previewLink) ? previewInfo.previewLink : "";
  const nowIso = new Date().toISOString();
  const outreach = {
    ...generateOutreach(prospect, previewLink),
    approved: false,
    lastRegeneratedAt: nowIso,
  };
  const saved = await saveProspect({
    ...prospect,
    outreach,
    activities: [
      activity("outreach", "Permission-first Autonomous Growth review package created or refreshed. No preview was generated and nothing was sent."),
      ...prospect.activities,
    ],
  });
  return upsertAutonomousQueueItemFromPackage({
    forceReviewOnly: true,
    outreachPreference: "written_only",
    previewLink,
    prospect: saved,
    sourceProvider: "Legacy Outreach Backfill",
    topProspectResultId: previewInfo.topProspectResultId,
  });
}

export async function recordAutonomousFeedback''',
)
replace_all("lib/autonomous-growth-repository.ts", '["Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested", "Won"]', '["Positive Reply", "Prospect Said Yes", "Preview Build Needed", "Loom Needed", "Pricing Requested", "Won"]')
replace_once("lib/autonomous-growth-repository.ts", 'const loomNeeded = queue.filter((item) => item.status === "Loom Needed").length;', 'const loomNeeded = queue.filter((item) => ["Preview Build Needed", "Loom Needed"].includes(item.status)).length;')

# API endpoint for saving a manually built Lovable preview.
replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '''  sendQueuedEmailQueueItem,\n  startAutopilotCampaign,''',
    '''  sendQueuedEmailQueueItem,\n  setManualPreviewLink,\n  startAutopilotCampaign,''',
)
replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '''      note?: string;\n    };''',
    '''      note?: string;\n      previewLink?: string;\n    };''',
)
replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '''    if (payload.action === "record_feedback") {''',
    '''    if (payload.action === "set_manual_preview_link") {\n      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });\n      const item = await setManualPreviewLink(payload.queueItemId, payload.previewLink ?? "");\n      if (!item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });\n      return NextResponse.json({ item });\n    }\n    if (payload.action === "record_feedback") {''',
)

# Operator UI: manual build queue and checklist.
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''  if (mode === "dry_run") return "Finds, scores, generates previews and copy, then sends nothing.";\n  if (mode === "manual_approval") return "Builds the queue and lets you approve, copy, edit, or mark sent manually. Sends nothing.";''',
    '''  if (mode === "dry_run") return "Finds, scores, and drafts permission-first outreach, then sends nothing.";\n  if (mode === "manual_approval") return "Builds the review queue. Lovable previews are created manually only after a prospect asks for one.";''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''      setNotice(status === "Prospect Said Yes" ? "Prospect said yes. A Loom Needed task was created and nothing was sent." : `${status} recorded. Nothing was sent automatically.`);''',
    '''      setNotice(status === "Prospect Said Yes" ? "Prospect said yes. A Preview Build Needed task was created. Lovable, QA, Loom, and sending remain manual." : `${status} recorded. Nothing was sent automatically.`);''',
)
manual_preview_ui_function = r'''
  async function saveManualPreviewLink(item: OutreachQueueItem) {
    const previewLink = window.prompt("Paste the public Lovable preview URL after you have built and QA'd the site:", item.previewLink || "");
    if (previewLink === null) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_manual_preview_link", queueItemId: item.id, previewLink: previewLink.trim() }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.item) throw new Error(apiError(payload, "Unable to save the manual preview link."));
      await loadDashboard();
      setNotice("Manual Lovable preview link saved. Check desktop, mobile, buttons, forms, and factual accuracy before marking Ready for Loom.");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to save the manual preview link.");
    } finally {
      setSaving(false);
    }
  }

'''
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''  async function approveAndQueueEmail(item: OutreachQueueItem) {''',
    manual_preview_ui_function + '''  async function approveAndQueueEmail(item: OutreachQueueItem) {''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''    const loomStatuses = ["Loom Needed", "Preview Needs Polish", "Ready for Loom", "Loom Recorded"] as OutreachQueueStatus[];''',
    '''    const loomStatuses = ["Preview Build Needed", "Loom Needed", "Preview Needs Polish", "Ready for Loom", "Loom Recorded"] as OutreachQueueStatus[];''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''          <div><b>You have Loom walkthroughs to record.</b><p>{metrics.loomNeeded} prospect{metrics.loomNeeded === 1 ? "" : "s"} said yes and now need a manual video before the preview is sent.</p></div>\n          <span>{metrics.loomNeeded} Loom Needed</span>''',
    '''          <div><b>You have manual Lovable previews to build.</b><p>{metrics.loomNeeded} prospect{metrics.loomNeeded === 1 ? "" : "s"} asked for a preview. Build and QA the site first; record the Loom only after the public preview is ready.</p></div>\n          <span>{metrics.loomNeeded} Preview Build Needed</span>''',
)
replace_all("components/engine/AutonomousGrowthWorkspace.tsx", '["Previews generated", metrics.previewsGeneratedToday, "Public /p/ links only"]', '["Manual previews saved", metrics.previewsGeneratedToday, "Built only after interest"]')
replace_all("components/engine/AutonomousGrowthWorkspace.tsx", '["Average preview QA", `${metrics.averagePreviewQualityScore}/100`, "Self-review signal"]', '["Builds waiting", metrics.loomNeeded, "Manual Lovable queue"]')
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''        <LoomQueueSection\n          copied={copied}\n          items={groupedQueue.loom}\n          onCopy={copyText}\n          onStatus={updateStatus}\n        />''',
    '''        <LoomQueueSection\n          copied={copied}\n          items={groupedQueue.loom}\n          onCopy={copyText}\n          onSavePreview={saveManualPreviewLink}\n          onStatus={updateStatus}\n        />''',
)
replace_regex(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    r'''function LoomQueueSection\(\{\n  copied,\n  items,\n  onCopy,\n  onStatus,\n}: \{\n  copied: string;\n  items: OutreachQueueItem\[\];\n  onCopy: \(key: string, value: string\) => Promise<void>;\n  onStatus: \(item: OutreachQueueItem, status: OutreachQueueStatus\) => Promise<void>;\n}\) \{''',
    r'''function LoomQueueSection({
  copied,
  items,
  onCopy,
  onSavePreview,
  onStatus,
}: {
  copied: string;
  items: OutreachQueueItem[];
  onCopy: (key: string, value: string) => Promise<void>;
  onSavePreview: (item: OutreachQueueItem) => Promise<void>;
  onStatus: (item: OutreachQueueItem, status: OutreachQueueStatus) => Promise<void>;
}) {''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''        <div><h2>Loom Needed Queue</h2><p>Prospects who said yes. Polish the preview if needed, record a manual Loom, then send the Loom and preview manually.</p></div>\n        <span>{items.length} Loom task{items.length === 1 ? "" : "s"}</span>''',
    '''        <div><h2>Manual Preview Build Queue</h2><p>Prospects who said yes. Build one polished Lovable site, QA it, save the public link, then record and send the Loom manually.</p></div>\n        <span>{items.length} manual build{items.length === 1 ? "" : "s"}</span>''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''      {items.length === 0 ? <EmptyState title="No Loom walkthroughs waiting" body="Mark a prospect as Prospect Said Yes to create a Loom Needed task." /> : (''',
    '''      {items.length === 0 ? <EmptyState title="No manual preview builds waiting" body="Mark a prospect as Prospect Said Yes to create a Preview Build Needed task." /> : (''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''                <section className="engine-loom-checklist">\n                  <h4>Review-before-Loom checklist</h4>''',
    '''                <section className="engine-loom-checklist">\n                  <h4>Manual Lovable workflow</h4>\n                  <ol>\n                    <li>Recheck the business identity and website status.</li>\n                    <li>Gather verified logo, services, brand cues, and usable images.</li>\n                    <li>Build one polished website manually in Lovable.</li>\n                    <li>Check desktop and mobile layouts.</li>\n                    <li>Verify every button and form and remove unsupported claims or fake proof.</li>\n                    <li>Save the legitimate public preview link here.</li>\n                    <li>Record the Loom manually.</li>\n                    <li>Send the preview and Loom manually.</li>\n                  </ol>\n                  <h4>Review-before-Loom checklist</h4>''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''                  <button className="engine-button" onClick={() => void onStatus(item, "Preview Needs Polish")} type="button">Preview Needs Polish</button>''',
    '''                  <button className="engine-button" onClick={() => void onSavePreview(item)} type="button">Add Lovable preview link</button>\n                  <button className="engine-button" onClick={() => void onStatus(item, "Preview Needs Polish")} type="button">Preview Needs Polish</button>''',
)

# Documentation wording.
for path in ["ENGINE_DEPLOYMENT.md", "ENGINE_READINESS.md"]:
    content = read(path)
    content = content.replace("Want me to send it over?", "Would you like me to put together a quick preview?")
    content = content.replace("preview already exists", "preview is created manually only after interest")
    content = content.replace("preview link is required", "preview link is required only after a prospect requests a manual build")
    write(path, content)

# Update obvious legacy phrase/status assertions and add focused regression coverage.
for path in [
    "tests/autonomous-growth.test.ts",
    "tests/operator-test-center.test.ts",
    "tests/prospect-engine.test.ts",
    "tests/top-prospects.test.ts",
    "tests/legacy-outreach-backfill.test.ts",
    "tests/mobile-engine-layout.test.ts",
]:
    content = read(path)
    content = content.replace("standardized_permission_first_v2", "manual_lovable_permission_first_v3")
    content = content.replace("Want me to send it over?", "Would you like me to put together a quick preview?")
    content = content.replace("Want me to send it over\\?", "Would you like me to put together a quick preview\\?")
    content = content.replace("A Loom Needed task was created", "A Preview Build Needed task was created")
    content = content.replace('queueStatusAfterManualAction("Prospect Said Yes"), "Loom Needed"', 'queueStatusAfterManualAction("Prospect Said Yes"), "Preview Build Needed"')
    write(path, content)

write("tests/manual-lovable-workflow.test.ts", r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueStatusAfterManualAction } from "../lib/autonomous-growth";
import { firstTouchEmailDraft, outreachComplianceFooter, withAnalysis, seedProspects } from "../lib/prospect-engine";

process.env.WEBWORKSHOP_POSTAL_ADDRESS ??= "147 George St, Findlay, OH 45840";

test("first touch asks permission to create a preview and never claims one already exists", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const email = firstTouchEmailDraft(prospect, outreachComplianceFooter());
  assert.match(email, /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(email, /\b(?:I|we)\s+(?:built|made|created|put together)\b.{0,80}\b(?:preview|website|site)\b/i);
  assert.doesNotMatch(email, /https?:\/\/|\/p\//i);
});

test("positive interest enters the manual Lovable build queue", () => {
  assert.equal(queueStatusAfterManualAction("Prospect Said Yes"), "Preview Build Needed");
});

test("first-touch readiness no longer requires preview generation or preview quality", () => {
  const autonomous = readFileSync(new URL("../lib/autonomous-growth.ts", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../lib/autonomous-growth-repository.ts", import.meta.url), "utf8");
  const quality = readFileSync(new URL("../lib/top-prospects.ts", import.meta.url), "utf8");
  assert.doesNotMatch(autonomous.match(/function prospectFacingEmailBodySafe[\s\S]*?export function evaluateQueuedEmailSendReadiness/)?.[0] ?? "", /Public \/p\/ preview link is missing/);
  assert.doesNotMatch(quality.match(/export function evaluateOutreachEmailQuality[\s\S]*?export function assertOutreachEmailReady/)?.[0] ?? "", /Public preview link exists and is included after permission/);
  assert.match(repository, /Permission-first first-touch package prepared\. No preview was generated/);
  assert.doesNotMatch(repository.match(/async function syncTopProspectResultIntoQueue[\s\S]*?export async function getAutonomousGrowthDashboard/)?.[0] ?? "", /prepareTopProspectArtifactsWithResearch|prepareProspectForPreview|createPublicPreviewToken/);
});

test("manual preview link workflow is explicit and provider-free", () => {
  const repository = readFileSync(new URL("../lib/autonomous-growth-repository.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/engine/autonomous-growth/route.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../components/engine/AutonomousGrowthWorkspace.tsx", import.meta.url), "utf8");
  const setter = repository.match(/export async function setManualPreviewLink[\s\S]*?export async function updateOutreachQueueStatus/)?.[0] ?? "";
  assert.match(setter, /Preview Build Needed/);
  assert.match(setter, /legitimate public HTTPS preview link/);
  assert.doesNotMatch(setter, /sendWithResend|api\.resend\.com|fetch\(/);
  assert.match(route, /set_manual_preview_link[\s\S]*setManualPreviewLink/);
  assert.match(workspace, /Build one polished website manually in Lovable/);
  assert.match(workspace, /Add Lovable preview link/);
});

test("Ready for Loom fails closed without a public preview link", () => {
  const repository = readFileSync(new URL("../lib/autonomous-growth-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /status === "Ready for Loom"[\s\S]*Save and QA a legitimate public Lovable preview link/);
});
''')

print("Manual Lovable workflow transformations applied.")
