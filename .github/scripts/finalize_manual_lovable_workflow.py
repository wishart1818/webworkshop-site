from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:140]!r}")
    write(path, content.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    content = read(path)
    count = content.count(old)
    if count < minimum:
        raise RuntimeError(f"Expected at least {minimum} matches in {path}, found {count}: {old[:140]!r}")
    write(path, content.replace(old, new))


def replace_regex(path: str, pattern: str, replacement: str, count: int = 1) -> None:
    content = read(path)
    updated, matches = re.subn(pattern, lambda _match: replacement, content, count=count, flags=re.S)
    if matches != count:
        raise RuntimeError(f"Expected {count} regex matches in {path}, found {matches}: {pattern[:140]!r}")
    write(path, updated)


# ---------------------------------------------------------------------------
# 1. Normal Top Prospects discovery/package generation must not build previews.
# ---------------------------------------------------------------------------

outreach_artifacts = r'''
export function prepareTopProspectOutreachArtifacts(
  prospect: Prospect,
  outreachPreference: OutreachPreference = "written_only",
) {
  let outreach = generateOutreach(prospect, "");
  let withArtifacts: Prospect = { ...prospect, outreach };
  let emailQuality = evaluateOutreachEmailQuality(withArtifacts, "", outreachPreference);
  if (emailQuality.readinessLabel === "Unsupported claim") {
    outreach = repairUnsupportedOutreachClaims(outreach);
    withArtifacts = { ...withArtifacts, outreach };
    emailQuality = evaluateOutreachEmailQuality(withArtifacts, "", outreachPreference);
  }
  const assessment = prospect.prospectType === "no_website_social_only"
    ? assessNoWebsiteOpportunity(withArtifacts)
    : assessOpportunity(withArtifacts);
  return {
    prospect: withArtifacts,
    assessment,
    buildPrompt: "",
    previewLink: "",
    emailQuality,
  };
}

'''
replace_once(
    "lib/top-prospects.ts",
    '''export function prepareTopProspectArtifacts(prospect: Prospect, previewLink: string, outreachPreference: OutreachPreference = "written_only") {
  return prepareTopProspectArtifactsFromPreview(prospect, generatePreview(prospect), previewLink, outreachPreference);
}

const stateCodePattern''',
    '''export function prepareTopProspectArtifacts(prospect: Prospect, previewLink: string, outreachPreference: OutreachPreference = "written_only") {
  return prepareTopProspectArtifactsFromPreview(prospect, generatePreview(prospect), previewLink, outreachPreference);
}

''' + outreach_artifacts + '''const stateCodePattern''',
)

replace_once("lib/top-prospect-worker.ts", 'import { createPublicPreviewToken } from "@/lib/public-preview-token";\n', "")
replace_once("lib/top-prospect-worker.ts", '  publicProspectPreviewLink,\n', '  prepareTopProspectOutreachArtifacts,\n')
replace_once("lib/top-prospect-worker.ts", 'import { prepareTopProspectArtifactsWithResearch } from "@/lib/top-prospect-preview-preparation";\n', "")
replace_regex(
    "lib/top-prospect-worker.ts",
    r'''async function saveTopProspectResult\([\s\S]*?\n}\n\nasync function processLead''',
    r'''async function saveTopProspectResult(
  jobId: string,
  prospect: Prospect,
  mode: ProspectMode,
  outreachPreference: OutreachPreference,
) {
  const database = getProspectDatabase();
  const existingResult = await database.topProspectResult.findUnique({
    where: { jobId_prospectId: { jobId, prospectId: prospect.id } },
    select: { buildPrompt: true, previewLink: true, publicPreviewToken: true },
  });
  const prepared = prepareTopProspectOutreachArtifacts(prospect, outreachPreference);
  const rejectionReason = topProspectRejectionReason(prepared.prospect, prepared.assessment, mode, outreachPreference);
  const scores = prepared.assessment.salesScores;
  await saveProspect({
    ...prepared.prospect,
    priorityScore: scores.weightedSalesScore,
    activities: [
      activity("outreach", "Permission-first Top Prospects outreach package generated without building a preview."),
      ...prepared.prospect.activities,
    ],
  });
  const preservedPreview = {
    buildPrompt: existingResult?.buildPrompt ?? "",
    previewLink: existingResult?.previewLink ?? "",
    publicPreviewToken: existingResult?.publicPreviewToken ?? null,
  };
  await database.topProspectResult.upsert({
    where: { jobId_prospectId: { jobId, prospectId: prospect.id } },
    update: {
      opportunityScore: prepared.assessment.opportunityScore,
      ...scores,
      prospectType: prospect.prospectType,
      onlinePresenceGapScore: prepared.assessment.presenceScores?.onlinePresenceGapScore ?? 0,
      businessActivityScore: prepared.assessment.presenceScores?.businessActivityScore ?? 0,
      websiteNeedScore: prepared.assessment.presenceScores?.websiteNeedScore ?? 0,
      mainWeakness: prepared.assessment.mainWeakness,
      whyMayBuy: prepared.assessment.whyMayBuy,
      pitchAngle: prepared.assessment.pitchAngle,
      ...preservedPreview,
      packageStatus: "PACKAGE_GENERATED",
      packageGeneratedAt: new Date(),
      packageReviewedAt: null,
      packageApprovedAt: null,
      packageSentAt: null,
      packageSkippedAt: null,
      selected: rejectionReason === null,
    },
    create: {
      jobId,
      prospectId: prospect.id,
      opportunityScore: prepared.assessment.opportunityScore,
      ...scores,
      prospectType: prospect.prospectType,
      onlinePresenceGapScore: prepared.assessment.presenceScores?.onlinePresenceGapScore ?? 0,
      businessActivityScore: prepared.assessment.presenceScores?.businessActivityScore ?? 0,
      websiteNeedScore: prepared.assessment.presenceScores?.websiteNeedScore ?? 0,
      mainWeakness: prepared.assessment.mainWeakness,
      whyMayBuy: prepared.assessment.whyMayBuy,
      pitchAngle: prepared.assessment.pitchAngle,
      buildPrompt: "",
      previewLink: "",
      packageStatus: "PACKAGE_GENERATED",
      packageGeneratedAt: new Date(),
      selected: rejectionReason === null,
    },
  });
  return rejectionReason;
}

async function processLead''',
)
replace_once(
    "lib/top-prospect-worker.ts",
    '''  return Boolean(prospect.outreach && prospect.preview && prospect.activities.some((item) => item.createdAt >= jobCreatedAt.toISOString()));''',
    '''  return Boolean(prospect.outreach && prospect.activities.some((item) => item.createdAt >= jobCreatedAt.toISOString()));''',
)
replace_once(
    "lib/top-prospect-worker.ts",
    '''      || ((existing.prospectType === "no_website_social_only" || existing.analysis) && existing.outreach && existing.preview)''',
    '''      || ((existing.prospectType === "no_website_social_only" || existing.analysis) && existing.outreach)''',
)
replace_once(
    "lib/top-prospect-worker.ts",
    '''      activity("preview", "Website preview and build prompt added to the Auto Prospect Queue."),
      activity("outreach", "Personalized outreach draft added to the Auto Prospect Queue for human approval."),''',
    '''      activity("outreach", "Permission-first outreach draft added to the Auto Prospect Queue for human approval. No preview was built."),''',
)

replace_once("lib/top-prospect-repository.ts", 'import { createPublicPreviewToken } from "@/lib/public-preview-token";\n', "")
replace_once("lib/top-prospect-repository.ts", '  publicProspectPreviewLink,\n', '  prepareTopProspectOutreachArtifacts,\n')
replace_once("lib/top-prospect-repository.ts", 'import { prepareTopProspectArtifactsWithResearch } from "@/lib/top-prospect-preview-preparation";\n', "")
replace_regex(
    "lib/top-prospect-repository.ts",
    r'''  if \(action === "generate"\) \{[\s\S]*?\n  } else \{''',
    r'''  if (action === "generate") {
    const prepared = prepareTopProspectOutreachArtifacts(
      prospect,
      normalizeOutreachPreference(result.job?.outreachPreference),
    );
    const saved = await saveProspect({
      ...prepared.prospect,
      activities: [
        activity("outreach", "Permission-first Outreach Package generated for human review without building a preview."),
        ...prepared.prospect.activities,
      ],
    });
    const scores = prepared.assessment.salesScores;
    await database.topProspectResult.update({
      where: { id: resultId },
      data: {
        opportunityScore: prepared.assessment.opportunityScore,
        ...scores,
        onlinePresenceGapScore: prepared.assessment.presenceScores?.onlinePresenceGapScore ?? 0,
        businessActivityScore: prepared.assessment.presenceScores?.businessActivityScore ?? 0,
        websiteNeedScore: prepared.assessment.presenceScores?.websiteNeedScore ?? 0,
        mainWeakness: prepared.assessment.mainWeakness,
        whyMayBuy: prepared.assessment.whyMayBuy,
        pitchAngle: prepared.assessment.pitchAngle,
        packageStatus: "PACKAGE_GENERATED",
        packageGeneratedAt: new Date(),
        packageReviewedAt: null,
        packageApprovedAt: null,
        packageSentAt: null,
        packageSkippedAt: null,
      },
    });
    console.info("[outreach-package] Permission-first package generated without a preview.", { resultId, prospectId: saved.id });
    try {
      await upsertAutonomousQueueItemFromPackage({
        outreachPreference: normalizeOutreachPreference(result.job?.outreachPreference),
        previewLink: result.previewLink,
        prospect: saved,
        topProspectResultId: resultId,
      });
    } catch (queueError) {
      console.error("[autonomous-growth] Unable to sync Outreach Package into queue.", {
        resultId,
        prospectId: saved.id,
        error: queueError instanceof Error ? queueError.name : "unknown",
      });
    }
  } else {''',
)

# ---------------------------------------------------------------------------
# 2. Protect every post-interest/manual-build state and fix reply metrics.
# ---------------------------------------------------------------------------

replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  "Preview Build Needed",
  "Loom Needed",
  "Ready for Loom",''',
    '''  "Preview Build Needed",
  "Preview Needs Polish",
  "Loom Needed",
  "Ready for Loom",''',
)
replace_once(
    "lib/autonomous-growth.ts",
    '''  "Preview Build Needed",
  "Loom Needed",
  "Preview Needs Polish",''',
    '''  "Preview Build Needed",
  "Preview Needs Polish",
  "Loom Needed",''',
)
replace_once(
    "lib/autonomous-growth.ts",
    '''  "Preview Needs Polish": ["Eligible", "Needs Review", "Ready for Loom", "Skipped", "Bad Fit"],''',
    '''  "Preview Needs Polish": ["Preview Build Needed", "Ready for Loom", "Lost", "Not Interested"],''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const replies = queue.filter((item) => ["Replied", "Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested"].includes(item.status) || item.replyStatus).length;''',
    '''  const replies = queue.filter((item) => ["Replied", "Positive Reply", "Prospect Said Yes", "Preview Build Needed", "Preview Needs Polish", "Loom Needed", "Ready for Loom", "Loom Recorded", "Loom Sent", "Pricing Requested", "Pricing Sent", "Won"].includes(item.status) || item.replyStatus).length;''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const positiveReplies = queue.filter((item) => ["Positive Reply", "Prospect Said Yes", "Preview Build Needed", "Loom Needed", "Pricing Requested", "Won"].includes(item.status) || /positive|prospect_said_yes|pricing_requested/i.test(item.replyStatus)).length;''',
    '''  const positiveReplies = queue.filter((item) => ["Positive Reply", "Prospect Said Yes", "Preview Build Needed", "Preview Needs Polish", "Loom Needed", "Ready for Loom", "Loom Recorded", "Loom Sent", "Pricing Requested", "Pricing Sent", "Won"].includes(item.status) || /positive|prospect_said_yes|pricing_requested/i.test(item.replyStatus)).length;''',
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''      setNotice("Preview and outreach package regenerated for review. Nothing was sent.");''',
    '''      setNotice("Permission-first outreach package regenerated for review. No preview was built and nothing was sent.");''',
)

