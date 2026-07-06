import assert from "node:assert/strict";
import test from "node:test";
import {
  casualDmPlaybook,
  defaultAutonomousGrowthSettings,
  evaluateAutoSendEligibility,
  evaluatePreviewQualityGate,
  evaluateSelfReview,
  learningSummaryForQueue,
  loomNeededNotificationDraft,
  loomNeededTaskForQueueItem,
  normalizeAutonomousGrowthMode,
  normalizeAutonomousGrowthSettings,
  outreachEnvironment,
  outreachQueueStatuses,
  outreachRewritePlan,
  previewRegenerationPlan,
  queueStatusAfterManualAction,
  queueStatusForPackage,
  rewriteOutreachWithFixes,
  type OutreachQueueItem,
} from "../lib/autonomous-growth";
import {
  autopilotActionLabels,
  autopilotDraftFromRecommendedMarket,
  autopilotMarketMismatchWarning,
  autopilotPresetFields,
  autopilotProviderRequestEstimate,
  autopilotQueueKeyForItem,
  autopilotStartConfirmation,
  autopilotTopProspectInput,
  attachAutopilotRunReport,
  buildAutopilotDashboard,
  buildAutopilotTopProspectJobReport,
  createAutopilotCampaign,
  defaultAutopilotCampaignSettings,
  recommendedFirstAutopilotRunSettings,
  runFakeAutopilotSmokeTest,
  transitionAutopilotCampaign,
} from "../lib/autopilot-campaign";
import { evaluateOutreachEmailQuality, prepareTopProspectArtifacts, publicProspectPreviewLink, recommendedMarketPresets, type TopProspectJob } from "../lib/top-prospects";
import { seedProspects, withAnalysis, type Prospect } from "../lib/prospect-engine";

const publicLink = publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    OUTREACH_AUTO_SEND_ENABLED: "true",
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "test-key",
    OUTREACH_FROM_EMAIL: "hello@webworkshop.dev",
    OUTREACH_REPLY_TO_EMAIL: "reply@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "123 Main St, Toledo, OH",
    OUTREACH_DAILY_CAP: "5",
    ...overrides,
  };
}

function eligibleProspect() {
  const prospect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    email: "owner@example.com",
    publicEmail: undefined,
    contactFormUrl: "",
    recommendedContactMethod: "send_email",
    classification: "website_redesign",
  } as Prospect);
  return prepareTopProspectArtifacts(prospect, publicLink).prospect;
}

function eligibilityFor(prospect: Prospect, overrides: Partial<Parameters<typeof evaluateAutoSendEligibility>[0]> = {}) {
  const previewGate = overrides.previewGate ?? evaluatePreviewQualityGate(prospect);
  const emailQuality = overrides.emailQuality ?? evaluateOutreachEmailQuality(prospect, overrides.previewLink ?? publicLink);
  return evaluateAutoSendEligibility({
    emailQuality,
    environment: env(),
    previewGate,
    previewLink: publicLink,
    prospect,
    settings: { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false },
    ...overrides,
  });
}

test("Autonomous Growth defaults to Off with conservative caps and kill switch enabled", () => {
  const settings = normalizeAutonomousGrowthSettings();
  assert.equal(settings.mode, "off");
  assert.equal(settings.killSwitch, true);
  assert.equal(settings.maxProspectsScannedPerDay, 25);
  assert.equal(settings.maxPreviewsGeneratedPerDay, 10);
  assert.equal(settings.maxEmailsSentPerDay, 5);
  assert.equal(settings.emailCooldownMinutes, 7);
  assert.equal(normalizeAutonomousGrowthMode("surprise_send"), "off");
});

test("Dry Run and Manual Approval never auto-send", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
  for (const mode of ["dry_run", "manual_approval"] as const) {
    const result = evaluateAutoSendEligibility({
      emailQuality,
      environment: env(),
      previewGate,
      previewLink: publicLink,
      prospect,
      settings: { ...defaultAutonomousGrowthSettings, mode, killSwitch: false },
    });
    assert.equal(result.eligible, false);
    assert.match(result.blockedReasons.join(" "), /sends nothing automatically/);
  }
});

