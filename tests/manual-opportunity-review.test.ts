import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { discoveryDiagnosticsFromJson, mergeDiscoveryCandidates, type DiscoveredLead, type UnresolvedTopProspectRecord } from "../lib/lead-discovery";
import { createProspect, type Prospect, type WebsiteFitDisposition } from "../lib/prospect-engine";
import {
  discoveryIdentityEvidenceSignal,
  discoverySameNameAmbiguitySignal,
} from "../lib/prospect-identity-evidence";
import {
  verifiedEmailEvidenceForProspect,
  websiteFitAllowsAutonomousOutreach,
} from "../lib/prospect-qualification";
import { mergeResolvedWebsiteEvidence, verifyProspectWebsiteWithSecondPass } from "../lib/prospect-verification-resolution";
import {
  existingProspectRequiresWebsiteResolution,
  verifiedExistingTopProspectCanBeReassessed,
} from "../lib/top-prospect-worker";
import {
  assessNoWebsiteOpportunity,
  assessManualTopProspectOpportunity,
  topProspectOutcomeCounts,
  topProspectRejectionReason,
  type OpportunityAssessment,
} from "../lib/top-prospects";

const now = "2026-08-11T14:00:00.000Z";

function prospect(input: Partial<Prospect> = {}) {
  const value = createProspect({
    businessName: "Neighborhood Pressure Washing",
    website: "",
    profileUrl: "",
    phone: "419-555-0142",
    email: "",
    address: "123 Main Street",
    city: "Toledo",
    state: "OH",
    trade: "Pressure Washing",
    serviceArea: "Toledo, OH",
    sizeIndicator: "Small",
    status: "New",
  });
  return Object.assign(value, input);
}

function markWebsiteState(value: Prospect, disposition: WebsiteFitDisposition, status: Prospect["websiteStatus"], ownershipDecision: "owned" | "not_owned" | "uncertain") {
  value.fitDisposition = disposition;
  value.websiteStatus = status;
  value.websiteVerification = {
    version: "website-verification-v2",
    status,
    confidence: "high",
    canonicalUrl: value.website,
    attempts: [],
    usableSignals: status === "usable" ? ["meaningful page title", "service content"] : [],
    explanation: "Bounded verification completed.",
    checkedAt: now,
    ownershipDecision,
    identityEvidence: ownershipDecision === "owned" ? ["The business identity matches the owned website."] : [],
    fit: {
      disposition,
      reason: "Current structured evidence produced this disposition.",
      supportingEvidence: ["Current structured evidence was retained."],
      confidence: disposition === "inconclusive_requires_review" ? "low" : "high",
      analysisOrigin: "automated_html",
      evaluatedAt: now,
    },
  };
  return value;
}

function manualLead(overrides: Partial<DiscoveredLead> = {}): DiscoveredLead {
  return {
    businessName: "Neighborhood Pressure Washing",
    website: "",
    profileUrl: "",
    prospectType: "no_website_social_only",
    classification: "phone_only",
    phone: "419-555-0142",
    email: "",
    contactFormUrl: "",
    address: "123 Main Street",
    city: "Toledo",
    state: "OH",
    trade: "Pressure Washing",
    serviceArea: "Toledo and nearby communities",
    sources: ["google"],
    sourceConfidence: 55,
    activitySignals: ["discovery_source:google"],
    providerIdentityEvidence: [],
    recommendedContactMethod: "needs_manual_contact_research",
    inactive: false,
    manualReviewOnly: true,
    manualOpportunityReason: "One public provider supplied a plausible local identity, but activity corroboration is incomplete.",
    strictRequirementFailed: "Independent activity and no-owned-website corroboration did not meet the autonomous standard.",
    ...overrides,
  };
}

