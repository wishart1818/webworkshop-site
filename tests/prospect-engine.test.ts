import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePriority,
  generateOutreach,
  generatePreview,
  generateProspectStyleProfile,
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
  assert.match(outreach.concise, /service and replacement inquiries/i);
  assert.match(outreach.concise, /postal address before sending/i);
  assert.match(outreach.concise, /would rather not receive another note/i);
  assert.equal(outreach.subjects.length, 3);
  assert.equal(outreach.followUps.length, 2);
  assert.ok(outreach.followUps.every((followUp) => /would rather not receive another note/i.test(followUp)));
  assert.ok(outreach.followUps.every((followUp) => /earlier email|follow up/i.test(followUp)));
  assert.doesNotMatch(outreach.followUps.join("\n"), /happy to send|send it over/i);
});

test("Outreach Package email includes a public preview link and human sales-ready observations", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const previewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";
  const outreach = generateOutreach(prospect, previewLink);

  assert.match(outreach.concise, /One thing that already works well:/i);
  assert.match(outreach.concise, /One missed opportunity:/i);
  assert.match(outreach.concise, new RegExp(previewLink.replaceAll("/", "\\/")));
  assert.match(outreach.concise, /roofing estimate requests/i);
  assert.match(outreach.concise, /quick 10-minute call/i);
  assert.match(outreach.concise, /would rather not receive another note/i);
  assert.doesNotMatch(outreach.concise, /\b\d{1,3}\s*\/\s*100\b|\bscore\b/i);
  assert.doesNotMatch(outreach.concise, /Would it be useful if I sent|happy to send/i);
  assert.doesNotMatch(outreach.concise, /you requested|your request/i);
  assert.ok(outreach.followUps.every((followUp) => followUp.includes(previewLink)));
});

test("outreach does not overstate a weak website's strongest category", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  for (const key of Object.keys(prospect.analysis!.scores) as Array<keyof typeof prospect.analysis.scores>) {
    prospect.analysis!.scores[key] = 25;
  }
  const outreach = generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF");

  assert.match(outreach.concise, /active website where homeowners can find the business online/i);
  assert.doesNotMatch(outreach.concise, /already pretty easy|solid technical foundation/i);
});

test("preview concepts include contractor-specific conversion strategy", () => {
  const prospect = structuredClone(seedProspects[2]);
  const preview = generatePreview(prospect);

  assert.match(preview.direction, /landscaping/i);
  assert.match(preview.ctaStrategy, /get a free quote/i);
  assert.ok(preview.homepageStructure.length >= 5);
  assert.ok(preview.servicePageStructure.length >= 5);
  assert.match(preview.visualStyleDirection, /outdoor spaces/i);
  assert.ok(preview.styleProfile);
  assert.ok(preview.heroHeadline);
  assert.equal(preview.styleProfile?.ctaLabel, "Get a free quote");
});

test("preview intelligence changes meaningfully by contractor trade", () => {
  const roofing = generatePreview(structuredClone(seedProspects[0]));
  const plumbing = generatePreview(structuredClone(seedProspects[3]));

  assert.match(roofing.trustStrategy, /material warranties/i);
  assert.match(plumbing.trustStrategy, /licensed plumbers/i);
  assert.notEqual(roofing.ctaStrategy, plumbing.ctaStrategy);
});

test("prospect-specific style profiles use recognizable brand cues and vary by business", () => {
  const blueLine = {
    ...structuredClone(seedProspects[0]),
    businessName: "Blue Line Roofing",
    website: "https://bluelineroofing.example",
  };
  const blueLineProfile = generateProspectStyleProfile(blueLine);
  const landscapingProfile = generateProspectStyleProfile(structuredClone(seedProspects[2]));

  assert.equal(blueLineProfile.primaryColor, "#174b78");
  assert.equal(blueLineProfile.accentColor, "#2c94c6");
  assert.equal(blueLineProfile.brandSource, "business-name cue");
  assert.equal(blueLineProfile.ctaLabel, "Request an estimate");
  assert.match(blueLineProfile.styleReason, /blue business-name cue/i);
  assert.notEqual(blueLineProfile.primaryColor, landscapingProfile.primaryColor);
  assert.notEqual(blueLineProfile.layoutStyle, landscapingProfile.layoutStyle);
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