test("self-review runs for Dry Run and Manual Approval without changing send status", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
  const selfReview = evaluateSelfReview({ emailQuality, previewGate, prospect });

  assert.ok(selfReview.reviewScore > 0);
  assert.match(selfReview.reviewSummary, /review:/);
  assert.ok(["Keep", "Rewrite Outreach", "Needs Human Review", "Regenerate Preview"].includes(selfReview.recommendedNextAction));

  for (const mode of ["dry_run", "manual_approval"] as const) {
    const autoEligibility = evaluateAutoSendEligibility({
      emailQuality,
      environment: env(),
      previewGate,
      previewLink: publicLink,
      prospect,
      settings: { ...defaultAutonomousGrowthSettings, mode, killSwitch: false },
    });
    assert.equal(autoEligibility.eligible, false);
    assert.notEqual(queueStatusForPackage({
      autoEligibility,
      emailQuality,
      previewGate,
      settings: { ...defaultAutonomousGrowthSettings, mode, killSwitch: false },
    }), "Queued");
  }
});

test("Auto Email Pilot only passes for eligible email leads with all sender gates configured", () => {
  const prospect = eligibleProspect();
  const result = eligibilityFor(prospect);
  assert.equal(result.eligible, true);
  assert.equal(queueStatusForPackage({
    autoEligibility: result,
    emailQuality: evaluateOutreachEmailQuality(prospect, publicLink),
    previewGate: evaluatePreviewQualityGate(prospect),
    settings: { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false },
  }), "Queued");
});

test("phone-only, social-only, contact-form-only, and bad-fit leads never auto-send", () => {
  const base = eligibleProspect();
  const cases: Array<[string, Prospect]> = [
    ["phone-only", { ...base, email: "", recommendedContactMethod: "call_first", classification: "phone_only" }],
    ["social-only", { ...base, email: "", profileUrl: "https://facebook.com/example", recommendedContactMethod: "message_on_social", classification: "social_only" }],
    ["contact-form-only", { ...base, email: "", contactFormUrl: "https://example.com/contact", recommendedContactMethod: "submit_contact_form" }],
    ["bad-fit", { ...base, classification: "national_large_brand", businessName: "Erie Home" }],
  ];
  for (const [label, prospect] of cases) {
    assert.equal(eligibilityFor(prospect).eligible, false, label);
  }
});

test("missing public preview, protected engine links, and weak previews block send readiness", () => {
  const prospect = eligibleProspect();
  assert.equal(eligibilityFor({ ...prospect, preview: undefined }).eligible, false);
  assert.equal(eligibilityFor(prospect, { previewLink: "https://webworkshop.dev/engine/previews/prospect-1" }).eligible, false);
  const weak = {
    ...prospect,
    preview: {
      ...prospect.preview!,
      heroHeadline: "hvac help in toledo",
      qualityScore: {
        visualPolish: 60,
        businessSpecificity: 70,
        clarity: 70,
        mobileResponsiveness: 70,
        conversionStrength: 70,
        safetyTruthfulness: 90,
        overall: 70,
        notes: ["Needs stronger layout."],
      },
    },
  };
  const gate = evaluatePreviewQualityGate(weak);
  assert.equal(gate.status, "Blocked");
  assert.equal(eligibilityFor(weak).eligible, false);
});

test("preview below 85 creates a regeneration plan and remains not send-ready", () => {
  const prospect = eligibleProspect();
  const weak = {
    ...prospect,
    preview: {
      ...prospect.preview!,
      heroHeadline: "hvac help in toledo",
      qualityScore: {
        visualPolish: 78,
        businessSpecificity: 72,
        clarity: 80,
        mobileResponsiveness: 82,
        conversionStrength: 74,
        safetyTruthfulness: 92,
        overall: 78,
        notes: ["Needs stronger layout."],
      },
    },
  };
  const previewGate = evaluatePreviewQualityGate(weak);
  const emailQuality = evaluateOutreachEmailQuality(weak, publicLink);
  const review = evaluateSelfReview({ emailQuality, previewGate, prospect: weak });
  assert.notEqual(previewGate.status, "Eligible");
  assert.equal(review.recommendedNextAction, "Regenerate Preview");
  assert.ok(review.regenerationPlan.includes("fix image relevance") || review.regenerationPlan.includes("improve CTA section"));
  assert.equal(eligibilityFor(weak, { previewGate, emailQuality }).eligible, false);
});

