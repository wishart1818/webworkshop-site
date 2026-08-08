import assert from "node:assert/strict";
import test from "node:test";
import {
  controlledPilotConfirmation,
  disableAllProspectEmailSending,
  enableControlledEmailPilot,
  runControlledOutreachLaunchReadiness,
  validateControlledPilotSend,
  type ControlledLaunchDependencies,
} from "../lib/controlled-outreach-launch";
import {
  currentOutreachCopyVersion,
  defaultAutonomousGrowthSettings,
  type AutonomousGrowthDashboard,
  type AutonomousGrowthSettings,
  type OutreachQueueItem,
} from "../lib/autonomous-growth";
import {
  createProspect,
  generateOutreach,
  type Prospect,
} from "../lib/prospect-engine";
import type { OperatorActionResult } from "../lib/operator-test-center";

const now = new Date();

function environment(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const defaults: Record<string, string | undefined> = {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
    VERCEL_PROJECT_ID: "project_webworkshop",
    VERCEL_PROJECT_PRODUCTION_URL: "webworkshop.dev",
    NEXT_PUBLIC_APP_URL: "https://webworkshop.dev",
    AUTOPILOT_DISABLED: "false",
    OUTREACH_EMAIL_DISABLED: "false",
    OUTREACH_AUTO_SEND_ENABLED: "true",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "test-only-provider-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "reply@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
    OUTREACH_DAILY_CAP: "1",
  };
  return {
    ...defaults,
    ...overrides,
    NODE_ENV: overrides.NODE_ENV ?? defaults.NODE_ENV,
  } as NodeJS.ProcessEnv;
}

function eligibleProspect(overrides: Partial<Prospect> = {}) {
  const base = createProspect({
    businessName: "Grounded HVAC",
    website: "https://groundedhvac.com",
    phone: "+14195550123",
    email: "info@groundedhvac.com",
    city: "Findlay",
    state: "OH",
    trade: "HVAC",
    serviceArea: "Findlay, OH",
    status: "New",
    sizeIndicator: "Small",
  });
  return {
    ...base,
    status: "Reviewed",
    prospectType: "redesign",
    classification: "website_redesign",
    websiteStatus: "usable",
    websiteStatusDetail: "A meaningful public business website was verified.",
    websiteVerification: {
      version: "website-verification-v2",
      status: "usable",
      confidence: "high",
      canonicalUrl: "https://groundedhvac.com/",
      attempts: [],
      usableSignals: ["meaningful page title", "business name", "service content", "public email"],
      explanation: "A meaningful public business website was verified.",
      checkedAt: now.toISOString(),
      ownershipDecision: "owned",
      identityEvidence: ["The business name and website host match."],
      fit: {
        disposition: "clearly_weak_or_outdated_website",
        reason: "Rendered fixture review found that the quote request is difficult to reach.",
        supportingEvidence: ["The primary customer path does not expose the quote action."],
        confidence: "high",
        analysisOrigin: "rendered_review",
        evaluatedAt: now.toISOString(),
        observation: {
          kind: "quote_path",
          statement: "I noticed the quote request is difficult to reach on the current website.",
          rebuildSentence: "I can rebuild your current website with a more modern design that makes requesting a quote easier while presenting your verified services and contact information more clearly.",
          evidence: ["Rendered fixture review found no quote action in the primary customer path."],
          demoChecklist: ["Show the quote action on desktop", "Show the quote action on mobile"],
        },
      },
    },
    fitDisposition: "clearly_weak_or_outdated_website",
    recommendedContactMethod: "send_email",
    bestManualContactMethod: "email",
    contactConfidence: "high",
    contactPersonName: "",
    contactEvidence: [{
      kind: "email",
      value: "info@groundedhvac.com",
      sourceUrl: "https://groundedhvac.com/contact",
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: now.toISOString(),
      sourceType: "owned_website",
      firstParty: true,
      decision: "autonomous_eligible",
      decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
    }],
    ...overrides,
  } satisfies Prospect;
}

