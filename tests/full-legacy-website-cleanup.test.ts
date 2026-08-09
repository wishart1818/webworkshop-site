import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  outreachQueueMemoryForTests,
  resetAutonomousGrowthMemoryForTests,
  setOutreachQueueMemoryForTests,
} from "../lib/autonomous-growth-repository";
import type { OutreachQueueItem } from "../lib/autonomous-growth";
import {
  beginFullLegacyWebsiteCleanupApply,
  continueFullLegacyWebsiteCleanup,
  continueFullLegacyWebsiteCleanupApply,
  fullLegacyCleanupAuditChunkSize,
  getFullLegacyWebsiteCleanup,
  startFullLegacyWebsiteCleanup,
} from "../lib/full-legacy-website-cleanup";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import { listProspects, resetProspectMemoryForTests, setProspectMemoryForTests } from "../lib/prospect-repository";
import { resetOperationalMemoryForTests } from "../lib/operational-controls";
import {
  claimWebsiteRepairApplyWork,
  releaseWebsiteRepairApplyLease,
  resetWebsiteRepairAuditRunsForTests,
} from "../lib/website-repair-audit-repository";
import {
  applyReviewedWebsiteRepairItems,
  type ExistingWebsiteRepairRecord,
} from "../lib/website-verification-operations";

const now = "2026-08-09T14:00:00.000Z";

test("persisted cleanup runs retain their stored version for fail-closed validation", () => {
  const source = readFileSync(new URL("../lib/website-repair-audit-repository.ts", import.meta.url), "utf8");
  assert.match(source, /version: row\.version as 1/);
  assert.doesNotMatch(source, /\.\.\.row,[\s\S]{0,80}version: 1,/);
});

function legacyProspect(index: number) {
  return createProspect({
    businessName: `Legacy Contractor ${String(index).padStart(3, "0")}`,
    website: `https://legacy-${index}.example.com`,
    phone: `+1419555${String(index).padStart(4, "0")}`,
    email: `info@legacy-${index}.example.com`,
    city: index % 2 ? "Toledo" : "Findlay",
    state: "OH",
    trade: index % 3 ? "Pressure Washing" : "Landscaping",
    status: index >= 30 && index < 35 ? "Contacted" : "Reviewed",
    websiteStatus: "unreachable_website",
    websiteStatusDetail: "Legacy one-request website result.",
    fitDisposition: "unreviewed",
  });
}

function queueItem(prospect: Prospect): OutreachQueueItem {
  return {
    id: `queue-${prospect.id}`,
    prospectId: prospect.id,
    topProspectResultId: "",
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: `${prospect.city}, ${prospect.state}`,
    website: prospect.website,
    email: prospect.email,
    contactSource: "Public business website",
    contactConfidence: 90,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: "",
    emailBody: "",
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Legacy review inventory.",
    blockedReason: "",
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
    notes: "Legacy package. Nothing was sent.",
    outreachCopyVersion: "legacy-v1",
    outreachCopyGeneratedAt: now,
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: now,
    updatedAt: now,
  };
}

function verifiedReport(prospect: Prospect, disposition: "adequate_existing_website" | "strong_existing_website") {
  return {
    version: "website-verification-v2" as const,
    status: "usable" as const,
    confidence: "high" as const,
    canonicalUrl: `${prospect.website}/`,
    attempts: [],
    usableSignals: ["business name", "navigation", "service content"],
    explanation: "A meaningful first-party business website was verified.",
    checkedAt: now,
    ownershipDecision: "owned" as const,
    identityEvidence: ["Business name, first-party host, and exact market match."],
    identitySignals: ["prominent_business_name", "stored_website_host_match", "market_location_match"] as NonNullable<Prospect["websiteVerification"]>["identitySignals"],
    fit: {
      disposition,
      reason: "The current website is already suitable for the rebuild offer.",
      supportingEvidence: ["The site is complete, usable, and presents the business clearly."],
      confidence: "high" as const,
      analysisOrigin: "rendered_review" as const,
      evaluatedAt: now,
    },
  };
}

