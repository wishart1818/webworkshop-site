import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePriority,
  generateOutreach,
  generatePreview,
  generateProspectStyleProfile,
  prospectPresenceLabels,
  seedProspects,
  sortProspects,
  withAnalysis,
  withOutreach,
  withPresenceGapReview,
  withPreview,
} from "../lib/prospect-engine";
import { buildProspectFunnel, explainProspectBucket, prospectFunnelFilterKeys, prospectMatchesFunnelFilter } from "../lib/prospect-funnel";
import { classifyWebsiteAnalysisFailure } from "../lib/site-analysis";

const testPostalAddress = "123 Main St, Findlay, OH 45840";

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
  const outreach = generateOutreach(prospect, "", { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.equal(outreach.approved, false);
  assert.match(outreach.concise, new RegExp(prospect.businessName));
  assert.match(outreach.concise, /Thanks,\nBrendan\nWebWorkshop/i);
  assert.match(outreach.concise, new RegExp(testPostalAddress));
  assert.doesNotMatch(outreach.concise, /\[Add your business postal address before sending\]/i);
  assert.match(outreach.concise, /would rather not receive another note/i);
  assert.equal(outreach.subjects.length, 3);
  assert.equal(outreach.followUps.length, 2);
  assert.ok(outreach.followUps.every((followUp) => /would rather not receive another note/i.test(followUp)));
  assert.ok(outreach.followUps.every((followUp) => /follow up|last note/i.test(followUp)));
  assert.doesNotMatch(outreach.followUps.join("\n"), /happy to send/i);
});