test("missing sender settings, missing postal address, disabled env flag, and daily cap block Auto Email Pilot", () => {
  const prospect = eligibleProspect();
  assert.equal(eligibilityFor(prospect, { environment: env({ OUTREACH_AUTO_SEND_ENABLED: "false" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { environment: env({ RESEND_API_KEY: "" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { environment: env({ OUTREACH_POSTAL_ADDRESS: "" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { emailsSentToday: 5 }).eligible, false);
  assert.equal(outreachEnvironment(env({ OUTREACH_DAILY_CAP: "2" })).dailyCap, 2);
});

test("Autopilot defaults to one-trade manual-safe review mode", () => {
  assert.equal(defaultAutopilotCampaignSettings.duration, "run_once");
  assert.equal(defaultAutopilotCampaignSettings.cadence, "manual_only");
  assert.equal(defaultAutopilotCampaignSettings.manualDmMode, true);
  assert.equal(defaultAutopilotCampaignSettings.excludePreviouslyReviewed, true);
  assert.equal(defaultAutopilotCampaignSettings.requirePreviewQuality85, true);
  assert.equal(defaultAutopilotCampaignSettings.requireWrittenContact, true);
  assert.notEqual(defaultAutopilotCampaignSettings.trade, "All Core Service Trades");
  assert.ok(autopilotActionLabels.includes("Start Autopilot"));
  assert.ok(autopilotActionLabels.includes("Run Fake Smoke Test"));
  assert.ok(autopilotProviderRequestEstimate(defaultAutopilotCampaignSettings) > 0);
});

test("Autopilot campaign transitions pause, resume, and stop without sending", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const paused = transitionAutopilotCampaign(campaign, "pause", new Date(1));
  const resumed = transitionAutopilotCampaign(paused, "resume", new Date(2));
  const stopped = transitionAutopilotCampaign(resumed, "stop", new Date(3));

  assert.equal(campaign.status, "running");
  assert.equal(paused.status, "paused");
  assert.equal(resumed.status, "running");
  assert.equal(stopped.status, "stopped");
  assert.match(stopped.notifications[0].body, /No outreach was sent/);
});

test("Autopilot translates campaign settings into a safe Top Prospects run input", () => {
  const input = autopilotTopProspectInput({
    ...defaultAutopilotCampaignSettings,
    customCities: "Toledo, OH; Tampa, FL",
    state: "OH",
    trade: "Pressure Washing",
    maxProspectsPerRun: 100,
    maxPreviewsPerRun: 20,
    requireWrittenContact: true,
  });

  assert.equal(input.trade, "Pressure Washing");
  assert.equal(input.radiusKm, 50);
  assert.equal(input.businessesToScan, 100);
  assert.equal(input.finalProspectsWanted, 20);
  assert.equal(input.outreachPreference, "written_only");
  assert.equal(input.excludePreviouslyReviewed, true);
  assert.deepEqual(input.cityTargets.map((target) => target.label), ["Toledo, OH", "Tampa, FL"]);
});

test("Autopilot market preset syncing fills Florida cities, fallback state, and estimates without running", () => {
  const floridaFields = autopilotPresetFields("florida");

  assert.ok(floridaFields);
  assert.equal(floridaFields.state, "FL");
  assert.equal(floridaFields.customCities, "Tampa, FL; St. Petersburg, FL; Clearwater, FL; Lakeland, FL; Orlando, FL; Kissimmee, FL; Jacksonville, FL; St. Augustine, FL; Sarasota, FL; Fort Myers, FL");

  const settings = {
    ...defaultAutopilotCampaignSettings,
    ...floridaFields,
    trade: "Pressure Washing" as const,
  };
  const input = autopilotTopProspectInput(settings);

  assert.equal(input.cityTargets.length, 10);
  assert.equal(input.cityTargets[0].label, "Tampa, FL");
  assert.equal(input.trade, "Pressure Washing");
  assert.equal(autopilotProviderRequestEstimate(settings), 40);
});

test("Recommended Market trade selection can hand off selected cities and trade to Autopilot", () => {
  const florida = recommendedMarketPresets.find((preset) => preset.id === "florida");

  assert.ok(florida);
  const draft = autopilotDraftFromRecommendedMarket(florida, "Pressure Washing");

  assert.equal(draft.marketPresetId, "florida");
  assert.equal(draft.state, "FL");
  assert.equal(draft.trade, "Pressure Washing");
  assert.match(draft.customCities ?? "", /Tampa, FL; St\. Petersburg, FL/);
});

test("Autopilot warns when preset and custom cities do not match", () => {
  const warning = autopilotMarketMismatchWarning({
    ...defaultAutopilotCampaignSettings,
    marketPresetId: "florida",
    customCities: "Toledo, OH; Sylvania, OH",
    state: "OH",
  });

  assert.equal(warning, "Market preset is Florida, but Custom cities look like Northwest Ohio. Update cities before starting.");
  assert.equal(autopilotMarketMismatchWarning({
    ...defaultAutopilotCampaignSettings,
    marketPresetId: "florida",
    customCities: "Tampa, FL; St. Petersburg, FL; Clearwater, FL; Lakeland, FL; Orlando, FL; Kissimmee, FL; Jacksonville, FL; St. Augustine, FL; Sarasota, FL; Fort Myers, FL",
    state: "FL",
  }), "");
});

test("recommended first real Autopilot run selects Florida Pressure Washing with safe defaults", () => {
  const settings = recommendedFirstAutopilotRunSettings();

  assert.equal(settings.marketPresetId, "florida");
  assert.match(settings.customCities, /Tampa, FL; St\. Petersburg, FL/);
  assert.equal(settings.state, "FL");
  assert.equal(settings.trade, "Pressure Washing");
  assert.equal(settings.duration, "run_once");
  assert.equal(settings.cadence, "manual_only");
  assert.equal(settings.maxProspectsPerRun, 100);
  assert.equal(settings.maxPreviewsPerRun, 20);
  assert.equal(settings.maxProspectsTotal, 20);
  assert.equal(settings.outreachStyle, "manual_social_safe");
  assert.equal(settings.excludePreviouslyReviewed, true);
  assert.equal(settings.requirePreviewQuality85, true);
  assert.equal(settings.requireWrittenContact, true);
  assert.equal(settings.manualDmMode, true);
  assert.equal(settings.loomNotifications, true);
  assert.equal(settings.stopRules.pauseOnProviderFailure, false);
});

test("Autopilot start confirmation uses the selected market, trade, duration, and no-send safety", () => {
  const confirmation = autopilotStartConfirmation({
    ...defaultAutopilotCampaignSettings,
    ...(autopilotPresetFields("florida") ?? {}),
    trade: "Pressure Washing",
    duration: "run_once",
  });

  assert.equal(confirmation.market, "Florida");
  assert.match(confirmation.citySummary, /Tampa, FL/);
  assert.equal(confirmation.trade, "Pressure Washing");
  assert.equal(confirmation.duration, "Run once");
  assert.equal(confirmation.safety, "No outreach will be sent automatically.");
});

test("fake Autopilot smoke test routes fixtures into safe queues", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const result = runFakeAutopilotSmokeTest(campaign, new Date(1));

  assert.equal(result.passed, true);
  assert.ok(result.report.fakeOnly);
  assert.ok(result.report.safetyFindings.some((finding) => /Automatic email, social DM, contact form, phone, and Loom sending stayed disabled/.test(finding)));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Glass City Pressure Washing" && fixture.actualQueue === "emailDraftReady"));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Sylvania Lawn Care" && fixture.actualQueue === "readyForManualDm"));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Toledo HVAC Equipment Supply" && fixture.actualQueue === "blockedBadFit"));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Maumee Concrete Repair" && fixture.actualQueue === "blockedBadFit"));
});

test("Autopilot dashboard shows latest run queue counts when fake smoke test does not save queue items", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const smoke = runFakeAutopilotSmokeTest(campaign, new Date(1));
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, smoke.report, new Date(2)), [], true);

  assert.equal(dashboard.campaign.status, "finished");
  assert.equal(dashboard.queueCountsSource, "latest_run_report");
  assert.equal(dashboard.campaign.queueCounts.emailDraftReady, 1);
  assert.equal(dashboard.campaign.queueCounts.readyForManualDm, 1);
  assert.equal(dashboard.campaign.queueCounts.needsPreviewReview, 1);
  assert.equal(dashboard.campaign.queueCounts.loomNeeded, 1);
  assert.equal(dashboard.campaign.queueCounts.blockedBadFit, 2);
  assert.equal(dashboard.exportRows.length, 0);
});

