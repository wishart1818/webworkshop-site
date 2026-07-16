import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
  assert.equal(prepared.preview.businessProfile?.officialWebsite.provenance, "verified provider source");
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
  assert.equal(inferred.businessProfile?.officialWebsite.provenance, "verified provider source");
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