function corroboratedNoSiteProspect() {
  const value = prospect({
    prospectType: "no_website_social_only",
    classification: "phone_only",
    recommendedContactMethod: "call_first",
    createdAt: now,
  });
  const identity = {
    businessName: value.businessName,
    website: "",
    phone: value.phone,
    address: value.address,
    city: value.city,
    state: value.state,
    latitude: 41.6528,
    longitude: -83.5379,
  };
  value.activitySignals = [
    discoveryIdentityEvidenceSignal({
      ...identity,
      source: "google",
      profileUrl: "https://maps.google.com/?cid=3545450935484072529",
    }),
    discoveryIdentityEvidenceSignal({
      ...identity,
      source: "bing",
      profileUrl: "",
    }),
  ];
  return value;
}

test("probable no-site candidate with insufficient autonomous activity is retained for manual review", () => {
  const result = mergeDiscoveryCandidates({
    candidates: [{
      source: "google",
      businessName: "Neighborhood Pressure Washing",
      phone: "419-555-0142",
      address: "123 Main Street, Toledo, OH",
      city: "Toledo",
      state: "OH",
    }],
    latitude: 41.65,
    longitude: -83.54,
    city: "Toledo",
    state: "OH",
    trade: "Pressure Washing",
    radiusKm: 50,
    limit: 20,
    prospectType: "no_website_social_only",
  });

  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0]?.manualReviewOnly, true);
  assert.equal(result.diagnostics.qualificationBreakdown?.noActivityEvidence, 1);
  assert.equal(result.diagnostics.qualificationBreakdown?.eligibleLeads, 0);
  assert.equal(result.diagnostics.qualificationBreakdown?.manualOpportunityCandidates, 1);

  const noIdentity = mergeDiscoveryCandidates({
    candidates: [{ source: "google", businessName: "Uncorroborated Exterior Care", city: "Toledo", state: "OH" }],
    latitude: 41.65,
    longitude: -83.54,
    city: "Toledo",
    state: "OH",
    trade: "Pressure Washing",
    radiusKm: 50,
    limit: 20,
    prospectType: "no_website_social_only",
  });
  assert.equal(noIdentity.leads.length, 0);
});

test("manual opportunities cannot displace strict candidates at the discovery limit", () => {
  const result = mergeDiscoveryCandidates({
    candidates: [
      { source: "google", businessName: "Maumee Pressure Washing", phone: "419-555-0142", address: "123 Main Street, Toledo, OH", city: "Toledo", state: "OH" },
      { source: "google", businessName: "Lake Erie Pressure Washing", website: "https://lake-erie-pressure-washing.example", phone: "419-555-0188", address: "456 Main Street, Toledo, OH", city: "Toledo", state: "OH" },
    ],
    latitude: 41.65,
    longitude: -83.54,
    city: "Toledo",
    state: "OH",
    trade: "Pressure Washing",
    radiusKm: 50,
    limit: 1,
    prospectType: "all",
  });

  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0]?.businessName, "Lake Erie Pressure Washing");
  assert.equal(result.leads[0]?.manualReviewOnly, undefined);
  assert.equal(result.diagnostics.qualificationBreakdown?.eligibleLeads, 1);
  assert.equal(result.diagnostics.qualificationBreakdown?.manualOpportunityCandidates, 1);
});

test("verified no-owned-website prospect leaves manual review and continues through normal qualification gates", () => {
  const value = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  const assessment = assessManualTopProspectOpportunity(value, manualLead());

  assert.equal(assessment, null);
  assert.equal(websiteFitAllowsAutonomousOutreach(value), true);
  assert.equal(topProspectRejectionReason(value, assessNoWebsiteOpportunity(value), "growth", "phone_allowed"), null);
  assert.equal(verifiedEmailEvidenceForProspect(value), null);
  assert.equal(value.outreach, undefined);
  assert.equal(value.preview, undefined);
});

test("uncorroborated and conflicting no-site prospects remain manual and package-free", () => {
  const uncorroborated = prospect({ prospectType: "no_website_social_only" });
  const conflicting = markWebsiteState(
    prospect({
      prospectType: "no_website_social_only",
      activitySignals: [discoverySameNameAmbiguitySignal()],
    }),
    "inconclusive_requires_review",
    "inconclusive",
    "uncertain",
  );

  for (const value of [uncorroborated, conflicting]) {
    assert.equal(websiteFitAllowsAutonomousOutreach(value), false);
    assert.equal(assessManualTopProspectOpportunity(value, manualLead())?.kind, "probable_no_owned_website");
    assert.equal(value.outreach, undefined);
    assert.equal(value.preview, undefined);
  }
});

