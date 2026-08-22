import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePriority,
  firstTouchEmailDraft,
  generateEmailReviewOutreach,
  generateOutreach,
  generatePreview,
  generateProspectStyleProfile,
  outreachComplianceFooter,
  prospectPresenceLabels,
  previewRegenerationBlockReason,
  PREVIEW_GENERATOR_VERSION,
  regeneratePreview,
  scorePreviewQuality,
  seedProspects,
  sortProspects,
  withAnalysis,
  withOutreach,
  withPresenceGapReview,
  withPreview,
  type Prospect,
} from "../lib/prospect-engine";
import {
  buildProspectFunnel,
  explainProspectBucket,
  prospectCurrentBucket,
  prospectExclusiveBucketKeys,
  prospectFunnelFilterKeys,
  prospectMatchesFunnelFilter,
} from "../lib/prospect-funnel";
import {
  applyManualCallSuppression,
  buildManualCallsQueue,
  callQueueResolutionState,
  manualCallOpportunityScore,
  pendingManualCallsCount,
  prospectCallQueueEligibility,
} from "../lib/calls-queue";
import { classifyWebsiteAnalysisFailure } from "../lib/site-analysis";
import {
  adequateWebsiteCommercialReviewSignals,
  prospectEmailReviewEligibility,
  prospectRoutingDecision,
  reviewOnlyOutreachObservationForProspect,
} from "../lib/prospect-review-routing";
import { outreachObservationSupported, websiteFitAllowsAutonomousOutreach } from "../lib/prospect-qualification";
import { assessManualTopProspectOpportunity, evaluateOutreachEmailQuality } from "../lib/top-prospects";

const testPostalAddress = "123 Main St, Findlay, OH 45840";
const testFooter = [
  "Thanks,",
  "",
  "Brendan",
  "WebWorkshop",
  "",
  testPostalAddress,
  "",
  "If you'd rather not hear from me again, just let me know.",
].join("\n");

function withVerifiedNoOwnedWebsite(prospect: typeof seedProspects[number]) {
  const checkedAt = new Date().toISOString();
  const reviewed = withPresenceGapReview(prospect, "no_owned_website", "Verified public profiles did not identify an owned website.");
  return {
    ...reviewed,
    fitDisposition: "no_owned_website" as const,
    websiteVerification: {
      version: "website-verification-v2" as const,
      status: "no_owned_website" as const,
      confidence: "high" as const,
      canonicalUrl: "",
      attempts: [],
      usableSignals: [],
      explanation: "Verified public profiles did not identify an owned website.",
      checkedAt,
      ownershipDecision: "not_owned" as const,
      identityEvidence: ["The verified business profile did not link to an owned website."],
      fit: {
        disposition: "no_owned_website" as const,
        reason: "No owned website was linked from the verified public business profiles.",
        supportingEvidence: ["The verified business profile did not link to an owned website."],
        confidence: "high" as const,
        analysisOrigin: "not_applicable" as const,
        evaluatedAt: checkedAt,
      },
    },
  };
}

function withVerifiedWeakWebsite(prospect: Prospect, email = "owner@example.com") {
  const checkedAt = new Date().toISOString();
  const website = "https://example.com";
  return {
    ...prospect,
    website,
    email,
    recommendedContactMethod: "send_email" as const,
    bestManualContactMethod: "email" as const,
    websiteStatus: "usable" as const,
    fitDisposition: "clearly_weak_or_outdated_website" as const,
    websiteVerification: {
      version: "website-verification-v2" as const,
      status: "usable" as const,
      confidence: "high" as const,
      canonicalUrl: website,
      attempts: [],
      usableSignals: ["business name"],
      explanation: "The owned website was verified.",
      checkedAt,
      ownershipDecision: "owned" as const,
      identityEvidence: ["The business and domain match."],
      fit: {
        disposition: "clearly_weak_or_outdated_website" as const,
        reason: "Rendered review found a difficult-to-reach quote request.",
        supportingEvidence: ["The primary rendered customer path did not expose the quote request."],
        confidence: "high" as const,
        analysisOrigin: "rendered_review" as const,
        evaluatedAt: checkedAt,
        observation: {
          kind: "quote_path" as const,
          statement: "I noticed the quote request is difficult to reach on the current website.",
          rebuildSentence: "I can rebuild your current website with a more modern design that makes requesting a quote easier while presenting your services and contact information more clearly.",
          evidence: ["Rendered review found no quote action in the primary customer path."],
          demoChecklist: ["Show the improved quote action on desktop and mobile."],
        },
      },
    },
    contactEvidence: [{
      kind: "email" as const,
      value: email,
      sourceUrl: `${website}/contact`,
      extractionMethod: "mailto" as const,
      confidence: "high" as const,
      domainMatchesBusiness: true,
      discoveredAt: checkedAt,
      sourceType: "owned_website" as const,
      firstParty: true,
      decision: "autonomous_eligible" as const,
      decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
    }],
  } as Prospect;
}

function withEmailReviewCandidate() {
  const prospect = withVerifiedWeakWebsite(withAnalysis(structuredClone(seedProspects[0])));
  prospect.fitDisposition = "inconclusive_requires_review";
  prospect.websiteVerification = {
    ...prospect.websiteVerification!,
    fit: {
      ...prospect.websiteVerification!.fit!,
      disposition: "inconclusive_requires_review",
      reason: "The rendered evidence supports human redesign review but not autonomous qualification.",
    },
  };
  return prospect;
}

function withAdequateCommercialReviewCandidate() {
  const prospect = withVerifiedWeakWebsite(withAnalysis(structuredClone(seedProspects[0])));
  prospect.fitDisposition = "adequate_existing_website";
  prospect.analysis = {
    ...prospect.analysis!,
    scores: {
      ...prospect.analysis!.scores,
      contactAccessibility: 52,
      ctaStrength: 58,
      conversionReadiness: 82,
      portfolioQuality: 84,
      trustSignals: 86,
      technicalQuality: 88,
    },
  };
  prospect.websiteVerification = {
    ...prospect.websiteVerification!,
    fit: {
      ...prospect.websiteVerification!.fit!,
      disposition: "adequate_existing_website",
      reason: "The website is structurally complete, while bounded commercial signals merit human review.",
    },
  };
  return prospect;
}