test("Autopilot Live Activity shows a clear empty state before the first run", () => {
  const campaign = { ...createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0)), status: "draft" as const };
  const dashboard = buildAutopilotDashboard(campaign, [], true);

  assert.equal(dashboard.activity.status, "not_started");
  assert.equal(dashboard.activity.progressPercent, 0);
  assert.equal(dashboard.activity.currentStep, "No Autopilot run has started");
  assert.match(dashboard.activity.entries[0].label, /No Autopilot activity yet/);
  assert.equal(dashboard.activity.queueRouting.length, 6);
});

test("Autopilot Live Activity tracks a real Top Prospects job instead of fake-completing", () => {
  const campaign = createAutopilotCampaign({
    ...defaultAutopilotCampaignSettings,
    customCities: "Tampa, FL",
    state: "FL",
    trade: "Pressure Washing",
  }, new Date(0));
  const job = {
    id: "top-job-123",
    input: autopilotTopProspectInput(campaign.settings),
    status: "RUNNING",
    stage: "DISCOVER",
    discoveredCount: 25,
    scannedCount: 8,
    qualifiedCount: 3,
    skippedCount: 4,
    skipSummary: { supplier_distributor: 2, phone_only_written_outreach_blocked: 2 },
    results: [],
    reviewedNotRecommended: [],
    failureClassification: null,
    errorMessage: "",
    completedAt: null,
    createdAt: new Date(1).toISOString(),
    updatedAt: new Date(2).toISOString(),
    nextRunRecommendations: ["Wait for this Top Prospects job to finish."],
    discoveryDiagnostics: {
      rawProviderCount: 25,
      afterDistanceFilteringCount: 21,
      afterDuplicateFilteringCount: 18,
      afterQualificationFilteringCount: 9,
      returnedCount: 9,
      radiusKm: 50,
      categorySignals: [],
      sourceCounts: { osm: 0, google: 0, bing: 25, yelp: 0, yellowPages: 0 },
      finalMergedCount: 18,
      providerDiagnostics: {
        osm: { configured: null, queryExecuted: false, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 25, withinRadiusCount: 21, afterDeduplicationCount: 18, usableWebsiteCount: 9 },
        googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      },
      cityDiagnostics: [{
        city: "Tampa",
        state: "FL",
        label: "Tampa, FL",
        status: "completed",
        requestedCount: 100,
        rawProviderCount: 25,
        withinRadiusCount: 21,
        afterDeduplicationCount: 18,
        usableWebsiteCount: 9,
        returnedCount: 9,
        qualifiedCount: 3,
        skippedCount: 4,
        providerDiagnostics: {
          osm: { configured: null, queryExecuted: false, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 25, withinRadiusCount: 21, afterDeduplicationCount: 18, usableWebsiteCount: 9 },
          googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        },
      }],
    },
  } as TopProspectJob;
  const report = buildAutopilotTopProspectJobReport(campaign, job, new Date(3));
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, report, new Date(4)), [], true);

  assert.equal(dashboard.activity.status, "top_prospects_running");
  assert.equal(dashboard.activity.topProspectJobId, "top-job-123");
  assert.equal(dashboard.activity.rawRecordsFound, 25);
  assert.equal(dashboard.activity.currentStep, "Top Prospects job running");
  assert.ok(dashboard.activity.providerDiagnostics.some((provider) => provider.provider === "Azure Maps" && provider.rawRecords === 25));
  assert.ok(dashboard.activity.cityBreakdown.some((city) => city.city === "Tampa, FL" && city.qualified === 3));
  assert.ok(dashboard.activity.entries.some((entry) => /still running/.test(entry.label)));
});