test("second-pass authoritative no-site result is not returned to Manual Opportunity Review", async () => {
  const result = await verifyProspectWebsiteWithSecondPass(corroboratedNoSiteProspect(), {
    fetch: async () => {
      throw new Error("Authoritative two-provider no-site evidence should not need speculative recovery.");
    },
    now: () => new Date(now),
    googlePlacesApiKey: "google-test-key",
    azureMapsApiKey: "azure-test-key",
  });
  const verified = result.result.prospect;

  assert.equal(result.result.report.status, "no_owned_website");
  assert.equal(websiteFitAllowsAutonomousOutreach(verified), true);
  assert.equal(assessManualTopProspectOpportunity(verified, manualLead({ sources: ["bing", "google"] })), null);
  assert.equal(topProspectRejectionReason(verified, assessNoWebsiteOpportunity(verified), "growth", "phone_allowed"), "No usable contact path");
  verified.recommendedContactMethod = "call_first";
  assert.equal(topProspectRejectionReason(verified, assessNoWebsiteOpportunity(verified), "growth", "phone_allowed"), null);
  assert.equal(verified.outreach, undefined);
  assert.equal(verified.preview, undefined);
});

test("older verified no-site prospect without outreach can re-enter normal Top Prospect assessment", () => {
  const existing = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  existing.createdAt = "2026-08-01T12:00:00.000Z";
  existing.activities.unshift({
    id: "prior-top-prospect-review",
    type: "analysis",
    label: "Automated Top Prospects analysis completed in an earlier run.",
    at: "2026-08-10T12:00:00.000Z",
  });

  assert.equal(existing.outreach, undefined);
  assert.equal(websiteFitAllowsAutonomousOutreach(existing), true);
  assert.equal(verifiedExistingTopProspectCanBeReassessed(existing, new Date(now)), true);
  assert.equal(verifiedExistingTopProspectCanBeReassessed(existing, new Date(now), { excludePreviouslyReviewed: true }), false);
  assert.equal(topProspectRejectionReason(existing, assessNoWebsiteOpportunity(existing), "growth", "phone_allowed"), null);
});

test("verified-fit reassessment remains closed for contacted and suppressed prospects", () => {
  const contacted = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  contacted.status = "Contacted";
  const suppressed = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  suppressed.notes.push("Do not contact - operator suppression.");

  assert.equal(verifiedExistingTopProspectCanBeReassessed(contacted, new Date(now)), false);
  assert.equal(verifiedExistingTopProspectCanBeReassessed(suppressed, new Date(now)), false);
});

test("existing verified-fit reuse remains closed for stale, unresolved, and adequate-site records", () => {
  const stale = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  stale.websiteVerification!.checkedAt = "2026-08-01T12:00:00.000Z";
  stale.websiteVerification!.fit!.evaluatedAt = "2026-08-01T12:00:00.000Z";
  const unresolved = markWebsiteState(corroboratedNoSiteProspect(), "inconclusive_requires_review", "inconclusive", "uncertain");
  const adequate = markWebsiteState(
    prospect({ website: "https://adequate-pressure-washing.example", prospectType: "redesign" }),
    "adequate_existing_website",
    "usable",
    "owned",
  );

  for (const value of [stale, unresolved, adequate]) {
    assert.equal(verifiedExistingTopProspectCanBeReassessed(value, new Date(now)), false);
  }
  assert.equal(existingProspectRequiresWebsiteResolution(stale, new Date(now)), true);
  assert.equal(existingProspectRequiresWebsiteResolution(unresolved, new Date(now)), true);
  assert.equal(existingProspectRequiresWebsiteResolution(adequate, new Date(now)), false);
});