function recordFor(prospect: Prospect, index: number): ExistingWebsiteRepairRecord {
  const protectedRecord = index >= 30 && index < 35;
  const safe = index < 30;
  const disposition = safe
    ? index % 2 ? "adequate_existing_website" as const : "strong_existing_website" as const
    : "inconclusive_requires_review" as const;
  return {
    prospectId: prospect.id,
    businessName: prospect.businessName,
    currentProspectStatus: prospect.status,
    currentQueueStatuses: index < 10 ? ["Needs Review"] : [],
    currentDisposition: prospect.fitDisposition,
    proposedDisposition: disposition,
    oldStatus: prospect.websiteStatus,
    proposedStatus: safe ? "usable" : prospect.websiteStatus,
    oldEmail: prospect.email,
    proposedEmail: prospect.email,
    evidence: safe ? "Current first-party website evidence is sufficient." : "Current identity or website evidence remains incomplete.",
    changedFields: safe ? ["websiteStatus", "websiteStatusDetail", "websiteVerification", "fitDisposition"] : [],
    fieldChanges: [],
    protectedReason: protectedRecord ? "Prospect status Contacted is protected." : "",
    newlyFoundContactPaths: [],
    legacyCandidate: true,
    businessIdentitySufficient: safe,
    websiteEvidenceSufficient: safe,
    websiteEvidenceConfidence: safe ? "high" : "low",
    contactEvidenceSufficient: false,
    manualReviewRequired: !safe && !protectedRecord,
    autonomouslyEligible: false,
    proposedOutcome: protectedRecord ? "protected" : safe ? "exclude_from_rebuild_outreach" : "manual_review",
    exactReason: protectedRecord
      ? "Protected history remains unchanged."
      : safe ? "Current evidence verifies an adequate or strong owned website." : "Manual review is required.",
    productionMutationRequired: safe,
    alreadyCurrent: false,
    selectionEligible: safe,
    highConfidenceExclusionEligible: safe,
    safeExclusionReasonCode: protectedRecord ? "protected" : safe ? "safe_verified_exclusion" : index % 2 ? "crawler_blocked" : "insufficient_identity",
    identitySafetyResult: safe ? "safe" : "manual_review",
    evidenceSafetyResult: safe ? "safe" : "manual_review",
    verifiedCanonicalWebsite: safe ? `${prospect.website}/` : "",
    identitySummary: safe ? "Business name, first-party host, and market match the exact prospect." : "Exact identity is not sufficiently grounded.",
  };
}

function proposedProspect(prospect: Prospect, index: number) {
  if (index >= 30) return null;
  const disposition = index % 2 ? "adequate_existing_website" as const : "strong_existing_website" as const;
  return {
    ...prospect,
    websiteStatus: "usable" as const,
    websiteStatusDetail: "A meaningful first-party business website was verified.",
    websiteVerification: verifiedReport(prospect, disposition),
    fitDisposition: disposition,
  } satisfies Prospect;
}

