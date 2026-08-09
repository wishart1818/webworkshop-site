import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  outreachQueueItemHasPersistedApproval,
  outreachQueueMemoryForTests,
  resetAutonomousGrowthMemoryForTests,
  setAtomicWebsiteRepairFailureProspectIdForTests,
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
import { prospectCurrentBucket } from "../lib/prospect-funnel";
import { prospectQualificationBlockReasons, websiteFitAllowsAutonomousOutreach } from "../lib/prospect-qualification";
import {
  getProspect,
  resetProspectMemoryForTests,
  setProspectMemoryForTests,
} from "../lib/prospect-repository";
import { enforceRateLimit, memoryAuditEventsForTests, resetOperationalMemoryForTests } from "../lib/operational-controls";
import { verifyProspectWebsite } from "../lib/site-analysis";
import { enforceWebsiteRepairApplyRateLimit } from "../lib/website-repair-rate-limit";
import {
  auditExistingWebsiteRecords,
  confirmUsableWebsiteNotFit,
  inspectCandidatesBounded,
  recheckProspectWebsite,
  setProspectWebsiteFitDisposition,
  websiteRepairConcurrency,
  websiteRepairReviewTokenMaxLength,
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

function verificationDependencies(contactEmail = "info@truecleanprowash.com", businessName = "True Clean Prowash") {
  const homepage = `
    <!doctype html><html><head>
      <title>${businessName} | Exterior Cleaning in Columbus</title>
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

function inconclusiveWebsiteDependencies() {
  const homepage = `
    <!doctype html><html><head>
      <title>True Clean Prowash | Columbus Exterior Cleaning</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href="https://truecleanprowash.com/" />
    </head><body>
      <h1>True Clean Prowash</h1>
      <p>Residential exterior cleaning and pressure washing in Columbus.</p>
    </body></html>
  `;
  return {
    fetch: (async (input: Parameters<typeof fetch>[0]) => {
      const url = requestUrl(input);
      if (new URL(url).pathname === "/") {
        return new Response(homepage, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("Not found", { status: 404, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => new Date(now),
  };
}

function contactEnrichmentDependencies() {
  const base = verificationDependencies("new-contact@truecleanprowash.com");
  const baseFetch = base.fetch!;
  return {
    ...base,
    fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (new URL(requestUrl(input)).pathname === "/contact") {
        return new Response(`
    <!doctype html><html><head><title>Contact True Clean Prowash</title></head><body>
            <h1>Request an exterior cleaning estimate</h1>
            <a href="mailto:new-contact@truecleanprowash.com">new-contact@truecleanprowash.com</a>
            <a href="https://www.facebook.com/truecleanprowash">Facebook</a>
            <a href="https://www.instagram.com/accounts/login">Instagram</a>
            <a href="https://www.linkedin.com/company/truecleanprowash">LinkedIn</a>
            <form action="/free-estimate"><input name="email" /><button>Request estimate</button></form>
          </body></html>
        `, { status: 200, headers: { "content-type": "text/html" } });
      }
      return baseFetch(input, init);
    }) as typeof fetch,
  };
}

function noEmailEvidenceDependencies() {
  const base = verificationDependencies();
  const baseFetch = base.fetch!;
  return {
    ...base,
    fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (new URL(requestUrl(input)).pathname === "/contact") {
        return new Response(`
          <!doctype html><html><head><title>Contact True Clean Prowash</title></head><body>
            <h1>Request an exterior cleaning estimate</h1>
            <form action="/quote"><input name="phone" /><button>Request estimate</button></form>
          </body></html>
        `, { status: 200, headers: { "content-type": "text/html" } });
      }
      return baseFetch(input, init);
    }) as typeof fetch,
  };
}

const preservedContactFields = [
  "email",
  "phone",
  "contactPageUrl",
  "contactFormUrl",
  "quoteFormUrl",
  "contactFormDetected",
  "quoteFormDetected",
  "facebookUrl",
  "instagramUrl",
  "linkedinUrl",
  "xUrl",
  "youtubeUrl",
  "contactPersonName",
  "contactConfidence",
  "contactEvidence",
  "contactDiscoveryNotes",
  "recommendedContactMethod",
  "bestManualContactMethod",
  "address",
] as const satisfies readonly (keyof Prospect)[];

function contactState(prospect: Prospect) {
  return Object.fromEntries(preservedContactFields.map((field) => [field, structuredClone(prospect[field])]));
}

function tamperReviewedProposal(token: string, value: string) {
  const [encodedPayload, signature] = token.split(".");
  const payload = JSON.parse(inflateRawSync(Buffer.from(encodedPayload!, "base64url")).toString("utf8")) as {
    records: Array<{
      proposedPatch: { entries: Array<{ field: string; unset: boolean; value?: unknown }> } | null;
    }>;
  };
  const websiteStatusEntry = payload.records[0]?.proposedPatch?.entries.find((entry) => entry.field === "websiteStatus");
  assert.ok(websiteStatusEntry);
  websiteStatusEntry.value = value;
  return `${deflateRawSync(Buffer.from(JSON.stringify(payload)), { level: 9 }).toString("base64url")}.${signature}`;
}

function reviewedPatchValue(token: string, field: string) {
  const [encodedPayload] = token.split(".");
  const payload = JSON.parse(inflateRawSync(Buffer.from(encodedPayload!, "base64url")).toString("utf8")) as {
    records: Array<{
      proposedPatch: { entries: Array<{ field: string; unset: boolean; value?: unknown }> } | null;
    }>;
  };
  const entry = payload.records[0]?.proposedPatch?.entries.find((candidate) => candidate.field === field);
  assert.ok(entry, `Expected a reviewed ${field} patch.`);
  return entry.unset ? undefined : entry.value;
}

test("existing-record audit is dry-run only until exact confirmation is supplied", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
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
    assert.equal(dryRun.selectedCount, 0);
    assert.deepEqual(dryRun.selectedProspectIds, []);
    assert.equal(dryRun.records[0]?.currentProspectStatus, "Reviewed");
    assert.deepEqual(dryRun.records[0]?.currentQueueStatuses, ["Queued"]);
    assert.equal(dryRun.records[0]?.proposedStatus, "usable");
    assert.equal(dryRun.records[0]?.proposedDisposition, "adequate_existing_website");
    assert.equal(dryRun.records[0]?.websiteEvidenceSufficient, true);
    assert.equal(dryRun.records[0]?.contactEvidenceSufficient, true);
    assert.equal(dryRun.records[0]?.autonomouslyEligible, false);
    assert.equal(dryRun.records[0]?.proposedOutcome, "exclude_from_rebuild_outreach");
    assert.equal(dryRun.records[0]?.selectionEligible, true);
    assert.equal(dryRun.records[0]?.highConfidenceExclusionEligible, true);
    assert.match(dryRun.records[0]?.exactReason ?? "", /regardless of business score/i);
    assert.match(dryRun.records[0]?.evidence ?? "", /Stored trigger: unreachable_website.*HTTP 508/i);
    assert.equal(dryRun.records[0]?.fieldChanges.some((change) => change.field === "email"), false);
    assert.match(dryRun.records[0]?.newlyFoundContactPaths.join(" ") ?? "", /info@truecleanprowash\.com/i);
    assert.ok(dryRun.reviewToken.length > 40);
    assert.equal((await getProspect(prospect.id))?.websiteStatus, "unreachable_website");
    assert.equal(outreachQueueMemoryForTests()[0]?.status, "Queued");
    assert.equal(memoryAuditEventsForTests().length, 0);
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
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    const repairedQueue = result.records[0];
    const queueAfter = outreachQueueMemoryForTests()[0]!;
    assert.equal(result.mode, "applied");
    assert.equal(result.changed, 1);
    assert.equal(saved?.websiteStatus, "usable");
    assert.equal(saved?.email, prospect.email);
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

test("repair apply uses the signed reviewed proposal without another website crawl", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospect = legacyProspect();
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect)]);
  try {
    let applying = false;
    let applyCrawlCalls = 0;
    const reviewedDependencies = verificationDependencies("info@truecleanprowash.com");
    const reviewedFetch = reviewedDependencies.fetch!;
    const dependencies = {
      ...reviewedDependencies,
      fetch: (async (...args: Parameters<typeof fetch>) => {
        if (applying) {
          applyCrawlCalls += 1;
          throw new Error("Apply must not invoke external website verification.");
        }
        return reviewedFetch(...args);
      }) as typeof fetch,
    };
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
    });
    assert.ok(review.reviewToken.length > 2_000);
    applying = true;
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    assert.equal(result.changed, 1);
    assert.equal(saved?.websiteStatus, review.records[0]?.proposedStatus);
    assert.equal(saved?.fitDisposition, review.records[0]?.proposedDisposition);
    assert.equal(saved?.email, prospect.email);
    assert.deepEqual(saved?.websiteVerification, reviewedPatchValue(review.reviewToken, "websiteVerification"));
    assert.deepEqual(saved?.analysis, prospect.analysis);
    assert.equal(applyCrawlCalls, 0);
    assert.equal(result.nothingSent, true);
    assert.equal(memoryAuditEventsForTests().some((event) => /send/i.test(event.action)), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("adequate-site exclusion persists only website state and preserves all discovered and stored contact data", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospect = legacyProspect({
    id: "website-only-adequate",
    email: "stored-contact@example.net",
    contactPageUrl: "",
    contactFormUrl: "https://example.net/form",
    quoteFormUrl: "https://example.net/quote",
    contactFormDetected: true,
    quoteFormDetected: true,
    facebookUrl: "",
    instagramUrl: "https://instagram.com/stored-business",
    linkedinUrl: "https://linkedin.com/company/stored-business",
    xUrl: "https://x.com/stored-business",
    youtubeUrl: "https://youtube.com/@stored-business",
    contactPersonName: "Verified Contact",
    contactConfidence: "medium",
    contactEvidence: [{
      kind: "email",
      value: "stored-contact@example.net",
      sourceUrl: "https://example.net/contact",
      extractionMethod: "visible_text",
      confidence: "medium",
      domainMatchesBusiness: false,
      discoveredAt: "2026-07-01T12:00:00.000Z",
      sourceType: "provider",
      firstParty: false,
      decision: "manual_review_required",
      decisionReason: "Stored legacy contact evidence requires separate review.",
    }],
    contactDiscoveryNotes: ["Existing contact research note."],
    recommendedContactMethod: "verify_email_manually",
    bestManualContactMethod: "facebook",
    address: "123 Existing Contact Ave, Columbus, OH",
  });
  const queue = queueItem(prospect);
  const contactBefore = contactState(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queue]);
  try {
    const dependencies = contactEnrichmentDependencies();
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    const record = review.records[0]!;
    assert.equal(record.proposedOutcome, "exclude_from_rebuild_outreach");
    assert.equal(record.highConfidenceExclusionEligible, true);
    assert.equal(record.contactEvidenceSufficient, true);
    assert.equal(record.changedFields.every((field) => [
      "website",
      "websiteStatus",
      "websiteStatusDetail",
      "websiteVerification",
      "fitDisposition",
    ].includes(field)), true);
    assert.equal(record.changedFields.some((field) => preservedContactFields.includes(field as typeof preservedContactFields[number])), false);
    assert.equal(record.proposedEmail, prospect.email);
    assert.match(record.newlyFoundContactPaths.join(" "), /contact page: https:\/\/truecleanprowash\.com\/contact/i);
    assert.match(record.newlyFoundContactPaths.join(" "), /facebook\.com\/truecleanprowash/i);

    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    assert.equal(result.changed, 1);
    assert.ok(saved);
    assert.deepEqual(contactState(saved!), contactBefore);
    assert.equal(saved?.instagramUrl, "https://instagram.com/stored-business");
    assert.equal(saved?.classification, prospect.classification);
    assert.equal(saved?.prospectType, prospect.prospectType);
    assert.deepEqual(saved?.notes, prospect.notes);
    assert.deepEqual(saved?.activities, prospect.activities);
    assert.equal(saved?.websiteStatus, "usable");
    assert.equal(saved?.fitDisposition, "adequate_existing_website");
    assert.equal(saved?.websiteVerification?.version, "website-verification-v2");
    assert.equal(saved?.websiteVerification?.freshness, undefined);
    assert.equal(result.nothingSent, true);
    assert.equal(memoryAuditEventsForTests().some((event) => /provider.*send|outreach.*send/i.test(event.action)), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("strong-site exclusion uses the same website-only allowlist", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const dependencies = contactEnrichmentDependencies();
  const baseline = await verifyProspectWebsite(legacyProspect({ id: "strong-baseline" }), dependencies);
  const prospect = legacyProspect({
    id: "website-only-strong",
    websiteStatus: "usable",
    websiteStatusDetail: "Legacy strong-site review requires v2 migration.",
    fitDisposition: "strong_existing_website",
    websiteVerification: {
      ...baseline.report,
      version: "website-verification-v1",
      fit: {
        disposition: "strong_existing_website",
        reason: "A rendered operator review confirmed a complete existing website.",
        supportingEvidence: ["The current site has complete branding, services, and customer contact paths."],
        confidence: "high",
        analysisOrigin: "rendered_review",
        evaluatedAt: now,
      },
    },
    email: "stored@example.net",
    instagramUrl: "https://instagram.com/stored-strong-site",
    contactEvidence: [],
    recommendedContactMethod: "verify_email_manually",
    bestManualContactMethod: "instagram",
  });
  const contactBefore = contactState(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect, "Needs Review")]);
  try {
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    assert.equal(review.records[0]?.proposedDisposition, "strong_existing_website");
    assert.equal(review.records[0]?.highConfidenceExclusionEligible, true);
    assert.equal(review.records[0]?.changedFields.some((field) => preservedContactFields.includes(field as typeof preservedContactFields[number])), false);
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    assert.equal(result.changed, 1);
    assert.ok(saved);
    assert.equal(saved?.fitDisposition, "strong_existing_website");
    assert.equal(saved?.websiteVerification?.version, "website-verification-v2");
    assert.deepEqual(contactState(saved!), contactBefore);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("contact evidence is irrelevant to a valid high-confidence website exclusion", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ id: "exclusion-without-contact-evidence", phone: "", email: "", contactEvidence: [] });
  const contactBefore = contactState(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect, "Needs Review")]);
  try {
    const dependencies = noEmailEvidenceDependencies();
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    assert.equal(review.records[0]?.contactEvidenceSufficient, false);
    assert.equal(review.records[0]?.proposedOutcome, "exclude_from_rebuild_outreach");
    assert.equal(review.records[0]?.highConfidenceExclusionEligible, true);
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    assert.equal(result.changed, 1);
    assert.ok(saved);
    assert.deepEqual(contactState(saved!), contactBefore);
    assert.equal(saved?.fitDisposition, "adequate_existing_website");
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("website-only exclusion persists a genuine owned canonical correction", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({
    id: "website-canonical-correction",
    website: "http://truecleanprowash.com/legacy",
  });
  const contactBefore = contactState(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect, "Needs Review")]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    assert.equal(review.records[0]?.changedFields.includes("website"), true);
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    assert.equal(result.changed, 1);
    assert.equal(saved?.website, "https://truecleanprowash.com/");
    assert.deepEqual(contactState(saved!), contactBefore);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("current v2 exclusion with inconsistent persisted website status remains repairable", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const baseline = await verifyProspectWebsite(legacyProspect({ id: "current-v2-status-baseline" }), verificationDependencies());
  const prospect = {
    ...baseline.prospect,
    id: "current-v2-inconsistent-status",
    status: "Reviewed" as const,
    websiteStatus: "unreachable_website" as const,
    websiteStatusDetail: "Website verification failed after one HTTP 508 response.",
    fitDisposition: "adequate_existing_website" as const,
    websiteVerification: {
      ...baseline.report,
      fit: {
        ...baseline.report.fit!,
        disposition: "adequate_existing_website" as const,
        confidence: "high" as const,
      },
    },
  } satisfies Prospect;
  const contactBefore = contactState(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([{ ...queueItem(prospect, "Needs Review"), outreachCopyVersion: "legacy_copy_v1" }]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    assert.equal(review.candidates, 1);
    assert.equal(review.records[0]?.highConfidenceExclusionEligible, true);
    assert.equal(review.records[0]?.changedFields.includes("websiteStatus"), true);
    assert.equal(review.records[0]?.changedFields.includes("websiteStatusDetail"), true);
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const saved = await getProspect(prospect.id);
    assert.equal(result.changed, 1);
    assert.equal(saved?.websiteStatus, "usable");
    assert.doesNotMatch(saved?.websiteStatusDetail ?? "", /508|failed/i);
    assert.deepEqual(contactState(saved!), contactBefore);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("American Dream-style completed exclusions replay as no-op and leave legacy candidate scope", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospect = legacyProspect({
    id: "american-dream-pressure-clean",
    businessName: "American Dream Pressure Clean",
  });
  const oldQueue = { ...queueItem(prospect), outreachCopyVersion: "legacy_copy_v1" };
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([oldQueue]);
  try {
    const dependencies = verificationDependencies("info@truecleanprowash.com", prospect.businessName);
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    const first = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    const prospectAfterFirst = await getProspect(prospect.id);
    const queueAfterFirst = structuredClone(outreachQueueMemoryForTests());
    assert.equal(first.changed, 1);
    assert.equal(websiteFitAllowsAutonomousOutreach(prospectAfterFirst!), false);
    assert.equal(prospectCurrentBucket(prospectAfterFirst!), "website_already_strong");
    assert.match(prospectQualificationBlockReasons(prospectAfterFirst!).join(" "), /website fit|adequate|strong/i);
    assert.equal(queueAfterFirst[0]?.status, "Needs Review");
    assert.equal(queueAfterFirst[0]?.queuedDate, "");
    assert.doesNotMatch(queueAfterFirst[0]?.notes ?? "", /\[auto-email-approved\]/);
    assert.equal(await outreachQueueItemHasPersistedApproval(queueAfterFirst[0]!), false);
    assert.match(queueAfterFirst[0]?.blockedReason ?? "", /current verified website fit excludes this prospect/i);
    assert.match(queueAfterFirst[0]?.notes ?? "", /safe readiness repair: current verified website fit excludes this prospect/i);
    const [encodedReview] = review.reviewToken.split(".");
    const reviewedPayload = JSON.parse(inflateRawSync(Buffer.from(encodedReview!, "base64url")).toString("utf8")) as {
      records: Array<{ proposedPatch: { entries: Array<{ field: keyof Prospect; unset: boolean; value?: unknown }> } }>;
    };
    const expectedAfterFirst = structuredClone(prospect) as Prospect & Record<string, unknown>;
    for (const entry of reviewedPayload.records[0]!.proposedPatch.entries) {
      expectedAfterFirst[entry.field] = entry.unset ? undefined : structuredClone(entry.value);
    }
    if (expectedAfterFirst.outreach?.approved) {
      expectedAfterFirst.outreach = { ...expectedAfterFirst.outreach, approved: false };
    }
    assert.deepEqual(prospectAfterFirst, expectedAfterFirst);

    const repeated = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies: {
        ...dependencies,
        fetch: async () => { throw new Error("Repeated apply must not crawl."); },
      },
      reviewToken: review.reviewToken,
      selectedProspectIds: [prospect.id],
      snapshotSecret,
    });
    assert.equal(repeated.changed, 0);
    assert.deepEqual(await getProspect(prospect.id), prospectAfterFirst);
    assert.deepEqual(outreachQueueMemoryForTests(), queueAfterFirst);

    let auditCrawlCalls = 0;
    const current = structuredClone(prospectAfterFirst!);
    current.websiteVerification = {
      ...current.websiteVerification!,
      checkedAt: "2026-07-28T15:05:00.000Z",
      attempts: [...current.websiteVerification!.attempts].reverse(),
      usableSignals: [...current.websiteVerification!.usableSignals].reverse(),
      identityEvidence: [...(current.websiteVerification!.identityEvidence ?? [])].reverse(),
      fit: {
        ...current.websiteVerification!.fit!,
        evaluatedAt: "2026-07-28T15:05:00.000Z",
        supportingEvidence: [...(current.websiteVerification!.fit?.supportingEvidence ?? [])].reverse(),
      },
    };
    current.contactEvidence = [{
      kind: "email",
      value: "read-only-change@truecleanprowash.com",
      sourceUrl: "https://truecleanprowash.com/contact",
      extractionMethod: "visible_text",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: "2026-07-28T15:05:00.000Z",
    }];
    assert.equal(current.websiteStatus, "usable");
    assert.equal(current.websiteVerification?.version, "website-verification-v2");
    assert.equal(current.websiteVerification?.status, "usable");
    assert.equal(current.websiteVerification?.confidence, "high");
    assert.equal(current.websiteVerification?.ownershipDecision, "owned");
    assert.equal(current.website, current.websiteVerification?.canonicalUrl.replace(/\/$/, ""));
    assert.ok(current.websiteStatusDetail.trim());
    assert.match(current.websiteStatusDetail, /meaningful public business website was verified/i);
    assert.ok(current.websiteVerification?.identityEvidence?.length);
    assert.equal(current.websiteVerification?.fit?.disposition, current.fitDisposition);
    assert.equal(current.websiteVerification?.fit?.confidence, "high");
    setProspectMemoryForTests([current]);
    setOutreachQueueMemoryForTests([{ ...queueAfterFirst[0]!, outreachCopyVersion: "legacy_copy_v1" }]);
    const freshAudit = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: {
        ...dependencies,
        fetch: async () => {
          auditCrawlCalls += 1;
          throw new Error("Already-current exclusions must leave website-repair candidate scope.");
        },
      },
      snapshotSecret,
    });
    assert.equal(freshAudit.candidates, 0);
    assert.equal(freshAudit.inspected, 0);
    assert.equal(auditCrawlCalls, 0);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: false,
        dependencies,
        prospectId: prospect.id,
        snapshotSecret,
      }),
      /not part of the current legacy website audit inventory/i,
    );
    assert.equal(memoryAuditEventsForTests().some((event) => /provider.*send|outreach.*send/i.test(event.action)), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("legacy website audit uses an explicit bounded request batch without hiding remaining candidates", async () => {
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
      limit: 3,
    });
    assert.equal(result.candidates, 6);
    assert.equal(result.inspected, 3);
    assert.equal(result.remainingCandidates, 3);
    assert.equal(result.rangeStart, 1);
    assert.equal(result.rangeEnd, 3);
    assert.equal(result.currentPage, 1);
    assert.equal(result.totalPages, 2);
    assert.equal(result.previousOffset, null);
    assert.equal(result.nextOffset, 3);
    assert.equal(result.records.length, 3);
    assert.equal(result.nothingSent, true);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("protected contacted records cannot be selected for existing-record repair", async () => {
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
    assert.equal(review.records[0]?.selectionEligible, false);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [prospect.id],
        snapshotSecret,
      }),
      /protected or has no reviewed mutable change/i,
    );
    assert.match(review.records[0]?.protectedReason ?? "", /Contacted/);
    assert.equal((await getProspect(prospect.id))?.websiteStatus, "unreachable_website");
    assert.equal(outreachQueueMemoryForTests()[0]?.status, "Sent");
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("protected sent queue history cannot be selected even when the prospect status is still Reviewed", async () => {
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
    assert.equal(review.records[0]?.selectionEligible, false);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [prospect.id],
        snapshotSecret,
      }),
      /protected or has no reviewed mutable change/i,
    );
    assert.match(review.records[0]?.protectedReason ?? "", /queue history is protected/i);
    assert.equal((await getProspect(prospect.id))?.websiteStatus, "unreachable_website");
    assert.equal(outreachQueueMemoryForTests()[0]?.status, "Sent");
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

test("legacy Needs Review inventory is inspected even without a legacy error status", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({
    id: "legacy-needs-review",
    websiteStatus: "usable",
    websiteStatusDetail: "Legacy usable status without v2 evidence.",
    classification: "website_redesign",
    recommendedContactMethod: "send_email",
    websiteVerification: undefined,
  });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect, "Needs Review")]);
  try {
    const result = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
    });
    assert.equal(result.inspected, 1);
    assert.equal(result.records[0]?.businessName, "True Clean Prowash");
    assert.equal(result.records[0]?.legacyCandidate, true);
    assert.equal(result.records[0]?.proposedOutcome, "exclude_from_rebuild_outreach");
    assert.equal(result.nothingSent, true);
    assert.equal((await getProspect(prospect.id))?.websiteVerification, undefined);
    assert.equal(outreachQueueMemoryForTests()[0]?.status, "Needs Review");
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("a full reviewed batch produces a bounded signed review artifact", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospects = Array.from({ length: 20 }, (_, index) => legacyProspect({
    id: `signed-review-batch-${index + 1}`,
    businessName: `Signed Review Business ${index + 1}`,
  }));
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests(prospects.map((prospect) => queueItem(prospect)));
  try {
    const result = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
      limit: 20,
    });
    assert.equal(result.inspected, 20);
    assert.ok(result.reviewToken.length > 2_000);
    assert.ok(result.reviewToken.length <= websiteRepairReviewTokenMaxLength);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("suppression, reply, and provider-attempt history remain byte-for-byte unchanged", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospects = [
    legacyProspect({ id: "protected-suppressed" }),
    legacyProspect({ id: "protected-replied" }),
    legacyProspect({ id: "protected-provider" }),
  ];
  const queue = [
    queueItem(prospects[0]!, "Suppressed"),
    { ...queueItem(prospects[1]!, "Replied"), replyStatus: "Reply recorded" },
    { ...queueItem(prospects[2]!, "Sending"), notes: "[auto-email-ambiguous] Provider outcome pending." },
  ];
  const prospectsBefore = structuredClone(prospects);
  const queueBefore = structuredClone(queue);
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests(queue);
  try {
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
    });
    assert.equal(review.records.every((record) => !record.selectionEligible), true);
    assert.equal(review.records.every((record) => record.proposedOutcome === "protected"), true);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies: verificationDependencies(),
        reviewToken: review.reviewToken,
        selectedProspectIds: [prospects[0]!.id],
        snapshotSecret,
      }),
      /protected or has no reviewed mutable change/i,
    );
    assert.deepEqual(await Promise.all(prospects.map((prospect) => getProspect(prospect.id))), prospectsBefore);
    assert.deepEqual(outreachQueueMemoryForTests(), queueBefore);
    assert.equal(memoryAuditEventsForTests().some((event) => /send/i.test(event.action)), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("selective repair changes only the explicitly selected signed-snapshot record", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const selected = legacyProspect({ id: "selective-repair-1" });
  const unselected = legacyProspect({ id: "selective-repair-2" });
  const selectedQueue = queueItem(selected);
  const unselectedQueue = queueItem(unselected);
  const unselectedBefore = structuredClone(unselected);
  const unselectedQueueBefore = structuredClone(unselectedQueue);
  setProspectMemoryForTests([selected, unselected]);
  setOutreachQueueMemoryForTests([selectedQueue, unselectedQueue]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 2,
    });
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [selected.id],
      snapshotSecret,
      limit: 2,
    });
    const queueAfter = outreachQueueMemoryForTests();
    assert.equal(result.changed, 1);
    assert.equal(result.selectedCount, 1);
    assert.deepEqual(result.selectedProspectIds, [selected.id]);
    const selectedAfter = await getProspect(selected.id);
    assert.equal(selectedAfter?.websiteStatus, "usable");
    assert.match(prospectQualificationBlockReasons(selectedAfter!).join(" "), /not a fit for rebuild outreach/i);
    assert.deepEqual(await getProspect(unselected.id), unselectedBefore);
    assert.equal(queueAfter.find((item) => item.id === selectedQueue.id)?.status, "Needs Review");
    assert.match(queueAfter.find((item) => item.id === selectedQueue.id)?.notes ?? "", /website fit excludes.*non-sendable/i);
    assert.deepEqual(queueAfter.find((item) => item.id === unselectedQueue.id), unselectedQueueBefore);
    assert.equal(result.nothingSent, true);
    assert.equal(memoryAuditEventsForTests().some((event) => /send/i.test(event.action)), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("two distinct reviewed batches can be applied in one bounded cleanup session", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const first = legacyProspect({ id: "bounded-session-1" });
  const second = legacyProspect({ id: "bounded-session-2" });
  setProspectMemoryForTests([first, second]);
  setOutreachQueueMemoryForTests([queueItem(first), queueItem(second)]);
  try {
    const dependencies = verificationDependencies();
    let cleanupAttemptCount = 0;
    const localEnforce: typeof enforceRateLimit = async (input) => {
      cleanupAttemptCount += 1;
      return {
        count: cleanupAttemptCount,
        remaining: input.limit - cleanupAttemptCount,
        resetsAt: new Date(Date.parse(now) + input.windowMs).toISOString(),
      };
    };
    const firstReview = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 1,
      offset: 0,
    });
    const secondReview = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 1,
      offset: 1,
    });
    assert.notEqual(firstReview.records[0]?.prospectId, secondReview.records[0]?.prospectId);

    const firstLimit = await enforceWebsiteRepairApplyRateLimit(localEnforce);
    const firstResult = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: firstReview.reviewToken,
      selectedProspectIds: [firstReview.records[0]!.prospectId],
      snapshotSecret,
      limit: 1,
      offset: 0,
    });
    const secondLimit = await enforceWebsiteRepairApplyRateLimit(localEnforce);
    const secondResult = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: secondReview.reviewToken,
      selectedProspectIds: [secondReview.records[0]!.prospectId],
      snapshotSecret,
      limit: 1,
      offset: 1,
    });

    assert.equal(firstLimit.count, 1);
    assert.equal(secondLimit.count, 2);
    assert.equal(firstResult.changed, 1);
    assert.equal(secondResult.changed, 1);
    assert.equal(memoryAuditEventsForTests().some((event) => /send|provider/i.test(event.action)), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("a production-shaped nine-record exclusion batch applies atomically and leaves legacy scope", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospects = Array.from({ length: 9 }, (_, index) => {
    const original = legacyProspect({
      id: `production-shaped-exclusion-${index + 1}`,
      notes: index % 2 === 0 ? [`Safe note B${index}.`, `Safe note A${index}.`] : [],
      activities: index % 3 === 0 ? [
        { id: `activity-b-${index}`, type: "analysis", label: "Second website review event.", at: now },
        { id: `activity-a-${index}`, type: "analysis", label: "First website review event.", at: now },
      ] : [],
      contactEvidence: index % 2 === 0 ? [] : [{
        kind: "phone",
        value: `+16145550${String(index).padStart(3, "0")}`,
        sourceUrl: "https://truecleanprowash.com/contact",
        extractionMethod: "tel",
        confidence: "medium",
        domainMatchesBusiness: true,
        discoveredAt: now,
      }],
    });
    return index % 4 === 0
      ? { ...original, outreach: { ...generateOutreach(original, "", postalEnvironment), approved: true } }
      : original;
  });
  const queue = prospects.flatMap((prospect, index) => (
    index % 3 === 0 ? [] : [queueItem(prospect, index % 3 === 1 ? "Needs Review" : "Queued")]
  ));
  const contactsBefore = new Map(prospects.map((prospect) => [prospect.id, contactState(prospect)]));
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests(queue);
  try {
    let applying = false;
    let applyCrawlCalls = 0;
    const base = verificationDependencies();
    const fetchImpl = base.fetch!;
    const dependencies = {
      ...base,
      fetch: (async (...args: Parameters<typeof fetch>) => {
        if (applying) {
          applyCrawlCalls += 1;
          throw new Error("Atomic Apply must not crawl external websites.");
        }
        return fetchImpl(...args);
      }) as typeof fetch,
    };
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 20,
    });
    const selectedProspectIds = review.records
      .filter((record) => record.highConfidenceExclusionEligible)
      .map((record) => record.prospectId);
    assert.equal(review.records.length, 9);
    assert.equal(selectedProspectIds.length, 9);

    applying = true;
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds,
      snapshotSecret,
      limit: 20,
    });
    assert.equal(result.mode, "applied");
    assert.equal(result.selectedCount, 9);
    assert.equal(result.changed, 9);
    assert.equal(result.nothingSent, true);
    assert.equal(applyCrawlCalls, 0);

    const replay = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds,
      snapshotSecret,
      limit: 20,
    });
    assert.equal(replay.changed, 0);
    assert.equal(applyCrawlCalls, 0);

    applying = false;
    const fresh = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret, limit: 20 });
    assert.equal(fresh.candidates, 0);
    for (const prospect of prospects) {
      const saved = await getProspect(prospect.id);
      assert.equal(saved?.websiteStatus, "usable");
      assert.equal(saved?.fitDisposition, "adequate_existing_website");
      assert.deepEqual(contactState(saved!), contactsBefore.get(prospect.id));
    }
    assert.equal(memoryAuditEventsForTests().some((event) => /provider.*send|outreach.*send/i.test(event.action)), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("unselected external evidence changes do not invalidate a selected reviewed repair", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const selected = legacyProspect({ id: "stable-review-selected" });
  const unselected = legacyProspect({ id: "stable-review-unselected", businessName: "Another Pressure Cleaner" });
  const unselectedBefore = structuredClone(unselected);
  setProspectMemoryForTests([selected, unselected]);
  setOutreachQueueMemoryForTests([queueItem(selected), queueItem(unselected)]);
  try {
    let afterReview = false;
    let applyCrawlCalls = 0;
    const initial = verificationDependencies("info@truecleanprowash.com");
    const changed = verificationDependencies("sales@truecleanprowash.com");
    const dependencies = {
      ...initial,
      fetch: (async (...args: Parameters<typeof fetch>) => {
        if (afterReview) {
          applyCrawlCalls += 1;
          return changed.fetch!(...args);
        }
        return initial.fetch!(...args);
      }) as typeof fetch,
    };
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 2,
    });
    afterReview = true;
    const result = await auditExistingWebsiteRecords({
      apply: true,
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      dependencies,
      reviewToken: review.reviewToken,
      selectedProspectIds: [selected.id],
      snapshotSecret,
      limit: 2,
    });
    assert.equal(result.changed, 1);
    assert.equal((await getProspect(selected.id))?.email, selected.email);
    assert.deepEqual(await getProspect(unselected.id), unselectedBefore);
    assert.equal(applyCrawlCalls, 0);
    assert.equal(result.nothingSent, true);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("tampering with signed reviewed proposal values fails before mutation", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ id: "tampered-reviewed-proposal" });
  const queue = queueItem(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queue]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    const tamperedToken = tamperReviewedProposal(review.reviewToken, "attacker@example.com");
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: tamperedToken,
        selectedProspectIds: [prospect.id],
        snapshotSecret,
      }),
      /snapshot is invalid/i,
    );
    assert.deepEqual(await getProspect(prospect.id), prospect);
    assert.deepEqual(outreachQueueMemoryForTests(), [queue]);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("selected production prospect changes after review fail closed", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ id: "stale-selected-prospect" });
  const queue = queueItem(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queue]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    const changedProspect = { ...prospect, notes: ["Operator added a current review note.", ...prospect.notes] };
    setProspectMemoryForTests([changedProspect]);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [prospect.id],
        snapshotSecret,
      }),
      /selected record .* changed after review/i,
    );
    assert.deepEqual(await getProspect(prospect.id), changedProspect);
    assert.deepEqual(outreachQueueMemoryForTests(), [queue]);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("expired reviewed website snapshot fails before mutation", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ id: "expired-reviewed-snapshot" });
  const queue = queueItem(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queue]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({ apply: false, dependencies, snapshotSecret });
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies: {
          ...dependencies,
          now: () => new Date("2026-07-28T15:16:01.000Z"),
          fetch: async () => { throw new Error("Expired apply must not crawl."); },
        },
        reviewToken: review.reviewToken,
        selectedProspectIds: [prospect.id],
        snapshotSecret,
      }),
      /expired or is invalid/i,
    );
    assert.deepEqual(await getProspect(prospect.id), prospect);
    assert.deepEqual(outreachQueueMemoryForTests(), [queue]);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("multi-record selective apply fails before mutation when a later record becomes protected", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const first = legacyProspect({ id: "atomic-preflight-1" });
  const later = legacyProspect({ id: "atomic-preflight-2" });
  const firstQueue = queueItem(first);
  const laterQueue = queueItem(later);
  const prospectsBefore = structuredClone([first, later]);
  setProspectMemoryForTests([first, later]);
  setOutreachQueueMemoryForTests([firstQueue, laterQueue]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 2,
    });
    const protectedQueue = {
      ...laterQueue,
      status: "Sending" as const,
      notes: "[auto-email-ambiguous] Provider outcome pending.",
      updatedAt: "2026-07-28T15:01:00.000Z",
    };
    setOutreachQueueMemoryForTests([firstQueue, protectedQueue]);
    const queueBeforeApply = structuredClone(outreachQueueMemoryForTests());
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [first.id, later.id],
        snapshotSecret,
        limit: 2,
      }),
      /outreach queue.*changed after review|protected|provider/i,
    );
    assert.deepEqual(await Promise.all([getProspect(first.id), getProspect(later.id)]), prospectsBefore);
    assert.deepEqual(outreachQueueMemoryForTests(), queueBeforeApply);
    assert.equal(memoryAuditEventsForTests().some((event) => event.outcome === "success"), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("a nonterminal queue snapshot change still fails closed before website repair", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospect = legacyProspect({ id: "queue-snapshot-change" });
  const queue = queueItem(prospect);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queue]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
    });
    const changedQueue = {
      ...queue,
      notes: "A new review-only queue note was recorded.",
      updatedAt: "2026-07-28T15:01:00.000Z",
    };
    setOutreachQueueMemoryForTests([changedQueue]);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [prospect.id],
        snapshotSecret,
      }),
      /outreach queue.*changed after review/i,
    );
    assert.deepEqual(await getProspect(prospect.id), prospect);
    assert.deepEqual(outreachQueueMemoryForTests(), [changedQueue]);
    assert.equal(memoryAuditEventsForTests().some((event) => event.outcome === "success"), false);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("atomic selected repair rolls back earlier writes when a later persistence write fails", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const first = legacyProspect({ id: "atomic-rollback-1" });
  const later = legacyProspect({ id: "atomic-rollback-2" });
  const prospectsBefore = structuredClone([first, later]);
  const queueBefore = [queueItem(first), queueItem(later)];
  setProspectMemoryForTests([first, later]);
  setOutreachQueueMemoryForTests(queueBefore);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 2,
    });
    setAtomicWebsiteRepairFailureProspectIdForTests(later.id);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [first.id, later.id],
        snapshotSecret,
        limit: 2,
      }),
      /simulated atomic website-repair write failure/i,
    );
    assert.deepEqual(await Promise.all([getProspect(first.id), getProspect(later.id)]), prospectsBefore);
    assert.deepEqual(outreachQueueMemoryForTests(), queueBefore);
    assert.equal(memoryAuditEventsForTests().some((event) => event.outcome === "success"), false);
  } finally {
    setAtomicWebsiteRepairFailureProspectIdForTests();
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("selective repair requires a non-empty selection from the signed reviewed snapshot", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const reviewed = legacyProspect({ id: "selection-snapshot-1" });
  const outside = legacyProspect({ id: "selection-snapshot-2" });
  setProspectMemoryForTests([reviewed, outside]);
  setOutreachQueueMemoryForTests([]);
  try {
    const dependencies = verificationDependencies();
    const review = await auditExistingWebsiteRecords({
      apply: false,
      dependencies,
      snapshotSecret,
      limit: 1,
      offset: 0,
    });
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [],
        snapshotSecret,
        limit: 1,
        offset: 0,
      }),
      /select at least one reviewed website record/i,
    );
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies,
        reviewToken: review.reviewToken,
        selectedProspectIds: [outside.id],
        snapshotSecret,
        limit: 1,
        offset: 0,
      }),
      /outside the signed reviewed website-record snapshot/i,
    );
    assert.deepEqual(await getProspect(reviewed.id), reviewed);
    assert.deepEqual(await getProspect(outside.id), outside);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("legacy website audit pages traverse different deterministic candidates without mutation", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospects = Array.from({ length: 5 }, (_, index) => legacyProspect({
    id: `legacy-page-${index + 1}`,
    businessName: `Legacy Page ${String(index + 1).padStart(2, "0")}`,
  }));
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests([]);
  try {
    const pageOne = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
      limit: 2,
      offset: 0,
    });
    const pageTwo = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
      limit: 2,
      offset: pageOne.nextOffset ?? -1,
    });
    const pageThree = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
      limit: 2,
      offset: pageTwo.nextOffset ?? -1,
    });
    const repeatedPageOne = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
      limit: 2,
      offset: 0,
    });
    const pageOneIds = pageOne.records.map((record) => record.prospectId);
    const pageTwoIds = pageTwo.records.map((record) => record.prospectId);
    assert.deepEqual(pageOneIds, ["legacy-page-1", "legacy-page-2"]);
    assert.deepEqual(pageTwoIds, ["legacy-page-3", "legacy-page-4"]);
    assert.notDeepEqual(pageOneIds, pageTwoIds);
    assert.deepEqual(repeatedPageOne.records.map((record) => record.prospectId), pageOneIds);
    assert.deepEqual(
      [...pageOne.records, ...pageTwo.records, ...pageThree.records].map((record) => record.prospectId),
      prospects.map((prospect) => prospect.id),
    );
    assert.equal(pageTwo.rangeStart, 3);
    assert.equal(pageTwo.rangeEnd, 4);
    assert.equal(pageTwo.currentPage, 2);
    assert.equal(pageThree.remainingCandidates, 0);
    assert.equal(pageThree.nextOffset, null);
    assert.equal(memoryAuditEventsForTests().length, 0);
    for (const prospect of prospects) {
      assert.equal((await getProspect(prospect.id))?.websiteStatus, prospect.websiteStatus);
    }
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("legacy website audit rejects invalid page bounds without changing records", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({ id: "legacy-bounds" });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([]);
  try {
    for (const input of [
      { offset: -1, limit: 1 },
      { offset: 0, limit: 0 },
      { offset: 0, limit: 26 },
      { offset: 1, limit: 1 },
    ]) {
      await assert.rejects(
        auditExistingWebsiteRecords({
          apply: false,
          dependencies: verificationDependencies(),
          snapshotSecret,
          ...input,
        }),
        /offset|batch size|candidate range/i,
      );
    }
    assert.equal((await getProspect(prospect.id))?.websiteStatus, prospect.websiteStatus);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("review token for one legacy audit batch cannot apply another batch", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospects = Array.from({ length: 4 }, (_, index) => legacyProspect({
    id: `legacy-token-page-${index + 1}`,
    businessName: `Token Page ${index + 1}`,
  }));
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests([]);
  try {
    const pageOne = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
      limit: 2,
      offset: 0,
    });
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies: verificationDependencies(),
        snapshotSecret,
        reviewToken: pageOne.reviewToken,
        selectedProspectIds: [prospects[2]!.id],
        limit: 2,
        offset: 2,
      }),
      /different page or scope|outside the signed reviewed/i,
    );
    for (const prospect of prospects) {
      assert.equal((await getProspect(prospect.id))?.websiteStatus, prospect.websiteStatus);
    }
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("exact-prospect legacy dry run proposes strong-site exclusion without mutation", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const pinnacleStyle = legacyProspect({
    id: "pinnacle-style-exact",
  });
  const other = legacyProspect({ id: "other-legacy-exact", businessName: "Another Legacy Company" });
  setProspectMemoryForTests([other, pinnacleStyle]);
  setOutreachQueueMemoryForTests([]);
  try {
    const result = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: verificationDependencies(),
      snapshotSecret,
      prospectId: pinnacleStyle.id,
    });
    assert.equal(result.scope, "exact_prospect");
    assert.equal(result.exactProspectId, pinnacleStyle.id);
    assert.equal(result.inspected, 1);
    assert.equal(result.remainingCandidates, 0);
    assert.equal(result.records[0]?.prospectId, pinnacleStyle.id);
    assert.equal(result.records[0]?.proposedDisposition, "adequate_existing_website");
    assert.equal(result.records[0]?.proposedOutcome, "exclude_from_rebuild_outreach");
    assert.equal(result.nothingSent, true);
    assert.equal((await getProspect(pinnacleStyle.id))?.websiteStatus, pinnacleStyle.websiteStatus);
    assert.equal((await getProspect(other.id))?.websiteStatus, other.websiteStatus);
    assert.equal(memoryAuditEventsForTests().length, 0);
    await assert.rejects(
      auditExistingWebsiteRecords({
        apply: true,
        confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
        dependencies: verificationDependencies(),
        snapshotSecret,
        prospectId: pinnacleStyle.id,
        reviewToken: result.reviewToken,
        selectedProspectIds: [pinnacleStyle.id],
      }),
      /exact-prospect website audits are read-only/i,
    );
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("inconclusive legacy website remains manual review and source-less email is not eligible", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const prospect = legacyProspect({
    id: "legacy-inconclusive",
    phone: "",
    email: "hello@truecleanprowash.com",
  });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem(prospect, "Needs Review")]);
  try {
    const result = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: inconclusiveWebsiteDependencies(),
      snapshotSecret,
    });
    const record = result.records[0]!;
    assert.equal(record.proposedDisposition, "inconclusive_requires_review");
    assert.equal(record.proposedOutcome, "manual_review");
    assert.equal(record.manualReviewRequired, true);
    assert.equal(record.autonomouslyEligible, false);
    assert.equal(record.highConfidenceExclusionEligible, false);
    assert.equal(record.contactEvidenceSufficient, false);
    assert.match(record.exactReason, /rendered human review/i);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("current rendered weak-site evidence stays actionable without re-entering website repair for old copy", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const dependencies = verificationDependencies();
  const baseline = await verifyProspectWebsite(legacyProspect({ id: "legacy-rendered-weak" }), dependencies);
  const observation = {
    kind: "quote_path" as const,
    statement: "I noticed the quote request is difficult to find from the service page.",
    rebuildSentence: "I can rebuild your current website with a more modern design that places the quote request beside the core services, while also making your services, contact information, and quote request easier for customers to find.",
    evidence: ["A rendered review verified the quote action is separated from the main service content."],
    demoChecklist: ["Show the quote action beside the primary services"],
  };
  const prospect = {
    ...baseline.prospect,
    id: "legacy-rendered-weak",
    status: "Reviewed" as const,
    fitDisposition: "clearly_weak_or_outdated_website" as const,
    websiteVerification: {
      ...baseline.report,
      fit: {
        disposition: "clearly_weak_or_outdated_website" as const,
        reason: "A rendered review verified one customer-facing quote-path issue.",
        supportingEvidence: observation.evidence,
        confidence: "high" as const,
        analysisOrigin: "rendered_review" as const,
        evaluatedAt: now,
        observation,
      },
    },
  } satisfies Prospect;
  const needsReview = {
    ...queueItem(prospect, "Needs Review"),
    outreachCopyVersion: "legacy_unversioned",
  };
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([needsReview]);
  try {
    let crawlCalls = 0;
    const result = await auditExistingWebsiteRecords({
      apply: false,
      dependencies: {
        ...dependencies,
        fetch: async () => {
          crawlCalls += 1;
          throw new Error("Current weak-site evidence must not be re-crawled only because outreach copy is old.");
        },
      },
      snapshotSecret,
    });
    assert.equal(result.candidates, 0);
    assert.equal(result.inspected, 0);
    assert.equal(crawlCalls, 0);
    assert.equal(websiteFitAllowsAutonomousOutreach(prospect), true);
    assert.equal(prospectCurrentBucket(prospect), "ready_email");
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
    resetOperationalMemoryForTests();
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

test("website repair inspection bounds concurrent candidate verification", async () => {
  const candidates = Array.from({ length: 8 }, (_, index) => legacyProspect({ id: `bounded-inspection-${index}` }));
  const base = verificationDependencies();
  let activeFetches = 0;
  let peakFetches = 0;
  const fetchImpl = base.fetch!;
  const inspected = await inspectCandidatesBounded(candidates, {
    ...base,
    fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      activeFetches += 1;
      peakFetches = Math.max(peakFetches, activeFetches);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await fetchImpl(input, init);
      } finally {
        activeFetches -= 1;
      }
    }) as typeof fetch,
  }, new Map());
  assert.equal(inspected.length, candidates.length);
  assert.ok(peakFetches > 1);
  assert.ok(peakFetches <= websiteRepairConcurrency);
});