test("stale verified no-site evidence is refreshed before normal Top Prospect assessment", async () => {
  const checkedAt = new Date(now);
  const refreshAt = new Date(checkedAt.getTime() + 2 * 24 * 60 * 60 * 1_000);
  const existing = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  existing.createdAt = checkedAt.toISOString();

  assert.equal(existingProspectRequiresWebsiteResolution(existing, refreshAt), true);
  assert.equal(verifiedExistingTopProspectCanBeReassessed(existing, refreshAt), false);

  const resolution = await verifyProspectWebsiteWithSecondPass(existing, {
    fetch: async () => {
      throw new Error("Current structured no-site evidence should not require a speculative website request.");
    },
    forceNoSiteEvidenceRefresh: true,
    now: () => refreshAt,
  });
  const refreshed = mergeResolvedWebsiteEvidence(existing, resolution.result.prospect);

  assert.equal(resolution.result.report.status, "no_owned_website");
  assert.equal(refreshed.websiteVerification?.checkedAt, refreshAt.toISOString());
  assert.equal(existingProspectRequiresWebsiteResolution(refreshed, refreshAt), false);
  assert.equal(verifiedExistingTopProspectCanBeReassessed(refreshed, refreshAt), true);
  assert.equal(
    topProspectRejectionReason(refreshed, assessNoWebsiteOpportunity(refreshed), "growth", "written_only"),
    "Phone-only / written outreach blocked",
  );
  assert.equal(refreshed.outreach, undefined);
});

test("historical stale no-site evidence that cannot be refreshed becomes unresolved instead of reusable", async () => {
  const refreshAt = new Date(now);
  const existing = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  existing.createdAt = "2026-07-01T12:00:00.000Z";
  existing.websiteVerification!.checkedAt = "2026-07-01T12:00:00.000Z";
  existing.websiteVerification!.fit!.evaluatedAt = "2026-07-01T12:00:00.000Z";

  const resolution = await verifyProspectWebsiteWithSecondPass(existing, {
    allowHistoricalNoSiteLookup: true,
    forceNoSiteEvidenceRefresh: true,
    fetch: async () => {
      throw new Error("Two stored provider identities require no additional configured provider lookup.");
    },
    now: () => refreshAt,
  });
  const refreshed = mergeResolvedWebsiteEvidence(existing, resolution.result.prospect);

  assert.equal(resolution.outcome, "still_manual");
  assert.equal(refreshed.fitDisposition, "inconclusive_requires_review");
  assert.equal(websiteFitAllowsAutonomousOutreach(refreshed), false);
  assert.equal(verifiedExistingTopProspectCanBeReassessed(refreshed, refreshAt), false);
  assert.equal(refreshed.outreach, undefined);
});

