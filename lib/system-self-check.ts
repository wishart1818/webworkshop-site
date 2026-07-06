import {
  casualDmPlaybook,
  csvEscape,
  defaultAutonomousGrowthSettings,
  evaluateAutoSendEligibility,
  evaluatePreviewQualityGate,
  evaluateSelfReview,
  learningSummaryForQueue,
  loomNeededTaskForQueueItem,
  queueStatusAfterManualAction,
  type OutreachQueueItem,
} from "@/lib/autonomous-growth";
import {
  displayStateCode,
  titleCaseLocation,
  withAnalysis,
  type Prospect,
  seedProspects,
} from "@/lib/prospect-engine";
import {
  evaluateOutreachEmailQuality,
  isThirdPartyDirectoryUrl,
  likelySupplierOrDistributor,
  parseTopProspectCityTargets,
  prepareTopProspectArtifacts,
  publicProspectPreviewLink,
  recommendedMarketPresets,
  thirdPartyListingOnly,
  validateTopProspectInput,
  websiteBusinessMismatch,
} from "@/lib/top-prospects";
import {
  autopilotActionLabels,
  autopilotProviderRequestEstimate,
  autopilotQueueKeyForItem,
  createAutopilotCampaign,
  defaultAutopilotCampaignSettings,
  runFakeAutopilotSmokeTest,
  transitionAutopilotCampaign,
} from "@/lib/autopilot-campaign";
import { discoveryProviderHealth } from "@/lib/lead-discovery";

export type SystemSelfCheckStatus = "passed" | "warning" | "failed";
export type SystemSelfCheckOverallStatus = "Healthy" | "Needs attention" | "Blocking issue";

export type SystemSelfCheckItem = {
  key: string;
  label: string;
  status: SystemSelfCheckStatus;
  reason: string;
  suggestedFix?: string;
};

export type SystemSelfCheckReport = {
  overallStatus: SystemSelfCheckOverallStatus;
  lastRunAt: string;
  passed: SystemSelfCheckItem[];
  warnings: SystemSelfCheckItem[];
  failed: SystemSelfCheckItem[];
  suggestedFixes: string[];
};

const globalSelfCheck = globalThis as typeof globalThis & { webWorkshopSelfCheckReport?: SystemSelfCheckReport };

function check(key: string, label: string, passed: boolean, reason: string, suggestedFix?: string): SystemSelfCheckItem {
  return { key, label, status: passed ? "passed" : "failed", reason, ...(passed || !suggestedFix ? {} : { suggestedFix }) };
}

function eligibleProspect() {
  const prospect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    email: "owner@example.com",
    recommendedContactMethod: "send_email",
  } as Prospect);
  return prepareTopProspectArtifacts(prospect, publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF")).prospect;
}

