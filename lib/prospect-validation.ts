import {
  prospectStatuses,
  prospectTypes,
  websiteAvailabilityStatuses,
  prospectClassifications,
  recommendedContactMethods,
  manualContactMethods,
  contactConfidenceLevels,
  classifyProspectPresence,
  displayStateCode,
  normalizeTradeCategory,
  recommendProspectContactMethod,
  scoreLabels,
  prospectBestManualContactMethod,
  prospectContactConfidence,
  titleCaseLocation,
  type Activity,
  type Analysis,
  type OutreachDraft,
  type PreviewConcept,
  type PreviewQualityScore,
  type PreviewStyleProfile,
  type Prospect,
  type ProspectStatus,
  type ProspectType,
  type WebsiteAvailabilityStatus,
  type ProspectClassification,
  type RecommendedContactMethod,
  type ManualContactMethod,
  type ContactConfidence,
  type ScoreKey,
} from "@/lib/prospect-engine";

type ValidationResult = { ok: true; value: Prospect } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, maxLength: number, required = true) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${field} is required.`);
  if (result.length > maxLength) throw new Error(`${field} is too long.`);
  return result;
}

function dateText(value: unknown, field: string) {
  const result = text(value, field, 100);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a valid date.`);
  return new Date(result).toISOString();
}

function stringArray(value: unknown, field: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} must be a valid list.`);
  return value.map((item) => text(item, field, maxLength));
}

function analysisValue(value: unknown): Analysis | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.scores)) throw new Error("Analysis must be a valid object.");
  const scores = {} as Record<ScoreKey, number>;
  for (const key of Object.keys(scoreLabels) as ScoreKey[]) {
    const score = Number(value.scores[key]);
    if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error("Analysis scores must be integers from 0 to 100.");
    scores[key] = score;
  }
  const overallScore = Number(value.overallScore);
  if (!Number.isInteger(overallScore) || overallScore < 0 || overallScore > 100) throw new Error("Analysis overall score must be an integer from 0 to 100.");
  const opportunityRating = text(value.opportunityRating, "Opportunity rating", 20) as Analysis["opportunityRating"];
  if (!["High", "Medium", "Low"].includes(opportunityRating)) throw new Error("Opportunity rating is not supported.");
  return {
    overallScore,
    opportunityRating,
    scores,
    strengths: stringArray(value.strengths, "Analysis strengths", 20, 1000),
    weaknesses: stringArray(value.weaknesses, "Analysis weaknesses", 20, 1000),
    summary: text(value.summary, "Analysis summary", 5000),
    redesignDirection: text(value.redesignDirection, "Redesign direction", 5000),
    analyzedAt: dateText(value.analyzedAt, "Analysis date"),
  };
}

function outreachValue(value: unknown): OutreachDraft | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.approved !== "boolean") throw new Error("Outreach draft must be a valid object.");
  return {
    subjects: stringArray(value.subjects, "Outreach subjects", 10, 300),
    concise: text(value.concise, "Concise outreach", 20_000),
    detailed: text(value.detailed, "Detailed outreach", 40_000),
    followUps: stringArray(value.followUps, "Outreach follow-ups", 10, 20_000),
    approved: value.approved,
    generatedAt: dateText(value.generatedAt, "Outreach generated date"),
  };
}

function styleProfileValue(value: unknown): PreviewStyleProfile | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview style profile must be a valid object.");
  const color = (input: unknown, field: string) => {
    const result = text(input, field, 7);
    if (!/^#[0-9a-f]{6}$/i.test(result)) throw new Error(`${field} must be a six-digit hex color.`);
    return result;
  };
  const font = (input: unknown, field: string) => {
    const result = text(input, field, 200);
    if (!/^[A-Za-z0-9'", -]+$/.test(result)) throw new Error(`${field} contains unsupported characters.`);
    return result;
  };
  const tone = text(value.tone, "Preview tone", 30) as PreviewStyleProfile["tone"];
  if (!["practical", "modern-practical", "local-family", "premium-craft", "high-trust"].includes(tone)) {
    throw new Error("Preview tone is not supported.");
  }
  const layoutStyle = text(value.layoutStyle, "Preview layout style", 30) as PreviewStyleProfile["layoutStyle"];
  if (!["trust-led", "service-led", "project-led", "clean-split"].includes(layoutStyle)) {
    throw new Error("Preview layout style is not supported.");
  }
  const brandSource = text(value.brandSource, "Preview brand source", 30) as PreviewStyleProfile["brandSource"];
  if (!["business-name cue", "website-domain cue", "trade fallback"].includes(brandSource)) {
    throw new Error("Preview brand source is not supported.");
  }
  return {
    name: text(value.name, "Preview style name", 160),
    primaryColor: color(value.primaryColor, "Preview primary color"),
    accentColor: color(value.accentColor, "Preview accent color"),
    surfaceColor: color(value.surfaceColor, "Preview surface color"),
    softSurfaceColor: color(value.softSurfaceColor, "Preview soft surface color"),
    inkColor: color(value.inkColor, "Preview ink color"),
    mutedTextColor: color(value.mutedTextColor, "Preview muted text color"),
    borderColor: color(value.borderColor, "Preview border color"),
    typographyStyle: text(value.typographyStyle, "Preview typography style", 500),
    headingFont: font(value.headingFont, "Preview heading font"),
    bodyFont: font(value.bodyFont, "Preview body font"),
    tone,
    layoutStyle,
    ctaLabel: text(value.ctaLabel, "Preview CTA label", 100),
    styleReason: text(value.styleReason, "Preview style reason", 1000),
    brandSource,
  };
}

function scoreValue(input: unknown, field: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${field} must be a score from 0 to 100.`);
  return Math.round(value);
}