# ---------------------------------------------------------------------------
# 3. Bind approval to the exact reviewed recipient, subject, body, and version.
# ---------------------------------------------------------------------------

approval_snapshot_type = r'''
export type EmailApprovalSnapshot = {
  businessName: string;
  email: string;
  subjectLine: string;
  emailBody: string;
  outreachCopyVersion: string;
  updatedAt: string;
};

function approvalSnapshotContentMatches(item: OutreachQueueItem, expected: EmailApprovalSnapshot) {
  return item.businessName === expected.businessName
    && normalizeEmailAddress(item.email) === normalizeEmailAddress(expected.email)
    && item.subjectLine === expected.subjectLine
    && item.emailBody === expected.emailBody
    && item.outreachCopyVersion === expected.outreachCopyVersion;
}

function approvalSnapshotMatches(item: OutreachQueueItem, expected: EmailApprovalSnapshot) {
  return item.updatedAt === expected.updatedAt && approvalSnapshotContentMatches(item, expected);
}

'''
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''export type ApproveAndQueueEmailResult = {
  item: OutreachQueueItem | null;
  queued: boolean;
  blockedReasons: string[];
};

export type AutoEmailPilotCycleResult''',
    '''export type ApproveAndQueueEmailResult = {
  item: OutreachQueueItem | null;
  queued: boolean;
  blockedReasons: string[];
};