test("centralized prospect email footer includes the complete required sender identity", () => {
  assert.equal(outreachComplianceFooter({ ...process.env, WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress }), [
    "Thanks,",
    "",
    "Brendan Wishart",
    "WebWorkshop",
    "webworkshop.dev",
    "",
    testPostalAddress,
    "",
    "If you'd rather not hear from me again, just let me know.",
  ].join("\n"));
});

test("human-review routing excludes protected and non-email prospects", () => {
  const candidate = withEmailReviewCandidate();
  assert.equal(prospectEmailReviewEligibility(candidate).eligible, true);
  assert.equal(prospectRoutingDecision(candidate).sending, "Review Only");
  assert.equal(prospectEmailReviewEligibility({ ...candidate, notes: ["No outreach was sent."] }).eligible, true);

  const blocked = [
    { ...candidate, status: "Contacted" as const },
    { ...candidate, recommendedContactMethod: "do_not_contact" as const, notes: ["Suppressed by operator."] },
    { ...candidate, recommendedContactMethod: "call_first" as const },
    { ...candidate, classification: "phone_only" as const },
    { ...candidate, inactive: true },
    { ...candidate, classification: "national_large_brand" as const },
    { ...candidate, notes: ["Supplier / distributor record."] },
    { ...candidate, notes: ["Duplicate record."] },
  ];
  for (const prospect of blocked) {
    assert.equal(prospectEmailReviewEligibility(prospect).eligible, false);
    assert.equal(prospectRoutingDecision(prospect).sending, "Blocked");
  }
});

