import assert from "node:assert/strict";
import test from "node:test";
import { handleTopProspectList, topProspectBuildVersion } from "../lib/top-prospect-list-route";
import {
  assessOpportunity,
  assessNoWebsiteOpportunity,
  assertOutreachEmailReady,
  applyRecommendedMarketPresetFields,
  calculateNoWebsitePresenceScores,
  calculateProspectSalesScores,
  evaluateOutreachEmailQuality,
  generateWebsiteBuildPrompt,
  hasClearLocalServiceIntent,
  isThirdPartyDirectoryUrl,
  likelyFranchise,
  likelyInstitutionalOrNonBusiness,
  likelyNationalOrLargeBrand,
  likelySupplierOrDistributor,
  normalizeWebsite,
  normalizeOutreachPackageStatus,
  outreachPackageActionAllowed,
  outreachPackageStatusLabel,
  parseTopProspectCityTargets,
  prepareTopProspectArtifacts,
  repairUnsupportedOutreachClaims,
  recommendedMarketPresets,
  citySearchBudgets,
  prospectPreviewLink,
  publicProspectPreviewLink,
  topProspectJobStatuses,
  topProspectNextRunRecommendations,
  topProspectRejectionReason,
  topProspectResultBucket,
  topProspectResultDisposition,
  thirdPartyListingOnly,
  validateTopProspectInput,
  websiteBusinessMismatch,
  type OpportunityAssessment,
} from "../lib/top-prospects";
import {
  classifyProspectPresence,
  displayTradeCategory,
  normalizeTradeCategory,
  prospectEmailNeedsManualVerification,
  recommendProspectContactMethod,
  seedProspects,
  titleCaseLocation,
  withAnalysis,
} from "../lib/prospect-engine";
import { inactivePublicRecord } from "../lib/lead-discovery";
import { createPublicPreviewToken } from "../lib/public-preview-token";
import { combineCityDiscoveryResults, combineTradeDiscoveryResults, recoverableTopProspect, tradeFailureDiscoveryResult } from "../lib/top-prospect-worker";

const testPostalAddress = "123 Main St, Findlay, OH 45840";
process.env.WEBWORKSHOP_POSTAL_ADDRESS ??= testPostalAddress;

function manualAssessment(opportunityScore: number): OpportunityAssessment {
  return {
    opportunityScore,
    salesScores: {
      websiteQualityScore: 65,
      revenueOpportunityScore: 70,
      contactabilityScore: 70,
      localMarketCompetitivenessScore: 70,
      aiReplacementConfidenceScore: 70,
      weightedSalesScore: 70,
    },
    presenceScores: null,
    mainWeakness: "",
    whyMayBuy: "",
    pitchAngle: "",
  };
}

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
  if (valid.ok) {
    assert.equal(valid.value.state, "OH");
    assert.equal(valid.value.mode, "strict");
    assert.equal(valid.value.workflowType, "search");
    assert.equal(valid.value.prospectType, "redesign");
    assert.equal(valid.value.outreachPreference, "written_only");
  }

  const morningBatch = validateTopProspectInput({
    trade: "Roofing",
    city: "Findlay",
    state: "OH",
    radiusKm: 50,
    businessesToScan: 50,
    finalProspectsWanted: 10,
    mode: "growth",
    workflowType: "morning_batch",
    outreachPreference: "phone_allowed",
  });
  assert.equal(morningBatch.ok, true);
  if (morningBatch.ok) assert.deepEqual([morningBatch.value.mode, morningBatch.value.workflowType, morningBatch.value.outreachPreference], ["growth", "morning_batch", "phone_allowed"]);
  const noWebsite = validateTopProspectInput({
    trade: "Roofing",
    city: "Findlay",
    state: "OH",
    radiusKm: 25,
    businessesToScan: 25,
    finalProspectsWanted: 10,
    prospectType: "no_website_social_only",
  });
  assert.equal(noWebsite.ok, true);
  if (noWebsite.ok) assert.equal(noWebsite.value.prospectType, "no_website_social_only");
  const allTypes = validateTopProspectInput({
    trade: "Roofing",
    city: "Findlay",
    state: "OH",
    radiusKm: 25,
    businessesToScan: 25,
    finalProspectsWanted: 10,
    prospectType: "all",
  });
  assert.equal(allTypes.ok, true);
  if (allTypes.ok) assert.equal(allTypes.value.prospectType, "all");
  const allCoreTrades = validateTopProspectInput({
    trade: "All Core Service Trades",
    city: "Findlay",
    state: "OH",
    radiusKm: 50,
    businessesToScan: 100,
    finalProspectsWanted: 20,
    prospectType: "all",
    mode: "growth",
  });
  assert.equal(allCoreTrades.ok, true);
  if (allCoreTrades.ok) assert.deepEqual([allCoreTrades.value.trade, allCoreTrades.value.prospectType, allCoreTrades.value.mode], ["All Core Service Trades", "all", "growth"]);
  assert.equal(validateTopProspectInput({ trade: "Painting", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 10, finalProspectsWanted: 5 }).ok, true);

  assert.equal(validateTopProspectInput({ trade: "Roofing", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 251, finalProspectsWanted: 10 }).ok, false);
  assert.equal(validateTopProspectInput({ trade: "Roofing", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 10, finalProspectsWanted: 11 }).ok, false);
  assert.equal(validateTopProspectInput({ trade: "Roofing", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 10, finalProspectsWanted: 5, mode: "unknown" }).ok, false);
  assert.equal(validateTopProspectInput({ trade: "Roofing", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 10, finalProspectsWanted: 5, workflowType: "unknown" }).ok, false);
  assert.equal(validateTopProspectInput({ trade: "Roofing", city: "Findlay", state: "OH", radiusKm: 25, businessesToScan: 10, finalProspectsWanted: 5, outreachPreference: "cold_call_everyone" }).ok, false);
});