function previewQualityValue(value: unknown): PreviewQualityScore | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview quality score must be a valid object.");
  return {
    visualPolish: scoreValue(value.visualPolish, "Preview visual polish"),
    businessSpecificity: scoreValue(value.businessSpecificity, "Preview business specificity"),
    clarity: scoreValue(value.clarity, "Preview clarity"),
    mobileResponsiveness: scoreValue(value.mobileResponsiveness, "Preview mobile responsiveness"),
    conversionStrength: scoreValue(value.conversionStrength, "Preview conversion strength"),
    safetyTruthfulness: scoreValue(value.safetyTruthfulness, "Preview safety truthfulness"),
    overall: scoreValue(value.overall, "Preview overall quality"),
    notes: value.notes === undefined ? [] : stringArray(value.notes, "Preview quality notes", 12, 500),
  };
}

function previewValue(value: unknown): PreviewConcept | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview concept must be a valid object.");
  return {
    direction: text(value.direction, "Preview direction", 5000),
    visualStyleDirection: text(value.visualStyleDirection ?? "Practical contractor visual direction.", "Visual style direction", 5000),
    hero: text(value.hero, "Preview hero", 5000),
    heroHeadline: value.heroHeadline === undefined ? undefined : text(value.heroHeadline, "Preview hero headline", 500),
    heroSupporting: value.heroSupporting === undefined ? undefined : text(value.heroSupporting, "Preview hero supporting copy", 2000),
    serviceHighlights: value.serviceHighlights === undefined ? undefined : stringArray(value.serviceHighlights, "Preview service highlights", 12, 300),
    trustItems: value.trustItems === undefined ? undefined : stringArray(value.trustItems, "Preview trust items", 12, 300),
    styleProfile: styleProfileValue(value.styleProfile),
    homepageStructure: stringArray(value.homepageStructure, "Homepage structure", 20, 1000),
    ctaStrategy: text(value.ctaStrategy, "CTA strategy", 5000),
    servicePageStructure: stringArray(value.servicePageStructure, "Service page structure", 20, 1000),
    portfolioDirection: text(value.portfolioDirection, "Portfolio direction", 5000),
    trustStrategy: text(value.trustStrategy, "Trust strategy", 5000),
    leadCaptureStrategy: text(value.leadCaptureStrategy, "Lead capture strategy", 5000),
    qualityScore: previewQualityValue(value.qualityScore),
    generatedAt: dateText(value.generatedAt, "Preview generated date"),
  };
}

function activityValues(value: unknown): Activity[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error("Activities must be a valid list.");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("Activity must be a valid object.");
    const type = text(item.type, "Activity type", 30) as Activity["type"];
    if (!["created", "analysis", "outreach", "preview", "status", "note"].includes(type)) throw new Error("Activity type is not supported.");
    return {
      id: text(item.id, "Activity ID", 100),
      type,
      label: text(item.label, "Activity label", 1000),
      at: dateText(item.at, "Activity date"),
    };
  });
}