test("one Full Legacy Cleanup run audits 80 records in bounded chunks and applies only safe exclusions", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  const prospects = Array.from({ length: 80 }, (_, index) => legacyProspect(index));
  const queue = prospects.slice(0, 10).map(queueItem);
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests(queue);
  const originalProtected = structuredClone(prospects.slice(30, 35));
  const originalManual = structuredClone(prospects.slice(35));
  let inspectCalls = 0;
  const chunkSizes: number[] = [];
  const auditActions: Array<{ action: string; subject?: string }> = [];
  const listPopulation = async () => {
    const current = await listProspects();
    const candidates = current.filter((prospect) => prospect.websiteStatus !== "usable");
    const currentQueue = outreachQueueMemoryForTests();
    const grouped = new Map<string, OutreachQueueItem[]>();
    for (const item of currentQueue) grouped.set(item.prospectId, [...(grouped.get(item.prospectId) ?? []), item]);
    return { prospects: current, queue: currentQueue, queueByProspect: grouped, candidates };
  };
  const dependencies = {
    now: () => new Date(now),
    listPopulation,
    enforceAuditRateLimit: async () => undefined,
    enforceApplyRateLimit: async () => undefined,
    recordAudit: async (event: { action: string; subject?: string }) => {
      auditActions.push({ action: event.action, subject: event.subject });
      return true;
    },
    inspect: async (candidates: Prospect[], _verification: unknown, queueByProspect: Map<string, OutreachQueueItem[]>) => {
      inspectCalls += 1;
      chunkSizes.push(candidates.length);
      return candidates.map((prospect) => {
        const index = Number(prospect.businessName.slice(-3));
        return {
          prospect,
          verified: null,
          proposedProspect: proposedProspect(prospect, index),
          record: recordFor(prospect, index),
          queueItems: queueByProspect.get(prospect.id) ?? [],
        };
      });
    },
  };

  let report = await startFullLegacyWebsiteCleanup(dependencies);
  assert.equal(report.totalCandidates, 80);
  assert.equal(report.inspectedCount, 0);
  while (report.status === "AUDITING") {
    report = await continueFullLegacyWebsiteCleanup({
      auditRunId: report.auditRunId,
      accessToken: report.accessToken,
      dependencies,
    });
  }
  assert.equal(inspectCalls, 4);
  assert.deepEqual(chunkSizes, [fullLegacyCleanupAuditChunkSize, 20, 20, 20]);
  assert.equal(report.status, "READY");
  assert.equal(report.safeExclusionCount, 30);
  assert.equal(report.manualReviewCount, 45);
  assert.equal(report.protectedCount, 5);
  assert.equal(report.safeExclusions.length, 30);
  assert.equal(report.applyMode, "bounded_atomic_groups");
  assert.doesNotMatch(JSON.stringify(report), /proposedPatch|currentProspectDigest|currentQueueDigest|postApplyProspectDigest/);

  report = await beginFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
    dependencies,
  });
  const crawlCountBeforeApply = inspectCalls;
  while (report.status === "APPLYING") {
    report = await continueFullLegacyWebsiteCleanupApply({
      auditRunId: report.auditRunId,
      accessToken: report.accessToken,
      dependencies,
    });
  }
  assert.equal(inspectCalls, crawlCountBeforeApply, "Apply must perform no website verification or crawl");
  assert.equal(report.status, "APPLIED");
  assert.equal(report.appliedCount, 30);
  assert.equal(report.remainingCandidatesAfter, 50);
  const after = await listProspects();
  assert.ok(after.slice(0, 30).every((prospect) => prospect.websiteStatus === "usable"));
  assert.deepEqual(after.filter((prospect) => originalProtected.some((item) => item.id === prospect.id)), originalProtected);
  assert.deepEqual(after.filter((prospect) => originalManual.some((item) => item.id === prospect.id)), originalManual);
  assert.ok(outreachQueueMemoryForTests().every((item) => !item.sentDate));
  assert.equal(report.nothingSent, true);
  const recordAuditProspectIds = auditActions
    .filter((event) => event.action === "full_legacy_website_cleanup_record_repaired")
    .map((event) => event.subject);
  assert.deepEqual(recordAuditProspectIds, prospects.slice(0, 30).map((prospect) => prospect.id));

  const replay = await continueFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    dependencies,
  });
  assert.equal(replay.status, "APPLIED");
  assert.equal(replay.appliedCount, 30);
});

