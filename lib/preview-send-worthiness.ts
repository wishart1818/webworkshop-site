import { displayStateCode, displayTradeCategory, titleCaseLocation, type Prospect, type PreviewConcept } from "@/lib/prospect-engine";
import { isPublicPreviewImageRelevant, resolvePreviewImages, validatePreviewImages, type ResolvedPreviewImage } from "@/lib/preview-image-resolver";

export type PreviewSendWorthinessVerdict = "send_worthy" | "needs_improvement" | "blocked";

export type PreviewSendWorthiness = {
  verdict: PreviewSendWorthinessVerdict;
  label: "SEND-WORTHY" | "NEEDS IMPROVEMENT" | "BLOCKED";
  description: string;
  primaryWarning: string;
  nextAction: "Generate Preview" | "Improve Preview" | "Resolve Issue" | "Review Outreach";
  freshness: string;
  resolvedImageCount: number;
  warnings: string[];
};

const internalPublicTextPattern = /include only when verified|placeholder|proof concept|operator note|editorial instruction|verification required|suggested wording|build prompt|internal instruction|generator note|internal qa|representative image direction|replace with verified/i;
const unsupportedClaimPattern = /\b(award-winning|certified|licensed|insured|guaranteed|guarantee|guarantees|warrant(?:y|ies)|five-star|best rated|family-owned|locally owned for \d+ years|in business for \d+ years)\b/i;

function previewServices(prospect: Prospect, preview: PreviewConcept) {
  return [
    { title: preview.serviceHighlights?.[0] ?? displayTradeCategory(prospect.trade), description: "Primary service." },
    { title: preview.serviceHighlights?.[1] ?? "Service planning", description: "Secondary service." },
    { title: preview.serviceHighlights?.[2] ?? "Estimate request", description: "Supporting service." },
  ] as const;
}

function publicCopy(preview: PreviewConcept) {
  return [
    preview.direction,
    preview.hero,
    preview.heroHeadline,
    preview.heroSupporting,
    ...(preview.serviceHighlights ?? []),
    ...(preview.trustItems ?? []),
    preview.ctaStrategy,
    preview.leadCaptureStrategy,
  ].filter(Boolean).join("\n");
}

function uniqueBySrc(images: readonly ResolvedPreviewImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.src || seen.has(image.src)) return false;
    seen.add(image.src);
    return true;
  });
}

function publicMajorImagesForWorthiness(prospect: Prospect, images: ReturnType<typeof resolvePreviewImages>) {
  const all = [images.hero, ...images.services, ...images.gallery, images.beforeAfter, images.process, images.cta];
  if (displayTradeCategory(prospect.trade) !== "Pressure Washing") return all;
  const visibleRelevant = all.filter((image) => isPublicPreviewImageRelevant(image, prospect.trade));
  return uniqueBySrc(visibleRelevant.length ? visibleRelevant : all);
}

function previewFreshness(preview: PreviewConcept | undefined) {
  if (!preview?.generatedAt) return "Not recorded";
  const generated = new Date(preview.generatedAt);
  if (Number.isNaN(generated.getTime())) return "Not recorded";
  const ageHours = Math.max(0, Math.round((Date.now() - generated.getTime()) / 36_000) / 100);
  if (ageHours < 1) return "Updated less than 1 hour ago";
  if (ageHours < 24) return `Updated ${Math.round(ageHours)} hour${Math.round(ageHours) === 1 ? "" : "s"} ago`;
  const ageDays = Math.round(ageHours / 24);
  return `Updated ${ageDays} day${ageDays === 1 ? "" : "s"} ago`;
}