export function validateProspect(input: unknown): ValidationResult {
  try {
    if (!isRecord(input)) throw new Error("Prospect payload must be an object.");

    const prospectType = text(input.prospectType ?? "redesign", "Prospect type", 40) as ProspectType;
    if (!prospectTypes.includes(prospectType)) throw new Error("Prospect type is not supported.");
    const website = text(input.website ?? "", "Website", 2048, prospectType === "redesign");
    const profileUrl = text(input.profileUrl ?? "", "Profile URL", 2048, false);
    const validateUrl = (value: string, field: string) => {
      if (!value) return "";
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${field} must use HTTP or HTTPS.`);
      if (parsed.username || parsed.password) throw new Error(`${field} cannot include credentials.`);
      if (parsed.port && !["80", "443"].includes(parsed.port)) throw new Error(`${field} uses an unsupported port.`);
      return parsed.href;
    };
    const parsedWebsite = validateUrl(website, "Website");
    const parsedProfileUrl = validateUrl(profileUrl, "Profile URL");
    const parsedContactPageUrl = validateUrl(text(input.contactPageUrl ?? "", "Contact page URL", 2048, false), "Contact page URL");
    const parsedContactFormUrl = validateUrl(text(input.contactFormUrl ?? "", "Contact form URL", 2048, false), "Contact form URL");
    const parsedQuoteFormUrl = validateUrl(text(input.quoteFormUrl ?? "", "Quote form URL", 2048, false), "Quote form URL");
    const parsedFacebookUrl = validateUrl(text(input.facebookUrl ?? "", "Facebook URL", 2048, false), "Facebook URL");
    const parsedInstagramUrl = validateUrl(text(input.instagramUrl ?? "", "Instagram URL", 2048, false), "Instagram URL");
    const parsedLinkedinUrl = validateUrl(text(input.linkedinUrl ?? "", "LinkedIn URL", 2048, false), "LinkedIn URL");
    const parsedXUrl = validateUrl(text(input.xUrl ?? "", "X/Twitter URL", 2048, false), "X/Twitter URL");
    const parsedYoutubeUrl = validateUrl(text(input.youtubeUrl ?? "", "YouTube URL", 2048, false), "YouTube URL");

    const trade = normalizeTradeCategory(text(input.trade, "Trade", 40));
    if (!trade) throw new Error("Trade category is not supported.");

    const status = text(input.status, "Status", 40) as ProspectStatus;
    if (!prospectStatuses.includes(status)) throw new Error("Pipeline status is not supported.");

    const sizeIndicator = text(input.sizeIndicator, "Business size", 20) as Prospect["sizeIndicator"];
    if (!["Small", "Growing", "Established"].includes(sizeIndicator)) throw new Error("Business size is not supported.");

    const priorityScore = Number(input.priorityScore);
    if (!Number.isInteger(priorityScore) || priorityScore < 0 || priorityScore > 100) {
      throw new Error("Priority score must be an integer from 0 to 100.");
    }

    const email = text(input.email, "Email", 254, false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email must be valid.");
    const phone = text(input.phone, "Phone", 50, false);
    const contactFields = {
      website: parsedWebsite,
      profileUrl: parsedProfileUrl,
      phone,
      email,
      contactFormUrl: parsedContactFormUrl,
      quoteFormUrl: parsedQuoteFormUrl,
      facebookUrl: parsedFacebookUrl,
      instagramUrl: parsedInstagramUrl,
      linkedinUrl: parsedLinkedinUrl,
    };
    const classification = input.classification === undefined
      ? classifyProspectPresence(contactFields)
      : text(input.classification, "Prospect classification", 50) as ProspectClassification;
    if (!prospectClassifications.includes(classification)) throw new Error("Prospect classification is not supported.");
    const inactive = input.inactive === undefined ? false : input.inactive;
    if (typeof inactive !== "boolean") throw new Error("Inactive status must be true or false.");
    const websiteStatus = text(input.websiteStatus ?? (parsedWebsite ? "unknown" : "no_owned_website"), "Website status", 40) as WebsiteAvailabilityStatus;
    if (!websiteAvailabilityStatuses.includes(websiteStatus)) throw new Error("Website status is not supported.");
    const websiteAnalysisAttemptedAt = text(input.websiteAnalysisAttemptedAt ?? "", "Website analysis attempt date", 100, false);
    if (websiteAnalysisAttemptedAt && !Number.isFinite(Date.parse(websiteAnalysisAttemptedAt))) {
      throw new Error("Website analysis attempt date must be valid.");
    }
    const recommendedContactMethod = input.recommendedContactMethod === undefined
      ? recommendProspectContactMethod({ ...contactFields, classification, inactive })
      : text(input.recommendedContactMethod, "Recommended contact method", 60) as RecommendedContactMethod;
    if (!recommendedContactMethods.includes(recommendedContactMethod)) throw new Error("Recommended contact method is not supported.");
    const bestManualContactMethod = input.bestManualContactMethod === undefined
      ? prospectBestManualContactMethod(contactFields)
      : text(input.bestManualContactMethod, "Best manual contact method", 50) as ManualContactMethod;
    if (!manualContactMethods.includes(bestManualContactMethod)) throw new Error("Best manual contact method is not supported.");
    const contactConfidence = input.contactConfidence === undefined
      ? prospectContactConfidence(contactFields)
      : text(input.contactConfidence, "Contact confidence", 20) as ContactConfidence;
    if (!contactConfidenceLevels.includes(contactConfidence)) throw new Error("Contact confidence is not supported.");

    const scoreValue = (value: unknown, field: string, fallback = 0) => {
      const score = value === undefined ? fallback : Number(value);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`${field} must be between 0 and 100.`);
      return score;
    };
    const countValue = (value: unknown, field: string) => {
      const count = value === undefined ? 0 : Number(value);
      if (!Number.isInteger(count) || count < 0) throw new Error(`${field} must be a non-negative integer.`);
      return count;
    };

    return {
      ok: true,
      value: {
        id: text(input.id, "Prospect ID", 100),
        businessName: text(input.businessName, "Business name", 160),
        website: parsedWebsite,
        profileUrl: parsedProfileUrl,
        prospectType,
        classification,
        phone,
        email,
        contactPageUrl: parsedContactPageUrl,
        contactFormUrl: parsedContactFormUrl,
        quoteFormUrl: parsedQuoteFormUrl,
        contactFormDetected: Boolean(input.contactFormDetected ?? parsedContactFormUrl),
        quoteFormDetected: Boolean(input.quoteFormDetected ?? parsedQuoteFormUrl),
        facebookUrl: parsedFacebookUrl,
        instagramUrl: parsedInstagramUrl,
        linkedinUrl: parsedLinkedinUrl,
        xUrl: parsedXUrl,
        youtubeUrl: parsedYoutubeUrl,
        contactPersonName: text(input.contactPersonName ?? "", "Contact person", 160, false),
        contactConfidence,
        bestManualContactMethod,
        contactDiscoveryNotes: input.contactDiscoveryNotes === undefined ? [] : stringArray(input.contactDiscoveryNotes, "Contact discovery notes", 25, 500),
        address: text(input.address ?? "", "Address", 500, false),
        city: titleCaseLocation(text(input.city, "City", 100)),
        state: displayStateCode(text(input.state, "State", 2)),
        trade,
        status,
        serviceArea: text(input.serviceArea, "Service area", 300),
        sizeIndicator,
        priorityScore,
        rating: Math.min(5, scoreValue(input.rating, "Rating")),
        reviewCount: countValue(input.reviewCount, "Review count"),
        recentReviewCount: countValue(input.recentReviewCount, "Recent review count"),
        sourceConfidence: scoreValue(input.sourceConfidence, "Source confidence"),
        activitySignals: input.activitySignals === undefined ? [] : stringArray(input.activitySignals, "Activity signals", 50, 100),
        recommendedContactMethod,
        inactive,
        websiteStatus,
        websiteStatusDetail: text(input.websiteStatusDetail ?? "", "Website status detail", 1000, false),
        websiteAnalysisAttemptedAt: websiteAnalysisAttemptedAt ? new Date(websiteAnalysisAttemptedAt).toISOString() : "",
        notes: stringArray(input.notes, "Notes", 1000, 5000),
        activities: activityValues(input.activities),
        analysis: analysisValue(input.analysis),
        outreach: outreachValue(input.outreach),
        preview: previewValue(input.preview),
        createdAt: dateText(input.createdAt, "Created date"),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid prospect payload." };
  }
}