test("Full Legacy Cleanup rejects guessed tokens, expiry, wrong confirmation, and oversized populations", async () => {
  resetWebsiteRepairAuditRunsForTests();
  const candidate = legacyProspect(1);
  const dependencies = {
    now: () => new Date(now),
    listPopulation: async () => ({ prospects: [candidate], queue: [], queueByProspect: new Map(), candidates: [candidate] }),
    enforceAuditRateLimit: async () => undefined,
    recordAudit: async () => undefined,
  };
  const report = await startFullLegacyWebsiteCleanup(dependencies);
  await assert.rejects(() => continueFullLegacyWebsiteCleanup({
    auditRunId: report.auditRunId,
    accessToken: "guessed-token",
    dependencies,
  }), /invalid/);
  await assert.rejects(() => beginFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    confirmation: "REPAIR SOME RECORDS",
    dependencies,
  }), /Type REPAIR VERIFIED WEBSITE RECORDS/);
  await assert.rejects(() => continueFullLegacyWebsiteCleanup({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    dependencies: { ...dependencies, now: () => new Date("2026-08-09T17:00:01.000Z") },
  }), /expired/);

  const tooMany = Array.from({ length: 501 }, (_, index) => legacyProspect(index));
  await assert.rejects(() => startFullLegacyWebsiteCleanup({
    ...dependencies,
    listPopulation: async () => ({ prospects: tooMany, queue: [], queueByProspect: new Map(), candidates: tooMany }),
  }), /500-record safety bound/);
});

test("Full Legacy Cleanup resumes an interrupted bounded audit without creating another run or rate-limit charge", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  const prospect = legacyProspect(1);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([]);
  let inspectionAttempts = 0;
  let rateLimitCharges = 0;
  const dependencies = {
    now: () => new Date(now),
    listPopulation: async () => ({ prospects: [prospect], queue: [], queueByProspect: new Map(), candidates: [prospect] }),
    enforceAuditRateLimit: async () => { rateLimitCharges += 1; },
    recordAudit: async () => undefined,
    inspect: async (candidates: Prospect[]) => {
      inspectionAttempts += 1;
      if (inspectionAttempts === 1) throw new Error("Simulated transient audit interruption.");
      return candidates.map((candidate) => ({
        prospect: candidate,
        verified: null,
        proposedProspect: proposedProspect(candidate, 1),
        record: recordFor(candidate, 1),
        queueItems: [],
      }));
    },
  };
  const started = await startFullLegacyWebsiteCleanup(dependencies);
  await assert.rejects(() => continueFullLegacyWebsiteCleanup({
    auditRunId: started.auditRunId,
    accessToken: started.accessToken,
    dependencies,
  }), /transient audit interruption/i);
  const interrupted = await getFullLegacyWebsiteCleanup({
    auditRunId: started.auditRunId,
    accessToken: started.accessToken,
    dependencies,
  });
  assert.equal(interrupted.status, "AUDITING");
  assert.equal(interrupted.inspectedCount, 0);
  assert.doesNotMatch(interrupted.errorMessage, /Simulated transient audit interruption/);
  assert.match(interrupted.errorMessage, /failed safely/i);
  const resumed = await continueFullLegacyWebsiteCleanup({
    auditRunId: started.auditRunId,
    accessToken: started.accessToken,
    dependencies,
  });
  assert.equal(resumed.status, "READY");
  assert.equal(resumed.auditRunId, started.auditRunId);
  assert.equal(resumed.inspectedCount, 1);
  assert.equal(rateLimitCharges, 1);
});