test("human-review outreach uses the saved observation without becoming strict send eligible", () => {
  const prospect = withEmailReviewCandidate();
  const testEnvironment = { ...process.env, WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress };
  const outreach = generateEmailReviewOutreach(prospect, testEnvironment);
  const prepared = { ...prospect, outreach };
  const observation = prospect.websiteVerification?.fit?.observation;

  assert.ok(observation);
  assert.match(outreach.concise, new RegExp(observation.statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(outreach.concise, new RegExp(observation.rebuildSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(outreachObservationSupported(prepared, outreach.concise), true);
  assert.equal(evaluateOutreachEmailQuality(prepared, "", "written_only", testEnvironment).ready, true);
  assert.equal(prospectRoutingDecision(prepared).sending, "Review Only");
});

test("commercially improvable adequate websites enter only the human email review lane", () => {
  const prospect = withAdequateCommercialReviewCandidate();
  const eligibility = prospectEmailReviewEligibility(prospect);
  const routing = prospectRoutingDecision(prospect);
  const observation = reviewOnlyOutreachObservationForProspect(prospect);
  const outreach = generateEmailReviewOutreach(prospect, { ...process.env, WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.deepEqual(adequateWebsiteCommercialReviewSignals(prospect).map((signal) => signal.key), [
    "contact_accessibility",
    "cta_strength",
  ]);
  assert.equal(eligibility.eligible, true);
  assert.deepEqual(routing, { opportunity: "Needs Review", email: "Ready", sending: "Review Only" });
  assert.equal(websiteFitAllowsAutonomousOutreach(prospect), false);
  assert.ok(observation);
  assert.match(outreach.concise, /had a couple ideas/i);
  assert.match(outreach.concise, /contact|estimate/i);
  assert.match(outreach.concise, /Would you be open to me putting together a quick website concept around your current services and branding\?/i);
  assert.doesNotMatch(outreach.concise, /I can rebuild your current website/i);
  assert.doesNotMatch(outreach.concise, /Would you be interested in seeing what that could look like\?/i);
  assert.doesNotMatch(outreach.concise, /\b(?:bad|outdated|losing leads|defective)\b/i);
  assert.equal(outreach.approved, false);
  assert.equal(evaluateOutreachEmailQuality({ ...prospect, outreach }, "", "written_only", { ...process.env, WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress }).ready, true);
  assert.equal(assessManualTopProspectOpportunity(prospect, {
    manualReviewOnly: false,
    manualOpportunityReason: "",
    strictRequirementFailed: "",
    sources: ["google"],
  })?.kind, "existing_site_observation");
});

test("adequate websites require two bounded signals including a commercial path signal", () => {
  const oneSignal = withAdequateCommercialReviewCandidate();
  oneSignal.analysis = {
    ...oneSignal.analysis!,
    scores: { ...oneSignal.analysis!.scores, ctaStrength: 80 },
  };
  assert.deepEqual(adequateWebsiteCommercialReviewSignals(oneSignal), []);
  assert.equal(prospectEmailReviewEligibility(oneSignal).eligible, false);
  assert.deepEqual(prospectRoutingDecision(oneSignal), { opportunity: "Not a Fit", email: "Ready", sending: "Blocked" });

  const nonCommercialSignals = withAdequateCommercialReviewCandidate();
  nonCommercialSignals.analysis = {
    ...nonCommercialSignals.analysis!,
    scores: {
      ...nonCommercialSignals.analysis!.scores,
      contactAccessibility: 90,
      ctaStrength: 90,
      portfolioQuality: 40,
      trustSignals: 40,
    },
  };
  assert.deepEqual(adequateWebsiteCommercialReviewSignals(nonCommercialSignals), []);
  assert.equal(prospectEmailReviewEligibility(nonCommercialSignals).eligible, false);
  assert.deepEqual(prospectRoutingDecision(nonCommercialSignals), { opportunity: "Not a Fit", email: "Ready", sending: "Blocked" });
});

test("production-like strong adequate sites and unsafe adequate records stay blocked", () => {
  const strongAdequate = withAdequateCommercialReviewCandidate();
  strongAdequate.businessName = "Dependable Painting & Remodeling";
  strongAdequate.analysis = {
    ...strongAdequate.analysis!,
    scores: {
      ...strongAdequate.analysis!.scores,
      ctaStrength: 100,
      trustSignals: 96,
      contactAccessibility: 66,
      portfolioQuality: 100,
      conversionReadiness: 85,
      technicalQuality: 95,
    },
  };
  assert.equal(strongAdequate.fitDisposition, "adequate_existing_website");
  assert.equal(strongAdequate.websiteVerification?.fit?.disposition, "adequate_existing_website");
  assert.deepEqual(adequateWebsiteCommercialReviewSignals(strongAdequate), []);
  assert.equal(prospectEmailReviewEligibility(strongAdequate).eligible, false);
  assert.deepEqual(prospectRoutingDecision(strongAdequate), { opportunity: "Not a Fit", email: "Ready", sending: "Blocked" });
  assert.equal(websiteFitAllowsAutonomousOutreach(strongAdequate), false);

  const adequate = withAdequateCommercialReviewCandidate();
  const unsafe = [
    {
      ...adequate,
      websiteVerification: {
        ...adequate.websiteVerification!,
        identitySignals: [...(adequate.websiteVerification?.identitySignals ?? []), "public_phone_conflict"],
      },
    },
    { ...adequate, email: "unverified@gmail.com" },
    { ...adequate, notes: ["Duplicate record."] },
  ] satisfies Prospect[];
  for (const prospect of unsafe) {
    assert.equal(prospectEmailReviewEligibility(prospect).eligible, false);
    assert.equal(prospectRoutingDecision(prospect).sending, "Blocked");
  }
});

test("strict email routing uses the same protected and contact-route guards as the backend", () => {
  const candidate = withVerifiedWeakWebsite(withAnalysis(structuredClone(seedProspects[0])));
  assert.equal(prospectRoutingDecision(candidate).sending, "Strict Email Eligible");

  for (const prospect of [
    { ...candidate, inactive: true },
    { ...candidate, classification: "national_large_brand" as const },
    { ...candidate, classification: "duplicate_bad_fit" as const },
    { ...candidate, recommendedContactMethod: "message_on_social" as const },
    { ...candidate, recommendedContactMethod: "do_not_contact" as const },
    { ...candidate, notes: ["Recipient opted out."] },
  ]) {
    assert.equal(prospectRoutingDecision(prospect).sending, "Blocked");
  }
});

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
  assert.match(outreach.concise, /Thanks,\n\nBrendan Wishart\nWebWorkshop\nwebworkshop\.dev/i);
  assert.match(outreach.concise, new RegExp(testPostalAddress));
  assert.doesNotMatch(outreach.concise, /\[Add your business postal address before sending\]/i);
  assert.match(outreach.concise, /rather not hear from me again/i);
  assert.equal(outreach.subjects.length, 3);
  assert.equal(outreach.followUps.length, 2);
  assert.ok(outreach.followUps.every((followUp) => /rather not hear from me again/i.test(followUp)));
  assert.ok(outreach.followUps.every((followUp) => /follow up|last note/i.test(followUp)));
  assert.doesNotMatch(outreach.followUps.join("\n"), /happy to send/i);
});

test("Outreach Package uses truthful permission-first copy before a manual build", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "MC Pressure Washing FL";
  prospect.trade = "Pressure Washing";
  prospect.city = "Tampa";
  const previewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";
  const outreach = generateOutreach(prospect, previewLink, { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });
  const allDrafts = [outreach.concise, outreach.detailed, ...outreach.followUps].join("\n");

  assert.equal(outreach.subjects[0], "Quick website idea for MC Pressure Washing FL");
  assert.match(outreach.concise, /I came across MC Pressure Washing FL while looking at pressure-washing businesses around Tampa/i);
  assert.match(outreach.concise, /rebuild your current website with a more modern design/i);
  assert.match(outreach.concise, /services, contact information, and quote request easier for customers to find/i);
  assert.match(outreach.concise, /Would you be interested in seeing what that could look like\?/i);
  assert.doesNotMatch(outreach.concise, /https?:\/\/|\/p\//i);
  assert.doesNotMatch(outreach.concise, /\b(?:I|we)\s+(?:built|made|created|put together)\b.{0,60}\bpreview\b/i);
  assert.match(outreach.detailed, /I'll put together a website concept and send you a quick video walkthrough when it's ready/i);
  assert.doesNotMatch(outreach.detailed, new RegExp(previewLink.replaceAll("/", "\\/")));
  assert.match(outreach.concise, /Thanks,\n\nBrendan Wishart\nWebWorkshop\nwebworkshop\.dev/i);
  assert.match(outreach.concise, new RegExp(testPostalAddress));
  assert.match(outreach.concise, /rather not hear from me again/i);
  assert.doesNotMatch(allDrafts, /One missed opportunity:|One thing that already works well:|customer proof you can verify|trust details could be easier/i);
  assert.doesNotMatch(allDrafts, /\b\d{1,3}\s*\/\s*100\b|\bscore\b/i);
  assert.doesNotMatch(allDrafts, /I reviewed your website|I analyzed your website|free audit|problems|mistakes|your website is bad/i);
  assert.doesNotMatch(allDrafts, /\bwill get you more calls/i);
  assert.ok(outreach.followUps.every((followUp) => !followUp.includes(previewLink)));
});

test("first-touch email wording matches the manual Lovable permission-first templates", () => {
  const hasWebsite = withAnalysis(structuredClone(seedProspects[0]));
  hasWebsite.businessName = "Styles Power Wash";
  hasWebsite.trade = "Pressure Washing";
  hasWebsite.city = "St Augustine";

  assert.equal(firstTouchEmailDraft(hasWebsite, testFooter), [
  "Hi Styles Power Wash team,",
  "",
  "I'm Brendan, and I build websites for local service businesses. I came across Styles Power Wash while looking at pressure-washing businesses around St Augustine.",
  "",
  "I can rebuild your current website with a more modern design that better represents your business and makes your services, contact information, and quote request easier for customers to find.",
  "",
  "Would you be interested in seeing what that could look like?",
  "",
  testFooter,
].join("\n"));

const noWebsite = withVerifiedNoOwnedWebsite({ ...structuredClone(seedProspects[0]), businessName: "ClearFlow Plumbing", trade: "Plumbing", city: "Toledo", website: "" });
assert.equal(firstTouchEmailDraft(noWebsite, testFooter), [
  "Hi ClearFlow Plumbing team,",
  "",
  "I'm Brendan, based in Findlay, and I build websites for local service businesses. I came across ClearFlow Plumbing while looking at plumbing businesses around Toledo.",
  "",
  "I couldn't find a dedicated website linked from the business's public profiles.",
  "",
  "I can build you a modern website from the ground up that clearly presents your services and makes it easier for customers to call or request a quote.",
  "",
  "Would you be interested in seeing what that could look like?",
  "",
  testFooter,
].join("\n"));
});


test("first-touch email uses the saved contact first name and never infers one from the email address", () => {
  const checkedAt = "2026-08-04T12:00:00.000Z";
  const prospect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Pinnacle Pressure Washing of Toledo",
    trade: "Pressure Washing",
    city: "Toledo",
    website: "https://pinnacle419.com",
    websiteStatus: "usable",
    websiteVerification: {
      version: "website-verification-v2" as const,
      status: "usable" as const,
      confidence: "high" as const,
      canonicalUrl: "https://pinnacle419.com",
      attempts: [],
      usableSignals: ["business name"],
      explanation: "The owned website was verified.",
      checkedAt,
      ownershipDecision: "owned" as const,
      identityEvidence: ["The business and domain match."],
      fit: {
        disposition: "inconclusive_requires_review" as const,
        reason: "Rendered review is pending.",
        supportingEvidence: [],
        confidence: "low" as const,
        analysisOrigin: "automated_html" as const,
        evaluatedAt: checkedAt,
      },
    },
    email: "nick@pinnacle419.com",
    contactPersonName: "Nick Smith",
    contactEvidence: [{
      kind: "contact_person" as const,
      value: "Nick Smith",
      sourceUrl: "https://pinnacle419.com/contact",
      extractionMethod: "visible_text" as const,
      confidence: "high" as const,
      domainMatchesBusiness: true,
      discoveredAt: checkedAt,
      sourceType: "owned_website" as const,
      firstParty: true,
      decision: "autonomous_eligible" as const,
      decisionReason: "The contact page explicitly names Nick Smith as the business contact.",
    }],
  });

  assert.match(firstTouchEmailDraft(prospect, testFooter), /^Hi Nick,/);
  assert.match(firstTouchEmailDraft({ ...prospect, contactEvidence: [] }, testFooter), /^Hi Pinnacle Pressure Washing of Toledo team,/);
});

test("permission-first outreach avoids repeating the business name and stays link-free", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "Styles Power Wash";
  prospect.trade = "Pressure Washing";
  prospect.city = "St Augustine";
  const previewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";
  const outreach = generateOutreach(prospect, previewLink, { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.match(outreach.concise, /Hi Styles Power Wash team,\n\nI'm Brendan, and I build websites for local service businesses\. I came across Styles Power Wash while looking at pressure-washing businesses around St Augustine\./);
  assert.doesNotMatch(outreach.concise, /Hi Styles Power Wash team,\n\n[^.]+Styles Power Wash[^.]+Styles Power Wash/i);
  assert.doesNotMatch(outreach.concise, /https?:\/\/|\/p\//i);
  assert.doesNotMatch(outreach.detailed, new RegExp(previewLink.replaceAll("/", "\\/")));
  assert.match(outreach.detailed, /I'll put together a website concept and send you a quick video walkthrough/i);
  assert.match(outreach.detailed, /Thanks,\n\nBrendan Wishart\nWebWorkshop\nwebworkshop\.dev/i);
  assert.match(outreach.detailed, new RegExp(testPostalAddress));
  assert.match(outreach.detailed, /rather not hear from me again/i);
});

test("outreach drafts omit postal-address placeholders when sender address is missing", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const outreach = generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", {});
  const allDrafts = [outreach.concise, outreach.detailed, ...outreach.followUps].join("\n");

  assert.doesNotMatch(allDrafts, /\[Add your business postal address before sending\]/i);
  assert.match(outreach.concise, /Thanks,\n\nBrendan Wishart\nWebWorkshop\nwebworkshop\.dev/i);
  assert.match(outreach.concise, /If you'd rather not hear from me again/i);
});

test("outreach avoids analytical strength claims for weak websites", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  for (const key of Object.keys(prospect.analysis!.scores) as Array<keyof typeof prospect.analysis.scores>) {
    prospect.analysis!.scores[key] = 25;
  }
  const outreach = generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.match(outreach.concise, /rebuild your current website with a more modern design/i);
  assert.match(outreach.concise, /Would you be interested in seeing what that could look like\?/i);
  assert.doesNotMatch(outreach.concise, /https?:\/\/|\/p\//i);
  assert.doesNotMatch(outreach.concise, /already pretty easy|solid technical foundation/i);
  assert.doesNotMatch(outreach.concise, /One thing that already works well|One missed opportunity/i);
});

test("preview concepts include contractor-specific conversion strategy", () => {
  const prospect = structuredClone(seedProspects[2]);
  const preview = generatePreview(prospect);

  assert.match(preview.direction, /landscaping/i);
  assert.match(preview.ctaStrategy, /request an estimate/i);
  assert.ok(preview.homepageStructure.length >= 5);
  assert.ok(preview.servicePageStructure.length >= 5);
  assert.match(preview.visualStyleDirection, /outdoor spaces/i);
  assert.ok(preview.styleProfile);
  assert.ok(preview.artDirection);
  assert.equal(preview.previewVersion, "v3");
  assert.equal(preview.creativeBrief?.businessName, prospect.businessName);
  assert.equal(preview.creativeBrief?.imagerySource, "curated stock photo library");
  assert.equal(preview.resolvedImages?.sourceStatus, "curated stock photo library");
  assert.match(preview.resolvedImages?.hero.src ?? "", /(?:\/engine-preview-assets\/trade-photos\/|images\.unsplash\.com\/photo-|upload\.wikimedia\.org\/wikipedia\/commons)/);
  assert.ok((preview.resolvedImages?.services ?? []).every((image) => image.source === "curated-stock-photo-library"));
  assert.ok(preview.layoutDirection);
  assert.match(preview.creativeBrief?.visualDirection ?? "", /locally credible|approachable|polished|sturdy|established/i);
  assert.ok(preview.qualityScore);
  assert.ok(preview.qualityScore.overall >= 85);
  assert.ok(preview.qualityScore.visualPolish >= 85);
  assert.ok(preview.qualityScore.safetyTruthfulness >= 90);
  assert.match(preview.artDirection?.imageTreatment ?? "", /large landscaping hero photo|distinct service/i);
  assert.match(preview.artDirection?.sectionFlow ?? "", /hero -> services/);
  assert.equal(preview.renderPlan?.version, "render-plan-v1");
  assert.ok((preview.artDirection?.imageryPlan ?? []).length >= 5);
  assert.match(preview.artDirection?.interactiveFeatures.join(" ") ?? "", /FAQ accordion|gallery lightbox|quote form browser validation|sticky mobile quote CTA/i);
  assert.match(preview.qualityScore.notes.join(" "), /prospect-specific style rationale|stronger CTA treatment/i);
  assert.ok(preview.heroHeadline);
  assert.equal(preview.styleProfile?.ctaLabel, "Request an estimate");
  assert.match(preview.homepageStructure.join(" "), /strong trade photo|distinct service photos/i);
  assert.match(preview.portfolioDirection, /verified photos|project photos/i);
});

test("preview quality flags generic imagery and missing art direction", () => {
  const prospect = structuredClone(seedProspects[5]);
  const strong = generatePreview(prospect);
  const weak = {
    ...strong,
    artDirection: undefined,
    visualStyleDirection: "Use repeated placeholder art and a generic filler layout.",
    homepageStructure: ["Generic service cards", "Generic service cards", "Same image repeated"],
    servicePageStructure: ["Generic services"],
  };

  const score = scorePreviewQuality(prospect, weak);

  assert.ok(score.overall < (strong.qualityScore?.overall ?? 100));
  assert.ok(score.visualPolish < 85);
  assert.match(score.notes.join(" "), /imagery sounds generic|section rhythm needs more visual variety|art direction metadata is missing|mobile-friendly interactions/i);
});

test("preview quality keeps mismatched real imagery out of send-worthy status", () => {
  const prospect = {
    ...structuredClone(seedProspects[5]),
    businessName: "MC Pressure Washing FL",
    trade: "Pressure Washing",
    city: "Tampa",
    state: "FL",
  };
  const preview = generatePreview(prospect);
  const mismatchedPreview = {
    ...preview,
    artDirection: {
      ...preview.artDirection!,
      qaWarnings: [
        ...(preview.artDirection?.qaWarnings ?? []),
        "House washing image reads as municipal, industrial, or street-cleaning instead of residential exterior cleaning.",
      ],
    },
  };

  const score = scorePreviewQuality(prospect, mismatchedPreview);

  assert.notEqual(score.status, "Send-worthy / polished");
  assert.match(score.notes.join(" "), /imagery sounds generic|random|placeholder/i);
});

test("preview generation normalizes city and state capitalization", () => {
  const preview = generatePreview({
    ...structuredClone(seedProspects[0]),
    trade: "HVAC",
    city: "toledo",
    state: "oh",
    serviceArea: "toledo and nearby communities",
  });

  assert.match(`${preview.heroHeadline} ${preview.heroSupporting}`, /Toledo/);
  assert.match(preview.hero, /Toledo and nearby communities/);
  assert.match(preview.heroSupporting ?? "", /Toledo and nearby communities/);
  assert.doesNotMatch(`${preview.hero} ${preview.heroSupporting}`, /\btoledo\b/);
});

test("preview generation creates a structured photo-led business design brief", () => {
  const preview = generatePreview({
    ...structuredClone(seedProspects[0]),
    businessName: "MC Pressure Washing FL",
    trade: "Pressure Washing",
    city: "Tampa",
    state: "FL",
    email: "hello@mcpressure.test",
    recommendedContactMethod: "send_email",
  });

  assert.equal(preview.previewVersion, "v3");
  assert.equal(preview.businessProfile?.officialBusinessName, "MC Pressure Washing FL");
  assert.equal(preview.businessProfile?.primaryMarket, "Tampa, FL");
  assert.equal(preview.businessProfile?.primaryService, "Pressure Washing");
  assert.equal(preview.businessProfile?.logo.status, "wordmark_fallback");
  assert.match(preview.businessProfile?.logo.note ?? "", /instead of inventing a logo/i);
  assert.ok((preview.businessProfile?.sourceFacts.length ?? 0) >= 4);
  assert.ok(preview.businessProfile?.sourceFacts.every((fact) => ["verified", "inferred", "unavailable"].includes(fact.confidence)));
  assert.equal(preview.creativeBrief?.businessName, "MC Pressure Washing FL");
  assert.equal(preview.creativeBrief?.primaryService, "Pressure Washing");
  assert.match(preview.creativeBrief?.verifiedEmailOrContactPath ?? "", /public email/);
  assert.match(preview.creativeBrief?.imageIntents.join(" ") ?? "", /Hero: .*pressure washer|Hero: .*pressure washing/i);
  assert.equal(preview.resolvedImages?.sourceStatus, "curated stock photo library");
  assert.match(preview.resolvedImages?.hero.src ?? "", /(?:\/engine-preview-assets\/trade-photos\/|images\.(?:unsplash|pexels)\.com\/|upload\.wikimedia\.org\/wikipedia\/commons)/);
  assert.match(preview.creativeBrief?.copyRestrictions.join(" ") ?? "", /Do not invent reviews/);
  assert.match(preview.heroHeadline ?? "", /cleaner exterior|Pressure Washing|surfaces people notice/i);
  assert.ok((preview.qualityScore?.imageQuality ?? 0) >= 50);
  assert.ok((preview.resolvedImages?.heroCandidates.length ?? 0) >= 2);
  assert.ok(["Send-worthy / polished", "Needs visual review", "Needs regeneration"].includes(preview.qualityScore?.status ?? ""));
});

test("preview regeneration uses latest generator, records feedback, and sends nothing", () => {
  const prospect = withPreview(withAnalysis(structuredClone(seedProspects[0])));
  prospect.preview = { ...prospect.preview!, previewVersion: "v2" };
  const regenerated = regeneratePreview(prospect, "make it darker, more premium, and add certified five-star claims");

  assert.equal(PREVIEW_GENERATOR_VERSION, "photo-led-v3");
  assert.equal(regenerated.preview?.previewVersion, "v3");
  assert.match(regenerated.activities[0].label, /Preview regenerated/);
  assert.match(regenerated.preview?.regenerationFeedbackHistory?.[0] ?? "", /darker, more premium/i);
  assert.doesNotMatch(regenerated.preview?.regenerationFeedbackHistory?.[0] ?? "", /certified|five-star/i);
  assert.equal(regenerated.outreach?.approved ?? false, false);
});

test("preview regeneration blocks contacted or suppressed records before mutation", () => {
  const contacted = withPreview(withAnalysis({
    ...structuredClone(seedProspects[0]),
    status: "Contacted",
  }));
  const suppressed = withPreview(withAnalysis({
    ...structuredClone(seedProspects[0]),
    recommendedContactMethod: "do_not_contact",
    activities: [
      ...seedProspects[0].activities,
      { id: "suppression-test", type: "status", label: "Prospect opted out. Never contact.", at: new Date().toISOString() },
    ],
  }));

  assert.match(previewRegenerationBlockReason(contacted), /already contacted/i);
  assert.match(previewRegenerationBlockReason(suppressed), /do not contact|suppression/i);
  assert.throws(() => regeneratePreview(contacted), /Preview regeneration blocked/i);
  assert.throws(() => regeneratePreview(suppressed), /Preview regeneration blocked/i);
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
  const emailReady = withVerifiedWeakWebsite(withAnalysis(structuredClone(seedProspects[0])));
  const facebookReady = withVerifiedNoOwnedWebsite({ ...structuredClone(seedProspects[1]), email: "" });
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
  assert.equal(funnel.diagnostics.difference, 0);
  assert.equal(Object.values(funnel.exclusiveBuckets).reduce((sum, count) => sum + count, 0), prospects.length);
  for (const prospect of prospects) {
    const matchingExclusiveBuckets = prospectExclusiveBucketKeys.filter((key) => prospectMatchesFunnelFilter(prospect, key));
    assert.deepEqual(matchingExclusiveBuckets, [prospectCurrentBucket(prospect)]);
  }
  for (const key of prospectExclusiveBucketKeys) {
    const ids = prospects.filter((prospect) => prospectMatchesFunnelFilter(prospect, key)).map((prospect) => prospect.id);
    assert.equal(new Set(ids).size, ids.length, `unique ids for ${key}`);
    assert.equal(funnel.exclusiveBuckets[key], ids.length, `exclusive count for ${key}`);
  }
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

test("every actionable written route requires a current evidence-backed rebuild opportunity", () => {
  const verifiedWeak = withVerifiedWeakWebsite(withAnalysis(structuredClone(seedProspects[0])));
  const manualBase = {
    ...verifiedWeak,
    email: "",
    contactEvidence: [],
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    profileUrl: "",
    contactFormUrl: "",
    quoteFormUrl: "",
    contactFormDetected: false,
    quoteFormDetected: false,
    recommendedContactMethod: "verify_email_manually" as const,
    bestManualContactMethod: "unknown" as const,
  } satisfies Prospect;
  const inconclusiveBase = {
    ...manualBase,
    fitDisposition: "inconclusive_requires_review" as const,
    websiteStatus: "inconclusive" as const,
    websiteVerification: {
      ...manualBase.websiteVerification!,
      status: "inconclusive" as const,
      confidence: "low" as const,
      ownershipDecision: "unresolved" as const,
      fit: {
        disposition: "inconclusive_requires_review" as const,
        reason: "Current ownership and website-fit evidence is incomplete.",
        supportingEvidence: [],
        confidence: "low" as const,
        analysisOrigin: "metadata" as const,
        evaluatedAt: new Date().toISOString(),
      },
    },
  } satisfies Prospect;
  const inconclusiveRoutes: Prospect[] = [
    { ...inconclusiveBase, id: "inconclusive-facebook", facebookUrl: "https://facebook.com/example", recommendedContactMethod: "message_on_facebook" },
    { ...inconclusiveBase, id: "inconclusive-instagram", instagramUrl: "https://instagram.com/example", profileUrl: "https://instagram.com/example", recommendedContactMethod: "message_on_social" },
    { ...inconclusiveBase, id: "inconclusive-contact-form", contactFormUrl: "https://example.com/contact", contactFormDetected: true, recommendedContactMethod: "submit_contact_form" },
    { ...inconclusiveBase, id: "inconclusive-quote-form", quoteFormUrl: "https://example.com/quote", quoteFormDetected: true },
  ];
  const legacyRoutes: Prospect[] = [
    { ...manualBase, id: "legacy-facebook", websiteVerification: undefined, fitDisposition: "inconclusive_requires_review", facebookUrl: "https://facebook.com/legacy", recommendedContactMethod: "message_on_facebook" },
    { ...manualBase, id: "legacy-contact-form", websiteVerification: undefined, fitDisposition: "inconclusive_requires_review", contactFormUrl: "https://example.com/contact", contactFormDetected: true, recommendedContactMethod: "submit_contact_form" },
  ];

  for (const prospect of [...inconclusiveRoutes, ...legacyRoutes]) {
    assert.equal(prospectCurrentBucket(prospect), "other_not_actionable", prospect.id);
    assert.equal(prospectMatchesFunnelFilter(prospect, "qualified_unsent"), false, prospect.id);
  }

  for (const disposition of ["adequate_existing_website", "strong_existing_website"] as const) {
    const prospect = {
      ...manualBase,
      id: `${disposition}-all-routes`,
      email: "owner@example.com",
      facebookUrl: "https://facebook.com/example",
      instagramUrl: "https://instagram.com/example",
      contactFormUrl: "https://example.com/contact",
      fitDisposition: disposition,
      websiteVerification: {
        ...manualBase.websiteVerification!,
        fit: {
          ...manualBase.websiteVerification!.fit!,
          disposition,
        },
      },
    } satisfies Prospect;
    assert.equal(prospectCurrentBucket(prospect), "website_already_strong");
    assert.equal(prospectMatchesFunnelFilter(prospect, "qualified_unsent"), false);
  }
});

test("verified rebuild opportunities may use manual routes while email keeps its stricter evidence gate", () => {
  const verifiedWeak = withVerifiedWeakWebsite(withAnalysis(structuredClone(seedProspects[0])));
  const manualBase = {
    ...verifiedWeak,
    email: "",
    contactEvidence: [],
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    profileUrl: "",
    contactFormUrl: "",
    quoteFormUrl: "",
    contactFormDetected: false,
    quoteFormDetected: false,
    recommendedContactMethod: "verify_email_manually" as const,
    bestManualContactMethod: "unknown" as const,
  } satisfies Prospect;
  const verifiedWeakFacebook = {
    ...manualBase,
    id: "verified-weak-facebook",
    facebookUrl: "https://facebook.com/verified-weak",
    recommendedContactMethod: "message_on_facebook" as const,
  } satisfies Prospect;
  const verifiedBrokenInstagram = {
    ...manualBase,
    id: "verified-broken-instagram",
    websiteStatus: "confirmed_broken" as const,
    fitDisposition: "broken_or_inactive_website" as const,
    instagramUrl: "https://instagram.com/verified-broken",
    profileUrl: "https://instagram.com/verified-broken",
    recommendedContactMethod: "message_on_social" as const,
    websiteVerification: {
      ...manualBase.websiteVerification!,
      status: "confirmed_broken" as const,
      fit: {
        ...manualBase.websiteVerification!.fit!,
        disposition: "broken_or_inactive_website" as const,
      },
    },
  } satisfies Prospect;
  const verifiedNoOwnedForm = {
    ...withVerifiedNoOwnedWebsite(structuredClone(seedProspects[1])),
    id: "verified-no-owned-form",
    email: "",
    contactEvidence: [],
    facebookUrl: "",
    instagramUrl: "",
    profileUrl: "",
    contactFormUrl: "https://facebook.com/verified-business/contact",
    contactFormDetected: true,
    quoteFormUrl: "",
    quoteFormDetected: false,
    status: "Reviewed" as const,
    priorityScore: 72,
    recommendedContactMethod: "submit_contact_form" as const,
    bestManualContactMethod: "contact_form" as const,
  } satisfies Prospect;
  const unverifiedEmail = {
    ...manualBase,
    id: "verified-fit-unverified-email",
    email: "owner@example.com",
    recommendedContactMethod: "send_email" as const,
    bestManualContactMethod: "email" as const,
  } satisfies Prospect;

  assert.equal(prospectCurrentBucket(verifiedWeakFacebook), "ready_facebook");
  assert.equal(prospectCurrentBucket(verifiedBrokenInstagram), "ready_instagram");
  assert.equal(prospectCurrentBucket(verifiedNoOwnedForm), "ready_contact_form");
  assert.equal(prospectCurrentBucket(unverifiedEmail), "other_not_actionable");
  assert.equal(prospectMatchesFunnelFilter(unverifiedEmail, "ready_email"), false);
});

test("Phone Only requires a phone and no usable written contact path", () => {
  const phoneOnly = { ...structuredClone(seedProspects[1]), phone: "(419) 555-0100", email: "", facebookUrl: "", instagramUrl: "", contactFormUrl: "", quoteFormUrl: "", recommendedContactMethod: "call_first" as const };
  const emailPlusPhone = { ...phoneOnly, id: "email-plus-phone", email: "owner@example.com", recommendedContactMethod: "send_email" as const };
  const facebookPlusPhone = { ...phoneOnly, id: "facebook-plus-phone", facebookUrl: "https://facebook.com/example", recommendedContactMethod: "message_on_facebook" as const };

  assert.equal(prospectCurrentBucket(phoneOnly), "phone_only");
  assert.notEqual(prospectCurrentBucket(emailPlusPhone), "phone_only");
  assert.notEqual(prospectCurrentBucket(facebookPlusPhone), "phone_only");
});

test("manual Calls queue only includes high-priority phone-only prospects needing operator calls", () => {
  const phoneOnly = {
    ...structuredClone(seedProspects[1]),
    id: "phone-only-call",
    phone: "(419) 555-0100",
    email: "",
    contactFormUrl: "",
    quoteFormUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    classification: "phone_only" as const,
    recommendedContactMethod: "call_first" as const,
    bestManualContactMethod: "phone_only" as const,
    priorityScore: 91,
    rating: 4.8,
    reviewCount: 44,
    status: "Reviewed" as const,
  };
  const emailReady = {
    ...phoneOnly,
    id: "email-ready-call-excluded",
    email: "owner@example.com",
    recommendedContactMethod: "send_email" as const,
    bestManualContactMethod: "email" as const,
  };
  const lowPriorityPhone = { ...phoneOnly, id: "low-priority-phone", priorityScore: 60 };
  const contactedPhone = { ...phoneOnly, id: "contacted-phone", status: "Contacted" as const };
  const protectedPhoneProspects: Prospect[] = [
    contactedPhone,
    { ...phoneOnly, id: "suppressed-phone", notes: ["Suppressed by operator."] },
    { ...phoneOnly, id: "duplicate-phone", notes: ["Duplicate record."] },
    { ...phoneOnly, id: "bad-fit-phone", classification: "national_large_brand" as const },
    {
      ...phoneOnly,
      id: "identity-conflict-phone",
      websiteVerification: {
        ...phoneOnly.websiteVerification,
        identitySignals: ["public_phone_conflict"],
      } as NonNullable<Prospect["websiteVerification"]>,
    },
  ];

  assert.ok(manualCallOpportunityScore(phoneOnly) >= 65);
  assert.equal(prospectCallQueueEligibility(phoneOnly).eligible, true);
  assert.equal(prospectCallQueueEligibility(emailReady).eligible, false);
  assert.equal(prospectCallQueueEligibility(lowPriorityPhone).eligible, false);
  for (const protectedProspect of protectedPhoneProspects) {
    assert.equal(prospectCallQueueEligibility(protectedProspect).eligible, false, protectedProspect.id);
  }
  assert.deepEqual(buildManualCallsQueue([phoneOnly, emailReady, lowPriorityPhone, ...protectedPhoneProspects]).map((item) => item.prospect.id), ["phone-only-call"]);
  assert.equal(pendingManualCallsCount([phoneOnly, emailReady, lowPriorityPhone, ...protectedPhoneProspects]), 1);
});

test("manual Calls queue badge states resolve or stay pending by call outcome", () => {
  const phoneOnly = {
    ...structuredClone(seedProspects[1]),
    id: "phone-only-call-status",
    phone: "(419) 555-0100",
    email: "",
    contactFormUrl: "",
    quoteFormUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    classification: "phone_only" as const,
    recommendedContactMethod: "call_first" as const,
    bestManualContactMethod: "phone_only" as const,
    priorityScore: 91,
    rating: 4.8,
    reviewCount: 44,
    status: "Reviewed" as const,
  };

  assert.equal(callQueueResolutionState(phoneOnly), "new");
  assert.equal(callQueueResolutionState({ ...phoneOnly, status: "Contacted" as const, notes: ["Calls queue: Marked called manually."] }), "resolved");
  assert.equal(callQueueResolutionState({ ...phoneOnly, status: "Interested" as const, notes: ["Calls queue: Marked interested after manual call."] }), "resolved");
  assert.equal(callQueueResolutionState({ ...phoneOnly, notes: ["Calls queue: Call Back requested or due."] }), "pending");
  assert.equal(callQueueResolutionState({ ...phoneOnly, notes: ["Calls queue: No Answer. Follow-up call due."] }), "pending");
  assert.equal(callQueueResolutionState({ ...phoneOnly, notes: ["Calls queue: No Answer. No further action."] }), "resolved");
  assert.equal(callQueueResolutionState({ ...phoneOnly, status: "Closed Lost" as const, notes: ["Calls queue: Marked not interested after manual call."] }), "resolved");
  assert.equal(callQueueResolutionState(applyManualCallSuppression(phoneOnly)), "resolved");
  assert.equal(pendingManualCallsCount([phoneOnly]), 1);
  assert.equal(pendingManualCallsCount([applyManualCallSuppression(phoneOnly)]), 0);
});

test("prospect funnel explanations are human-readable and do not change ranking or outreach", () => {
  const prospect = withVerifiedWeakWebsite(withAnalysis(structuredClone(seedProspects[0])));
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

test("website analysis failures remain conservative until independent evidence confirms a presence gap", () => {
  assert.deepEqual(classifyWebsiteAnalysisFailure(new Error("Website returned HTTP 404.")), {
    status: "inconclusive",
    detail: "One inactive response was recorded; confirmation is required.",
  });
  assert.equal(classifyWebsiteAnalysisFailure(new TypeError("fetch failed"))?.status, "temporarily_unavailable");
  assert.equal(classifyWebsiteAnalysisFailure(new Error("Website robots.txt does not allow analysis of this page."))?.status, "crawler_blocked");
  assert.equal(classifyWebsiteAnalysisFailure(new Error("Website returned HTTP 403."))?.status, "crawler_blocked");
  assert.equal(classifyWebsiteAnalysisFailure(new Error("Website returned HTTP 429."))?.status, "crawler_blocked");

  const broken = withPresenceGapReview(
    structuredClone(seedProspects[3]),
    "confirmed_inactive",
    "Independent safe URL variants consistently returned HTTP 404.",
  );
  assert.equal(broken.prospectType, "no_website_social_only");
  assert.equal(broken.analysis, undefined);
  assert.equal(broken.websiteStatus, "confirmed_inactive");
  assert.ok(broken.websiteAnalysisAttemptedAt);
  assert.deepEqual(prospectPresenceLabels(broken), ["Website confirmed inactive", "Phone only", "Phone-only / written outreach blocked", "Needs manual contact research"]);
});

test("verified no-website prospects receive careful dedicated-website wording", () => {
  const noWebsite = withVerifiedNoOwnedWebsite({
    ...structuredClone(seedProspects[0]),
    website: "",
  });
  const withDraft = withOutreach(noWebsite);

  assert.match(withDraft.outreach?.concise ?? "", /couldn't find a dedicated website linked from the business's public profiles/i);
  assert.match(withDraft.outreach?.concise ?? "", /modern website from the ground up/i);
  assert.match(withDraft.outreach?.concise ?? "", /Would you be interested in seeing what that could look like\?/i);
  assert.doesNotMatch(withDraft.outreach?.concise ?? "", /https?:\/\/|\/p\//i);
  assert.doesNotMatch(withDraft.outreach?.concise ?? "", /your website has issues|you don't have a website/i);
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
