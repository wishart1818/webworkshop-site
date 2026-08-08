import assert from "node:assert/strict";
import test from "node:test";
import {
  outreachQueueItemHasPersistedApproval,
  outreachQueueMemoryForTests,
  resetAutonomousGrowthMemoryForTests,
  setOutreachQueueMemoryForTests,
} from "../lib/autonomous-growth-repository";
import {
  currentOutreachCopyVersion,
  type OutreachQueueItem,
} from "../lib/autonomous-growth";
import {
  createProspect,
  generateOutreach,
  type Prospect,
} from "../lib/prospect-engine";
import { prospectQualificationBlockReasons } from "../lib/prospect-qualification";
import {
  getProspect,
  resetProspectMemoryForTests,
  setProspectMemoryForTests,
} from "../lib/prospect-repository";
import {
  auditExistingWebsiteRecords,
  confirmUsableWebsiteNotFit,
  recheckProspectWebsite,
  setProspectWebsiteFitDisposition,
} from "../lib/website-verification-operations";

const now = "2026-07-28T15:00:00.000Z";
const snapshotSecret = "website-repair-review-test-secret";
const postalEnvironment = {
  OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
} as unknown as NodeJS.ProcessEnv;

function legacyProspect(overrides: Partial<Prospect> = {}) {
  const base = createProspect({
    businessName: "True Clean Prowash",
    website: "https://truecleanprowash.com",
    phone: "+16145550123",
    email: "",
    city: "Columbus",
    state: "OH",
    trade: "Pressure Washing",
    serviceArea: "Columbus, OH",
    status: "New",
    sizeIndicator: "Small",
  });
  return {
    ...base,
    status: "Reviewed",
    websiteStatus: "unreachable_website",
    websiteStatusDetail: "Website verification failed after one HTTP 508 response.",
    recommendedContactMethod: "needs_manual_contact_research",
    classification: "phone_only",
    ...overrides,
  } satisfies Prospect;
}

function verifiedWebsiteReport() {
  return {
    version: "website-verification-v2" as const,
    status: "usable" as const,
    confidence: "high" as const,
    canonicalUrl: "https://truecleanprowash.com/",
    attempts: [],
    usableSignals: ["business name", "service content", "contact or quote form"],
    explanation: "A meaningful public business website was verified.",
    checkedAt: now,
    ownershipDecision: "owned" as const,
    identityEvidence: ["The business name and owned host match."],
    fit: {
      disposition: "inconclusive_requires_review" as const,
      reason: "Rendered review is required.",
      supportingEvidence: ["The owned website is usable."],
      confidence: "medium" as const,
      analysisOrigin: "automated_html" as const,
      evaluatedAt: now,
    },
  };
}

function queueItem(prospect: Prospect, status: OutreachQueueItem["status"] = "Queued") {
  const outreach = prospect.outreach ?? generateOutreach(
    { ...prospect, websiteVerification: undefined },
    "",
    postalEnvironment,
  );
  return {
    id: `queue-${prospect.id}`,
    prospectId: prospect.id,
    topProspectResultId: `top-${prospect.id}`,
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: `${prospect.city}, ${prospect.state}`,
    website: prospect.website,
    email: "old-recipient@truecleanprowash.com",
    contactSource: "Public email",
    contactConfidence: 80,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: outreach.subjects[0]!,
    emailBody: outreach.concise,
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Legacy record awaiting verification.",
    blockedReason: "",
    reviewScore: 80,
    reviewSummary: "",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status,
    sourceProvider: "Top Prospects",
    queuedDate: status === "Queued" ? now : "",
    sentDate: status === "Sent" ? now : "",
    followUpDate: "",
    replyStatus: "",
    notes: status === "Queued" ? "[auto-email-approved]" : "",
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: now,
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: now,
    updatedAt: now,
  } satisfies OutreachQueueItem;
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
}

function userAgent(init?: RequestInit) {
  return new Headers(init?.headers).get("user-agent") ?? "";
}