test("fake Autopilot smoke activity records fake provider, blocked reasons, and queue routing without sending", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const smoke = runFakeAutopilotSmokeTest(campaign, new Date(1));
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, smoke.report, new Date(2)), [], true);
  const labels = dashboard.activity.entries.map((entry) => entry.label).join(" | ");

  assert.equal(dashboard.activity.fakeOnly, true);
  assert.equal(dashboard.activity.status, "completed");
  assert.match(labels, /Fake Smoke Test Activity — no providers, no outreach/);
  assert.match(labels, /Estimated \d+ provider requests/);
  assert.match(labels, /Blocked 2 bad-fit or unsafe leads/);
  assert.match(labels, /Created 1 manual DM scripts and 1 email drafts/);
  assert.equal(dashboard.activity.providerDiagnostics[0].provider, "Fake Smoke Test");
  assert.equal(dashboard.activity.providerDiagnostics[0].status, "fake_only");
  assert.ok(dashboard.activity.blockedReasons.some((blocked) => blocked.count === 2));
  assert.ok(dashboard.activity.queueRouting.some((queue) => queue.queue === "emailDraftReady" && queue.count === 1));
  assert.ok(dashboard.activity.entries.every((entry) => !/sent automatically/i.test(entry.detail) || /Nothing was sent|No outreach was sent/i.test(entry.detail)));
});