test("Top Prospects job statuses include waiting and partial completion states", () => {
  assert.ok(topProspectJobStatuses.includes("NEEDS_NEXT_BATCH"));
  assert.ok(topProspectJobStatuses.includes("PARTIAL_RESULTS_READY"));
  assert.ok(topProspectJobStatuses.includes("COMPLETED_WITH_PARTIAL_RESULTS"));
  assert.ok(topProspectJobStatuses.includes("FAILED_AFTER_DISCOVERY"));
});

test("duplicate normalization and franchise screening are deterministic", () => {
  assert.equal(normalizeWebsite("https://www.example.com/services/"), normalizeWebsite("https://example.com/contact"));
  assert.equal(likelyFranchise({ businessName: "SERVPRO of Findlay", website: "https://example.com" }), true);
  assert.equal(likelyFranchise({ businessName: "North Main Roofing", website: "https://northmain.example" }), false);
  assert.equal(likelyNationalOrLargeBrand({ businessName: "Erie Home", website: "https://eriehome.com" }), true);
  assert.equal(likelySupplierOrDistributor({ businessName: "ABC Roofing Supply", website: "https://abc-roofing-supply.example" }), true);
});

test("institutional, supplier, and mismatched website leads are blocked before review", () => {
  const institutional = withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "University Campus Roofing Operations",
    website: "https://facilities.example.edu/roofing",
    trade: "Roofing",
  });
  const supplier = withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Toledo Roofing Equipment Supply",
    website: "https://toledo-roofing-supply.example",
    trade: "Roofing",
  });
  const mismatch = withAnalysis({
    ...structuredClone(seedProspects[4]),
    businessName: "BrightWire Electric",
    website: "https://saunatimes.example",
    trade: "Electrical",
  });
  const unclear = withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Northwest Holdings",
    website: "https://northwestholdings.example",
    trade: "Roofing",
  });

  assert.equal(likelyInstitutionalOrNonBusiness(institutional), true);
  assert.equal(likelySupplierOrDistributor(supplier), true);
  assert.equal(websiteBusinessMismatch(mismatch), true);
  assert.equal(hasClearLocalServiceIntent(unclear), false);
  assert.equal(topProspectRejectionReason(institutional, manualAssessment(80)), "Institutional/non-business page");
  assert.equal(topProspectRejectionReason(supplier, manualAssessment(80)), "Supplier/distributor");
  assert.equal(topProspectRejectionReason(mismatch, manualAssessment(80)), "Website/business mismatch");
  assert.equal(topProspectRejectionReason(unclear, manualAssessment(80)), "No clear local service intent");
});

test("real bad-run landscaping leads are blocked or kept out of send-ready review", () => {
  const supplier = {
    businessName: "D & D Landscaping Supply",
    website: "",
    trade: "Landscaping" as const,
  };
  const mismatch = withAnalysis({
    ...structuredClone(seedProspects[2]),
    businessName: "Otter Creek Landscaping",
    website: "https://wreathfactoryonline.com",
    trade: "Landscaping",
  });
  const directoryOnly = {
    ...structuredClone(seedProspects[2]),
    businessName: "Heritage Landscaping and Design",
    website: "",
    profileUrl: "https://hub.biz/heritage-landscaping-and-design",
    email: "",
    contactFormUrl: "",
    recommendedContactMethod: "needs_manual_contact_research" as const,
    classification: "listing_only" as const,
    prospectType: "no_website_social_only" as const,
    inactive: false,
  };

  assert.equal(likelySupplierOrDistributor(supplier), true);
  assert.equal(websiteBusinessMismatch(mismatch), true);
  assert.equal(isThirdPartyDirectoryUrl(directoryOnly.profileUrl), true);
  assert.equal(thirdPartyListingOnly(directoryOnly), true);
  assert.equal(topProspectRejectionReason(mismatch, manualAssessment(80)), "Website/business mismatch");
  assert.equal(topProspectRejectionReason(directoryOnly, manualAssessment(80)), "Third-party listing only");
});

test("display normalization keeps HVAC, Toledo, OH, and Pressure Washing labels consistent", () => {
  const valid = validateTopProspectInput({
    trade: "power washing",
    city: "toledo",
    state: "oh",
    radiusKm: 25,
    businessesToScan: 10,
    finalProspectsWanted: 5,
  });

  assert.equal(normalizeTradeCategory("Power Washing"), "Pressure Washing");
  assert.equal(displayTradeCategory("hvac"), "HVAC");
  assert.equal(displayTradeCategory("Power Washing"), "Pressure Washing");
  assert.equal(titleCaseLocation("sylvania"), "Sylvania");
  assert.equal(valid.ok, true);
  if (valid.ok) assert.deepEqual([valid.value.trade, valid.value.city, valid.value.state], ["Pressure Washing", "Toledo", "OH"]);

  const multiCity = validateTopProspectInput({
    trade: "Roofing",
    city: "Toledo, Sylvania, Perrysburg",
    state: "OH",
    radiusKm: 25,
    businessesToScan: 10,
    finalProspectsWanted: 5,
  });
  assert.equal(multiCity.ok, true);
  if (multiCity.ok) {
    assert.deepEqual(multiCity.value.cityTargets?.map((target) => target.label), ["Toledo, OH", "Sylvania, OH", "Perrysburg, OH"]);
    assert.equal(multiCity.value.excludePreviouslyReviewed, true);
  }
  assert.deepEqual(parseTopProspectCityTargets("Toledo, OH; Tampa, FL; Charlotte, NC", "OH").map((target) => target.label), [
    "Toledo, OH",
    "Tampa, FL",
    "Charlotte, NC",
  ]);
});

test("recommended market presets and multi-city budget splitting are deterministic", () => {
  assert.ok(recommendedMarketPresets.some((preset) => preset.name === "Northwest Ohio" && preset.starter));
  assert.ok(recommendedMarketPresets.some((preset) => preset.name === "Florida" && preset.trades.includes("Pressure Washing")));
  assert.deepEqual(citySearchBudgets(100, 3), [34, 33, 33]);
});

