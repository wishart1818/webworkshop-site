import { displayStateCode, displayTradeCategory, titleCaseLocation, type Prospect, type PreviewConcept } from "@/lib/prospect-engine";
import { isPublicPreviewImageRelevant, resolvePreviewImages, validatePreviewImages, type ResolvedPreviewImage } from "@/lib/preview-image-resolver";
import { normalizePreviewForRender } from "@/lib/preview-compatibility";

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
  if (preview.serviceHierarchy?.length) return preview.serviceHierarchy.map(({ title, description }) => ({ title, description }));
  return (preview.serviceHighlights?.length ? preview.serviceHighlights : [displayTradeCategory(prospect.trade)])
    .map((title) => ({ title, description: `Request an estimate for ${title.toLowerCase()}.` }));
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
  const effectiveHero = images.heroCandidates.find((image) => isPublicPreviewImageRelevant(image, prospect.trade)) ?? images.hero;
  const all = [effectiveHero, ...images.services, ...images.gallery, images.beforeAfter, images.process, images.cta];
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
  const savedPreview = prospect.preview;
  const warnings: string[] = [];

  if (!savedPreview) {
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

  const compatibility = normalizePreviewForRender(prospect, savedPreview);
  if (!compatibility.ok) {
    return {
      verdict: "blocked",
      label: "BLOCKED",
      description: "Do not send. The saved preview could not be displayed safely.",
      primaryWarning: compatibility.message,
      nextAction: "Resolve Issue",
      freshness: previewFreshness(savedPreview),
      resolvedImageCount: 0,
      warnings: [compatibility.message],
    };
  }
  const preview = compatibility.preview;

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
  const effectiveHero = images.heroCandidates.find((image) => isPublicPreviewImageRelevant(image, prospect.trade)) ?? images.hero;
  if (effectiveHero.source === "curated-trade-library" || effectiveHero.source === "neutral-fallback") {
    warnings.push("Hero image did not resolve to photography.");
  }
  if (imageList.some((image) => image.source === "curated-trade-library")) {
    warnings.push("One or more public preview sections are using illustration fallback instead of photography.");
  }
  if (preview.serviceFidelity?.status === "failed") {
    warnings.push(`Service fidelity failed: ${preview.serviceFidelity.transformations.map((item) => item.stage).join(", ")}.`);
  }
  if (preview.visualAssetQa?.criticalFailures.length) warnings.push(...preview.visualAssetQa.criticalFailures);
  if (preview.visualAssetQa?.brokenImage) warnings.push("The rendered hero image is broken.");
  if (preview.visualAssetQa?.visuallyBlank) warnings.push("The rendered hero image is visually blank.");
  if (preview.visualAssetQa?.semanticRelevance === "rejected") warnings.push("The rendered hero image is semantically unrelated to the business.");

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
  if (preview.renderPlan?.pageMode !== "concise" && resolvedImageCount < 3) warnings.push("Too few trade-relevant photos resolved for the selected full-page direction.");

  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];
  const blockingWarning = uniqueWarnings.find((warning) =>
    /No prospect-safe public|could not be verified|Internal or placeholder|Unsupported factual|No preview exists|factual-safety|Service fidelity failed|rendered hero|critical|semantically unrelated/i.test(warning),
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
