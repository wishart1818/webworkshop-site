import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applySelectedWebsiteRepairsAtomically,
  resetAutonomousGrowthMemoryForTests,
  setOutreachQueueMemoryForTests,
} from "../lib/autonomous-growth-repository";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import {
  getProspect,
  resetProspectMemoryForTests,
  setProspectMemoryForTests,
} from "../lib/prospect-repository";
import {
  websiteRepairProspectChangedPaths,
  websiteRepairProspectStateDigest,
  websiteRepairStateDigest,
} from "../lib/website-repair-snapshot";

const at = "2026-08-09T12:00:00.000Z";

function snapshotProspect(): Prospect {
  const base = createProspect({
    businessName: "A First Choice Pressure Washing",
    website: "https://afirstchoice.example.com",
    phone: "+14195550123",
    email: "",
    city: "Toledo",
    state: "OH",
    trade: "Pressure Washing",
    serviceArea: "Toledo, OH",
    status: "Reviewed",
    sizeIndicator: "Small",
  });
  return {
    ...base,
    websiteStatus: "unreachable_website",
    websiteStatusDetail: "Legacy HTTP 508 result.",
    notes: ["Second safe operator note.", "First safe operator note."],
    activities: [
      { id: "activity-b", type: "analysis", label: "Second safe review activity.", at },
      { id: "activity-a", type: "analysis", label: "First safe review activity.", at },
    ],
    contactEvidence: [
      {
        kind: "contact_page",
        value: "https://afirstchoice.example.com/contact",
        sourceUrl: "https://afirstchoice.example.com/",
        extractionMethod: "same_origin_link",
        confidence: "high",
        domainMatchesBusiness: true,
        discoveredAt: at,
      },
      {
        kind: "phone",
        value: "+14195550123",
        sourceUrl: "https://afirstchoice.example.com/contact",
        extractionMethod: "tel",
        confidence: "high",
        domainMatchesBusiness: true,
        discoveredAt: at,
      },
    ],
    outreach: {
      subjects: ["Quick question"],
      concise: "Hi A First Choice Pressure Washing team,\n\nWould you like a preview?",
      detailed: "Hi A First Choice Pressure Washing team,\n\nWould you like a preview?",
      followUps: [],
      approved: false,
      generatedAt: at,
      outreachCopyVersion: "manual_lovable_permission_first_v7",
      outreachCopyGeneratedAt: at,
    },
  };
}

test("canonical Prospect snapshots ignore only semantically irrelevant relation ordering", () => {
  const reviewed = snapshotProspect();
  assert.equal(websiteRepairProspectStateDigest(reviewed), websiteRepairProspectStateDigest(reviewed));
  for (const independentlyDecoded of [
    { ...structuredClone(reviewed), notes: [...reviewed.notes].reverse() },
    { ...structuredClone(reviewed), activities: [...reviewed.activities].reverse() },
    { ...structuredClone(reviewed), contactEvidence: [...reviewed.contactEvidence].reverse() },
  ]) {
    assert.notEqual(JSON.stringify(reviewed), JSON.stringify(independentlyDecoded));
    assert.equal(websiteRepairProspectStateDigest(reviewed), websiteRepairProspectStateDigest(independentlyDecoded));
    assert.deepEqual(websiteRepairProspectChangedPaths(reviewed, independentlyDecoded), []);
  }

  const meaningfulAttemptOrder = {
    ...reviewed,
    websiteVerification: {
      version: "website-verification-v2" as const,
      status: "usable" as const,
      confidence: "high" as const,
      canonicalUrl: "https://afirstchoice.example.com/",
      attempts: [
        {
          requestedUrl: "https://afirstchoice.example.com/",
          normalizedUrl: "https://afirstchoice.example.com/",
          finalUrl: "",
          httpStatus: 508,
          redirectChain: [],
          contentType: "text/html",
          durationMs: 20,
          failureCategory: "http_transient" as const,
          robotsAllowed: true,
          botBlocked: false,
          browserCompatibleHeaders: false,
          timestamp: at,
        },
        {
          requestedUrl: "https://afirstchoice.example.com/",
          normalizedUrl: "https://afirstchoice.example.com/",
          finalUrl: "https://afirstchoice.example.com/",
          httpStatus: 200,
          redirectChain: [],
          contentType: "text/html",
          durationMs: 25,
          failureCategory: "none" as const,
          robotsAllowed: true,
          botBlocked: false,
          browserCompatibleHeaders: true,
          timestamp: at,
        },
      ],
      usableSignals: ["business name", "service content"],
      explanation: "The owned business site returned meaningful HTML.",
      checkedAt: at,
      ownershipDecision: "owned" as const,
      identityEvidence: ["The business name matches the owned host."],
    },
  };
  const reversedAttempts = {
    ...meaningfulAttemptOrder,
    websiteVerification: {
      ...meaningfulAttemptOrder.websiteVerification,
      attempts: [...meaningfulAttemptOrder.websiteVerification.attempts].reverse(),
    },
  };
  assert.notEqual(
    websiteRepairProspectStateDigest(meaningfulAttemptOrder),
    websiteRepairProspectStateDigest(reversedAttempts),
  );
  assert.ok(websiteRepairProspectChangedPaths(meaningfulAttemptOrder, reversedAttempts).some((path) => path.startsWith("websiteVerification.attempts")));
});

test("undefined object fields normalize like omitted fields while null remains a meaningful value", () => {
  assert.equal(websiteRepairStateDigest({ value: undefined }), websiteRepairStateDigest({}));
  assert.notEqual(websiteRepairStateDigest({ value: null }), websiteRepairStateDigest({ value: undefined }));
});