test("Autopilot Live Activity surfaces provider, city, warning, and failed status details", () => {
  const campaign = createAutopilotCampaign({
    ...defaultAutopilotCampaignSettings,
    customCities: "Toledo, OH; Tampa, FL",
    trade: "Pressure Washing",
  }, new Date(0));
  const reportCampaign = attachAutopilotRunReport(campaign, {
    id: "run-warning",
    campaignId: campaign.id,
    status: "needs_review",
    startedAt: new Date(1).toISOString(),
    completedAt: new Date(2).toISOString(),
    marketTargets: ["Toledo, OH", "Tampa, FL"],
    providerRequestEstimate: 8,
    prospectsDiscovered: 3,
    prospectsQualified: 1,
    packagesGenerated: 1,
    queueCounts: {
      readyForManualDm: 0,
      needsPreviewReview: 0,
      loomNeeded: 0,
      emailDraftReady: 1,
      blockedBadFit: 2,
      needsHumanResearch: 0,
    },
    failedCities: [{ city: "Tampa, FL", reason: "Azure Maps timed out" }],
    safetyFindings: ["No outreach was sent."],
    recommendations: ["Try Toledo next."],
    nextRunRecommendation: "Try Toledo next.",
  }, new Date(3));
  const dashboard = buildAutopilotDashboard(reportCampaign, [
    queueItem({ id: "queue-provider", sourceProvider: "Azure Maps", city: "Toledo, OH", status: "Eligible", emailBody: "Draft", previewQualityScore: 91 }),
    queueItem({ id: "queue-phone", sourceProvider: "Azure Maps", city: "Tampa, FL", status: "Blocked", contactSource: "Phone", blockedReason: "Phone-only lead blocked by written outreach rules.", email: "" }),
  ], true);

  assert.equal(dashboard.activity.status, "completed_with_warnings");
  assert.match(dashboard.activity.warnings.join(" "), /Azure Maps timed out/);
  assert.equal(dashboard.activity.currentCity, "Tampa, FL");
  assert.equal(dashboard.activity.currentProvider, "Azure Maps");
  assert.equal(dashboard.activity.phoneOnlyLeadsBlocked, 1);
  assert.ok(dashboard.activity.cityBreakdown.some((city) => city.city === "Tampa, FL" && city.status === "failed"));
  assert.ok(dashboard.activity.providerDiagnostics.some((provider) => provider.provider === "Azure Maps" && provider.rawRecords === 2));

  const failedDashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, { ...reportCampaign.latestRunReport!, status: "blocked" }, new Date(4)), [], true);
  assert.equal(failedDashboard.activity.status, "failed");
  assert.match(failedDashboard.activity.errors.join(" "), /blocking rule/);
});

test("Autopilot queue classification keeps Loom and weak preview items manual", () => {
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "Loom Needed", previewQualityScore: 92 })), "loomNeeded");
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "Needs Review", previewQualityScore: 74 })), "needsPreviewReview");
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "DM Draft", contactSource: "Social profile", email: "" })), "readyForManualDm");
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "Blocked", contactSource: "Phone", email: "", blockedReason: "Phone-only lead blocked by written outreach rules." })), "blockedBadFit");
});

