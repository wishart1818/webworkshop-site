import assert from "node:assert/strict";
import test from "node:test";
import {
  outreachQueueMemoryForTests,
  resetAutonomousGrowthMemoryForTests,
  setOutreachQueueMemoryForTests,
} from "../lib/autonomous-growth-repository";
import type { OutreachQueueItem } from "../lib/autonomous-growth";
import {
  beginManualReviewTriageApply,
  continueManualReviewTriage,
  continueManualReviewTriageApply,
  getManualReviewTriage,
  inspectManualReviewTriageCandidate,
  manualReviewTriageChunkSize,
  startManualReviewTriage,
} from "../lib/manual-review-triage";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";
import {
  getProspect,
  listProspects,
  resetProspectMemoryForTests,
  saveProspect,
  setProspectMemoryForTests,
} from "../lib/prospect-repository";
import { resetOperationalMemoryForTests } from "../lib/operational-controls";
import { resetWebsiteRepairAuditRunsForTests } from "../lib/website-repair-audit-repository";

const now = new Date("2026-08-10T12:00:00.000Z");

function unresolvedProspect(index: number, overrides: Partial<Parameters<typeof createProspect>[0]> = {}) {
  return createProspect({
    businessName: `Triage Contractor ${String(index).padStart(3, "0")}`,
    website: `https://triage-${index}.example.com`,
    phone: `419555${String(index).padStart(4, "0")}`,
    email: "",
    city: index % 2 ? "Toledo" : "Findlay",
    state: "OH",
    trade: index % 2 ? "Pressure Washing" : "Landscaping",
    serviceArea: index % 2 ? "Toledo, OH" : "Findlay, OH",
    sizeIndicator: "Growing",
    status: "Reviewed",
    websiteStatus: "crawler_blocked",
    websiteStatusDetail: "The crawler could not verify this website.",
    fitDisposition: "unreviewed",
    ...overrides,
  });
}

function queueItem(prospect: Prospect): OutreachQueueItem {
  const at = now.toISOString();
  return {
    id: `queue-${prospect.id}`,
    prospectId: prospect.id,
    topProspectResultId: "",
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: `${prospect.city}, ${prospect.state}`,
    website: prospect.website,
    email: prospect.email,
    contactSource: prospect.email ? "Public business website" : "Manual research",
    contactConfidence: 0,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: "",
    emailBody: "",
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Unresolved website evidence.",
    blockedReason: "Website evidence requires review.",
    reviewScore: 0,
    reviewSummary: "",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Needs Human Review",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Needs Review",
    sourceProvider: "test",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "Nothing was sent.",
    outreachCopyVersion: "",
    outreachCopyGeneratedAt: "",
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: at,
    updatedAt: at,
  };
}

function resetState(prospects: Prospect[], queue: OutreachQueueItem[] = []) {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests(queue);
}

function htmlFor(prospect: Prospect) {
  return `<!doctype html><html><head><title>${prospect.businessName} | ${prospect.trade}</title><meta name="viewport" content="width=device-width"><link rel="canonical" href="${prospect.website}/"></head><body><header><nav><a href="/">Home</a><a href="/services">Services</a><a href="/contact">Contact</a></nav></header><main><h1>${prospect.businessName}</h1><p>${prospect.businessName} provides local ${prospect.trade.toLowerCase()} services in ${prospect.city}, ${prospect.state}.</p><p>Browse service information, project details, and ways to request an estimate from the local business team.</p><a href="tel:${prospect.phone}">${prospect.phone}</a><a href="mailto:info@${new URL(prospect.website).hostname}">Email the team</a><form><input name="name"><input name="email"><textarea name="message"></textarea><button>Request an estimate</button></form><img src="/project.jpg" alt="Completed local service project"></main></body></html>`;
}

function verificationDependencies(prospects: Prospect[], calls: string[]) {
  const byHost = new Map(prospects.filter((prospect) => prospect.website).map((prospect) => [new URL(prospect.website).hostname, prospect]));
  return {
    now: () => now,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    fetch: (async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      calls.push(url.href);
      const prospect = byHost.get(url.hostname);
      if (!prospect) return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } });
      return new Response(htmlFor(prospect), { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
  };
}