function queueItemFor(prospect: Prospect, env = environment()): OutreachQueueItem {
  const outreach = generateOutreach(prospect, "", env);
  return {
    id: "queue-controlled-1",
    prospectId: prospect.id,
    topProspectResultId: "top-result-controlled-1",
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: `${prospect.city}, ${prospect.state}`,
    website: prospect.website,
    email: prospect.email,
    contactSource: "Public email",
    contactConfidence: 95,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: outreach.subjects[0]!,
    emailBody: outreach.concise,
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Verified local HVAC business with a usable but weak website and a published business email.",
    blockedReason: "",
    reviewScore: 95,
    reviewSummary: "Ready for operator review.",
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
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: outreach.outreachCopyGeneratedAt,
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function settings(): AutonomousGrowthSettings {
  return {
    ...defaultAutonomousGrowthSettings,
    mode: "off",
    killSwitch: true,
    maxEmailsQueuedPerDay: 1,
    maxEmailsSentPerDay: 1,
    followUpsEnabled: false,
  };
}

function fullReadiness(): OperatorActionResult {
  return {
    ok: true,
    message: "Full readiness completed.",
    readiness: {
      failedRecords: [],
    } as unknown as NonNullable<OperatorActionResult["readiness"]>,
  };
}

function testDashboard(currentSettings: AutonomousGrowthSettings, queue: OutreachQueueItem[]) {
  return {
    settings: currentSettings,
    queue,
  } as unknown as AutonomousGrowthDashboard;
}

function dependencies(input: {
  prospect?: Prospect;
  item?: OutreachQueueItem;
  currentSettings?: AutonomousGrowthSettings;
  approved?: boolean;
  queue?: OutreachQueueItem[];
  onUpdateSettings?: (value: Partial<AutonomousGrowthSettings>) => void;
  auditEvents?: Awaited<ReturnType<ControlledLaunchDependencies["getAuditEvents"]>>;
  malformedRecordsOmitted?: number;
} = {}): ControlledLaunchDependencies {
  const prospect = input.prospect ?? eligibleProspect();
  const item = input.item ?? queueItemFor(prospect);
  const currentSettings = input.currentSettings ?? settings();
  const completedAt = new Date().toISOString();
  return {
    getDashboard: async () => testDashboard(currentSettings, input.queue ?? [item]),
    getSettings: async () => currentSettings,
    updateSettings: async (value) => {
      input.onUpdateSettings?.(value);
      return { ...currentSettings, ...value };
    },
    getProspects: async () => ({
      prospects: [prospect],
      diagnostics: { malformedRecordsOmitted: input.malformedRecordsOmitted ?? 0 },
    }),
    getDatabaseHealth: async () => ({
      configured: true,
      reachable: true,
      message: "PostgreSQL and required Prospect Engine tables are reachable.",
    }),
    getLatestSafeTests: async () => ({
      internal_resend: {
        testType: "internal_resend",
        startedAt: completedAt,
        completedAt,
        outcome: "success",
        summary: "Internal operator-owned Resend test passed.",
        providerMessageId: "provider-test-message-id",
        sentOutreach: false,
      },
      internal_notification: {
        testType: "internal_notification",
        startedAt: completedAt,
        completedAt,
        outcome: "success",
        summary: "Internal notification test passed.",
        sentOutreach: false,
      },
    }),
    getPersistedApproval: async () => input.approved ?? false,
    runFullReadiness: async () => fullReadiness(),
    runEmailSafety: async () => ({
      status: "Passed",
      summary: "All email safety gates passed.",
      unsafeQueuedRecords: 0,
    }),
    getMigrationStatus: async () => ({
      schemaCompatible: true,
      migrationApplied: true,
      detail: "Required schema and migration are present.",
    }),
    getAuditEvents: async () => input.auditEvents ?? [],
    recordAudit: async () => true,
  };
}

test("controlled launch readiness exposes one exact permission-first email and sends nothing", async () => {
  const result = await runControlledOutreachLaunchReadiness({
    environment: environment(),
    dependencies: dependencies(),
    now,
  });

  assert.equal(result.status, "READY FOR CONTROLLED PILOT");
  assert.equal(result.activationEnabled, true);
  assert.equal(result.emailPreview?.recipient, "info@groundedhvac.com");
  assert.equal(result.emailPreview?.sourceUrl, "https://groundedhvac.com/contact");
  assert.equal(result.emailPreview?.extractionMethod, "mailto");
  assert.equal(result.emailPreview?.approvalState, "not approved");
  assert.match(result.emailPreview?.body ?? "", /Would you be interested in seeing what that could look like\?/);
  assert.doesNotMatch(result.emailPreview?.body ?? "", /https?:\/\/|already built|built you/i);
  assert.match(result.emailPreview?.body ?? "", /Brendan[\s\S]*WebWorkshop[\s\S]*147 George St, Findlay, OH 45840/);
  assert.match(result.emailPreview?.body ?? "", /rather not hear from me again/i);
  assert.deepEqual(result.outreachSent, {
    emails: 0,
    dms: 0,
    forms: 0,
    calls: 0,
    sms: 0,
    looms: 0,
    previews: 0,
  });
});

test("every failed required readiness check blocks controlled activation", async () => {
  const result = await runControlledOutreachLaunchReadiness({
    environment: environment({
      OUTREACH_DAILY_CAP: "2",
      OUTREACH_FULL_AUTO_SEND_ENABLED: "true",
      RESEND_API_KEY: "",
    }),
    dependencies: dependencies(),
    now,
  });

  assert.equal(result.status, "BLOCKED — ACTION REQUIRED");
  assert.equal(result.activationEnabled, false);
  assert.ok(result.failedChecks.some((check) => check.key === "daily-cap"));
  assert.ok(result.failedChecks.some((check) => check.key === "full-auto-disabled"));
  assert.ok(result.failedChecks.some((check) => check.key === "provider-configured"));
});

test("unverified email and transient website evidence block controlled readiness", async () => {
  const prospect = eligibleProspect({
    websiteStatus: "temporarily_unavailable",
    websiteVerification: {
      version: "website-verification-v1",
      status: "temporarily_unavailable",
      confidence: "medium",
      canonicalUrl: "",
      attempts: [],
      usableSignals: [],
      explanation: "Only a temporary failure was observed.",
      checkedAt: now.toISOString(),
    },
    contactEvidence: [],
  });
  const result = await runControlledOutreachLaunchReadiness({
    environment: environment(),
    dependencies: dependencies({ prospect, item: queueItemFor(prospect) }),
    now,
  });

  assert.equal(result.status, "BLOCKED — ACTION REQUIRED");
  assert.equal(result.emailPreview, null);
  assert.match(result.checks.find((check) => check.key === "candidate-issues")?.detail ?? "", /temporar|source URL/i);
});

test("manual-fit websites and prior sends to the same prospect block controlled readiness", async () => {
  const eligibleBeforeManualReview = eligibleProspect();
  const manualFitItem = queueItemFor(eligibleBeforeManualReview);
  const manualFitProspect = { ...eligibleBeforeManualReview, fitDisposition: "manual_review_required" as const };
  const manualFit = await runControlledOutreachLaunchReadiness({
    environment: environment(),
    dependencies: dependencies({
      prospect: manualFitProspect,
      item: manualFitItem,
    }),
    now,
  });
  assert.equal(manualFit.activationEnabled, false);
  assert.ok(manualFit.failedChecks.some((check) => check.key === "candidate"));

  const prospect = eligibleProspect();
  const item = queueItemFor(prospect);
  const previouslySent: OutreachQueueItem = {
    ...item,
    id: "queue-controlled-prior-send",
    email: "owner@different-domain.example",
    status: "Sent",
    sentDate: "2026-07-27T14:00:00.000Z",
  };
  const priorSend = await runControlledOutreachLaunchReadiness({
    environment: environment(),
    dependencies: dependencies({
      prospect,
      item,
      queue: [item, previouslySent],
    }),
    now,
  });
  assert.equal(priorSend.activationEnabled, false);
  assert.ok(priorSend.failedChecks.some((check) => check.key === "candidate"));
});

test("activation requires exact typed confirmation and changes only controlled database settings", async () => {
  const updates: Array<Partial<AutonomousGrowthSettings>> = [];
  const deps = dependencies({ onUpdateSettings: (value) => updates.push(value) });

  const rejected = await enableControlledEmailPilot({
    confirmation: "enable controlled pilot",
    environment: environment(),
    dependencies: deps,
  });
  assert.equal(rejected.activated, false);
  assert.equal(updates.length, 0);

  const activated = await enableControlledEmailPilot({
    confirmation: controlledPilotConfirmation,
    environment: environment(),
    dependencies: deps,
  });
  assert.equal(activated.activated, true);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    mode: "auto_email_pilot",
    killSwitch: false,
    maxEmailsQueuedPerDay: 1,
    maxEmailsSentPerDay: 1,
    followUpsEnabled: false,
  });
  assert.equal(activated.outreachSent, 0);
  assert.ok(activated.unchangedSafetySettings.includes("Full autonomous email"));
});