test("recommended market preset actions fill fields without starting a search", () => {
  const florida = recommendedMarketPresets.find((preset) => preset.name === "Florida");
  assert.ok(florida);

  const replaced = applyRecommendedMarketPresetFields({
    currentCityInput: "Toledo",
    currentStateInput: "OH",
    mode: "replace",
    preset: florida,
  });
  assert.equal(replaced.stateInput, "FL");
  assert.match(replaced.cityInput, /^Tampa, St\. Petersburg, Clearwater/);
  assert.equal(parseTopProspectCityTargets(replaced.cityInput, replaced.stateInput).length, florida.cities.length);

  const appended = applyRecommendedMarketPresetFields({
    currentCityInput: "Toledo, OH; Tampa, FL",
    currentStateInput: "OH",
    mode: "append",
    preset: florida,
  });
  const appendedTargets = parseTopProspectCityTargets(appended.cityInput, appended.stateInput);
  assert.equal(appended.stateInput, "OH");
  assert.equal(appendedTargets.filter((target) => target.label === "Tampa, FL").length, 1);
  assert.ok(appendedTargets.some((target) => target.label === "Toledo, OH"));
  assert.ok(appendedTargets.some((target) => target.label === "Fort Myers, FL"));

  const withTrade = applyRecommendedMarketPresetFields({
    currentCityInput: "",
    currentStateInput: "OH",
    mode: "replace",
    preset: florida,
    trade: "Pressure Washing",
  });
  assert.equal(withTrade.trade, "Pressure Washing");
  assert.equal(withTrade.stateInput, "FL");
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
  assert.equal(assessment.salesScores.websiteQualityScore, 58);
  assert.ok(assessment.salesScores.weightedSalesScore >= 0 && assessment.salesScores.weightedSalesScore <= 100);
});

test("sales scoring calculates bounded revenue, contactability, market, replacement, and weighted scores", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.analysis!.overallScore = 74;
  prospect.analysis!.scores.contactAccessibility = 32;
  const scores = calculateProspectSalesScores(prospect, 68);

  assert.deepEqual(Object.keys(scores), [
    "websiteQualityScore",
    "revenueOpportunityScore",
    "contactabilityScore",
    "localMarketCompetitivenessScore",
    "aiReplacementConfidenceScore",
    "weightedSalesScore",
  ]);
  assert.ok(Object.values(scores).every((score) => Number.isInteger(score) && score >= 0 && score <= 100));
});

test("Toledo roofing ranking excludes strong websites and national brands", () => {
  const husky = withAnalysis(structuredClone(seedProspects[0]));
  husky.businessName = "Husky Roofing";
  husky.website = "https://husky-roofing.example";
  husky.email = "hello@husky-roofing.example";
  husky.analysis!.overallScore = 62;
  husky.analysis!.scores.contactAccessibility = 42;
  husky.analysis!.scores.trustSignals = 44;
  husky.analysis!.scores.conversionReadiness = 42;
  const huskyAssessment = assessOpportunity(husky);

  const strong = withAnalysis(structuredClone(seedProspects[0]));
  strong.businessName = "Shingle And Metal Roofs";
  strong.website = "https://shingle-and-metal.example";
  strong.email = "hello@shingle-and-metal.example";
  strong.analysis!.overallScore = 97;
  const strongAssessment = assessOpportunity(strong);

  const national = withAnalysis(structuredClone(seedProspects[0]));
  national.businessName = "Erie Home";
  national.website = "https://eriehome.com";
  national.email = "hello@eriehome.com";
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
    topProspectRejectionReason(prospect, manualAssessment(70)),
    "Low redesign opportunity",
  );

  prospect.analysis!.overallScore = 65;
  assert.equal(
    topProspectRejectionReason(prospect, manualAssessment(49)),
    "Weak sales fit",
  );

  prospect.phone = "";
  prospect.email = "";
  assert.equal(
    topProspectRejectionReason(prospect, manualAssessment(80)),
    "No usable contact path",
  );
  prospect.contactFormUrl = "https://local-roofing.example/contact";
  prospect.recommendedContactMethod = "submit_contact_form";
  assert.equal(topProspectRejectionReason(prospect, manualAssessment(80)), null);
});

test("written outreach readiness blocks phone-only leads from send-ready approval", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const prospect = {
    ...structuredClone(seedProspects[0]),
    website: "",
    profileUrl: "",
    prospectType: "no_website_social_only" as const,
    classification: "phone_only" as const,
    phone: "419-555-0100",
    email: "",
    contactFormUrl: "",
    recommendedContactMethod: "needs_manual_contact_research" as const,
    analysis: undefined,
  };
  const prepared = prepareTopProspectArtifacts(prospect, publicLink);

  assert.equal(topProspectRejectionReason(prepared.prospect, prepared.assessment), "Phone-only / written outreach blocked");
  assert.equal(prepared.emailQuality.ready, false);
  assert.equal(prepared.emailQuality.readinessLabel, "Phone-only / written outreach blocked");
  assert.throws(() => assertOutreachEmailReady(prepared.prospect, publicLink), /Phone-only \/ written outreach blocked/);
});