''' + approval_snapshot_type + '''export type AutoEmailPilotCycleResult''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''export async function approveAndQueueEmail(id: string): Promise<ApproveAndQueueEmailResult> {
  const queue = await listOutreachQueueItems();
  const existing = queue.find((entry) => entry.id === id) ?? null;
  if (!existing) return { item: null, queued: false, blockedReasons: ["Queue item was not found."] };''',
    '''export async function approveAndQueueEmail(
  id: string,
  expectedSnapshot?: EmailApprovalSnapshot,
): Promise<ApproveAndQueueEmailResult> {
  const queue = await listOutreachQueueItems();
  const existing = queue.find((entry) => entry.id === id) ?? null;
  if (!existing) return { item: null, queued: false, blockedReasons: ["Queue item was not found."] };
  if (expectedSnapshot && !approvalSnapshotMatches(existing, expectedSnapshot)) {
    return {
      item: existing,
      queued: false,
      blockedReasons: ["The recipient or email draft changed after review. Refresh and review the exact current draft again."],
    };
  }''',
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const refreshed = await reconcileQueueItem(existing);
  if (!approvableQueueStatuses.has(refreshed.status)) {''',
    '''  const refreshed = await reconcileQueueItem(existing);
  if (expectedSnapshot && !approvalSnapshotContentMatches(refreshed, expectedSnapshot)) {
    return {
      item: refreshed,
      queued: false,
      blockedReasons: ["The recipient or email draft changed during the final safety refresh. Review the updated draft before approval."],
    };
  }
  if (!approvableQueueStatuses.has(refreshed.status)) {''',
)

replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '''      previewLink?: string;
    };''',
    '''      previewLink?: string;
      expectedApprovalSnapshot?: {
        businessName?: string;
        email?: string;
        subjectLine?: string;
        emailBody?: string;
        outreachCopyVersion?: string;
        updatedAt?: string;
      };
    };''',
)
replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '''    if (payload.action === "approve_and_queue_email") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      const approval = await approveAndQueueEmail(payload.queueItemId);
      if (!approval.item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item: approval.item, approval });
    }''',
    '''    if (payload.action === "approve_and_queue_email") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      const snapshot = payload.expectedApprovalSnapshot;
      if (!snapshot
        || typeof snapshot.businessName !== "string"
        || typeof snapshot.email !== "string"
        || typeof snapshot.subjectLine !== "string"
        || typeof snapshot.emailBody !== "string"
        || typeof snapshot.outreachCopyVersion !== "string"
        || typeof snapshot.updatedAt !== "string") {
        return NextResponse.json({ error: "Review the exact current recipient, subject, and email body before approval." }, { status: 400 });
      }
      const approval = await approveAndQueueEmail(payload.queueItemId, {
        businessName: snapshot.businessName,
        email: snapshot.email,
        subjectLine: snapshot.subjectLine,
        emailBody: snapshot.emailBody,
        outreachCopyVersion: snapshot.outreachCopyVersion,
        updatedAt: snapshot.updatedAt,
      });
      if (!approval.item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item: approval.item, approval });
    }''',
)

replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''        body: JSON.stringify({ action: "approve_and_queue_email", queueItemId: item.id }),''',
    '''        body: JSON.stringify({
          action: "approve_and_queue_email",
          queueItemId: item.id,
          expectedApprovalSnapshot: {
            businessName: item.businessName,
            email: item.email,
            subjectLine: item.subjectLine,
            emailBody: item.emailBody,
            outreachCopyVersion: item.outreachCopyVersion,
            updatedAt: item.updatedAt,
          },
        }),''',
)

# Freeze the modal snapshot and approve directly through the guarded API.
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''import { useCallback, useEffect, useMemo, useRef, useState } from "react";''',
    '''import { useCallback, useEffect, useState } from "react";''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''  detectedIssues?: string[];
};''',
    '''  detectedIssues?: string[];
  outreachCopyVersion: string;
  updatedAt: string;
};''',
)
replace_regex(
    "components/engine/EmailDraftReviewHelper.tsx",
    r'''  const \[items, setItems\] = useState<EmailQueueItem\[]>\(\[]\);[\s\S]*?  const selectedItem = useMemo\([\s\S]*?\n  \);''',
    r'''  const [items, setItems] = useState<EmailQueueItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<EmailQueueItem | null>(null);
  const [loadError, setLoadError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [approving, setApproving] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''  const closeDialog = useCallback(() => {
    setSelectedItemId("");
    selectedRowRef.current = null;
    setCopyState("idle");
  }, []);''',
    '''  const closeDialog = useCallback(() => {
    if (approving) return;
    setSelectedItem(null);
    setApprovalError("");
    setCopyState("idle");
  }, [approving]);''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''        button.addEventListener("click", () => {
          selectedRowRef.current = row;
          setSelectedItemId(item.id);
          setCopyState("idle");
          void loadQueue();
        });''',
    '''        button.addEventListener("click", () => {
          setSelectedItem(structuredClone(item));
          setApprovalError("");
          setCopyState("idle");
        });''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''  const canApprove = Boolean(
    selectedItem?.email &&
      selectedItem?.subjectLine.trim() &&
      selectedItem?.emailBody.trim() &&
      selectedRowRef.current &&
      findRowButton(selectedRowRef.current, "Approve & Queue Email"),
  );''',
    '''  const canApprove = Boolean(
    selectedItem?.email
      && selectedItem?.subjectLine.trim()
      && selectedItem?.emailBody.trim()
      && selectedItem?.updatedAt
      && selectedItem?.outreachCopyVersion
      && ["Eligible", "Needs Review"].includes(selectedItem.status)
      && !approving,
  );''',
)
replace_regex(
    "components/engine/EmailDraftReviewHelper.tsx",
    r'''  function approveFromDialog\(\) \{[\s\S]*?\n  }\n\n  return \(''',
    r'''  async function approveFromDialog() {
    if (!selectedItem || !canApprove) return;
    setApproving(true);
    setApprovalError("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_and_queue_email",
          queueItemId: selectedItem.id,
          expectedApprovalSnapshot: {
            businessName: selectedItem.businessName,
            email: selectedItem.email,
            subjectLine: selectedItem.subjectLine,
            emailBody: selectedItem.emailBody,
            outreachCopyVersion: selectedItem.outreachCopyVersion,
            updatedAt: selectedItem.updatedAt,
          },
        }),
      });
      const payload = await response.json() as { approval?: { queued: boolean; blockedReasons: string[] }; error?: string };
      if (!response.ok || !payload.approval?.queued) {
        throw new Error(payload.error || payload.approval?.blockedReasons.join("; ") || "Unable to approve this exact draft.");
      }
      await loadQueue();
      window.location.reload();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Unable to approve this exact draft.");
    } finally {
      setApproving(false);
    }
  }

  return (''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''            {loadError ? <p className="email-draft-review-error">Latest refresh warning: {loadError}</p> : null}''',
    '''            {loadError ? <p className="email-draft-review-error">Latest refresh warning: {loadError}</p> : null}
            {approvalError ? <p className="email-draft-review-error">Approval blocked: {approvalError}</p> : null}''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''                onClick={approveFromDialog}
                title={canApprove ? "Approve this exact saved draft" : "A complete saved draft and the original approval action are required"}''',
    '''                onClick={() => void approveFromDialog()}
                title={canApprove ? "Approve this exact saved draft and version" : "A complete current draft in an approvable status is required"}''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '''                Approve &amp; Queue Email''',
    '''                {approving ? "Approving exact draft..." : "Approve & Queue Email"}''',
)

# ---------------------------------------------------------------------------
# 4. Regression tests for all final review findings.
# ---------------------------------------------------------------------------

replace_once(
    "tests/preview-render-plan.test.ts",
    '''  assert.match(worker, /await prepareTopProspectArtifactsWithResearch\(/);
  assert.match(repository, /await prepareTopProspectArtifactsWithResearch\(/);''',
    '''  assert.doesNotMatch(worker, /prepareTopProspectArtifactsWithResearch|prepareProspectForPreview|createPublicPreviewToken|publicProspectPreviewLink/);
  assert.match(worker, /prepareTopProspectOutreachArtifacts\(/);
  assert.doesNotMatch(repository.match(/if \(action === "generate"\)[\s\S]*?} else {/)?.[0] ?? "", /prepareTopProspectArtifactsWithResearch|prepareProspectForPreview|createPublicPreviewToken|publicProspectPreviewLink/);
  assert.match(repository, /prepareTopProspectOutreachArtifacts\(/);''',
)
replace_once(
    "tests/preview-render-plan.test.ts",
    '''  assert.match(firstTouchSync, /No preview was generated/);''',
    '''  assert.match(firstTouchSync, /No preview was generated/);
  assert.match(worker, /without building a preview/);
  assert.match(repository, /without building a preview/);''',
)

append_tests = r'''

test("pre-interest Top Prospect artifacts create outreach without a preview", () => {
  const prospect = { ...eligibleProspect(), preview: undefined };
  const prepared = prepareTopProspectOutreachArtifacts(prospect, "written_only");
  assert.equal(prepared.previewLink, "");
  assert.equal(prepared.buildPrompt, "");
  assert.equal(prepared.prospect.preview, undefined);
  assert.match(prepared.prospect.outreach?.concise ?? "", /Would you like me to put together a quick preview\?/i);
});

test("approval snapshot rejects a changed reviewed draft", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  try {
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: "",
      prospect: eligibleProspect(),
      topProspectResultId: "stale-approval-snapshot",
    });
    const result = await approveAndQueueEmail(eligible.id, {
      businessName: eligible.businessName,
      email: eligible.email,
      subjectLine: eligible.subjectLine,
      emailBody: `${eligible.emailBody}\nchanged after review`,
      outreachCopyVersion: eligible.outreachCopyVersion,
      updatedAt: eligible.updatedAt,
    });
    assert.equal(result.queued, false);
    assert.match(result.blockedReasons.join(" "), /changed after review/i);
    assert.notEqual(result.item?.status, "Queued");
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("post-interest polish state is protected from pre-contact reconciliation", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  const prospect = eligibleProspectFor({
    id: "protected-polish-prospect",
    businessName: "Protected Polish Plumbing",
    website: "https://protectedpolishplumbing.com",
    email: "approved@protectedpolishplumbing.com",
  });
  try {
    setProspectMemoryForTests([{ ...prospect, email: "changed@protectedpolishplumbing.com" }]);
    const protectedItem = queueItem({
      id: "protected-polish-item",
      prospectId: prospect.id,
      businessName: prospect.businessName,
      website: prospect.website,
      email: "approved@protectedpolishplumbing.com",
      status: "Preview Needs Polish",
      previewLink: "https://lovable.app/protected-polish-preview",
    });
    setOutreachQueueMemoryForTests([protectedItem]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });
    await processExistingQualifiedProspects({ dryRun: false });
    const current = outreachQueueMemoryForTests().find((item) => item.id === protectedItem.id);
    assert.equal(current?.status, "Preview Needs Polish");
    assert.equal(current?.email, "approved@protectedpolishplumbing.com");
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("real approval UI submits the exact draft snapshot instead of clicking a rendered row", () => {
  const route = readFileSync(new URL("../app/api/engine/autonomous-growth/route.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../components/engine/AutonomousGrowthWorkspace.tsx", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../components/engine/EmailDraftReviewHelper.tsx", import.meta.url), "utf8");
  assert.match(route, /expectedApprovalSnapshot[\s\S]*Review the exact current recipient/);
  assert.match(workspace, /expectedApprovalSnapshot:[\s\S]*emailBody: item\.emailBody[\s\S]*updatedAt: item\.updatedAt/);
  assert.match(helper, /expectedApprovalSnapshot:[\s\S]*emailBody: selectedItem\.emailBody[\s\S]*updatedAt: selectedItem\.updatedAt/);
  assert.doesNotMatch(helper, /approveButton\.click\(\)/);
});
'''

# Extend imports in autonomous-growth test.
replace_once(
    "tests/autonomous-growth.test.ts",
    '''import { evaluateOutreachEmailQuality, prepareTopProspectArtifacts, publicProspectPreviewLink, recommendedMarketPresets, type TopProspectJob, type TopProspectResult } from "../lib/top-prospects";''',
    '''import { evaluateOutreachEmailQuality, prepareTopProspectArtifacts, prepareTopProspectOutreachArtifacts, publicProspectPreviewLink, recommendedMarketPresets, type TopProspectJob, type TopProspectResult } from "../lib/top-prospects";''',
)
write("tests/autonomous-growth.test.ts", read("tests/autonomous-growth.test.ts") + append_tests)

print("Final manual Lovable workflow corrections applied.")