test("pre-existing queued approval blocks activation until the operator chooses after activation", async () => {
  const updates: Array<Partial<AutonomousGrowthSettings>> = [];
  const prospect = eligibleProspect();
  const item = {
    ...queueItemFor(prospect),
    status: "Queued" as const,
    queuedDate: now.toISOString(),
    notes: "[auto-email-approved]",
  };
  const deps = dependencies({
    prospect,
    item,
    approved: true,
    onUpdateSettings: (value) => updates.push(value),
  });

  const readiness = await runControlledOutreachLaunchReadiness({
    environment: environment(),
    dependencies: deps,
    now,
  });
  const activation = await enableControlledEmailPilot({
    confirmation: controlledPilotConfirmation,
    environment: environment(),
    dependencies: deps,
  });

  assert.equal(readiness.status, "BLOCKED — ACTION REQUIRED");
  assert.equal(readiness.activationEnabled, false);
  assert.equal(readiness.emailPreview, null);
  assert.equal(readiness.checks.find((check) => check.key === "no-preapproved-queue")?.passed, false);
  assert.equal(activation.activated, false);
  assert.equal(updates.length, 0);
});

test("emergency stop works without readiness and preserves all records", async () => {
  const updates: Array<Partial<AutonomousGrowthSettings>> = [];
  const item = { ...queueItemFor(eligibleProspect()), status: "Sending" as const };
  const result = await disableAllProspectEmailSending({
    dependencies: dependencies({
      item,
      onUpdateSettings: (value) => updates.push(value),
    }),
  });

  assert.equal(result.disabled, true);
  assert.equal(result.sendsInProgress, 1);
  assert.equal(result.recordsPreserved, true);
  assert.equal(result.outreachSent, 0);
  assert.deepEqual(updates, [{ mode: "off", killSwitch: true, followUpsEnabled: false }]);
});