test("Full Legacy Cleanup fails closed when persisted reviewed-state flags do not describe one safe exclusion", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  const prospect = legacyProspect(1);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([]);
  const dependencies = {
    now: () => new Date(now),
    listPopulation: async () => ({ prospects: [prospect], queue: [], queueByProspect: new Map(), candidates: [prospect] }),
    enforceAuditRateLimit: async () => undefined,
    recordAudit: async () => undefined,
    inspect: async () => [{
      prospect,
      verified: null,
      proposedProspect: proposedProspect(prospect, 1),
      record: { ...recordFor(prospect, 1), selectionEligible: false },
      queueItems: [],
    }],
  };
  const started = await startFullLegacyWebsiteCleanup(dependencies);
  const reviewed = await continueFullLegacyWebsiteCleanup({
    auditRunId: started.auditRunId,
    accessToken: started.accessToken,
    dependencies,
  });
  assert.equal(reviewed.status, "READY");
  assert.equal(reviewed.safeExclusionCount, 0);
  assert.equal(reviewed.safeExclusions.length, 0);
  assert.equal(reviewed.manualReviewCount, 1);
  assert.equal(reviewed.manualReasonCounts.other_manual_review, 1);
});

test("Full Legacy Cleanup preflights the complete reviewed set before the first mutation", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  const prospects = [legacyProspect(1), legacyProspect(2)];
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests([]);
  const dependencies = {
    now: () => new Date(now),
    listPopulation: async () => {
      const current = await listProspects();
      return { prospects: current, queue: [], queueByProspect: new Map(), candidates: current.filter((item) => item.websiteStatus !== "usable") };
    },
    enforceAuditRateLimit: async () => undefined,
    enforceApplyRateLimit: async () => undefined,
    recordAudit: async () => undefined,
    inspect: async (candidates: Prospect[]) => candidates.map((prospect) => {
      const index = Number(prospect.businessName.slice(-3));
      return { prospect, verified: null, proposedProspect: proposedProspect(prospect, index), record: recordFor(prospect, index), queueItems: [] };
    }),
  };
  let report = await startFullLegacyWebsiteCleanup(dependencies);
  report = await continueFullLegacyWebsiteCleanup({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  const changedAfterReview = { ...prospects[1]!, status: "Contacted" as const };
  setProspectMemoryForTests([prospects[0]!, changedAfterReview]);
  await assert.rejects(() => beginFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
    dependencies,
  }), /changed after review|protected/i);
  const after = await listProspects();
  assert.equal(after.find((item) => item.id === prospects[0]!.id)?.websiteStatus, "unreachable_website");
  assert.equal(after.find((item) => item.id === prospects[1]!.id)?.status, "Contacted");
});