function verificationDependencies(contactEmail = "info@truecleanprowash.com") {
  const homepage = `
    <!doctype html><html><head>
      <title>True Clean Prowash | Exterior Cleaning in Columbus</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href="https://truecleanprowash.com/" />
    </head><body>
      <nav><a href="/">Home</a><a href="/services">Services</a><a href="/contact">Contact</a></nav>
      <h1>True Clean Prowash</h1>
      <p>Residential pressure washing, house washing, and concrete cleaning for homeowners in Columbus.</p>
      <p>Request exterior cleaning for siding, patios, walkways, and driveways.</p>
      <a href="tel:+16145550123">Call (614) 555-0123</a>
      <form action="/quote"><input name="project" /><button>Request a quote</button></form>
      <img src="/crew.jpg" alt="Crew washing residential siding" />
    </body></html>
  `;
  const contact = `
    <!doctype html><html><head><title>Contact True Clean Prowash</title></head><body>
      <h1>Request an exterior cleaning estimate</h1>
      <p>Tell our team which surfaces need attention around your Columbus property.</p>
      <a href="mailto:${contactEmail}">${contactEmail}</a>
      <form><input name="email" /><textarea name="message"></textarea><button>Request estimate</button></form>
    </body></html>
  `;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = requestUrl(input);
    const pathname = new URL(url).pathname;
    if (url === "https://truecleanprowash.com/" && !userAgent(init).startsWith("Mozilla/")) {
      return new Response("Loop detected", { status: 508, headers: { "content-type": "text/html" } });
    }
    if (url === "https://truecleanprowash.com/" && userAgent(init).startsWith("Mozilla/")) {
      return new Response(homepage, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (pathname === "/contact") {
      return new Response(contact, { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response("Not found", { status: 404, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  return {
    fetch: fetchImpl,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => new Date(now),
  };
}

test("existing-record audit is dry-run only until exact confirmation is supplied", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect();
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect)]);
  try {
    const dryRun = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
    });
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.changed, 0);
    assert.equal(dryRun.records[0]?.proposedStatus, "usable");
    assert.match(dryRun.records[0]?.evidence ?? "", /Stored trigger: unreachable_website.*HTTP 508/i);
    assert.deepEqual(
      dryRun.records[0]?.fieldChanges.find((change) => change.field === "email"),
      { field: "email", oldValue: "not recorded", proposedValue: "info@truecleanprowash.com" },
    );
    assert.ok(dryRun.reviewToken.length > 40);
    assert.equal((await getProspect(prospect.id))?.websiteStatus, "unreachable_website");
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "repair",
        dependencies: verificationDependencies(),
        snapshotSecret,
      }),
      /REPAIR VERIFIED WEBSITE RECORDS/,
    );
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("confirmed repair preserves history, revokes stale approval, and returns the record to review", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const original = legacyProspect({
    notes: ["Original operator note."],
    activities: [{
      id: "activity-original",
      type: "analysis",
      label: "Original analysis retained.",
      at: now,
    }],
  });
  const prospect = {
    ...original,
    outreach: {
      ...generateOutreach(original, "", postalEnvironment),
      approved: true,
    },
  };
  const queued = queueItem(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queued]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
    });
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    const repairedQueue = result.records[0];
    const queueAfter = outreachQueueMemoryForTests()[0]!;
    assert.equal(result.mode, "applied");
    assert.equal(result.changed, 1);
    assert.equal(saved?.websiteStatus, "usable");
    assert.equal(saved?.email, "info@truecleanprowash.com");
    assert.ok(saved?.notes.includes("Original operator note."));
    assert.ok(saved?.activities.some((item) => item.id === "activity-original"));
    assert.equal(saved?.outreach?.approved, false);
    assert.equal(repairedQueue?.proposedStatus, "usable");
    assert.equal(queueAfter.status, "Needs Review");
    assert.doesNotMatch(queueAfter.notes, /\[auto-email-approved\]/);
    assert.equal(await outreachQueueItemHasPersistedApproval(queueAfter), false);
    assert.equal(result.nothingSent, true);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("repair apply rejects changed website evidence instead of applying a different proposal", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect();
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect)]);
  try {
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies("info@truecleanprowash.com"),
      snapshotSecret,
    });
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies: verificationDependencies("sales@truecleanprowash.com"),
        reviewToken: review.reviewToken,
        snapshotSecret,
      }),
      /evidence changed since the reviewed dry run/i,
    );
    assert.equal((await getProspect(prospect.id))?.websiteStatus, "unreachable_website");
    assert.equal((await getProspect(prospect.id))?.email, "");
    assert.equal(outreachQueueMemoryForTests()[0]?.status, "Queued");
    assert.match(outreachQueueMemoryForTests()[0]?.notes ?? "", /\[auto-email-approved\]/);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("legacy website audit uses a small bounded request batch", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospects = Array.from({ length: 6 }, (_, index) => legacyProspect({
    id: `legacy-batch-${index + 1}`,
  }));
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests([]);
  try {
    const result = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
    });
    assert.equal(result.inspected, 2);
    assert.equal(result.records.length, 2);
    assert.equal(result.nothingSent, true);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("protected contacted records are never changed by existing-record repair", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ status: "Contacted" });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect, "Sent")]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
    });
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      snapshotSecret,
    });
    assert.equal(result.changed, 0);
    assert.equal(result.skippedProtected, 1);
    assert.match(result.records[0]?.protectedReason ?? "", /Contacted/);
    assert.equal((await getProspect(prospect.id))?.websiteStatus, "unreachable_website");
    assert.equal(result.nothingSent, true);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("protected sent queue history blocks existing-record repair even when the prospect status is still Reviewed", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ status: "Reviewed" });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect, "Sent")]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
    });
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      snapshotSecret,
    });
    assert.equal(result.changed, 0);
    assert.equal(result.skippedProtected, 1);
    assert.match(result.records[0]?.protectedReason ?? "", /queue history is protected/i);
    assert.equal((await getProspect(prospect.id))?.websiteStatus, "unreachable_website");
    assert.equal(outreachQueueMemoryForTests()[0]?.status, "Sent");
    assert.equal(result.nothingSent, true);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("protected queue history is preflighted before any editable approval is revoked", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({
    websiteStatus: "usable",
    websiteStatusDetail: "A meaningful public business website was verified.",
    websiteVerification: verifiedWebsiteReport(),
    fitDisposition: "inconclusive_requires_review",
  });
  const editable = { ...queueItem(prospect, "Queued"), id: "queue-editable" };
  const sent = { ...queueItem(prospect, "Sent"), id: "queue-sent" };
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([editable, sent]);
  try {
    await assert.rejects(
      confirmUsableWebsiteNotFit(prospect.id, true),
      /protected outreach or contact history/i,
    );
    const queueAfter = outreachQueueMemoryForTests();
    assert.equal(queueAfter.find((item) => item.id === editable.id)?.status, "Queued");
    assert.match(queueAfter.find((item) => item.id === editable.id)?.notes ?? "", /\[auto-email-approved\]/);
    assert.equal(queueAfter.find((item) => item.id === sent.id)?.status, "Sent");
    assert.equal((await getProspect(prospect.id))?.fitDisposition, "inconclusive_requires_review");
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("usable-not-fit disposition removes eligibility without recording contact or sending", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({
    websiteStatus: "usable",
    websiteStatusDetail: "A meaningful public business website was verified.",
    websiteVerification: verifiedWebsiteReport(),
    fitDisposition: "inconclusive_requires_review",
  });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect)]);
  try {
    const result = await confirmUsableWebsiteNotFit(prospect.id, true);
    const saved = await getProspect(prospect.id);
    assert.equal(result.nothingSent, true);
    assert.equal(saved?.fitDisposition, "strong_existing_website");
    assert.equal(saved?.status, "Reviewed");
    assert.ok(saved?.activities.some((item) => /not a fit/i.test(item.label) && /nothing was sent/i.test(item.label)));
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("website re-check cannot mutate protected contacted history", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ status: "Contacted" });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([]);
  try {
    await assert.rejects(
      recheckProspectWebsite(prospect.id, verificationDependencies()),
      /protected outreach or contact history/i,
    );
    assert.deepEqual(await getProspect(prospect.id), prospect);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("manual weak-fit reason stays internal until a grounded customer-facing observation is verified", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({
    websiteStatus: "usable",
    websiteStatusDetail: "A meaningful public business website was verified.",
    websiteVerification: verifiedWebsiteReport(),
    fitDisposition: "inconclusive_requires_review",
  });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect)]);
  try {
    const result = await setProspectWebsiteFitDisposition({
      prospectId: prospect.id,
      disposition: "clearly_weak_or_outdated_website",
      reason: "The operator observed a weak quote-request path in the rendered website.",
      confirmed: true,
    });
    assert.equal(result.prospect.websiteVerification?.fit?.observation, undefined);
    assert.match(prospectQualificationBlockReasons(result.prospect).join(" "), /No evidence-backed outreach observation is saved/i);
    assert.equal(result.nothingSent, true);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("an active provider attempt blocks fit mutation and remains untouched", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({
    websiteStatus: "usable",
    websiteStatusDetail: "A meaningful public business website was verified.",
    websiteVerification: verifiedWebsiteReport(),
    fitDisposition: "inconclusive_requires_review",
  });
  const sending = {
    ...queueItem(prospect, "Sending"),
    notes: "[auto-email-claim:active-attempt]",
  };
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([sending]);
  try {
    await assert.rejects(
      confirmUsableWebsiteNotFit(prospect.id, true),
      /provider attempt is in progress/i,
    );
    assert.equal((await getProspect(prospect.id))?.fitDisposition, "inconclusive_requires_review");
    assert.equal(outreachQueueMemoryForTests()[0]?.status, "Sending");
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});