test("the atomic reread accepts independently decoded equivalent relation order", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const current = snapshotProspect();
  const reviewed = {
    ...structuredClone(current),
    notes: [...current.notes].reverse(),
    activities: [...current.activities].reverse(),
    contactEvidence: [...current.contactEvidence].reverse(),
  };
  const proposed = {
    ...reviewed,
    websiteStatus: "usable" as const,
    websiteStatusDetail: "The owned website returned meaningful public content.",
  };
  setProspectMemoryForTests([current]);
  setOutreachQueueMemoryForTests([]);
  try {
    const result = await applySelectedWebsiteRepairsAtomically({
      mutations: [{
        expectedProspect: reviewed,
        proposedProspect: proposed,
        expectedQueueItems: [],
        queueReason: "Verified owned website is not a rebuild opportunity.",
      }],
      now: new Date(at),
    });
    assert.deepEqual(result.changedProspectIds, [current.id]);
    assert.equal((await getProspect(current.id))?.websiteStatus, "usable");
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("canonical snapshots still reject every safety-relevant Prospect mutation", async () => {
  const reviewed = snapshotProspect();
  const mutations: Array<{ label: string; current: Prospect; expectedPath: RegExp }> = [
    { label: "note addition", current: { ...reviewed, notes: [...reviewed.notes, "New safe note."] }, expectedPath: /^notes/ },
    {
      label: "activity addition",
      current: { ...reviewed, activities: [...reviewed.activities, { id: "activity-c", type: "note", label: "New activity.", at }] },
      expectedPath: /^activities/,
    },
    {
      label: "contact evidence change",
      current: { ...reviewed, contactEvidence: reviewed.contactEvidence.map((item, index) => index === 0 ? { ...item, confidence: "medium" as const } : item) },
      expectedPath: /^contactEvidence/,
    },
    { label: "status change", current: { ...reviewed, status: "Contacted" as const }, expectedPath: /^status$/ },
    { label: "website change", current: { ...reviewed, websiteStatus: "usable" as const }, expectedPath: /^websiteStatus$/ },
    { label: "fit change", current: { ...reviewed, fitDisposition: "adequate_existing_website" as const }, expectedPath: /^fitDisposition$/ },
    {
      label: "nested website fit change",
      current: {
        ...reviewed,
        websiteVerification: {
          version: "website-verification-v2" as const,
          status: "usable" as const,
          confidence: "high" as const,
          canonicalUrl: reviewed.website,
          attempts: [],
          usableSignals: ["business name", "service content"],
          explanation: "The site is usable.",
          checkedAt: at,
          ownershipDecision: "owned" as const,
          identityEvidence: ["The business name matches."],
          fit: {
            disposition: "adequate_existing_website" as const,
            reason: "A rendered review found a complete website.",
            supportingEvidence: ["Services and contact paths are present."],
            confidence: "high" as const,
            analysisOrigin: "rendered_review" as const,
            evaluatedAt: at,
          },
        },
      },
      expectedPath: /^websiteVerification/,
    },
    { label: "approval change", current: { ...reviewed, outreach: { ...reviewed.outreach!, approved: true } }, expectedPath: /^outreach\.approved$/ },
  ];

  for (const mutation of mutations) {
    assert.notEqual(websiteRepairProspectStateDigest(reviewed), websiteRepairProspectStateDigest(mutation.current), mutation.label);
    assert.ok(websiteRepairProspectChangedPaths(reviewed, mutation.current).some((path) => mutation.expectedPath.test(path)), mutation.label);
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    setProspectMemoryForTests([mutation.current]);
    setOutreachQueueMemoryForTests([]);
    await assert.rejects(
      applySelectedWebsiteRepairsAtomically({
        mutations: [{
          expectedProspect: reviewed,
          proposedProspect: { ...reviewed, websiteStatus: "usable" },
          expectedQueueItems: [],
          queueReason: "Verified owned website is not a rebuild opportunity.",
        }],
        now: new Date(at),
      }),
      /A First Choice Pressure Washing .*changed after review/i,
      mutation.label,
    );
    assert.deepEqual(await getProspect(reviewed.id), mutation.current, mutation.label);
  }
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
});

test("atomic mismatch diagnostics expose paths but never note or contact values", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const reviewed = snapshotProspect();
  const secretNote = "private operator detail that must not be logged";
  const changed = { ...reviewed, notes: [...reviewed.notes, secretNote] };
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  setProspectMemoryForTests([changed]);
  setOutreachQueueMemoryForTests([]);
  try {
    await assert.rejects(
      applySelectedWebsiteRepairsAtomically({
        mutations: [{
          expectedProspect: reviewed,
          proposedProspect: { ...reviewed, websiteStatus: "usable" },
          expectedQueueItems: [],
          queueReason: "Verified owned website is not a rebuild opportunity.",
        }],
        now: new Date(at),
      }),
      /A First Choice Pressure Washing.*changed after review/i,
    );
    const diagnostic = JSON.stringify(logged);
    assert.match(diagnostic, /changedPaths/);
    assert.match(diagnostic, /notes/);
    assert.doesNotMatch(diagnostic, new RegExp(secretNote));
    assert.doesNotMatch(diagnostic, /\+14195550123|afirstchoice\.example\.com\/contact/);
  } finally {
    console.error = originalError;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("Prisma relation reads use stable ID tie-breakers after createdAt", () => {
  const repository = readFileSync("lib/prospect-repository.ts", "utf8");
  assert.match(repository, /notes:\s*\{\s*orderBy:\s*\[\{ createdAt: "desc" as const \}, \{ id: "desc" as const \}\]/);
  assert.match(repository, /activities:\s*\{\s*orderBy:\s*\[\{ createdAt: "desc" as const \}, \{ id: "desc" as const \}\]/);
});