test("opt-out and duplicate style statuses can stay blocked in the durable queue model", () => {
  const prospect = eligibleProspect();
  const blocked = eligibilityFor({ ...prospect, recommendedContactMethod: "do_not_contact" });
  assert.equal(blocked.eligible, false);
  assert.match(blocked.blockedReasons.join(" "), /Do-not-contact/);
  const duplicate = eligibilityFor({ ...prospect, classification: "duplicate_bad_fit" });
  assert.equal(duplicate.eligible, false);
  assert.match(duplicate.blockedReasons.join(" "), /duplicate/i);
  const alreadyContacted = eligibilityFor({ ...prospect, status: "Contacted" });
  assert.equal(alreadyContacted.eligible, false);
  assert.match(alreadyContacted.blockedReasons.join(" "), /already been contacted/i);
  const noSolicitation = eligibilityFor({ ...prospect, activitySignals: ["No solicitation language detected on contact page."] });
  assert.equal(noSolicitation.eligible, false);
  assert.match(noSolicitation.blockedReasons.join(" "), /No-solicitation/i);
});

test("learning feedback cannot bypass opt-out or bad-fit hard blockers", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
  const optOut = { ...prospect, recommendedContactMethod: "do_not_contact" as const };
  const badFit = { ...prospect, classification: "national_large_brand" as const };
  const positiveOptOutReview = evaluateSelfReview({
    emailQuality,
    feedbackLabels: ["Good lead", "Preview looked good", "Outreach sounded good"],
    previewGate,
    prospect: optOut,
  });
  const positiveBadFitReview = evaluateSelfReview({
    emailQuality,
    feedbackLabels: ["Good lead", "Preview looked good", "Outreach sounded good"],
    previewGate,
    prospect: badFit,
  });

  assert.equal(positiveOptOutReview.recommendedNextAction, "Never Contact");
  assert.equal(positiveBadFitReview.recommendedNextAction, "Bad Fit");
  assert.equal(eligibilityFor(optOut).eligible, false);
  assert.equal(eligibilityFor(badFit).eligible, false);
});

test("feedback labels create preview and outreach self-fix suggestions", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const previewPlan = previewRegenerationPlan(previewGate, ["Preview looked bad"]);
  const rewritePlan = outreachRewritePlan(
    "Hi, this free audit will transform your seamless next-generation web presence.",
    ["Outreach sounded too AI-ish"],
  );

  assert.ok(previewPlan.includes("make sections flow better"));
  assert.ok(previewPlan.includes("make it more specific to the trade/city"));
  assert.ok(rewritePlan.includes("make the email shorter"));
  assert.ok(rewritePlan.includes("make it more human"));
  assert.ok(rewritePlan.includes("remove free audit language"));
});

test("rewrite outreach preserves opt-out language and removes hype posture", () => {
  const rewritten = rewriteOutreachWithFixes([
    "Hi Rick,",
    "",
    "This free audit could transform your seamless web presence.",
    "",
    "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
    "",
    "WebWorkshop",
    "[Add your business postal address before sending]",
    "If you would rather not receive another note, reply and I will close the loop.",
  ].join("\n"));

  assert.match(rewritten, /If you would rather not receive another note/);
  assert.match(rewritten, /https:\/\/webworkshop\.dev\/p\/abcdefghijklmnopqrstuvwxyzABCDEF/);
  assert.doesNotMatch(rewritten, /free audit|transform your seamless/i);
});

