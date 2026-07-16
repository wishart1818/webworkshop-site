import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPreviewRenderPlan,
  generatePreview,
  previewRenderPlan,
  seedProspects,
  withAnalysis,
  type PreviewConcept,
  type Prospect,
} from "../lib/prospect-engine";
import { officialWebsiteMatchesProspect, type PreviewResearchOutcome } from "../lib/preview-business-research";
import { prepareProspectForPreview } from "../lib/preview-preparation";
import { prepareTopProspectArtifactsWithResearch } from "../lib/top-prospect-preview-preparation";
import { validateProspect } from "../lib/prospect-validation";
import { evaluateServiceFidelity } from "../lib/preview-fidelity";
import { evaluatePreviewSendWorthiness } from "../lib/preview-send-worthiness";
import { classifyRenderedImageEvidence } from "../components/engine/TradePreviewImage";
import { assessSemanticImage } from "../lib/preview-image-resolver";
import { ProspectWebsitePreview } from "../components/engine/ProspectWebsitePreview";

function groundedProspect(overrides: Partial<Prospect> & Record<string, unknown>): Prospect {
  return {
    ...structuredClone(seedProspects[0]),
    website: "https://example.com",
    phone: "(419) 555-0142",
    email: "hello@example.com",
    previewResearchVerified: true,
    previewResearchStatus: "succeeded",
    previewResearchNote: "Official website research completed.",
    previewResearchFacts: [
      { label: "Official website research", value: "https://example.com", source: "official website", confidence: "verified", provenance: "verified official source" },
    ],
    ...overrides,
  } as Prospect;
}

function photo(src: string, service: string) {
  return { src, alt: `${service} project`, service };
}