test("post-send validation requires exactly one provider-confirmed send and an exhausted cap", async () => {
  const activationAt = new Date(now.getTime() - 2 * 60_000).toISOString();
  const approvalAt = new Date(now.getTime() - 60_000).toISOString();
  const sentItem = {
    ...queueItemFor(eligibleProspect()),
    status: "Sent" as const,
    sentDate: now.toISOString(),
    notes: "Resend message ID: provider-live-message-id",
  };
  const result = await validateControlledPilotSend({
    environment: environment(),
    dependencies: dependencies({
      item: sentItem,
      currentSettings: {
        ...settings(),
        mode: "auto_email_pilot",
        killSwitch: false,
      },
      auditEvents: [{
        id: "audit-activation-1",
        action: "controlled_email_pilot_activation",
        outcome: "success",
        subject: "authenticated-engine-operator",
        metadata: { confirmationMatched: true, outreachSent: 0 },
        createdAt: activationAt,
      }, {
        id: "audit-approval-1",
        action: "autonomous_email_approval",
        outcome: "success",
        subject: sentItem.email,
        metadata: {
          queueItemId: sentItem.id,
          approvedBy: "authenticated-engine-operator",
        },
        createdAt: approvalAt,
      }, {
        id: "audit-send-1",
        action: "autonomous_email_send",
        outcome: "success",
        subject: sentItem.businessName,
        metadata: {
          queueItemId: sentItem.id,
          providerMessageId: "provider-live-message-id",
        },
        createdAt: now.toISOString(),
      }],
    }),
    now,
  });

  assert.equal(result.status, "PILOT SEND VERIFIED");
  assert.equal(result.activationAuditId, "audit-activation-1");
  assert.equal(result.approvingOperator, "authenticated-engine-operator");
  assert.equal(result.sentToday, 1);
  assert.equal(result.providerMessageId, "provider-live-message-id");
  assert.equal(result.providerSuccessAuditCount, 1);
  assert.equal(result.dailyCapExhausted, true);
  assert.equal(result.noSecondProspectSent, true);
  assert.equal(result.fullAutonomousSendingDisabled, true);
});