test("shared triage resolves a strong owned site, fails crawler blocks closed, and skips protected network work", async () => {
  const strong = unresolvedProspect(1);
  const blocked = unresolvedProspect(2, { website: "https://blocked.example.com" });
  const protectedProspect = unresolvedProspect(3, { status: "Contacted" });
  const calls: string[] = [];
  const dependencies = verificationDependencies([strong], calls);

  const strongResult = await inspectManualReviewTriageCandidate(strong, [], dependencies);
  assert.equal(strongResult.record.triageOutcome, "safe_exclusion");
  assert.ok(["adequate_existing_website", "strong_existing_website"].includes(strongResult.record.proposedDisposition));
  assert.equal(strongResult.record.selectionEligible, true);

  const blockedResult = await inspectManualReviewTriageCandidate(blocked, [], dependencies);
  assert.equal(blockedResult.record.triageOutcome, "still_manual");
  assert.notEqual(blockedResult.record.proposedDisposition, "broken_or_inactive_website");
  assert.notEqual(blockedResult.record.proposedDisposition, "no_owned_website");

  const callsBeforeProtected = calls.length;
  const protectedResult = await inspectManualReviewTriageCandidate(protectedProspect, [], dependencies);
  assert.equal(protectedResult.record.triageOutcome, "protected_ineligible");
  assert.equal(calls.length, callsBeforeProtected);
});

test("authoritative provider identity can recover a no-owned-site record only as human-reviewable", async () => {
  const facebook = "https://www.facebook.com/stealthlandscapetoledo";
  const prospect = unresolvedProspect(4, {
    businessName: "Stealth Landscape Services",
    website: "",
    profileUrl: facebook,
    facebookUrl: facebook,
    prospectType: "no_website_social_only",
    activitySignals: [
      discoveryIdentityEvidenceSignal({ source: "google", businessName: "Stealth Landscape Services", website: "", profileUrl: facebook, phone: "4195550104", address: "100 Main St Toledo OH", city: "Toledo", state: "OH", latitude: 41.65, longitude: -83.54 }),
      discoveryIdentityEvidenceSignal({ source: "osm", businessName: "Stealth Landscape Services", website: facebook, profileUrl: facebook, phone: "(419) 555-0104", address: "100 Main Street, Toledo, Ohio", city: "Toledo", state: "OH", latitude: 41.65, longitude: -83.54 }),
    ],
  });
  let calls = 0;
  const result = await inspectManualReviewTriageCandidate(prospect, [], {
    now: () => now,
    fetch: (async () => { calls += 1; throw new Error("No request expected"); }) as typeof fetch,
  });
  assert.equal(calls, 0);
  assert.equal(result.record.proposedDisposition, "no_owned_website");
  assert.equal(result.record.triageOutcome, "reviewable_rebuild_opportunity");
  assert.equal(result.record.autonomouslyEligible, false);
  assert.match(result.record.recommendedOperatorAction, /human review/i);
});