export function evaluatePreviewSendWorthiness(
  prospect: Prospect,
  options: { publicPreviewUrl?: string; publicPreviewVerified?: boolean } = {},
): PreviewSendWorthiness {
  const preview = prospect.preview;
  const warnings: string[] = [];

  if (!preview) {
    return {
      verdict: "blocked",
      label: "BLOCKED",
      description: "Do not send. No public preview has been generated yet.",
      primaryWarning: "No preview exists for this prospect.",
      nextAction: "Generate Preview",
      freshness: "No preview yet",
      resolvedImageCount: 0,
      warnings: ["No preview exists."],
    };
  }

  const publicPreviewUrl = options.publicPreviewUrl?.trim() ?? "";
  if (!publicPreviewUrl || !/\/p\/[A-Za-z0-9_-]{24,}/.test(publicPreviewUrl)) {
    warnings.push("No prospect-safe public /p/ preview link is available.");
  }
  if (publicPreviewUrl && options.publicPreviewVerified === false) {
    warnings.push("The public preview route could not be verified against the latest saved preview.");
  }

  const images = preview.resolvedImages ?? resolvePreviewImages(prospect, previewServices(prospect, preview));
  const imageList = publicMajorImagesForWorthiness(prospect, images);
  const resolvedImageCount = imageList.filter((image) => image.src && image.source !== "neutral-fallback" && image.source !== "curated-trade-library").length;
  const imageValidation = validatePreviewImages(imageList);
  const resolverWarnings = displayTradeCategory(prospect.trade) === "Pressure Washing"
    ? images.warnings.filter((warning) => !/one image is used across too much|repeats one image/i.test(warning))
    : images.warnings;
  warnings.push(...resolverWarnings, ...imageValidation.warnings);
  if (images.hero.source === "curated-trade-library" || images.hero.source === "neutral-fallback") {
    warnings.push("Hero image did not resolve to photography.");
  }
  if (imageList.some((image) => image.source === "curated-trade-library")) {
    warnings.push("One or more public preview sections are using illustration fallback instead of photography.");
  }

  const copy = publicCopy(preview);
  if (!copy.includes(prospect.businessName)) warnings.push("Business name is not clearly represented in the preview copy.");
  if (!new RegExp(displayTradeCategory(prospect.trade), "i").test(copy)) warnings.push("Trade is not clearly represented in the preview copy.");
  const locationCopy = `${titleCaseLocation(prospect.city)} ${displayStateCode(prospect.state)} ${prospect.serviceArea}`;
  if (!new RegExp(titleCaseLocation(prospect.city).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(`${copy} ${locationCopy}`)) {
    warnings.push("City or service-area language is not clear enough.");
  }
  if (internalPublicTextPattern.test(copy)) warnings.push("Internal or placeholder wording appears in public-facing preview copy.");
  if (unsupportedClaimPattern.test(copy) && !/verified|supplied by the business|public rating count only/i.test(copy)) {
    warnings.push("Unsupported factual claim appears in the preview copy.");
  }
  if ((preview.qualityScore?.imageQuality ?? 100) < 78) warnings.push("Image quality is below the send-worthy threshold.");
  if ((preview.qualityScore?.imageSectionRelevance ?? 100) < 78) warnings.push("Some images may not match nearby service content.");
  if ((preview.qualityScore?.layoutVariety ?? 100) < 78) warnings.push("Layout may feel too repetitive or template-like.");
  if ((preview.qualityScore?.mobileResponsiveness ?? 100) < 80) warnings.push("Mobile layout needs visual review before outreach.");
  if ((preview.qualityScore?.conversionStrength ?? 100) < 80) warnings.push("CTA hierarchy is not strong enough yet.");
  if ((preview.qualityScore?.safetyTruthfulness ?? 100) < 85) warnings.push("Factual-safety score is too low for prospect-facing use.");
  if (resolvedImageCount < 6) warnings.push("Too few trade-relevant photos resolved for the public preview.");

  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];
  const blockingWarning = uniqueWarnings.find((warning) =>
    /No prospect-safe public|could not be verified|Internal or placeholder|Unsupported factual|No preview exists|factual-safety/i.test(warning),
  );
  const score = preview.qualityScore?.overall ?? 0;
  const qualityStatus = preview.qualityScore?.status ?? "";
  const blocked = Boolean(blockingWarning) || /blocked/i.test(qualityStatus);
  const sendWorthy = !blocked && score >= 85 && uniqueWarnings.length === 0;
  const primaryWarning = blockingWarning ?? uniqueWarnings[0] ?? "Looks polished and ready to show the prospect.";

  if (blocked) {
    return {
      verdict: "blocked",
      label: "BLOCKED",
      description: "Do not send. The preview has a factual, visual, or technical problem.",
      primaryWarning,
      nextAction: "Resolve Issue",
      freshness: previewFreshness(preview),
      resolvedImageCount,
      warnings: uniqueWarnings,
    };
  }

  if (sendWorthy) {
    return {
      verdict: "send_worthy",
      label: "SEND-WORTHY",
      description: "Looks polished and ready to show the prospect.",
      primaryWarning,
      nextAction: "Review Outreach",
      freshness: previewFreshness(preview),
      resolvedImageCount,
      warnings: uniqueWarnings,
    };
  }

  return {
    verdict: "needs_improvement",
    label: "NEEDS IMPROVEMENT",
    description: "The preview works, but the visible result needs improvement before outreach.",
    primaryWarning,
    nextAction: "Improve Preview",
    freshness: previewFreshness(preview),
    resolvedImageCount,
    warnings: uniqueWarnings,
  };
}