test("Outreach Package email uses casual human copy and public preview links", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "MC Pressure Washing FL";
  prospect.trade = "Pressure Washing";
  prospect.city = "Tampa";
  const previewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";
  const outreach = generateOutreach(prospect, previewLink, { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });
  const allDrafts = [outreach.concise, outreach.detailed, ...outreach.followUps].join("\n");

  assert.equal(outreach.subjects[0], "Quick website preview for MC Pressure Washing FL");
  assert.match(outreach.concise, /noticed (?:your site could probably do a better job turning visitors into calls and quote requests|the path to call or request a quote could probably be clearer), so I put together a quick website preview for you/i);
  assert.match(outreach.concise, /built to make the page look cleaner and help get you more calls and quote requests/i);
  assert.match(outreach.concise, /Would you like me to send it over\?/i);
  assert.doesNotMatch(outreach.concise, /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(outreach.concise, /Here's the preview/i);
  assert.match(outreach.detailed, new RegExp(previewLink.replaceAll("/", "\\/")));
  assert.match(outreach.detailed, /Sounds good - here's the preview/i);
  assert.match(outreach.detailed, /helping get more calls and quote requests/i);
  assert.match(outreach.detailed, /simple pricing\/options/i);
  assert.match(outreach.concise, /Thanks,\nBrendan\nWebWorkshop/i);
  assert.match(outreach.concise, new RegExp(testPostalAddress));
  assert.match(outreach.concise, /would rather not receive another note/i);
  assert.doesNotMatch(allDrafts, /One missed opportunity:|One thing that already works well:|customer proof you can verify|trust details could be easier/i);
  assert.doesNotMatch(allDrafts, /\b\d{1,3}\s*\/\s*100\b|\bscore\b/i);
  assert.doesNotMatch(allDrafts, /I reviewed your website|I analyzed your website|free audit|problems|mistakes|your website is bad/i);
  assert.doesNotMatch(allDrafts, /Would it be useful if I sent|happy to send/i);
  assert.doesNotMatch(allDrafts, /\bwill get you more calls/i);
  assert.match(outreach.followUps[1], /If this isn't useful or timing is off/i);
  assert.doesNotMatch(outreach.followUps[1], /If the preview is not useful/i);
  assert.doesNotMatch(allDrafts, /you requested|your request|\/engine\//i);
  assert.ok(outreach.followUps.every((followUp) => !followUp.includes(previewLink)));
});

test("detailed outreach avoids repeating the business name immediately after greeting", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "Styles Power Wash";
  prospect.trade = "Pressure Washing";
  prospect.city = "St Augustine";
  const previewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";
  const outreach = generateOutreach(prospect, previewLink, { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.match(outreach.concise, /Hi Styles Power Wash team,\n\nI was looking at pressure washing businesses around St Augustine and noticed (?:your site could probably do a better job turning visitors into calls and quote requests|the path to call or request a quote could probably be clearer), so I put together a quick website preview for you\./);
  assert.doesNotMatch(outreach.concise, /Hi Styles Power Wash team,\n\nI was looking at[^.]+(?:made you|put together) a quick preview for Styles Power Wash/i);
  assert.doesNotMatch(outreach.concise, /https:\/\/webworkshop\.dev\/p\//i);
  assert.match(outreach.detailed, new RegExp(previewLink.replaceAll("/", "\\/")));
  assert.match(outreach.detailed, /Thanks,\nBrendan\nWebWorkshop/i);
  assert.match(outreach.detailed, new RegExp(testPostalAddress));
  assert.match(outreach.detailed, /would rather not receive another note/i);
});

test("outreach drafts omit postal-address placeholders when sender address is missing", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const outreach = generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", {});
  const allDrafts = [outreach.concise, outreach.detailed, ...outreach.followUps].join("\n");

  assert.doesNotMatch(allDrafts, /\[Add your business postal address before sending\]/i);
  assert.match(outreach.concise, /Thanks,\nBrendan\nWebWorkshop/i);
  assert.match(outreach.concise, /If you would rather not receive another note/i);
});

test("outreach avoids analytical strength claims for weak websites", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  for (const key of Object.keys(prospect.analysis!.scores) as Array<keyof typeof prospect.analysis.scores>) {
    prospect.analysis!.scores[key] = 25;
  }
  const outreach = generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.match(outreach.concise, /noticed (?:your site could probably do a better job turning visitors into calls and quote requests|the path to call or request a quote could probably be clearer)/i);
  assert.match(outreach.concise, /help get you more calls and quote requests/i);
  assert.doesNotMatch(outreach.concise, /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(outreach.concise, /already pretty easy|solid technical foundation/i);
  assert.doesNotMatch(outreach.concise, /One thing that already works well|One missed opportunity/i);
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
  assert.ok(preview.qualityScore);
  assert.ok(preview.qualityScore.overall >= 85);
  assert.ok(preview.qualityScore.visualPolish >= 85);
  assert.ok(preview.qualityScore.safetyTruthfulness >= 90);
  assert.ok(preview.heroHeadline);
  assert.equal(preview.styleProfile?.ctaLabel, "Get a free quote");
  assert.match(preview.homepageStructure.join(" "), /sample service visual/i);
  assert.match(preview.portfolioDirection, /sample layout/i);
});

test("preview generation normalizes city and state capitalization", () => {
  const preview = generatePreview({
    ...structuredClone(seedProspects[0]),
    trade: "HVAC",
    city: "toledo",
    state: "oh",
    serviceArea: "toledo and nearby communities",
  });

  assert.equal(preview.heroHeadline, "Heating and cooling help without the runaround.");
  assert.match(preview.hero, /Toledo and nearby communities/);
  assert.match(preview.heroSupporting ?? "", /Toledo and nearby communities/);
  assert.doesNotMatch(`${preview.hero} ${preview.heroSupporting}`, /\btoledo\b/);
});

test("preview intelligence changes meaningfully by contractor trade", () => {
  const roofing = generatePreview(structuredClone(seedProspects[0]));
  const plumbing = generatePreview(structuredClone(seedProspects[3]));

  assert.match(roofing.trustStrategy, /material warranties/i);
  assert.match(roofing.trustStrategy, /only when the business verifies/i);
  assert.match(plumbing.trustStrategy, /licensed plumbers/i);
  assert.match(plumbing.trustStrategy, /verified/i);
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

test("prospect funnel totals reconcile and bucket counts match filtered lists", () => {
  const emailReady = withAnalysis(structuredClone(seedProspects[0]));
  emailReady.email = "owner@example.com";
  emailReady.recommendedContactMethod = "send_email";
  const facebookReady = withPresenceGapReview({ ...structuredClone(seedProspects[1]), email: "" }, "no_owned_website", "No owned website.");
  facebookReady.facebookUrl = "https://facebook.com/example";
  facebookReady.recommendedContactMethod = "message_on_facebook";
  facebookReady.bestManualContactMethod = "facebook";
  facebookReady.classification = "social_only";
  facebookReady.status = "Reviewed";
  facebookReady.priorityScore = 72;
  const phoneOnly = { ...structuredClone(seedProspects[2]), email: "", contactFormUrl: "", facebookUrl: "", classification: "phone_only" as const, recommendedContactMethod: "call_first" as const };
  const duplicate = { ...structuredClone(seedProspects[3]), classification: "duplicate_bad_fit" as const };
  const contacted = { ...structuredClone(seedProspects[0]), id: "contacted-test", status: "Contacted" as const };
  const strongWebsite = withAnalysis({ ...structuredClone(seedProspects[1]), id: "strong-site-test" });
  strongWebsite.analysis!.overallScore = 92;
  strongWebsite.analysis!.opportunityRating = "Low";
  strongWebsite.bestManualContactMethod = "unknown";
  const prospects = [emailReady, facebookReady, phoneOnly, duplicate, contacted, strongWebsite];

  const funnel = buildProspectFunnel(prospects);

  assert.equal(funnel.counts.total, prospects.length);
  assert.equal(funnel.diagnostics.exclusiveTotal, prospects.length);
  assert.equal(funnel.diagnostics.reconciles, true);
  for (const key of prospectFunnelFilterKeys) {
    const filteredCount = prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, key)).length;
    assert.equal(funnel.counts[key], filteredCount, `bucket ${key}`);
  }
  assert.equal(prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, "ready_email")).length, 1);
  assert.equal(prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, "ready_facebook")).length, 1);
  assert.equal(prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, "phone_only")).length, 1);
  assert.ok(prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, "duplicate")).length >= 1);
  assert.equal(prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, "already_contacted")).length, 1);
  assert.equal(prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, "website_already_strong")).length, 1);
});