test("a production-shaped 69-record triage population is chunked, resumable, named, and secret-safe", async () => {
  const prospects = Array.from({ length: 69 }, (_, index) => unresolvedProspect(index, {
    status: index >= 64 ? "Contacted" : "Reviewed",
    website: `https://blocked-${index}.example.com`,
  }));
  resetState(prospects, prospects.slice(0, 12).map(queueItem));
  const calls: string[] = [];
  const dependencies = {
    now: () => now,
    verification: verificationDependencies([], calls),
    enforceAuditRateLimit: async () => undefined,
    recordAudit: async () => undefined,
  };
  let report = await startManualReviewTriage(dependencies);
  assert.equal(report.totalCandidates, 69);
  const firstRunId = report.auditRunId;
  report = await continueManualReviewTriage({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  assert.equal(report.inspectedCount, manualReviewTriageChunkSize);
  while (report.status === "AUDITING") {
    report = await continueManualReviewTriage({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  }
  assert.equal(report.auditRunId, firstRunId);
  assert.equal(report.status, "READY");
  assert.equal(report.records.length, 69);
  assert.equal(report.stillManualCount, 64);
  assert.equal(report.protectedCount, 5);
  assert.equal(report.records.every((record) => Boolean(record.businessName && record.prospectId && record.reasonCode)), true);
  assert.doesNotMatch(JSON.stringify(report), /accessTokenHash|proposedPatch|currentProspectDigest|currentQueueDigest|api[_-]?key/i);
  assert.equal(outreachQueueMemoryForTests().some((item) => Boolean(item.sentDate)), false);
});

test("reviewed triage Apply uses the saved server result, performs no crawl, and remains human-review-only", async () => {
  const prospects = [unresolvedProspect(10), unresolvedProspect(11)];
  const queue = prospects.map(queueItem);
  resetState(prospects, queue);
  const calls: string[] = [];
  const dependencies = {
    now: () => now,
    verification: verificationDependencies(prospects, calls),
    enforceAuditRateLimit: async () => undefined,
    enforceApplyRateLimit: async () => undefined,
    recordAudit: async () => undefined,
  };
  let report = await startManualReviewTriage(dependencies);
  while (report.status === "AUDITING") report = await continueManualReviewTriage({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  assert.equal(report.safeExclusionCount, 2);
  const callsBeforeApply = calls.length;
  report = await beginManualReviewTriageApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    confirmation: "APPLY REVIEWED TRIAGE RESULTS",
    dependencies,
  });
  while (report.status === "APPLYING") report = await continueManualReviewTriageApply({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  assert.equal(calls.length, callsBeforeApply, "Apply must never crawl or run external verification");
  assert.equal(report.status, "APPLIED");
  assert.equal(report.appliedCount, 2);
  assert.equal((await listProspects()).every((prospect) => ["adequate_existing_website", "strong_existing_website"].includes(prospect.fitDisposition)), true);
  assert.equal(outreachQueueMemoryForTests().every((item) => item.status === "Needs Review" && !item.sentDate), true);
  assert.equal(outreachQueueMemoryForTests().every((item) => item.recommendedNextAction === "Needs Human Review"), true);

  const replay = await continueManualReviewTriageApply({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  assert.equal(replay.status, "APPLIED");
  assert.equal(replay.appliedCount, 2);
});

test("Prospect or queue drift fails before triage mutation and preserves every reviewed record", async () => {
  for (const drift of ["prospect", "queue"] as const) {
    const prospects = [unresolvedProspect(20), unresolvedProspect(21)];
    const queue = prospects.map(queueItem);
    resetState(prospects, queue);
    const calls: string[] = [];
    const dependencies = {
      now: () => now,
      verification: verificationDependencies(prospects, calls),
      enforceAuditRateLimit: async () => undefined,
      enforceApplyRateLimit: async () => undefined,
      recordAudit: async () => undefined,
    };
    let report = await startManualReviewTriage(dependencies);
    report = await continueManualReviewTriage({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
    const before = await listProspects();
    const queueBefore = structuredClone(outreachQueueMemoryForTests());
    if (drift === "prospect") {
      const changed = (await getProspect(prospects[1]!.id))!;
      await saveProspect({ ...changed, notes: ["Operator added a current note.", ...changed.notes] });
    } else {
      const changedQueue = structuredClone(outreachQueueMemoryForTests());
      changedQueue[1]!.replyStatus = "Replied";
      setOutreachQueueMemoryForTests(changedQueue);
    }
    await assert.rejects(() => beginManualReviewTriageApply({
      auditRunId: report.auditRunId,
      accessToken: report.accessToken,
      confirmation: "APPLY REVIEWED TRIAGE RESULTS",
      dependencies,
    }), /changed after review|queue.*changed|protected/i);
    const after = await listProspects();
    assert.equal(after[0]!.websiteStatus, before[0]!.websiteStatus);
    assert.equal(after[0]!.fitDisposition, before[0]!.fitDisposition);
    assert.equal(outreachQueueMemoryForTests()[0]!.status, queueBefore[0]!.status);
    assert.equal(outreachQueueMemoryForTests()[0]!.sentDate, "");
  }
});

test("workflow versions prevent cross-operation capability-token use", async () => {
  const prospect = unresolvedProspect(30);
  resetState([prospect]);
  const dependencies = {
    now: () => now,
    verification: verificationDependencies([prospect], []),
    enforceAuditRateLimit: async () => undefined,
    recordAudit: async () => undefined,
  };
  const report = await startManualReviewTriage(dependencies);
  await assert.rejects(() => getManualReviewTriage({
    auditRunId: report.auditRunId,
    accessToken: "guessed-token",
    dependencies,
  }), /invalid/);
  assert.equal((await getManualReviewTriage({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies })).status, "AUDITING");
});
