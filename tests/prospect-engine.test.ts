import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePriority,
  generateOutreach,
  generatePreview,
  seedProspects,
  sortProspects,
  withAnalysis,
} from "../lib/prospect-engine";

test("analysis prioritizes weaker websites and moves new leads to reviewed", () => {
  const analyzed = withAnalysis(structuredClone(seedProspects[0]));

  assert.equal(analyzed.status, "Reviewed");
  assert.ok(analyzed.analysis);
  assert.ok(analyzed.analysis.overallScore >= 0 && analyzed.analysis.overallScore <= 100);
  assert.equal(analyzed.priorityScore, calculatePriority(analyzed.analysis, analyzed.sizeIndicator, analyzed.serviceArea));
  assert.equal(analyzed.activities[0].type, "analysis");
});

test("outreach remains unapproved and references the prospect", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[1]));
  const outreach = generateOutreach(prospect);

  assert.equal(outreach.approved, false);
  assert.match(outreach.concise, new RegExp(prospect.businessName));
  assert.match(outreach.concise, /schedule HVAC service/i);
  assert.match(outreach.concise, /postal address before sending/i);
  assert.match(outreach.concise, /would rather not receive another note/i);
  assert.equal(outreach.subjects.length, 3);
  assert.equal(outreach.followUps.length, 2);
  assert.ok(outreach.followUps.every((followUp) => /would rather not receive another note/i.test(followUp)));
});

test("preview concepts include contractor-specific conversion strategy", () => {
  const prospect = structuredClone(seedProspects[2]);
  const preview = generatePreview(prospect);

  assert.match(preview.direction, /landscaping/i);
  assert.match(preview.ctaStrategy, /plan a landscape consultation/i);
  assert.ok(preview.homepageStructure.length >= 5);
  assert.ok(preview.servicePageStructure.length >= 5);
  assert.match(preview.visualStyleDirection, /outdoor spaces/i);
});

test("preview intelligence changes meaningfully by contractor trade", () => {
  const roofing = generatePreview(structuredClone(seedProspects[0]));
  const plumbing = generatePreview(structuredClone(seedProspects[3]));

  assert.match(roofing.trustStrategy, /material warranties/i);
  assert.match(plumbing.trustStrategy, /licensed plumbers/i);
  assert.notEqual(roofing.ctaStrategy, plumbing.ctaStrategy);
});

test("prospects can be sorted for operator prioritization", () => {
  const lowScore = withAnalysis(structuredClone(seedProspects[0]));
  lowScore.analysis!.overallScore = 30;
  const highScore = withAnalysis(structuredClone(seedProspects[1]));
  highScore.analysis!.overallScore = 80;

  assert.equal(sortProspects([highScore, lowScore], "websiteScore")[0].id, lowScore.id);
  assert.equal(sortProspects([highScore, lowScore], "businessName")[0].businessName, "Northline Heating & Air");
});

test("priority scoring accounts for broader service-area reach", () => {
  const local = calculatePriority(undefined, "Growing", "Findlay");
  const regional = calculatePriority(undefined, "Growing", "Findlay and nearby communities");

  assert.ok(regional > local);
});
