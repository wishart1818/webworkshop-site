import assert from "node:assert/strict";
import test from "node:test";
import {
  assessOpportunity,
  generateWebsiteBuildPrompt,
  likelyFranchise,
  normalizeWebsite,
  prepareTopProspectArtifacts,
  validateTopProspectInput,
} from "../lib/top-prospects";
import { seedProspects, withAnalysis } from "../lib/prospect-engine";
import { inactivePublicRecord } from "../lib/lead-discovery";
import { recoverableTopProspect } from "../lib/top-prospect-worker";

test("Top Prospects input applies bounded production-safe limits", () => {
  const valid = validateTopProspectInput({
    trade: "Roofing",
    city: "Findlay",
    state: "oh",
    radiusKm: 25,
    businessesToScan: 50,
    finalProspectsWanted: 10,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.value.state, "OH");

  assert.equal(validateTopProspectInput({ trade: "Roofing", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 101, finalProspectsWanted: 10 }).ok, false);
  assert.equal(validateTopProspectInput({ trade: "Roofing", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 10, finalProspectsWanted: 11 }).ok, false);
});

test("duplicate normalization and franchise screening are deterministic", () => {
  assert.equal(normalizeWebsite("https://www.example.com/services/"), normalizeWebsite("https://example.com/contact"));
  assert.equal(likelyFranchise({ businessName: "SERVPRO of Findlay", website: "https://example.com" }), true);
  assert.equal(likelyFranchise({ businessName: "North Main Roofing", website: "https://northmain.example" }), false);
});

test("public discovery rejects records explicitly marked inactive", () => {
  assert.equal(inactivePublicRecord({ craft: "roofer", opening_hours: "closed" }), true);
  assert.equal(inactivePublicRecord({ craft: "roofer", end_date: "2024" }), true);
  assert.equal(inactivePublicRecord({ craft: "roofer", opening_hours: "Mo-Fr 08:00-17:00" }), false);
});

test("Opportunity Score is separate from Website Score and favors usable sales fit", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.phone = "(419) 555-0100";
  prospect.email = "hello@example.com";
  prospect.analysis!.overallScore = 58;
  prospect.analysis!.scores.contactAccessibility = 35;
  prospect.analysis!.scores.trustSignals = 42;
  prospect.analysis!.scores.conversionReadiness = 38;

  const assessment = assessOpportunity(prospect);
  assert.ok(assessment.opportunityScore > prospect.analysis!.overallScore);
  assert.match(assessment.whyMayBuy, /active site/i);
  assert.match(assessment.pitchAngle, /redesign/i);
});

test("Top Prospect artifacts remain unapproved and include a detailed builder prompt", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[1]));
  const prepared = prepareTopProspectArtifacts(prospect);
  const prompt = generateWebsiteBuildPrompt(prepared.prospect, prepared.assessment);

  assert.equal(prepared.prospect.outreach?.approved, false);
  assert.equal(prepared.prospect.outreach?.subjects.length, 3);
  assert.equal(prepared.prospect.outreach?.followUps.length, 2);
  assert.ok(prepared.prospect.preview);
  assert.match(prompt, new RegExp(prospect.businessName));
  assert.match(prompt, /no invented claims/i);
});

test("interrupted Top Prospects artifacts can be recovered only by their active job", () => {
  const jobCreatedAt = new Date();
  const prospect = prepareTopProspectArtifacts(withAnalysis(structuredClone(seedProspects[0]))).prospect;
  prospect.createdAt = new Date(jobCreatedAt.getTime() + 1_000).toISOString();
  prospect.activities.unshift({
    id: "automated-analysis",
    type: "analysis",
    label: "Automated Top Prospects analysis completed with a score of 58.",
    at: prospect.createdAt,
  });

  assert.equal(recoverableTopProspect(prospect, jobCreatedAt), true);
  assert.equal(recoverableTopProspect(prospect, new Date(jobCreatedAt.getTime() + 2_000)), false);
  assert.equal(recoverableTopProspect({ ...prospect, preview: undefined }, jobCreatedAt), false);
});