test("prospect funnel explanations are human-readable and do not change ranking or outreach", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.email = "owner@example.com";
  prospect.recommendedContactMethod = "send_email";
  const before = JSON.stringify(prospect);
  const sortedBefore = sortProspects([prospect], "priority").map((item) => item.id);
  const outreachBefore = generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress }).concise;

  const explanation = explainProspectBucket(prospect);
  buildProspectFunnel([prospect]);

  assert.equal(JSON.stringify(prospect), before);
  assert.deepEqual(sortProspects([prospect], "priority").map((item) => item.id), sortedBefore);
  assert.equal(generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress }).concise, outreachBefore);
  assert.equal(explanation.currentBucketLabel, "Ready for Email Review");
  assert.equal(explanation.eligibleFor.email, true);
  assert.ok(explanation.reasons.some((reason) => /Public business email found|Qualified|Not contacted/i.test(reason)));
  assert.match(explanation.nextStep, /Review/);
});

test("website analysis failures classify into persistent presence-gap states", () => {
  assert.deepEqual(classifyWebsiteAnalysisFailure(new Error("Website returned HTTP 404.")), {
    status: "http_404",
    detail: "Website returned HTTP 404.",
  });
  assert.equal(classifyWebsiteAnalysisFailure(new TypeError("fetch failed"))?.status, "unreachable_website");
  assert.equal(classifyWebsiteAnalysisFailure(new Error("Website robots.txt does not allow analysis of this page.")), null);
  assert.equal(classifyWebsiteAnalysisFailure(new Error("Website returned HTTP 403.")), null);
  assert.equal(classifyWebsiteAnalysisFailure(new Error("Website returned HTTP 429.")), null);

  const broken = withPresenceGapReview(structuredClone(seedProspects[3]), "http_404", "Website returned HTTP 404.");
  assert.equal(broken.prospectType, "no_website_social_only");
  assert.equal(broken.analysis, undefined);
  assert.equal(broken.websiteStatus, "http_404");
  assert.ok(broken.websiteAnalysisAttemptedAt);
  assert.deepEqual(prospectPresenceLabels(broken), ["Broken website", "Phone only", "Phone-only / written outreach blocked", "Needs manual contact research"]);
});

test("no-website prospects still generate dedicated-website outreach", () => {
  const noWebsite = withPresenceGapReview({
    ...structuredClone(seedProspects[0]),
    website: "",
  }, "no_owned_website", "No owned website detected.");
  const withDraft = withOutreach(noWebsite);

  assert.match(withDraft.outreach?.concise ?? "", /noticed I couldn't find a full website for your business/i);
  assert.match(withDraft.outreach?.concise ?? "", /quick preview of what one could look like/i);
  assert.match(withDraft.outreach?.concise ?? "", /make it easier for them to call or request a quote/i);
  assert.doesNotMatch(withDraft.outreach?.concise ?? "", /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(withDraft.outreach?.concise ?? "", /your website has issues/i);
});

test("switching prospect type clears stale analysis, outreach, and preview artifacts", () => {
  const redesign = withPreview(withOutreach(withAnalysis(structuredClone(seedProspects[0]))));
  const presenceGap = withPresenceGapReview(redesign, "http_404", "Website returned HTTP 404.");
  const restored = withAnalysis(withPreview(withOutreach(presenceGap)));

  assert.equal(presenceGap.analysis, undefined);
  assert.equal(presenceGap.outreach, undefined);
  assert.equal(presenceGap.preview, undefined);
  assert.equal(restored.outreach, undefined);
  assert.equal(restored.preview, undefined);
  assert.equal(restored.prospectType, "redesign");
});