test("stale no-site refresh excludes a newly verified adequate owned website", async () => {
  const refreshAt = new Date(now);
  const website = "https://neighborhood-pressure-washing.example/";
  const existing = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");
  existing.createdAt = "2026-07-01T12:00:00.000Z";
  existing.websiteVerification!.checkedAt = "2026-07-01T12:00:00.000Z";
  existing.websiteVerification!.fit!.evaluatedAt = "2026-07-01T12:00:00.000Z";
  const identity = {
    businessName: existing.businessName,
    phone: existing.phone,
    address: existing.address,
    city: existing.city,
    state: existing.state,
    latitude: 41.6528,
    longitude: -83.5379,
  };
  existing.activitySignals = [
    discoveryIdentityEvidenceSignal({
      ...identity,
      source: "google",
      website,
      profileUrl: "https://maps.google.com/?cid=3545450935484072529",
    }),
    discoveryIdentityEvidenceSignal({ ...identity, source: "bing", website: "", profileUrl: "" }),
  ];

  const resolution = await verifyProspectWebsiteWithSecondPass(existing, {
    allowHistoricalNoSiteLookup: true,
    forceNoSiteEvidenceRefresh: true,
    fetch: async (input) => {
      assert.equal(new URL(String(input)).hostname, "neighborhood-pressure-washing.example");
      return new Response(`<!doctype html><html><head><title>Neighborhood Pressure Washing | Toledo</title><meta name="viewport" content="width=device-width" /></head>
        <body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav><h1>Neighborhood Pressure Washing</h1>
        <p>Residential pressure washing, house washing, and concrete cleaning for Toledo homeowners.</p>
        <a href="tel:+14195550142">(419) 555-0142</a><form><button>Request an estimate</button></form>
        <img src="/project.jpg" alt="Completed pressure washing project" /></body></html>`, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    },
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    maxContactPages: 0,
    now: () => refreshAt,
  });
  const refreshed = mergeResolvedWebsiteEvidence(existing, resolution.result.prospect);

  assert.equal(resolution.result.report.status, "usable");
  assert.ok(["adequate_existing_website", "strong_existing_website"].includes(refreshed.fitDisposition));
  assert.equal(websiteFitAllowsAutonomousOutreach(refreshed), false);
  assert.equal(verifiedExistingTopProspectCanBeReassessed(refreshed, refreshAt), false);
  assert.equal(refreshed.outreach, undefined);
});

test("verified no-site prospect without written contact reaches the real downstream rejection", () => {
  const existing = markWebsiteState(corroboratedNoSiteProspect(), "no_owned_website", "no_owned_website", "not_owned");

  assert.equal(verifiedExistingTopProspectCanBeReassessed(existing, new Date(now)), true);
  assert.equal(
    topProspectRejectionReason(existing, assessNoWebsiteOpportunity(existing), "growth", "written_only"),
    "Phone-only / written outreach blocked",
  );
});

test("worker preserves current-result, contacted, suppressed, and review-setting guards before verified-fit reuse", () => {
  const workerSource = readFileSync(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
  const processLeadStart = workerSource.indexOf("async function processLead(");
  const currentResultGuard = workerSource.indexOf("if (existingResult) return", processLeadStart);
  const contactedGuard = workerSource.indexOf("if (contactedStatuses.has(existing.status))", currentResultGuard);
  const suppressionGuard = workerSource.indexOf("if (prospectIsSuppressed(existing))", contactedGuard);
  const reviewSettingGuard = workerSource.indexOf("if (excludePreviouslyReviewed && previouslyReviewed)", suppressionGuard);
  const verifiedReuse = workerSource.indexOf("verifiedExistingTopProspectCanBeReassessed(existing, jobCreatedAt, { excludePreviouslyReviewed })", reviewSettingGuard);
  const resultSave = workerSource.indexOf("saveTopProspectResult(jobId, existing", verifiedReuse);
  const duplicateSkip = workerSource.indexOf('addSkip(summary, "duplicate")', resultSave);

  assert.ok(processLeadStart >= 0);
  assert.ok(currentResultGuard > processLeadStart);
  assert.ok(contactedGuard > currentResultGuard);
  assert.ok(suppressionGuard > contactedGuard);
  assert.ok(reviewSettingGuard > suppressionGuard);
  assert.ok(verifiedReuse > reviewSettingGuard);
  assert.ok(resultSave > verifiedReuse);
  assert.ok(duplicateSkip > resultSave);
});

test("worker refreshes stale existing evidence and resolves every failure before duplicate fallback", () => {
  const workerSource = readFileSync(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
  const processLeadStart = workerSource.indexOf("async function processLead(");
  const refreshGate = workerSource.indexOf("if (existingProspectRequiresWebsiteResolution(existing, jobCreatedAt))", processLeadStart);
  const historicalLookup = workerSource.indexOf("allowHistoricalNoSiteLookup: existingProspectNeedsHistoricalNoSiteLookup(existing, jobCreatedAt)", refreshGate);
  const forcedRefresh = workerSource.indexOf("forceNoSiteEvidenceRefresh: staleNoSiteEvidence", historicalLookup);
  const verificationFailure = workerSource.indexOf('addUnresolvedSkip(summary, unresolved, "website_verification_failed")', forcedRefresh);
  const fitFailure = workerSource.indexOf('addUnresolvedSkip(summary, unresolved, "website_fit_requires_review")', verificationFailure);
  const refreshedResult = workerSource.indexOf("saveTopProspectResult(jobId, existing", fitFailure);
  const duplicateSkip = workerSource.indexOf('addSkip(summary, "duplicate")', refreshedResult);

  assert.ok(processLeadStart >= 0);
  assert.ok(refreshGate > processLeadStart);
  assert.ok(historicalLookup > refreshGate);
  assert.ok(forcedRefresh > historicalLookup);
  assert.ok(verificationFailure > forcedRefresh);
  assert.ok(fitFailure > verificationFailure);
  assert.ok(refreshedResult > fitFailure);
  assert.ok(duplicateSkip > refreshedResult);
});

test("worker diverts final manual opportunities before outreach artifact generation", () => {
  const workerSource = readFileSync(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
  const processLeadStart = workerSource.indexOf("async function processLead(");
  const manualGate = workerSource.indexOf("const manualOpportunity = assessManualTopProspectOpportunity(prospect, lead);", processLeadStart);
  const websiteFitGate = workerSource.indexOf("if (!websiteFitAllowsAutonomousOutreach(prospect))", manualGate);
  const artifactGeneration = workerSource.indexOf("const rejectionReason = await saveTopProspectResult(jobId, prospect", processLeadStart);

  assert.ok(processLeadStart >= 0);
  assert.ok(manualGate > processLeadStart);
  assert.ok(websiteFitGate > manualGate);
  assert.ok(artifactGeneration > websiteFitGate);
  assert.match(workerSource.slice(manualGate, artifactGeneration), /return \{ qualified: false, unresolved, .*websiteEnrichment/);
});

test("owned borderline website surfaces only when bounded analysis has a concrete inspection observation", () => {
  const value = markWebsiteState(prospect({ website: "https://neighborhood-exterior.example", prospectType: "redesign" }), "inconclusive_requires_review", "usable", "owned");
  value.analysis = {
    overallScore: 68,
    opportunityRating: "Medium",
    scores: {
      mobileExperience: 72,
      visualDesign: 70,
      ctaStrength: 42,
      trustSignals: 65,
      contactAccessibility: 44,
      portfolioQuality: 62,
      brandingQuality: 70,
      conversionReadiness: 48,
      technicalQuality: 78,
    },
    strengths: ["Technical quality is a relative strength at 78/100."],
    weaknesses: ["CTA strength is a conversion opportunity at 42/100."],
    summary: "The homepage returned successfully.",
    redesignDirection: "Inspect the estimate and contact path.",
    analyzedAt: now,
  };

  const assessment = assessManualTopProspectOpportunity(value, manualLead({ website: value.website, prospectType: "redesign", manualReviewOnly: false }));
  assert.equal(assessment?.kind, "existing_site_observation");
  assert.ok(assessment?.websiteObservations.some((item) => /contact|quote|estimate/i.test(item)));
  assert.equal(websiteFitAllowsAutonomousOutreach(value), false);
  assert.equal(topProspectRejectionReason(value, {
    opportunityScore: 90,
    salesScores: { websiteQualityScore: 68, revenueOpportunityScore: 70, contactabilityScore: 70, localMarketCompetitivenessScore: 70, aiReplacementConfidenceScore: 70, weightedSalesScore: 75 },
    presenceScores: null,
    mainWeakness: "Manual inspection is required.",
    whyMayBuy: "Manual review only.",
    pitchAngle: "Manual review only.",
  }, "volume", "phone_allowed"), "Website verification required");
});

test("strong website and protected records do not enter manual opportunity review", () => {
  const strong = markWebsiteState(prospect({ website: "https://strong-local.example", prospectType: "redesign" }), "strong_existing_website", "usable", "owned");
  strong.analysis = {
    overallScore: 94,
    opportunityRating: "Low",
    scores: { mobileExperience: 95, visualDesign: 94, ctaStrength: 92, trustSignals: 90, contactAccessibility: 96, portfolioQuality: 91, brandingQuality: 94, conversionReadiness: 93, technicalQuality: 96 },
    strengths: [], weaknesses: [], summary: "Complete site.", redesignDirection: "None.", analyzedAt: now,
  };
  assert.equal(assessManualTopProspectOpportunity(strong, manualLead({ website: strong.website, prospectType: "redesign" })), null);

  const suppressed = prospect({ notes: ["Do not contact - operator suppression."], prospectType: "no_website_social_only" });
  const contacted = prospect({ status: "Contacted", prospectType: "no_website_social_only" });
  assert.equal(assessManualTopProspectOpportunity(suppressed, manualLead()), null);
  assert.equal(assessManualTopProspectOpportunity(contacted, manualLead()), null);
});

test("confirmed broken website keeps strict qualification behavior", () => {
  const broken = markWebsiteState(prospect({ website: "https://broken-local.example", prospectType: "redesign" }), "broken_or_inactive_website", "confirmed_broken", "owned");
  const opportunity: OpportunityAssessment = {
    opportunityScore: 80,
    salesScores: { websiteQualityScore: 10, revenueOpportunityScore: 80, contactabilityScore: 60, localMarketCompetitivenessScore: 70, aiReplacementConfidenceScore: 90, weightedSalesScore: 78 },
    presenceScores: null,
    mainWeakness: "The owned site is confirmed broken.",
    whyMayBuy: "The business needs a working site.",
    pitchAngle: "Restore a reliable web presence.",
  };

  assert.equal(websiteFitAllowsAutonomousOutreach(broken), true);
  assert.equal(assessManualTopProspectOpportunity(broken, manualLead({ website: broken.website, prospectType: "redesign" })), null);
  assert.equal(topProspectRejectionReason(broken, opportunity, "volume", "phone_allowed"), null);
});

test("Top Prospects outcome counts keep strict, manual, skipped, and previous records separate", () => {
  const manualRecord = { prospectId: "manual-1", reviewBucket: "manual_opportunity" } as UnresolvedTopProspectRecord;
  const counts = topProspectOutcomeCounts({
    results: [{} as never, {} as never],
    manualOpportunityProspects: [manualRecord],
    skipSummary: { previously_reviewed: 3, manual_opportunity: 1, confirmed_usable_website_not_fit: 4 },
    skippedCount: 9,
  });

  assert.deepEqual(counts, { strictlyQualified: 2, manualReview: 1, previouslyReviewed: 3, skipped: 5 });
});

test("saved discovery diagnostics preserve the separate manual opportunity bucket", () => {
  const record: UnresolvedTopProspectRecord = {
    prospectId: "manual-1",
    businessName: "Neighborhood Pressure Washing",
    trade: "Pressure Washing",
    city: "Toledo",
    state: "OH",
    providerSources: ["google"],
    websiteCandidate: "",
    websiteVerificationState: "inconclusive",
    websiteFitState: "inconclusive_requires_review",
    unresolvedReasonCode: "LIKELY_NO_SITE_EVIDENCE_INCOMPLETE",
    evidenceSummary: "One provider supplied a plausible local business identity.",
    persistedAsProspect: true,
    preventedQualification: "Independent no-site corroboration is incomplete.",
    recommendedNextAction: "Inspect manually. Nothing was sent.",
    reviewBucket: "manual_opportunity",
    manualOpportunityKind: "probable_no_owned_website",
    websiteObservations: [],
  };
  const diagnostics = discoveryDiagnosticsFromJson({
    leads: [],
    diagnostics: {
      rawProviderCount: 1,
      afterDistanceFilteringCount: 1,
      afterDuplicateFilteringCount: 1,
      afterQualificationFilteringCount: 1,
      returnedCount: 1,
      radiusKm: 50,
      categorySignals: [],
      sourceCounts: { osm: 0, google: 1, bing: 0, yelp: 0, yellowPages: 0 },
      providerDiagnostics: {},
      finalMergedCount: 1,
      unresolvedRecords: [record],
    },
  });

  assert.equal(diagnostics?.unresolvedRecords?.[0]?.reviewBucket, "manual_opportunity");
  assert.equal(diagnostics?.unresolvedRecords?.[0]?.manualOpportunityKind, "probable_no_owned_website");
});