test("all production preview entry points use the authoritative research-aware pipeline", () => {
  const worker = readFileSync("lib/top-prospect-worker.ts", "utf8");
  const repository = readFileSync("lib/top-prospect-repository.ts", "utf8");
  const autonomous = readFileSync("lib/autonomous-growth-repository.ts", "utf8");
  const regeneration = readFileSync("app/api/engine/outreach-sync/route.ts", "utf8");
  const commands = readFileSync("lib/operator-command-center.ts", "utf8");

  assert.match(worker, /await prepareTopProspectArtifactsWithResearch\(/);
  assert.match(repository, /await prepareTopProspectArtifactsWithResearch\(/);
  assert.match(autonomous, /await prepareTopProspectArtifactsWithResearch\(/);
  assert.match(autonomous, /await prepareProspectForPreview\(prospect\)/);
  assert.match(regeneration, /await prepareProspectForPreview\(prospect, \{ mode: "regenerate"/);
  assert.match(commands, /await prepareProspectForPreview\(prospect, \{ mode: "regenerate"/);
});

test("bounded research timeout keeps provider facts, records lower confidence, and sends nothing", async () => {
  const existingOutreach = { subjects: ["Existing"], concise: "Draft", detailed: "Draft", followUps: [], approved: false, generatedAt: new Date().toISOString(), outreachCopyVersion: "test", outreachCopyGeneratedAt: new Date().toISOString() };
  const prospect = { ...structuredClone(seedProspects[0]), website: "https://slow.example", outreach: existingOutreach };
  const prepared = await prepareProspectForPreview(prospect, {
    researchTimeoutMs: 50,
    researcher: async () => new Promise<PreviewResearchOutcome>(() => undefined),
  });

  assert.equal(prepared.researchStatus, "timed_out");
  assert.equal(prepared.preview.businessProfile?.researchStatus, "timed_out");
  assert.equal(prepared.preview.businessProfile?.officialWebsite.provenance, "unverified provider source");
  assert.equal(prepared.preview.businessProfile?.officialWebsite.confidence, "inferred");
  assert.deepEqual(prepared.prospect.outreach, existingOutreach);
  assert.equal(prepared.preview.renderPlan?.version, "render-plan-v1");
});

test("initial package preparation consumes successful research before generating its saved plan", async () => {
  const source = withAnalysis(structuredClone(seedProspects[2]));
  const researched = groundedProspect({
    ...source,
    businessName: "Evergreen Outdoor Works",
    trade: "Landscaping",
    city: "Dublin",
    state: "OH",
    verifiedPreviewServices: ["Landscape Design", "Planting", "Seasonal Maintenance"],
    approvedPreviewPhotos: [
      photo("https://example.com/landscape-design.jpg", "Landscape Design"),
      photo("https://example.com/planting.jpg", "Planting"),
      photo("https://example.com/lawn-care.jpg", "Seasonal Maintenance"),
      photo("https://example.com/patio.jpg", "Landscape Design"),
    ],
  });
  const artifacts = await prepareTopProspectArtifactsWithResearch(
    source,
    "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
    "written_only",
    { researcher: async () => ({ prospect: researched, status: "succeeded", note: "Official website research completed." }) },
  );

  assert.equal(artifacts.previewPreparation.researchStatus, "succeeded");
  assert.equal(artifacts.prospect.preview?.businessProfile?.researchStatus, "succeeded");
  assert.equal(artifacts.prospect.preview?.renderPlan?.direction, "project-showcase");
  assert.equal(artifacts.prospect.outreach?.approved, false);
  assert.equal(source.preview, undefined);
});

test("official source identity is reconciled before research is treated as verified", () => {
  const prospect = groundedProspect({ businessName: "True Clean Prowash", trade: "Pressure Washing" });
  assert.equal(officialWebsiteMatchesProspect(prospect, "<title>True Clean Prowash | Columbus exterior cleaning</title>", "https://truecleanprowash.com"), true);
  assert.equal(officialWebsiteMatchesProspect(prospect, "<title>Luxury Sauna Products and Parts</title>", "https://sauna-supply.example"), false);
});

test("verified facts remain distinct from inferred branding and contradictory review data", () => {
  const inferred = generatePreview({ ...structuredClone(seedProspects[0]), website: "https://blue-line.example", businessName: "Blue Line Roofing", rating: 4.9, reviewCount: 0 });
  assert.equal(inferred.businessProfile?.officialWebsite.confidence, "inferred");
  assert.equal(inferred.businessProfile?.officialWebsite.provenance, "unverified provider source");
  assert.equal(inferred.businessProfile?.logo.status, "wordmark_fallback");
  assert.equal(inferred.businessProfile?.logo.provenance, "trade fallback");
  assert.ok(inferred.businessProfile?.detectedBrandColors.every((fact) => fact.confidence === "inferred"));
  assert.ok(inferred.businessProfile?.detectedBrandColors.every((fact) => fact.provenance === "inferred creative direction"));
  assert.equal(inferred.businessProfile?.realDifferentiators.some((fact) => fact.label === "Public rating"), false);
  assert.equal(inferred.trustItems?.some((item) => /rating|review/i.test(item)), false);

  const official = generatePreview(groundedProspect({
    businessName: "True Clean Prowash",
    trade: "Pressure Washing",
    websiteLogoUrl: "https://example.com/logo.png",
    previewBrandColors: ["#123456", "#f0a020"],
    verifiedPreviewServices: ["House Washing", "Concrete Cleaning"],
  }));
  assert.equal(official.businessProfile?.logo.provenance, "verified official source");
  assert.equal(official.businessProfile?.detectedBrandColors[0]?.provenance, "verified official source");
});

test("generation saves one coherent factual snapshot with material provenance", async () => {
  const researchedAt = "2026-07-16T12:00:00.000Z";
  const prospect = groundedProspect({
    businessName: "Harbor Exterior Care",
    trade: "Pressure Washing",
    rating: 4.9,
    reviewCount: 87,
    websiteLogoUrl: "https://example.com/harbor-logo.png",
    previewBrandColors: ["#123456", "#e7a51a"],
    verifiedPreviewServices: ["House Washing", "Concrete Cleaning"],
    previewResearchFacts: [
      { label: "Official website research", value: "https://example.com", source: "official website", confidence: "verified", provenance: "verified official source", factType: "website", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified", researchedAt },
      { label: "Official logo", value: "https://example.com/harbor-logo.png", source: "official website", confidence: "verified", provenance: "verified official source", factType: "logo", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified", researchedAt },
      { label: "Review rating", value: "4.9", source: "official website structured data", confidence: "verified", provenance: "verified official source", factType: "review_rating", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified", researchedAt },
      { label: "Review count", value: "87", source: "official website structured data", confidence: "verified", provenance: "verified official source", factType: "review_count", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified", researchedAt },
      { label: "Free estimates", value: "Free estimates", source: "official website", confidence: "verified", provenance: "verified official source", factType: "differentiator", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified", researchedAt },
    ],
  });
  const prepared = await prepareProspectForPreview(prospect, { researcher: async (value) => ({ prospect: value, status: "succeeded", note: "Fixture research complete." }) });
  const snapshot = prepared.preview.packageSnapshot;
  assert.equal(snapshot?.version, "business-package-v1");
  assert.equal(snapshot?.factualStatus, "coherent");
  assert.equal(new Set(Object.values(snapshot?.componentGenerationIds ?? {})).size, 1);
  assert.equal(prepared.preview.businessProfile?.snapshotId, snapshot?.generationId);
  assert.ok(prepared.preview.businessProfile?.sourceFacts.every((fact) => fact.factType && fact.sourceType && fact.verificationStatus && fact.researchedAt));
  assert.equal(prepared.preview.businessProfile?.logo.fact?.value, "https://example.com/harbor-logo.png");
  assert.equal(prepared.preview.businessProfile?.reviewProof?.publicStatement, "Rated 4.9 based on 87 public reviews.");
  assert.equal(prepared.preview.businessProfile?.realDifferentiators[0]?.sourceLocation, "https://example.com");
  const html = renderToStaticMarkup(React.createElement(ProspectWebsitePreview, { prospect: prepared.prospect, savedPreview: prepared.preview, publicView: true }));
  assert.match(html, /Rated 4\.9 based on 87 public reviews\./);
  assert.doesNotMatch(html, /rating recorded|reviews recorded/i);
});

test("material review conflicts are preserved, omitted publicly, and block send-worthiness", () => {
  const prospect = groundedProspect({
    businessName: "Conflicted Roofing",
    trade: "Roofing",
    rating: 4.9,
    reviewCount: 100,
    previewResearchFacts: [
      { label: "Official website research", value: "https://example.com", source: "official website", confidence: "verified", provenance: "verified official source" },
      { label: "Review rating", value: "4.6", source: "official website structured data", confidence: "verified", provenance: "verified official source", factType: "review_rating", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified" },
      { label: "Review count", value: "72", source: "official website structured data", confidence: "verified", provenance: "verified official source", factType: "review_count", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified" },
    ],
  });
  const preview = generatePreview(prospect);
  assert.equal(preview.businessProfile?.reviewProof?.status, "conflicted");
  assert.ok(preview.businessProfile?.sourceFacts.filter((fact) => fact.factType === "review_rating" || fact.factType === "review_count").every((fact) => fact.verificationStatus === "disputed"));
  assert.equal(preview.businessProfile?.reviewProof?.publicStatement, undefined);
  assert.equal(preview.packageSnapshot?.factualStatus, "blocked");
  assert.equal(preview.trustItems?.some((item) => /rating|reviews?/i.test(item)), false);
  const result = evaluatePreviewSendWorthiness({ ...prospect, preview }, { publicPreviewUrl: "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", publicPreviewVerified: true });
  assert.equal(result.verdict, "blocked");
  assert.match(result.warnings.join(" "), /review/i);
});

test("conflicting verified contact information is preserved internally and withheld publicly", () => {
  const prospect = groundedProspect({
    phone: "419-555-0101",
    previewResearchFacts: [
      { label: "Official website research", value: "https://example.com", source: "official website", confidence: "verified", provenance: "verified official source" },
      { label: "Official phone", value: "419-555-9999", source: "official website", confidence: "verified", provenance: "verified official source", factType: "phone", sourceType: "official_website", sourceLocation: "https://example.com/contact", verificationStatus: "verified" },
    ],
  });
  const preview = generatePreview(prospect);
  assert.equal(preview.businessProfile?.verifiedPhone.verificationStatus, "disputed");
  assert.equal(preview.businessProfile?.materialConflicts?.some((fact) => fact.factType === "phone"), true);
  assert.equal(preview.packageSnapshot?.factualStatus, "blocked");
  const html = renderToStaticMarkup(React.createElement(ProspectWebsitePreview, { prospect: { ...prospect, preview }, savedPreview: preview, publicView: true }));
  assert.doesNotMatch(html, /419-555-0101|419-555-9999/);
});

test("verified logo loss blocks while missing logos remain honest wordmark fallbacks", () => {
  const officialProspect = groundedProspect({
    websiteLogoUrl: "https://example.com/official-logo.png",
    previewResearchFacts: [
      { label: "Official website research", value: "https://example.com", source: "official website", confidence: "verified", provenance: "verified official source" },
      { label: "Official logo", value: "https://example.com/official-logo.png", source: "official website", confidence: "verified", provenance: "verified official source", factType: "logo", sourceType: "official_website", sourceLocation: "https://example.com", verificationStatus: "verified" },
    ],
  });
  const official = generatePreview(officialProspect);
  const lostLogo = { ...official, businessProfile: { ...official.businessProfile!, logo: { ...official.businessProfile!.logo, status: "wordmark_fallback" as const, url: "", source: "wordmark fallback" as const } } };
  const verdict = evaluatePreviewSendWorthiness({ ...officialProspect, preview: lostLogo }, { publicPreviewUrl: "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", publicPreviewVerified: true });
  assert.equal(verdict.verdict, "blocked");
  assert.match(verdict.warnings.join(" "), /official logo/i);

  const fallback = generatePreview(groundedProspect({ websiteLogoUrl: "", previewResearchFacts: [] }));
  assert.equal(fallback.businessProfile?.logo.status, "wordmark_fallback");
  assert.equal(fallback.businessProfile?.logo.fact?.verificationStatus, "unavailable");
  assert.equal(fallback.businessProfile?.logo.provenance, "trade fallback");
});

test("public and internal preview rendering consume saved packages without generation or mutation", () => {
  const prospect = groundedProspect({ verifiedPreviewServices: ["Roof Repair", "Roof Replacement"] });
  const preview = generatePreview(prospect);
  const before = JSON.stringify(preview);
  const publicHtml = renderToStaticMarkup(React.createElement(ProspectWebsitePreview, { prospect: { ...prospect, preview }, savedPreview: preview, publicView: true }));
  const internalHtml = renderToStaticMarkup(React.createElement(ProspectWebsitePreview, { prospect: { ...prospect, preview }, savedPreview: preview, publicView: false }));
  assert.match(publicHtml, /Roof Repair/);
  assert.match(internalHtml, /Roof Replacement/);
  assert.equal(JSON.stringify(preview), before);
  const rendererSource = readFileSync("components/engine/ProspectWebsitePreview.tsx", "utf8");
  const detailSource = readFileSync("components/engine/ProspectDetail.tsx", "utf8");
  assert.doesNotMatch(rendererSource, /\bgeneratePreview\(/);
  assert.doesNotMatch(detailSource, /\bgeneratePreview\(/);
  assert.doesNotMatch(`${rendererSource}\n${detailSource}`, /prepareProspectForPreview|researchProspectForPreview/);
});

test("render-plan selection is deterministic and responds to business content", () => {
  const projectProspect = groundedProspect({
    businessName: "True Clean Prowash",
    trade: "Pressure Washing",
    verifiedPreviewServices: ["House Washing", "Concrete Cleaning", "Soft Washing"],
    approvedPreviewPhotos: [
      photo("https://example.com/house-washing.jpg", "House Washing"),
      photo("https://example.com/concrete-cleaning.jpg", "Concrete Cleaning"),
      photo("https://example.com/soft-washing.jpg", "Soft Washing"),
      photo("https://example.com/crew.jpg", "Pressure Washing"),
      photo("https://example.com/exterior-result.jpg", "House Washing"),
    ],
  });
  const first = generatePreview(projectProspect);
  const second = generatePreview(structuredClone(projectProspect));
  assert.deepEqual(first.renderPlan, second.renderPlan);
  assert.equal(first.renderPlan?.direction, "project-showcase");
  assert.match(first.renderPlan?.selectionRationale ?? "", /distinct usable images|visual service story/i);
  assert.ok(["image-led-services", "alternating-service-spotlights"].includes(first.renderPlan?.servicePresentation ?? ""));

  const servicePreview = generatePreview(groundedProspect({
    businessName: "Reliable Comfort HVAC",
    trade: "HVAC",
    verifiedPreviewServices: ["Heating Repair", "Cooling Repair", "System Installation", "Maintenance"],
  }));
  assert.equal(servicePreview.renderPlan?.direction, "service-command");
  assert.equal(servicePreview.renderPlan?.servicePresentation, "balanced-grid");
  assert.match(servicePreview.renderPlan?.selectionRationale ?? "", /usable contact path|fast service navigation/i);

  const sparsePreview = generatePreview(groundedProspect({
    businessName: "Findlay Property Services",
    trade: "General Contractor",
    verifiedPreviewServices: ["General Contracting"],
    rating: 4.8,
    reviewCount: 14,
  }));
  const sparseImages = sparsePreview.resolvedImages!;
  const lowImagePreview: PreviewConcept = {
    ...sparsePreview,
    resolvedImages: {
      ...sparseImages,
      hero: { ...sparseImages.hero, source: "neutral-fallback" },
      services: sparseImages.services.map((image) => ({ ...image, source: "neutral-fallback" })) as typeof sparseImages.services,
      gallery: sparseImages.gallery.map((image) => ({ ...image, source: "neutral-fallback" })) as typeof sparseImages.gallery,
      beforeAfter: { ...sparseImages.beforeAfter, source: "neutral-fallback" },
      process: { ...sparseImages.process, source: "neutral-fallback" },
      cta: { ...sparseImages.cta, source: "neutral-fallback" },
    },
  };
  const trustPlan = buildPreviewRenderPlan({ ...groundedProspect({ businessName: "Findlay Property Services", trade: "General Contractor", rating: 4.8, reviewCount: 14 }), preview: lowImagePreview }, lowImagePreview);
  assert.equal(trustPlan.direction, "trust-led-local");
  assert.equal(trustPlan.imageStrategy, "restrained-imagery");
  assert.equal(trustPlan.sectionDecisions.find((section) => section.id === "gallery")?.status, "omitted");
  assert.equal(trustPlan.sectionDecisions.find((section) => section.id === "featured-service")?.status, "omitted");
});

test("legacy previews derive a non-mutating compatibility plan and blocked regeneration preserves the prior preview", async () => {
  const prospect = structuredClone(seedProspects[0]);
  const generated = generatePreview(prospect);
  const legacy = { ...generated, renderPlan: undefined };
  const legacyProspect = { ...prospect, preview: legacy };
  const plan = previewRenderPlan(legacyProspect, legacy);
  assert.equal(plan.version, "render-plan-v1");
  assert.match(plan.selectionRationale, /Legacy preview compatibility/);
  assert.equal(legacy.renderPlan, undefined);

  const contacted = { ...legacyProspect, status: "Contacted" as const };
  await assert.rejects(() => prepareProspectForPreview(contacted, {
    mode: "regenerate",
    researcher: async (value) => ({ prospect: value, status: "failed", note: "Research unavailable." }),
  }), /regeneration blocked/i);
  assert.deepEqual(contacted.preview, legacy);
});

test("researched service hierarchy survives validation, preparation, persistence, and rendering inputs", async () => {
  const source = groundedProspect({
    businessName: "Clear View Exterior Care",
    trade: "Pressure Washing",
    verifiedPreviewServices: ["House Washing", "Concrete Cleaning", "Gutter Cleaning"],
    providerPreviewServices: ["Window Cleaning"],
    approvedPreviewPhotos: [
      photo("https://example.com/house-washing.jpg", "House Washing"),
      photo("https://example.com/concrete-cleaning.jpg", "Concrete Cleaning"),
      photo("https://example.com/gutter-cleaning.jpg", "Gutter Cleaning"),
    ],
  });
  const validated = validateProspect(source);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.deepEqual(validated.value.verifiedPreviewServices, ["House Washing", "Concrete Cleaning", "Gutter Cleaning"]);
  assert.deepEqual(validated.value.providerPreviewServices, ["Window Cleaning"]);

  const prepared = await prepareProspectForPreview(validated.value, {
    researcher: async (prospect) => ({ prospect, status: "succeeded", note: "Research retained." }),
  });
  const expected = ["House Washing", "Concrete Cleaning", "Gutter Cleaning", "Window Cleaning"];
  assert.deepEqual(prepared.preview.serviceHierarchy?.map((service) => service.title), expected);
  assert.deepEqual(prepared.preview.businessProfile?.verifiedServices, expected);
  assert.deepEqual(prepared.preview.creativeBrief?.services, expected);
  assert.equal(prepared.preview.serviceFidelity?.status, "passed");
  assert.deepEqual(prepared.prospect.preview?.serviceHierarchy?.map((service) => service.title), expected);
});

test("service-fidelity loss records the stage and blocks send-worthiness", () => {
  const prospect = groundedProspect({
    verifiedPreviewServices: ["Roof Repair", "Roof Replacement"],
    trade: "Roofing",
  });
  const preview = generatePreview(prospect);
  const hierarchy = preview.serviceHierarchy ?? [];
  const fidelity = evaluateServiceFidelity(prospect, hierarchy, [{
    stage: "renderer",
    values: ["Roof Repair"],
    rule: "Test fixture simulates an accidental renderer collapse.",
  }]);
  assert.equal(fidelity.status, "failed");
  assert.deepEqual(fidelity.transformations[0]?.before, ["Roof Repair", "Roof Replacement"]);
  assert.deepEqual(fidelity.transformations[0]?.after, ["Roof Repair"]);
  assert.equal(fidelity.transformations[0]?.stage, "renderer");
  const verdict = evaluatePreviewSendWorthiness({ ...prospect, preview: { ...preview, serviceFidelity: fidelity } }, {
    publicPreviewUrl: "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
    publicPreviewVerified: true,
  });
  assert.equal(verdict.verdict, "blocked");
  assert.match(verdict.primaryWarning, /Service fidelity failed/i);
});

test("one and two grounded services stay unpadded and select intentional density", () => {
  const single = generatePreview(groundedProspect({ trade: "Plumbing", verifiedPreviewServices: ["Drain Repair"], approvedPreviewPhotos: [] }));
  const dual = generatePreview(groundedProspect({ trade: "Painting", verifiedPreviewServices: ["Interior Painting", "Exterior Painting"], approvedPreviewPhotos: [] }));
  assert.deepEqual(single.serviceHierarchy?.map((service) => service.title), ["Drain Repair"]);
  assert.deepEqual(dual.serviceHierarchy?.map((service) => service.title), ["Interior Painting", "Exterior Painting"]);
  assert.equal(single.serviceHierarchy?.some((service) => /service planning|estimate request/i.test(service.title)), false);
  assert.equal(dual.serviceHierarchy?.some((service) => /service planning|estimate request/i.test(service.title)), false);
});

test("rendered hero evidence combines load, crop, and pixel signals", () => {
  const base = { loaded: true, naturalWidth: 1800, naturalHeight: 1200, renderedWidth: 720, renderedHeight: 520 };
  assert.equal(classifyRenderedImageEvidence({ ...base, naturalWidth: 0 }), "unavailable");
  assert.equal(classifyRenderedImageEvidence({ ...base, luminanceVariance: 12, edgeDensity: 0.01, dominantColorConcentration: 0.9 }), "unavailable");
  assert.equal(classifyRenderedImageEvidence({ ...base, naturalWidth: 4200, naturalHeight: 500 }), "unavailable");
  assert.equal(classifyRenderedImageEvidence({ ...base, luminanceVariance: 60, edgeDensity: 0.02, dominantColorConcentration: 0.4 }), "uncertain");
  assert.equal(classifyRenderedImageEvidence({ ...base, luminanceVariance: 900, edgeDensity: 0.14, dominantColorConcentration: 0.18 }), "accepted");
});

test("representative visual-review failures cannot return to critical trade placements", () => {
  const cases = [
    ["Electrical", "https://images.unsplash.com/photo-1518770660439-4636190af475", ["circuit", "wiring", "technical detail"]],
    ["HVAC", "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158", ["technician", "service call", "equipment"]],
    ["Concrete", "https://images.unsplash.com/photo-1599995903128-531fc7fb694b", ["concrete", "walkway", "patio"]],
    ["Concrete", "https://images.unsplash.com/photo-1600585154340-be6161a56a0c", ["house", "driveway", "residential exterior"]],
    ["Painting", "https://images.unsplash.com/photo-1589939705384-5185137a7f0f", ["paint", "construction site"]],
    ["Roofing", "https://images.unsplash.com/photo-1621947081720-86970823b77a", ["roof", "interior scaffolding"]],
  ] as const;

  for (const [trade, src, keywords] of cases) {
    const result = assessSemanticImage(trade, {
      id: `${trade}-hero`,
      slot: "hero",
      section: "hero",
      purpose: `${trade} hero`,
      query: `${trade} residential service`,
      keywords: [...keywords],
    }, src, "curated-stock-photo-library", {
      keywords: [...keywords],
      context: "residential",
      kind: "photo",
      attribution: "curated test asset",
    });
    assert.equal(result.semanticStatus, "rejected", `${trade} reviewed asset should stay rejected`);
  }
});

test("runtime image failure produces an intentional low-image composition without public placeholders", () => {
  const css = readFileSync("app/engine/engine.css", "utf8");
  assert.match(css, /prospect-preview-hero:has\(\.prospect-preview-image\[data-preview-image-state="unavailable"\]\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 760px\)/);
  assert.match(css, /prospect-preview-image\[data-preview-image-state="unavailable"\][^{]*\{[^}]*display:\s*none/s);
});