function queueItem(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  return {
    id: "queue-1",
    prospectId: "prospect-1",
    topProspectResultId: "result-1",
    businessName: "Sample Roofing",
    trade: "Roofing",
    city: "Toledo, OH",
    website: "https://example.com",
    email: "owner@example.com",
    contactSource: "Public email",
    contactConfidence: 85,
    previewLink: publicLink,
    previewQualityScore: 88,
    subjectLine: "A clearer estimate path",
    emailBody: "Hi there,\n\nOne thing that already works well: customers can find your services.\n\nIf you would rather not receive another note, reply and I will close the loop.",
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Send-safe package.",
    blockedReason: "",
    reviewScore: 82,
    reviewSummary: "Keep.",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Eligible",
    sourceProvider: "Top Prospects",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("feedback updates learning summary and dashboard empty states can be represented", () => {
  const empty = learningSummaryForQueue([]);
  assert.equal(empty.latestReview, null);
  assert.deepEqual(empty.commonFailureReasons, []);

  const summary = learningSummaryForQueue([
    queueItem({ feedbackLabels: ["Good lead", "Positive reply"], status: "Positive Reply", replyStatus: "positive" }),
    queueItem({
      id: "queue-2",
      trade: "HVAC",
      reviewScore: 46,
      status: "Needs Review",
      detectedIssues: ["Preview copy is generic."],
      regenerationPlan: ["reduce AI-sounding copy"],
      rewritePlan: ["make the email shorter"],
    }),
  ]);
  assert.equal(summary.bestPerformingTrades[0], "Roofing");
  assert.ok(summary.commonFailureReasons.includes("Preview copy is generic."));
  assert.ok(summary.recommendedPreviewImprovements.includes("reduce AI-sounding copy"));
  assert.ok(summary.recommendedWordingImprovements.includes("make the email shorter"));
});

test("casual DM playbook keeps the first DM link-free and creates Loom-safe scripts", () => {
  const prospect = {
    ...eligibleProspect(),
    website: "",
    profileUrl: "https://facebook.com/sample-roofing",
    prospectType: "no_website_social_only",
    classification: "social_only",
    recommendedContactMethod: "message_on_facebook",
  } as Prospect;
  const playbook = casualDmPlaybook(prospect, publicLink);

  assert.match(playbook.firstDm, /Would you like to see it\?/);
  assert.doesNotMatch(playbook.firstDm, /https?:\/\/|\/p\//);
  assert.doesNotMatch(playbook.firstDm, /AI website|free audit/i);
  assert.match(playbook.sendAfterLoom, /Loom walkthrough/);
  assert.match(playbook.sendAfterLoom, /Preview:/);
  assert.match(playbook.sendAfterLoom, /\/p\/abcdefghijklmnopqrstuvwxyzABCDEF/);
  assert.match(playbook.pricingReply, /\$1,000 total/);
  assert.match(playbook.pricingReply, /\$49\/month/);
  assert.match(playbook.higherSupportReply, /\$79\/month/);
  assert.match(playbook.starterPageReply, /\$500/);
});

test("Prospect Said Yes creates a Loom Needed task status instead of sending", () => {
  assert.ok(outreachQueueStatuses.includes("Prospect Said Yes"));
  assert.ok(outreachQueueStatuses.includes("Loom Needed"));
  assert.equal(queueStatusAfterManualAction("Prospect Said Yes"), "Loom Needed");
  assert.equal(queueStatusAfterManualAction("First DM Sent"), "First DM Sent");
});

test("Loom Needed task exposes checklist, fix notes, scripts, and no auto-send path", () => {
  const task = loomNeededTaskForQueueItem(queueItem({
    status: "Loom Needed",
    regenerationPlan: ["make layout more believable"],
    improvementSuggestions: ["fix image relevance"],
    detectedIssues: ["Preview copy is generic."],
  }));

  assert.equal(task.businessName, "Sample Roofing");
  assert.equal(task.canMarkReadyForLoom, false);
  assert.ok(task.checklist.some((check) => check.key === "preview_quality" && !check.passed));
  assert.ok(task.fixNotes.includes("make layout more believable"));
  assert.match(task.scripts.loomScript, /This isn't live or anything/);
  assert.match(task.scripts.sendAfterLoom, /Preview:/);
});

test("strong Loom preview can be marked ready only after public preview and quality checks pass", () => {
  const task = loomNeededTaskForQueueItem(queueItem({
    status: "Loom Needed",
    previewQualityScore: 92,
    regenerationPlan: [],
    improvementSuggestions: [],
    detectedIssues: [],
  }));

  assert.equal(task.canMarkReadyForLoom, true);
});

test("Loom notification draft is internal-only and secret-safe", () => {
  const item = queueItem({ status: "Loom Needed" });
  const notification = loomNeededNotificationDraft(item, {
    OUTREACH_NOTIFY_EMAIL: "operator@example.com",
    OUTREACH_NOTIFY_FROM_EMAIL: "alerts@webworkshop.dev",
    OUTREACH_NOTIFY_ON_LOOM_NEEDED: "true",
    RESEND_API_KEY: "secret-resend-key",
  });

  assert.equal(notification.configured, true);
  assert.match(notification.subject, /Loom needed: Sample Roofing/);
  assert.match(notification.body, /manual/i);
  assert.match(notification.body, /webworkshop\.dev\/p\//);
  assert.doesNotMatch(JSON.stringify(notification), /secret-resend-key|operator@example.com|alerts@webworkshop\.dev/);
});