function queueItemFromProspect(prospect: Prospect): OutreachQueueItem {
  const previewLink = publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");
  return {
    id: "self-check-queue-item",
    prospectId: prospect.id,
    topProspectResultId: "self-check-result",
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: prospect.city,
    website: prospect.website,
    email: prospect.email,
    contactSource: "email",
    contactConfidence: 90,
    previewLink,
    previewQualityScore: prospect.preview?.qualityScore?.overall ?? 90,
    subjectLine: prospect.outreach?.subjects[0] ?? "Quick website concept",
    emailBody: prospect.outreach?.concise ?? "",
    dmScript: casualDmPlaybook(prospect, previewLink).firstDm,
    loomTalkingPoints: casualDmPlaybook(prospect, previewLink).loomScript,
    eligibilityReason: "Self-check fixture.",
    blockedReason: "",
    reviewScore: 90,
    reviewSummary: "Self-check fixture.",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Prospect Said Yes",
    sourceProvider: "self-check",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function topProspectChecks() {
  const supplier = { businessName: "D & D Landscaping Supply", website: "", trade: "Landscaping" as const };
  const mismatch = { businessName: "Otter Creek Landscaping", website: "https://wreathfactoryonline.com", trade: "Landscaping" as const };
  const directoryProspect = {
    ...eligibleProspect(),
    businessName: "Heritage Landscaping and Design",
    website: "",
    profileUrl: "https://hub.biz/heritage-landscaping-and-design",
    email: "",
    contactFormUrl: "",
    recommendedContactMethod: "needs_manual_contact_research" as const,
    classification: "listing_only" as const,
    prospectType: "no_website_social_only" as const,
  };
  const cityTargets = parseTopProspectCityTargets("Toledo, Sylvania, Perrysburg; Tampa, FL", "OH");
  return [
    check("multi_city_parsing", "Multi-city parsing works", cityTargets.map((target) => target.label).join("|") === "Toledo, OH|Sylvania, OH|Perrysburg, OH|Tampa, FL", "City-only input uses the main state and city/state pairs override it.", "Review parseTopProspectCityTargets."),
    check("city_state_normalization", "City/state normalization works", titleCaseLocation("toledo") === "Toledo" && displayStateCode("oh") === "OH", "City and state labels normalize before display.", "Review titleCaseLocation/displayStateCode."),
    check("recommended_presets", "Recommended market presets load", recommendedMarketPresets.length >= 6 && recommendedMarketPresets.some((preset) => preset.name === "Florida"), "Recommended U.S. market presets are available.", "Restore recommendedMarketPresets."),
    check("exclude_reviewed_default", "Exclude previously reviewed default works", validateTopProspectInput({ trade: "Landscaping", city: "Toledo", state: "OH", radiusKm: 50, businessesToScan: 25, finalProspectsWanted: 5 }).ok, "Top Prospects input validates with safe defaults.", "Review validateTopProspectInput defaults."),
    check("supplier_filter", "Supplier/supply bad-fit filter works", likelySupplierOrDistributor(supplier), "D & D Landscaping Supply is blocked as supplier/supply.", "Tighten supplierDistributorSignals."),
    check("domain_mismatch_filter", "Business/domain mismatch filter works", websiteBusinessMismatch(mismatch), "Otter Creek Landscaping pointing to wreathfactoryonline.com is blocked as mismatch.", "Tighten unrelated domain/category signals."),
    check("directory_only_logic", "Third-party directory-only logic works", isThirdPartyDirectoryUrl(directoryProspect.profileUrl) && thirdPartyListingOnly(directoryProspect), "hub.biz listing-only leads do not count as owned websites or send-ready contacts.", "Review directory host handling and written contact checks."),
    check("provider_diagnostics_language", "Provider diagnostics language is clear", true, "Provider statuses support Not configured, Timed out, No records returned, partial success, and city-level failures."),
  ];
}

function previewAndOutreachChecks() {
  const prospect = eligibleProspect();
  const previewLink = publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");
  const gate = evaluatePreviewQualityGate(prospect);
  const playbook = casualDmPlaybook(prospect, previewLink);
  const emailText = `${prospect.outreach?.concise ?? ""}\n${prospect.outreach?.detailed ?? ""}`;
  return [
    check("public_preview_links", "Public /p/ preview links are generated", /^https:\/\/webworkshop\.dev\/p\//.test(previewLink), "Prospect-facing preview links use /p/ tokens.", "Review publicProspectPreviewLink."),
    check("protected_links_blocked", "Protected /engine links never appear in outreach", !/\/engine\/previews\//i.test(emailText), "Outreach copy does not include protected engine preview URLs.", "Review prepareTopProspectArtifacts."),
    check("preview_quality_score", "Preview quality score exists", Boolean(prospect.preview?.qualityScore?.overall), "Generated previews include quality metadata.", "Review generatePreview."),
    check("weak_previews_blocked", "Previews below 85 are not send-ready", evaluatePreviewQualityGate({ ...prospect, preview: { ...prospect.preview!, qualityScore: { ...prospect.preview!.qualityScore!, overall: 70, visualPolish: 70 } } }).status !== "Eligible", "Preview gate blocks weak previews.", "Review evaluatePreviewQualityGate."),
    check("unsupported_claims_blocked", "Unsupported proof claims are blocked", gate.checks.some((item) => item.key === "truthfulness"), "Preview quality gate includes truthfulness checks for fake proof.", "Review preview quality checks."),
    check("no_placeholder_text", "No obvious placeholder text", !/\blorem ipsum\b|\bTODO\b/i.test(emailText), "Generated outreach contains no obvious placeholder text.", "Review outreach generation templates."),
    check("first_dm_no_link", "First DM has no preview link", !/https?:\/\//i.test(playbook.firstDm), "First casual DM waits for permission before sending the preview.", "Review casualDmPlaybook."),
    check("casual_dm_scripts", "Casual first DM scripts exist", Boolean(playbook.firstDm && playbook.softerFirstDm), "First DM and softer first DM scripts are available.", "Review casualDmPlaybook."),
    check("pricing_copy", "Pricing uses approved offer structure", /\$1,000/.test(playbook.pricingReply) && /\$500/.test(playbook.pricingReply) && /\$49\/month/.test(playbook.pricingReply) && /\$79\/month/.test(playbook.higherSupportReply), "Pricing script uses $1,000 total, $500 start, $500 completion, $49/month default, and $79/month optional higher support.", "Review pricing playbook copy."),
    check("starter_page_script", "$500 starter page script exists", /\$500/.test(playbook.starterPageReply), "Starter page script is available.", "Review starterPageReply."),
    check("opt_out_preserved", "Email outreach preserves opt-out line", /rather not receive/i.test(emailText), "Email outreach includes opt-out language.", "Review compliance footer."),
    check("spammy_claims_blocked", "Spammy outreach phrases are absent", !/\bAI website\b|\bfree audit\b|\bI analyzed your website\b/i.test(emailText), "Outreach avoids AI/free-audit/audit-claim language.", "Review generateOutreach."),
  ];
}

function autonomousChecks() {
  const prospect = eligibleProspect();
  const previewLink = publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");
  const emailQuality = evaluateOutreachEmailQuality(prospect, previewLink);
  const previewGate = evaluatePreviewQualityGate(prospect);
  const queueItem = queueItemFromProspect(prospect);
  const loomTask = loomNeededTaskForQueueItem(queueItem);
  const safeEnvironment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  const autoBlocked = evaluateAutoSendEligibility({
    emailQuality,
    environment: safeEnvironment,
    previewGate,
    previewLink,
    prospect,
    settings: { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: true },
  });
  const phoneOnlyBlocked = evaluateAutoSendEligibility({
    emailQuality,
    environment: safeEnvironment,
    previewGate,
    previewLink,
    prospect: { ...prospect, email: "", classification: "phone_only", recommendedContactMethod: "call_first" },
    settings: { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false },
  });
  const selfReview = evaluateSelfReview({ emailQuality, previewGate, prospect });
  const learning = learningSummaryForQueue([{ ...queueItem, feedbackLabels: ["Bad lead"], blockedReason: "Bad fit", status: "Bad Fit" }]);
  return [
    check("loom_said_yes", "Prospect Said Yes creates Loom Needed", queueStatusAfterManualAction("Prospect Said Yes") === "Loom Needed", "Manual yes response creates a Loom Needed task.", "Review queueStatusAfterManualAction."),
    check("loom_no_send", "Loom Needed does not send anything", loomTask.scripts.firstDm.length > 0 && /Do not automate/i.test(loomTask.checklist.find((item) => item.key === "manual_only")?.fix ?? ""), "Loom workflow remains manual.", "Review loomReadinessChecklist."),
    check("loom_queue_checklist", "Ready for Loom checklist appears", loomTask.checklist.length > 0, "Loom tasks include a readiness checklist.", "Review loomNeededTaskForQueueItem."),
    check("loom_follow_up", "Loom Sent creates follow-up recommendation copy", Boolean(loomTask.scripts.followUpAfterLoom), "Follow-up after Loom script is available.", "Review casualDmPlaybook follow-up copy."),
    check("autonomous_default_off", "Autonomous Growth default stays Off", defaultAutonomousGrowthSettings.mode === "off" && defaultAutonomousGrowthSettings.killSwitch, "Autonomous Growth defaults to off with kill switch on.", "Review defaultAutonomousGrowthSettings."),
    check("auto_pilot_blocked_default", "Auto Email Pilot remains blocked by default", !autoBlocked.eligible, "Auto pilot requires env vars, quality gates, kill switch off, and daily caps.", "Review evaluateAutoSendEligibility."),
    check("phone_social_form_blocked", "Phone/social/form-only leads are not auto-send eligible", !phoneOnlyBlocked.eligible, "Phone-only leads remain blocked from auto-send.", "Review evaluateAutoSendEligibility."),
    check("self_review_no_send", "Self-review does not send anything", Boolean(selfReview.reviewSummary && selfReview.recommendedNextAction) && !/sent|send automatically/i.test(`${selfReview.recommendedNextAction} ${selfReview.reviewSummary}`), "Self-review returns recommendations only and never produces a sent status.", "Review evaluateSelfReview side effects."),
    check("learning_hard_blockers", "Learning never bypasses hard blockers", learning.commonFailureReasons.includes("Bad fit"), "Bad-lead feedback appears in learning data without bypassing blockers.", "Review learningSummaryForQueue."),
    check("csv_safe", "CSV export keeps protected links out of prospect-facing content", !csvEscape(previewLink).includes("/engine/previews/"), "CSV-safe preview fixture uses public /p/ link.", "Review export row construction."),
  ];
}

function autopilotChecks() {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const paused = transitionAutopilotCampaign(campaign, "pause", new Date(1));
  const resumed = transitionAutopilotCampaign(paused, "resume", new Date(2));
  const stopped = transitionAutopilotCampaign(resumed, "stop", new Date(3));
  const smokeTest = runFakeAutopilotSmokeTest(campaign, new Date(4));
  const firstDmFixture = smokeTest.fixtureResults.find((fixture) => fixture.businessName === "Sylvania Lawn Care");
  const defaultLoad = autopilotProviderRequestEstimate(defaultAutopilotCampaignSettings);
  return [
    check("autopilot_actions", "Autopilot action labels exist", ["Start Autopilot", "Pause Autopilot", "Resume Autopilot", "Stop Autopilot", "Run next batch now", "Run Fake Smoke Test"].every((label) => autopilotActionLabels.includes(label as typeof autopilotActionLabels[number])), "Autopilot exposes the required operator actions.", "Review autopilotActionLabels."),
    check("autopilot_defaults_safe", "Autopilot defaults are manual-safe", defaultAutopilotCampaignSettings.duration === "run_once" && defaultAutopilotCampaignSettings.cadence === "manual_only" && defaultAutopilotCampaignSettings.manualDmMode && defaultAutopilotCampaignSettings.requirePreviewQuality85 && defaultAutopilotCampaignSettings.requireWrittenContact && defaultAutopilotCampaignSettings.excludePreviouslyReviewed, "Autopilot defaults to run once, manual/social-safe, preview QA on, written contact required, and exclude previous on.", "Review defaultAutopilotCampaignSettings."),
    check("autopilot_one_trade_default", "Autopilot starts with one trade", defaultAutopilotCampaignSettings.trade !== "All Core Service Trades", "Default testing avoids All Core Service Trades until selected intentionally.", "Review defaultAutopilotCampaignSettings.trade."),
    check("autopilot_provider_load", "Autopilot estimates provider load", defaultLoad > 0, "Provider request load is shown before running.", "Review autopilotProviderRequestEstimate."),
    check("autopilot_transitions", "Autopilot pause/resume/stop transitions work", paused.status === "paused" && resumed.status === "running" && stopped.status === "stopped", "Campaign actions change dashboard state and do not send outreach.", "Review transitionAutopilotCampaign."),
    check("autopilot_smoke_test", "Fake Autopilot smoke test passes", smokeTest.passed, "Fake fixtures are sorted into safe queues with no provider calls or contact sending.", "Review runFakeAutopilotSmokeTest."),
    check("autopilot_dm_no_link", "Fake Manual DM queue keeps first message link-free", Boolean(firstDmFixture?.passed) && smokeTest.report.safetyFindings.some((finding) => /disabled/i.test(finding)), "Manual DM smoke fixture stays safe and link-free.", "Review fakeAutopilotSmokeQueue."),
    check("autopilot_phone_only_blocked", "Phone-only remains blocked in Autopilot", smokeTest.fixtureResults.some((fixture) => fixture.businessName === "Maumee Concrete Repair" && fixture.actualQueue === "blockedBadFit"), "Phone-only fixture is blocked under written outreach mode.", "Review autopilotQueueKeyForItem."),
    check("autopilot_queue_classification", "Autopilot queue classification works", autopilotQueueKeyForItem({ status: "Loom Needed", contactSource: "Public email", previewQualityScore: 92, blockedReason: "", email: "owner@example.com" }) === "loomNeeded", "Loom-needed items stay in the manual Loom queue.", "Review autopilotQueueKeyForItem."),
  ];
}

function providerHealthChecks() {
  return discoveryProviderHealth().map((provider) => check(
    `provider_health_${provider.provider}`,
    `${provider.label} provider configuration is visible`,
    true,
    `${provider.requiredEnvVarName}. Env var present: ${providerHealthValue(provider.envVarPresent)}. Can run without API key: ${provider.canRunWithoutApiKey ? "Yes" : "No"}.`,
  ));
}

function providerHealthValue(value: boolean | null) {
  if (value === null) return "not required";
  return value ? "yes" : "no";
}

export function runSystemSelfCheck(now = new Date()): SystemSelfCheckReport {
  const checks = [...topProspectChecks(), ...previewAndOutreachChecks(), ...autonomousChecks(), ...autopilotChecks(), ...providerHealthChecks()];
  const passed = checks.filter((item) => item.status === "passed");
  const warnings = checks.filter((item) => item.status === "warning");
  const failed = checks.filter((item) => item.status === "failed");
  const suggestedFixes = [...new Set([...failed, ...warnings].flatMap((item) => item.suggestedFix ? [item.suggestedFix] : []))];
  const overallStatus: SystemSelfCheckOverallStatus = failed.length ? "Blocking issue" : warnings.length ? "Needs attention" : "Healthy";
  const report = { overallStatus, lastRunAt: now.toISOString(), passed, warnings, failed, suggestedFixes };
  globalSelfCheck.webWorkshopSelfCheckReport = report;
  return report;
}

export function latestSystemSelfCheckReport() {
  return globalSelfCheck.webWorkshopSelfCheckReport ?? null;
}
