import assert from "node:assert/strict";
import test from "node:test";
import { handleTopProspectList, topProspectBuildVersion } from "../lib/top-prospect-list-route";
import {
  assessOpportunity,
  generateWebsiteBuildPrompt,
  likelyFranchise,
  likelyNationalOrLargeBrand,
  normalizeWebsite,
  prepareTopProspectArtifacts,
  topProspectRejectionReason,
  topProspectResultDisposition,
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
  assert.equal(likelyNationalOrLargeBrand({ businessName: "Erie Home", website: "https://eriehome.com" }), true);
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

test("Toledo roofing ranking excludes strong websites and national brands", () => {
  const husky = withAnalysis(structuredClone(seedProspects[0]));
  husky.businessName = "Husky Roofing";
  husky.website = "https://husky-roofing.example";
  husky.analysis!.overallScore = 62;
  husky.analysis!.scores.contactAccessibility = 42;
  husky.analysis!.scores.trustSignals = 44;
  husky.analysis!.scores.conversionReadiness = 42;
  const huskyAssessment = assessOpportunity(husky);

  const strong = withAnalysis(structuredClone(seedProspects[0]));
  strong.businessName = "Shingle And Metal Roofs";
  strong.website = "https://shingle-and-metal.example";
  strong.analysis!.overallScore = 97;
  const strongAssessment = assessOpportunity(strong);

  const national = withAnalysis(structuredClone(seedProspects[0]));
  national.businessName = "Erie Home";
  national.website = "https://eriehome.com";
  national.analysis!.overallScore = 93;
  const nationalAssessment = assessOpportunity(national);

  assert.ok(huskyAssessment.opportunityScore >= 60);
  assert.equal(topProspectRejectionReason(husky, huskyAssessment), null);
  assert.equal(topProspectRejectionReason(strong, strongAssessment), "Already strong website");
  assert.equal(topProspectRejectionReason(national, nationalAssessment), "National/large brand");
});

test("Top Prospects recommendation gate explains every sales-fit rejection", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.analysis!.overallScore = 80;
  assert.equal(
    topProspectRejectionReason(prospect, { opportunityScore: 70, mainWeakness: "", whyMayBuy: "", pitchAngle: "" }),
    "Low redesign opportunity",
  );

  prospect.analysis!.overallScore = 65;
  assert.equal(
    topProspectRejectionReason(prospect, { opportunityScore: 49, mainWeakness: "", whyMayBuy: "", pitchAngle: "" }),
    "Weak sales fit",
  );

  prospect.phone = "";
  prospect.email = "";
  assert.equal(
    topProspectRejectionReason(prospect, { opportunityScore: 80, mainWeakness: "", whyMayBuy: "", pitchAngle: "" }),
    "No usable contact path",
  );
});

test("Top Prospects final cutoff never leaks extra qualified leads into ranked results", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.analysis!.overallScore = 62;
  const assessment = assessOpportunity(prospect);

  assert.deepEqual(topProspectResultDisposition(true, prospect, assessment), {
    selected: true,
    rejectionReason: null,
  });
  assert.deepEqual(topProspectResultDisposition(false, prospect, assessment), {
    selected: false,
    rejectionReason: "Below final cutoff",
  });
});

test("returning to Top Prospects automatically resumes a stalled saved job", async () => {
  let continuedJobId = "";
  const response = await handleTopProspectList(
    new Request("https://www.webworkshop.dev/api/engine/top-prospects"),
    {
      async listJobs() {
        return [];
      },
      async findResumableJobId() {
        return "stalled-job";
      },
      continueJob(_request, jobId) {
        continuedJobId = jobId;
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { jobs: [], buildVersion: topProspectBuildVersion() });
  assert.equal(continuedJobId, "stalled-job");
});

test("Top Prospects build version safely identifies the deployed commit", () => {
  assert.equal(topProspectBuildVersion({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }), "provider-diagnostics-v2-abcdef1");
  assert.equal(topProspectBuildVersion({ VERCEL_DEPLOYMENT_ID: "deployment-1234567890" }), "provider-diagnostics-v2-deployment-1");
  assert.equal(topProspectBuildVersion({}), "provider-diagnostics-v2");
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