test("Top Prospects treats contact forms and social profiles as usable manual written outreach", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const formProspect = withAnalysis(structuredClone(seedProspects[0]));
  formProspect.email = "";
  formProspect.phone = "419-555-0100";
  formProspect.contactFormUrl = "https://local-roofing.example/contact";
  formProspect.contactFormDetected = true;
  formProspect.bestManualContactMethod = "contact_form";
  formProspect.recommendedContactMethod = "submit_contact_form";
  const formPackage = prepareTopProspectArtifacts(formProspect, publicLink);

  assert.equal(topProspectRejectionReason(formPackage.prospect, formPackage.assessment, "growth"), null);
  assert.equal(formPackage.emailQuality.readinessLabel, "Send-ready");
  assert.match(formPackage.prospect.outreach?.concise ?? "", /put together a quick website preview for you/i);
  assert.match(formPackage.prospect.outreach?.concise ?? "", /help get you more calls and quote requests/i);
  assert.match(formPackage.prospect.outreach?.concise ?? "", /Would you like me to send it over\?/i);
  assert.doesNotMatch(formPackage.prospect.outreach?.concise ?? "", /\/p\//i);
  assert.match(formPackage.prospect.outreach?.detailed ?? "", new RegExp(publicLink.replaceAll("/", "\\/")));
  assert.doesNotMatch(formPackage.prospect.outreach?.concise ?? "", /\/engine\/previews/i);

  const socialProspect = withAnalysis(structuredClone(seedProspects[2]));
  socialProspect.email = "";
  socialProspect.contactFormUrl = "";
  socialProspect.facebookUrl = "https://facebook.com/evergreenoutdoor";
  socialProspect.bestManualContactMethod = "facebook";
  socialProspect.recommendedContactMethod = "message_on_facebook";
  const socialPackage = prepareTopProspectArtifacts(socialProspect, publicLink);

  assert.equal(topProspectRejectionReason(socialPackage.prospect, socialPackage.assessment, "growth"), null);
  assert.equal(socialPackage.emailQuality.readinessLabel, "Send-ready");
  assert.match(socialPackage.prospect.outreach?.concise ?? "", /help get you more calls and quote requests/i);
  assert.match(socialPackage.prospect.outreach?.concise ?? "", /Want to see it\?/);
  assert.doesNotMatch(socialPackage.prospect.outreach?.concise ?? "", /\/p\//);
  assert.match(socialPackage.prospect.outreach?.detailed ?? "", new RegExp(publicLink.replaceAll("/", "\\/")));
});

test("Prospect Modes preserve strict behavior and expand local qualification deliberately", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "Local Roofing Company";
  prospect.website = "https://local-roofing.example";
  prospect.email = "hello@local-roofing.example";
  prospect.analysis!.overallScore = 84;
  prospect.analysis!.scores.ctaStrength = 62;
  prospect.analysis!.scores.conversionReadiness = 58;
  const assessment = assessOpportunity(prospect);

  assert.equal(topProspectRejectionReason(prospect, assessment, "strict"), "Low redesign opportunity");
  assert.equal(topProspectRejectionReason(prospect, assessment, "growth"), null);

  prospect.phone = "";
  prospect.email = "";
  assert.equal(topProspectRejectionReason(prospect, assessment, "growth"), "No usable contact path");
  assert.equal(topProspectRejectionReason(prospect, assessment, "volume"), null);

  prospect.businessName = "Erie Home";
  prospect.website = "https://eriehome.com";
  assert.equal(topProspectRejectionReason(prospect, assessment, "volume"), "National/large brand");

  prospect.businessName = "Local Roofing Company";
  prospect.website = "https://local-roofing.example";
  prospect.analysis!.overallScore = 96;
  for (const key of Object.keys(prospect.analysis!.scores) as Array<keyof typeof prospect.analysis.scores>) {
    prospect.analysis!.scores[key] = 95;
  }
  assert.equal(topProspectRejectionReason(prospect, assessOpportunity(prospect), "volume"), "Low redesign opportunity");
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

test("Top Prospects separates reviewable lower-priority packages from blocked prospects", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const formProspect = withAnalysis(structuredClone(seedProspects[0]));
  formProspect.businessName = "Tampa Pressure Washing Co";
  formProspect.trade = "Pressure Washing";
  formProspect.city = "Tampa";
  formProspect.state = "FL";
  formProspect.email = "";
  formProspect.contactFormUrl = "https://tampapressurewashing.example/contact";
  formProspect.contactFormDetected = true;
  formProspect.bestManualContactMethod = "contact_form";
  formProspect.recommendedContactMethod = "submit_contact_form";
  const reviewablePackage = prepareTopProspectArtifacts(formProspect, publicLink);

  assert.equal(
    topProspectResultBucket({
      selected: false,
      rejectionReason: "Weak sales fit",
      packageStatus: "READY_FOR_REVIEW",
      emailQuality: reviewablePackage.emailQuality,
      prospect: reviewablePackage.prospect,
    }),
    "reviewable_lower_priority",
  );

  const phoneOnlyProspect = withAnalysis(structuredClone(seedProspects[1]));
  phoneOnlyProspect.email = "";
  phoneOnlyProspect.contactFormUrl = "";
  phoneOnlyProspect.quoteFormUrl = "";
  phoneOnlyProspect.facebookUrl = "";
  phoneOnlyProspect.instagramUrl = "";
  phoneOnlyProspect.linkedinUrl = "";
  phoneOnlyProspect.phone = "419-555-0100";
  phoneOnlyProspect.classification = "phone_only";
  phoneOnlyProspect.recommendedContactMethod = "call_first";
  phoneOnlyProspect.bestManualContactMethod = "phone_only";
  const phoneOnlyPackage = prepareTopProspectArtifacts(phoneOnlyProspect, publicLink);

  assert.equal(
    topProspectResultBucket({
      selected: false,
      rejectionReason: "Phone-only / written outreach blocked",
      packageStatus: "PACKAGE_GENERATED",
      emailQuality: phoneOnlyPackage.emailQuality,
      prospect: phoneOnlyPackage.prospect,
    }),
    "blocked",
  );
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

test("all-core discovery keeps partial results when one trade is rate limited", () => {
  const lead = {
    businessName: "Partial Roofing",
    website: "https://partialroofing.example/",
    profileUrl: "",
    prospectType: "redesign" as const,
    classification: "website_redesign" as const,
    phone: "(419) 555-0100",
    email: "hello@partialroofing.example",
    contactFormUrl: "",
    address: "",
    city: "Toledo",
    state: "OH",
    trade: "Roofing" as const,
    serviceArea: "Toledo and nearby communities",
    sources: ["osm" as const],
    sourceConfidence: 40,
    recommendedContactMethod: "send_email" as const,
    inactive: false,
  };
  const successfulTrade = {
    leads: [lead],
    diagnostics: {
      rawProviderCount: 1,
      afterDistanceFilteringCount: 1,
      afterDuplicateFilteringCount: 1,
      afterQualificationFilteringCount: 1,
      returnedCount: 1,
      radiusKm: 25,
      categorySignals: ["craft=roofer"],
      sourceCounts: { osm: 1, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
      providerDiagnostics: {
        osm: { configured: true, queryExecuted: true, status: "succeeded" as const, returnedCount: 1, withinRadiusCount: 1, afterDeduplicationCount: 1, usableWebsiteCount: 1 },
        azureMaps: { configured: false, queryExecuted: false, status: "not_configured" as const, returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        googlePlaces: { configured: false, queryExecuted: false, status: "not_configured" as const, returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        yelp: { configured: false, queryExecuted: false, status: "not_configured" as const, returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      },
      finalMergedCount: 1,
    },
  };
  const rateLimitedTrade = tradeFailureDiscoveryResult({
    trade: "HVAC",
    radiusKm: 25,
    rateLimited: true,
    safeReason: "The public business discovery provider returned HTTP 429.",
  });
  const combined = combineTradeDiscoveryResults({
    radiusKm: 25,
    limit: 10,
    results: [
      { trade: "Roofing", result: successfulTrade },
      { trade: "HVAC", result: rateLimitedTrade },
    ],
  });

  assert.equal(combined.leads.length, 1);
  assert.equal(combined.leads[0].businessName, "Partial Roofing");
  assert.equal(combined.diagnostics.tradeDiagnostics?.find((item) => item.trade === "HVAC")?.status, "skipped");
  assert.deepEqual(combined.diagnostics.tradeDiagnostics?.find((item) => item.trade === "HVAC")?.rateLimitedProviders, ["osm"]);
});

test("multi-city discovery merges duplicates and keeps city diagnostics", () => {
  const baseLead = {
    businessName: "Same Market Roofing",
    website: "https://same-market-roofing.example",
    profileUrl: "",
    prospectType: "redesign" as const,
    classification: "website_redesign" as const,
    phone: "(419) 555-0199",
    email: "hello@same-market-roofing.example",
    contactFormUrl: "",
    address: "",
    city: "Toledo",
    state: "OH",
    trade: "Roofing" as const,
    serviceArea: "Toledo and nearby communities",
    sources: ["osm" as const],
    sourceConfidence: 55,
    recommendedContactMethod: "send_email" as const,
    inactive: false,
  };
  const diagnostics = {
    rawProviderCount: 1,
    afterDistanceFilteringCount: 1,
    afterDuplicateFilteringCount: 1,
    afterQualificationFilteringCount: 1,
    returnedCount: 1,
    radiusKm: 25,
    categorySignals: ["craft=roofer"],
    sourceCounts: { osm: 1, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
    providerDiagnostics: {
      osm: { configured: true, queryExecuted: true, status: "succeeded" as const, returnedCount: 1, withinRadiusCount: 1, afterDeduplicationCount: 1, usableWebsiteCount: 1 },
      azureMaps: { configured: false, queryExecuted: false, status: "not_configured" as const, returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      googlePlaces: { configured: false, queryExecuted: false, status: "not_configured" as const, returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      yelp: { configured: false, queryExecuted: false, status: "not_configured" as const, returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
    },
    finalMergedCount: 1,
  };
  const combined = combineCityDiscoveryResults({
    radiusKm: 25,
    limit: 10,
    excludePreviouslyReviewed: true,
    cityTargets: [{ city: "Toledo", state: "OH", label: "Toledo, OH" }, { city: "Sylvania", state: "OH", label: "Sylvania, OH" }],
    results: [
      { target: { city: "Toledo", state: "OH", label: "Toledo, OH" }, requestedCount: 5, result: { leads: [{ ...baseLead, matchedCities: ["Toledo, OH"] }], diagnostics } },
      { target: { city: "Sylvania", state: "OH", label: "Sylvania, OH" }, requestedCount: 5, result: { leads: [{ ...baseLead, city: "Sylvania", matchedCities: ["Sylvania, OH"] }], diagnostics } },
    ],
  });

  assert.equal(combined.leads.length, 1);
  assert.deepEqual(combined.leads[0].matchedCities?.sort(), ["Sylvania, OH", "Toledo, OH"]);
  assert.equal(combined.diagnostics.cityDiagnostics?.length, 2);
  assert.equal(combined.diagnostics.excludePreviouslyReviewed, true);
});

test("zero-qualified runs explain provider, supplier, directory, and contact-path issues", () => {
  const recommendations = topProspectNextRunRecommendations({
    job: {
      input: {
        trade: "Landscaping",
        city: "Toledo, Sylvania, Perrysburg",
        state: "OH",
        radiusKm: 50,
        businessesToScan: 50,
        finalProspectsWanted: 10,
        prospectType: "all",
        mode: "growth",
        workflowType: "search",
        outreachPreference: "written_only",
        excludePreviouslyReviewed: true,
        cityTargets: [
          { city: "Toledo", state: "OH", label: "Toledo, OH" },
          { city: "Sylvania", state: "OH", label: "Sylvania, OH" },
          { city: "Perrysburg", state: "OH", label: "Perrysburg, OH" },
        ],
      },
      results: [],
      reviewedNotRecommended: [],
      skipSummary: {
        supplier_distributor: 3,
        third_party_listing_only: 2,
        no_usable_contact_path: 2,
      },
      discoveryDiagnostics: {
        rawProviderCount: 4,
        afterDistanceFilteringCount: 4,
        afterDuplicateFilteringCount: 4,
        afterQualificationFilteringCount: 0,
        returnedCount: 0,
        radiusKm: 50,
        categorySignals: [],
        sourceCounts: { osm: 4, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
        providerDiagnostics: {
          osm: { configured: true, queryExecuted: true, status: "failed", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          azureMaps: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        },
        finalMergedCount: 4,
        cityDiagnostics: [{ city: "Sylvania", state: "OH", label: "Sylvania, OH", status: "failed", requestedCount: 17, rawProviderCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0, returnedCount: 0, providerDiagnostics: {
          osm: { configured: true, queryExecuted: true, status: "failed", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          azureMaps: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        } }],
      },
    },
  });

  assert.match(recommendations.join(" "), /suppliers|directories|mismatched/i);
  assert.match(recommendations.join(" "), /All attempted discovery providers failed/i);
  assert.doesNotMatch(recommendations.join(" "), /Increase scan count/i);
  assert.match(recommendations.join(" "), /written contact path|Manual DM/i);
});

test("thin Azure-only discovery recommends Google Places before larger runs", () => {
  const recommendations = topProspectNextRunRecommendations({
    job: {
      input: {
        trade: "Pressure Washing",
        city: "Tampa, St. Petersburg, Clearwater",
        state: "FL",
        radiusKm: 50,
        businessesToScan: 100,
        finalProspectsWanted: 20,
        prospectType: "all",
        mode: "growth",
        workflowType: "search",
        outreachPreference: "written_only",
        excludePreviouslyReviewed: true,
        cityTargets: [
          { city: "Tampa", state: "FL", label: "Tampa, FL" },
          { city: "St. Petersburg", state: "FL", label: "St. Petersburg, FL" },
          { city: "Clearwater", state: "FL", label: "Clearwater, FL" },
        ],
      },
      results: [],
      reviewedNotRecommended: [],
      skipSummary: {},
      discoveryDiagnostics: {
        rawProviderCount: 1,
        afterDistanceFilteringCount: 1,
        afterDuplicateFilteringCount: 1,
        afterQualificationFilteringCount: 0,
        returnedCount: 0,
        radiusKm: 50,
        categorySignals: [],
        sourceCounts: { osm: 0, google: 0, bing: 1, yelp: 0, yellowPages: 0 },
        providerDiagnostics: {
          osm: { configured: true, queryExecuted: true, status: "timed_out", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 1, withinRadiusCount: 1, afterDeduplicationCount: 1, usableWebsiteCount: 0 },
          googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        },
        finalMergedCount: 1,
      },
    },
  });
  const joined = recommendations.join(" ");

  assert.match(joined, /Configure Google Places before increasing scan count/);
  assert.doesNotMatch(joined, /Increase scan count/i);
  assert.doesNotMatch(joined, /Florida or Texas Suburbs/i);
});

test("Top Prospects build version safely identifies the deployed commit", () => {
  assert.equal(topProspectBuildVersion({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }), "outreach-package-v1-abcdef1");
  assert.equal(topProspectBuildVersion({ VERCEL_DEPLOYMENT_ID: "deployment-1234567890" }), "outreach-package-v1-deployment-1");
  assert.equal(topProspectBuildVersion({}), "outreach-package-v1");
});

test("No Website / Social Only prospects receive separate presence scoring and ownership-focused artifacts", () => {
  const prospect = structuredClone(seedProspects[0]);
  prospect.businessName = "Local Social Roofing";
  prospect.website = "";
  prospect.profileUrl = "https://www.facebook.com/local-social-roofing";
  prospect.prospectType = "no_website_social_only";
  prospect.email = "";
  prospect.facebookUrl = "https://www.facebook.com/local-social-roofing";
  prospect.recommendedContactMethod = "message_on_facebook";
  prospect.bestManualContactMethod = "facebook";
  prospect.contactConfidence = "medium";
  prospect.phone = "(419) 555-0111";
  prospect.rating = 4.8;
  prospect.reviewCount = 48;
  prospect.recentReviewCount = 3;
  prospect.sourceConfidence = 82;
  prospect.analysis = undefined;

  const scores = calculateNoWebsitePresenceScores(prospect);
  const assessment = assessNoWebsiteOpportunity(prospect);
  const prepared = prepareTopProspectArtifacts(prospect, publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF"));

  assert.ok(scores.onlinePresenceGapScore >= 80);
  assert.ok(scores.businessActivityScore > 0);
  assert.ok(scores.localFitScore > 0);
  assert.ok(scores.finalSalesScore > 0);
  assert.equal(assessment.presenceScores?.websiteNeedScore, scores.websiteNeedScore);
  assert.equal(assessment.salesScores.weightedSalesScore, scores.finalSalesScore);
  assert.equal(assessment.salesScores.websiteQualityScore, 0);
  assert.equal(topProspectRejectionReason(prospect, assessment), null);
  assert.match(prepared.prospect.outreach?.concise ?? "", /dedicated website|simple site/i);
  assert.match(prepared.prospect.outreach?.detailed ?? "", new RegExp(prepared.previewLink.replaceAll("/", "\\/")));
  assert.match(prepared.buildPrompt, /first owned/i);
  assert.match(prepared.assessment.pitchAngle, /beyond Facebook or Google/i);
  assert.doesNotMatch(prepared.prospect.outreach?.detailed ?? "", /licensed|insured|warrant|recent local roofs?/i);
});

test("presence classification and contact recommendations cover public lead shapes", () => {
  assert.equal(classifyProspectPresence({ website: "https://local.example", profileUrl: "", phone: "", email: "", contactFormUrl: "" }), "website_redesign");
  assert.equal(classifyProspectPresence({ website: "", profileUrl: "https://facebook.com/local", phone: "", email: "", contactFormUrl: "" }), "social_only");
  assert.equal(classifyProspectPresence({ website: "", profileUrl: "https://yelp.com/biz/local", phone: "", email: "", contactFormUrl: "" }), "listing_only");
  assert.equal(classifyProspectPresence({ website: "", profileUrl: "", phone: "419-555-0100", email: "", contactFormUrl: "" }), "phone_only");
  assert.equal(recommendProspectContactMethod({ classification: "social_only", profileUrl: "https://facebook.com/local", phone: "", email: "", contactFormUrl: "", inactive: false }), "message_on_facebook");
  assert.equal(recommendProspectContactMethod({ classification: "social_only", profileUrl: "https://instagram.com/local", phone: "", email: "", contactFormUrl: "", inactive: false }), "message_on_social");
  assert.equal(recommendProspectContactMethod({ classification: "no_website", profileUrl: "", phone: "", email: "", contactFormUrl: "https://listing.example/contact", inactive: false }), "submit_contact_form");
  assert.equal(recommendProspectContactMethod({ classification: "no_website", profileUrl: "", phone: "", email: "", contactFormUrl: "", quoteFormUrl: "https://listing.example/free-estimate", inactive: false }), "submit_contact_form");
  assert.equal(recommendProspectContactMethod({ classification: "no_website", profileUrl: "", phone: "", email: "", contactFormUrl: "", facebookUrl: "https://facebook.com/local", inactive: false }), "message_on_facebook");
  assert.equal(recommendProspectContactMethod({ classification: "no_website", profileUrl: "", phone: "", email: "", contactFormUrl: "", linkedinUrl: "https://linkedin.com/company/local", inactive: false }), "message_on_social");
  assert.equal(recommendProspectContactMethod({ classification: "no_website", profileUrl: "", phone: "", email: "hello@example.com", contactFormUrl: "", inactive: false }), "send_email");
  assert.equal(recommendProspectContactMethod({ classification: "phone_only", profileUrl: "", phone: "419-555-0100", email: "", contactFormUrl: "", inactive: false }), "needs_manual_contact_research");
});

test("Top Prospect artifacts remain unapproved and include a detailed builder prompt", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const prepared = prepareTopProspectArtifacts(prospect, publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF"));
  const prompt = generateWebsiteBuildPrompt(prepared.prospect, prepared.assessment);

  assert.equal(prepared.prospect.outreach?.approved, false);
  assert.equal(prepared.prospect.outreach?.subjects.length, 3);
  assert.equal(prepared.prospect.outreach?.followUps.length, 2);
  assert.ok(prepared.prospect.preview);
  assert.match(prepared.previewLink, /^https:\/\/webworkshop\.dev\/p\//);
  assert.doesNotMatch(prepared.prospect.outreach?.concise ?? "", /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(prepared.prospect.outreach?.concise ?? "", /Here's the preview/i);
  assert.match(prepared.prospect.outreach?.concise ?? "", /Would you like me to send it over\?/i);
  assert.match(prepared.prospect.outreach?.detailed ?? "", new RegExp(prepared.previewLink.replaceAll("/", "\\/")));
  assert.equal(prepared.emailQuality.ready, true);
  assert.ok(prepared.assessment.salesScores.weightedSalesScore > 0);
  assert.match(prompt, new RegExp(prospect.businessName));
  assert.match(prompt, /Style profile:/);
  assert.match(prompt, /Palette: primary #[0-9a-f]{6}/i);
  assert.match(prompt, /Primary CTA wording:/);
  assert.match(prompt, /Why this style was selected:/);
  assert.match(prompt, /Do not reuse WebWorkshop branding/i);
  assert.match(prompt, /no invented claims/i);
});

test("public preview tokens are hard to guess and internal preview links fail send-readiness checks", () => {
  const token = createPublicPreviewToken();
  const publicLink = publicProspectPreviewLink(token);
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const publicPackage = prepareTopProspectArtifacts(prospect, publicLink);
  const internalLink = prospectPreviewLink(prospect.id);
  const scoreLeak = {
    ...publicPackage.prospect,
    outreach: {
      ...publicPackage.prospect.outreach!,
      concise: `${publicPackage.prospect.outreach!.concise}\nWebsite score: 82/100`,
    },
  };

  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(publicPackage.emailQuality.ready, true);
  assert.equal(evaluateOutreachEmailQuality(publicPackage.prospect, internalLink).ready, false);
  assert.throws(() => prepareTopProspectArtifacts(prospect, internalLink), /public \/p\/ preview link/i);
  assert.equal(evaluateOutreachEmailQuality(scoreLeak, publicLink).ready, false);
  assert.throws(() => assertOutreachEmailReady(publicPackage.prospect, internalLink), /cannot be approved/i);
  assert.doesNotThrow(() => assertOutreachEmailReady(publicPackage.prospect, publicLink));
});

test("missing sender postal address blocks email send-readiness without adding placeholders", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const prepared = prepareTopProspectArtifacts(withAnalysis(structuredClone(seedProspects[0])), publicLink);
  const quality = evaluateOutreachEmailQuality(prepared.prospect, publicLink, "written_only", {});
  const allDrafts = [
    prepared.prospect.outreach!.concise,
    prepared.prospect.outreach!.detailed,
    ...prepared.prospect.outreach!.followUps,
  ].join("\n");

  assert.equal(quality.ready, false);
  assert.equal(quality.readinessLabel, "Needs sender postal address before sending");
  assert.doesNotMatch(allDrafts, /\[Add your business postal address before sending\]/i);
  assert.doesNotMatch(prepared.prospect.outreach?.concise ?? "", /https:\/\/webworkshop\.dev\/p\//i);
  assert.match(prepared.prospect.outreach?.detailed ?? "", new RegExp(publicLink.replaceAll("/", "\\/")));
  assert.doesNotMatch(allDrafts, /\/engine\/previews\//i);
});

test("suspicious theme/admin emails require manual verification instead of send-ready approval", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "Tampa Roofing Pros";
  prospect.website = "https://tamparoofingpros.com";
  prospect.email = "admin@totalwptheme.com";
  prospect.contactFormUrl = "";
  prospect.quoteFormUrl = "";
  prospect.facebookUrl = "";
  prospect.instagramUrl = "";
  prospect.linkedinUrl = "";
  prospect.recommendedContactMethod = recommendProspectContactMethod(prospect);
  prospect.bestManualContactMethod = "unknown";
  prospect.contactConfidence = "low";
  const prepared = prepareTopProspectArtifacts(prospect, publicLink);
  const quality = evaluateOutreachEmailQuality(prepared.prospect, publicLink);

  assert.equal(prospectEmailNeedsManualVerification(prospect), true);
  assert.equal(prospectEmailNeedsManualVerification({
    businessName: "Ready Pressure Washing",
    website: "https://readypressurewashing.com",
    email: "owner@readypressurewashing.com",
  }), false);
  assert.equal(prospect.recommendedContactMethod, "verify_email_manually");
  assert.equal(quality.ready, false);
  assert.equal(quality.readinessLabel, "Verify email manually");
  assert.ok(quality.issues.some((issue) => /Email address appears business-owned/i.test(issue)));
});

test("unsupported outreach claim is explainable and safely repairable", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const prepared = prepareTopProspectArtifacts(withAnalysis(structuredClone(seedProspects[0])), publicLink);
  const unsafe = {
    ...prepared.prospect,
    outreach: {
      ...prepared.prospect.outreach!,
      concise: prepared.prospect.outreach!.concise.replace(
        /I was looking at [^\n]+/,
        "I reviewed your website while looking at hvac businesses serving Perrysburg.",
      ),
    },
  };
  const unsafeQuality = evaluateOutreachEmailQuality(unsafe, publicLink);
  const unsupportedCheck = unsafeQuality.checks.find((check) => check.key === "supported_facts_only");

  assert.equal(unsafeQuality.ready, false);
  assert.equal(unsafeQuality.readinessLabel, "Unsupported claim");
  assert.match(unsupportedCheck?.phrase ?? "", /I reviewed your website while looking at hvac businesses serving Perrysburg/i);
  assert.match(unsupportedCheck?.reason ?? "", /automated|audit/i);
  assert.match(unsupportedCheck?.suggestion ?? "", /came across/i);

  const repaired = {
    ...unsafe,
    outreach: repairUnsupportedOutreachClaims(unsafe.outreach),
  };
  const repairedQuality = evaluateOutreachEmailQuality(repaired, publicLink);
  assert.equal(repairedQuality.ready, true);
  assert.equal(repairedQuality.readinessLabel, "Send-ready");
  assert.doesNotMatch(repaired.outreach.concise, /I reviewed your website|I analyzed your website|free audit/i);
});

test("Outreach Package approval blocks unsafe no-website contact and unsupported claims", () => {
  const token = createPublicPreviewToken();
  const publicLink = publicProspectPreviewLink(token);
  const prospect = structuredClone(seedProspects[0]);
  prospect.website = "";
  prospect.profileUrl = "https://yelp.com/biz/local-roofing";
  prospect.prospectType = "no_website_social_only";
  prospect.classification = "listing_only";
  prospect.phone = "";
  prospect.email = "";
  prospect.recommendedContactMethod = "needs_manual_contact_research";
  prospect.analysis = undefined;
  const uncontactable = prepareTopProspectArtifacts(prospect, publicLink);
  assert.equal(uncontactable.emailQuality.ready, false);
  assert.ok(uncontactable.emailQuality.issues.some((issue) => /usable written contact method/i.test(issue)));
  assert.equal(evaluateOutreachEmailQuality({ ...uncontactable.prospect, recommendedContactMethod: "call_first" }, publicLink).ready, false);

  const unsafe = {
    ...uncontactable.prospect,
    phone: "419-555-0100",
    recommendedContactMethod: "call_first" as const,
    outreach: {
      ...uncontactable.prospect.outreach!,
      concise: `${uncontactable.prospect.outreach!.concise}\nYour licensed team has award-winning work.`,
    },
  };
  assert.ok(evaluateOutreachEmailQuality(unsafe, publicLink).issues.some((issue) => /unsupported claims/i.test(issue)));
  assert.throws(() => assertOutreachEmailReady(unsafe, publicLink), /cannot be approved/i);
});

test("Outreach Package lifecycle values remain explicit and backwards compatible", () => {
  assert.equal(normalizeOutreachPackageStatus("PACKAGE_GENERATED"), "PACKAGE_GENERATED");
  assert.equal(normalizeOutreachPackageStatus("unknown"), "NOT_GENERATED");
  assert.equal(outreachPackageStatusLabel("PACKAGE_GENERATED"), "Package Generated");
  assert.equal(outreachPackageStatusLabel("READY_FOR_REVIEW"), "Ready for Review");
  assert.equal(outreachPackageStatusLabel("APPROVED_TO_SEND"), "Approved to Send");
  assert.equal(outreachPackageStatusLabel("SENT"), "Sent");
  assert.equal(outreachPackageActionAllowed("PACKAGE_GENERATED", "approve"), true);
  assert.equal(outreachPackageActionAllowed("APPROVED_TO_SEND", "mark_sent"), true);
  assert.equal(outreachPackageActionAllowed("READY_FOR_REVIEW", "mark_sent"), false);
  assert.equal(outreachPackageActionAllowed("SENT", "generate"), false);
});

test("interrupted Top Prospects artifacts can be recovered only by their active job", () => {
  const jobCreatedAt = new Date();
  const prospect = prepareTopProspectArtifacts(
    withAnalysis(structuredClone(seedProspects[0])),
    publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF"),
  ).prospect;
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