test("bounded grouped Apply reports honest partial completion if a later group becomes protected", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  const prospects = Array.from({ length: 30 }, (_, index) => legacyProspect(index));
  setProspectMemoryForTests(prospects);
  setOutreachQueueMemoryForTests([]);
  const dependencies = {
    now: () => new Date(now),
    listPopulation: async () => {
      const current = await listProspects();
      return { prospects: current, queue: [], queueByProspect: new Map(), candidates: current.filter((item) => item.websiteStatus !== "usable") };
    },
    enforceAuditRateLimit: async () => undefined,
    enforceApplyRateLimit: async () => undefined,
    recordAudit: async () => undefined,
    inspect: async (candidates: Prospect[]) => candidates.map((prospect) => {
      const index = Number(prospect.businessName.slice(-3));
      return { prospect, verified: null, proposedProspect: proposedProspect(prospect, index), record: recordFor(prospect, index), queueItems: [] };
    }),
  };
  let report = await startFullLegacyWebsiteCleanup(dependencies);
  while (report.status === "AUDITING") {
    report = await continueFullLegacyWebsiteCleanup({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  }
  report = await beginFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
    dependencies,
  });
  report = await continueFullLegacyWebsiteCleanupApply({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  assert.equal(report.status, "APPLYING");
  assert.equal(report.appliedCount, 20);
  const afterFirstGroup = await listProspects();
  const later = afterFirstGroup[25]!;
  setProspectMemoryForTests(afterFirstGroup.map((prospect) => prospect.id === later.id
    ? { ...prospect, status: "Contacted" as const }
    : prospect));
  await assert.rejects(() => continueFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    dependencies,
  }), /protected|changed after review/i);
  const partial = await getFullLegacyWebsiteCleanup({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  assert.equal(partial.status, "PARTIAL_NEEDS_REVIEW");
  assert.equal(partial.partialApplyRequiresReview, true);
  assert.equal(partial.appliedCount, 20);
  const finalProspects = await listProspects();
  assert.equal(finalProspects.filter((prospect) => prospect.websiteStatus === "usable").length, 20);
  assert.equal(finalProspects.find((prospect) => prospect.id === later.id)?.status, "Contacted");
});

test("concurrent Full Legacy Cleanup Apply continuation requests claim one mutation group", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  const prospect = legacyProspect(1);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([]);
  let applyCalls = 0;
  const dependencies = {
    now: () => new Date(now),
    listPopulation: async () => ({ prospects: [prospect], queue: [], queueByProspect: new Map(), candidates: [prospect] }),
    enforceAuditRateLimit: async () => undefined,
    enforceApplyRateLimit: async () => undefined,
    recordAudit: async () => undefined,
    inspect: async () => [{
      prospect,
      verified: null,
      proposedProspect: proposedProspect(prospect, 1),
      record: recordFor(prospect, 1),
      queueItems: [],
    }],
    applyItems: async ({ reviewedItems }: { reviewedItems: Array<{ prospectId: string }> }) => {
      applyCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { changedProspectIds: reviewedItems.map((item) => item.prospectId) };
    },
  };
  let report = await startFullLegacyWebsiteCleanup(dependencies);
  report = await continueFullLegacyWebsiteCleanup({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  report = await beginFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
    dependencies,
  });
  await Promise.all([
    continueFullLegacyWebsiteCleanupApply({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies }),
    continueFullLegacyWebsiteCleanupApply({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies }),
  ]);
  const completed = await getFullLegacyWebsiteCleanup({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  assert.equal(applyCalls, 1);
  assert.equal(completed.status, "APPLIED");
  assert.equal(completed.appliedCount, 1);
});

test("a committed group resumes idempotently when progress persistence was interrupted", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetWebsiteRepairAuditRunsForTests();
  const prospect = legacyProspect(1);
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([]);
  const dependencies = {
    now: () => new Date(now),
    listPopulation: async () => {
      const current = await listProspects();
      return { prospects: current, queue: [], queueByProspect: new Map(), candidates: current.filter((item) => item.websiteStatus !== "usable") };
    },
    enforceAuditRateLimit: async () => undefined,
    enforceApplyRateLimit: async () => undefined,
    recordAudit: async () => undefined,
    inspect: async () => [{
      prospect,
      verified: null,
      proposedProspect: proposedProspect(prospect, 1),
      record: recordFor(prospect, 1),
      queueItems: [],
    }],
  };
  let report = await startFullLegacyWebsiteCleanup(dependencies);
  report = await continueFullLegacyWebsiteCleanup({ auditRunId: report.auditRunId, accessToken: report.accessToken, dependencies });
  report = await beginFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
    dependencies,
  });
  const claimed = await claimWebsiteRepairApplyWork({ id: report.auditRunId, accessToken: report.accessToken, now: new Date(now) });
  assert.ok(claimed);
  await applyReviewedWebsiteRepairItems({ reviewedItems: claimed.run.reviewedItems, now: new Date(now) });
  await releaseWebsiteRepairApplyLease({
    id: report.auditRunId,
    leaseToken: claimed.leaseToken,
    errorCode: "APPLY_PROGRESS_PENDING",
    errorMessage: "Simulated post-commit progress interruption.",
  });
  const resumed = await continueFullLegacyWebsiteCleanupApply({
    auditRunId: report.auditRunId,
    accessToken: report.accessToken,
    dependencies,
  });
  assert.equal(resumed.status, "APPLIED");
  assert.equal(resumed.appliedCount, 1);
  assert.equal((await listProspects())[0]?.websiteStatus, "usable");
  assert.equal(resumed.nothingSent, true);
});