test("post-send validation recognizes a sent item after it advances to a later lifecycle status", async () => {
  const activationAt = new Date(now.getTime() - 2 * 60_000).toISOString();
  const approvalAt = new Date(now.getTime() - 60_000).toISOString();
  const repliedItem = {
    ...queueItemFor(eligibleProspect()),
    status: "Positive Reply" as const,
    sentDate: now.toISOString(),
    notes: "Resend message ID: provider-replied-message-id",
  };
  const result = await validateControlledPilotSend({
    environment: environment(),
    dependencies: dependencies({
      item: repliedItem,
      currentSettings: {
        ...settings(),
        mode: "auto_email_pilot",
        killSwitch: false,
      },
      auditEvents: [{
        id: "audit-activation-replied",
        action: "controlled_email_pilot_activation",
        outcome: "success",
        subject: "authenticated-engine-operator",
        metadata: { confirmationMatched: true, outreachSent: 0 },
        createdAt: activationAt,
      }, {
        id: "audit-approval-replied",
        action: "autonomous_email_approval",
        outcome: "success",
        subject: repliedItem.email,
        metadata: {
          queueItemId: repliedItem.id,
          approvedBy: "authenticated-engine-operator",
        },
        createdAt: approvalAt,
      }, {
        id: "audit-send-replied",
        action: "autonomous_email_send",
        outcome: "success",
        subject: repliedItem.businessName,
        metadata: {
          queueItemId: repliedItem.id,
          providerMessageId: "provider-replied-message-id",
        },
        createdAt: now.toISOString(),
      }],
    }),
    now,
  });

  assert.equal(result.status, "PILOT SEND VERIFIED");
  assert.equal(result.sentToday, 1);
  assert.equal(result.queueItemId, repliedItem.id);
  assert.equal(result.providerMessageId, "provider-replied-message-id");
});

test("an unrelated same-day send cannot pass controlled-pilot post-send verification", async () => {
  const sentItem = {
    ...queueItemFor(eligibleProspect()),
    status: "Sent" as const,
    sentDate: now.toISOString(),
    notes: "Resend message ID: provider-unrelated-message-id",
  };
  const result = await validateControlledPilotSend({
    environment: environment(),
    dependencies: dependencies({
      item: sentItem,
      currentSettings: {
        ...settings(),
        mode: "auto_email_pilot",
        killSwitch: false,
      },
      auditEvents: [{
        id: "audit-send-unrelated",
        action: "autonomous_email_send",
        outcome: "success",
        subject: sentItem.businessName,
        metadata: {
          queueItemId: sentItem.id,
          providerMessageId: "provider-unrelated-message-id",
        },
        createdAt: now.toISOString(),
      }],
    }),
    now,
  });

  assert.equal(result.status, "PILOT SEND REQUIRES REVIEW");
  assert.match(result.issues.join(" "), /activation/i);
  assert.equal(result.activationAuditId, "");
});
