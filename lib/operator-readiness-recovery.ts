import type { Prisma } from "@prisma/client";
import {
  currentOutreachCopyVersion,
  loomTalkingPoints,
  manualDmScript,
  outreachCopyRegenerationEligibility,
  outreachHistoryTextIndicatesProtectedContact,
  type OutreachQueueItem,
} from "@/lib/autonomous-growth";
import {
  getAutonomousGrowthDashboard,
  safeReadinessRepairProtectionReason,
  type OutreachCopyRegenerationSummary,
} from "@/lib/autonomous-growth-repository";
import {
  generateOutreach,
  type Prospect,
} from "@/lib/prospect-engine";
import {
  regenerateOperatorUnsentOutreachCopy,
  runSafeReadinessRepair,
  type OperatorActionResult,
} from "@/lib/operator-test-center";
import { safeRecordAudit } from "@/lib/operational-controls";
import { getProspect, getProspectDatabase } from "@/lib/prospect-repository";

const mutableRecoveryStatuses = new Set<OutreachQueueItem["status"]>([
  "Draft",
  "Eligible",
  "Needs Review",
  "Queued",
]);

const ambiguousOutcomeMarker = "[auto-email-ambiguous]";
const approvalMarker = "[auto-email-approved]";

type RecoveryQueueRow = Prisma.OutreachQueueItemGetPayload<Record<string, never>>;

export function terminalQueueStatusForProspect(status: Prospect["status"]): "Lost" | "Won" | "" {
  if (status === "Closed Lost") return "Lost";
  if (status === "Closed Won") return "Won";
  return "";
}

export function readinessRecoveryProtectionReason(
  item: Pick<OutreachQueueItem, "status" | "sentDate" | "replyStatus" | "notes" | "blockedReason">,
) {
  if (!mutableRecoveryStatuses.has(item.status)) return `Status ${item.status} is protected from readiness recovery.`;
  if (item.sentDate) return "Sent records are protected from readiness recovery.";
  if (item.replyStatus) return "Reply, bounce, complaint, opt-out, or suppression history is protected.";
  if (item.notes.includes(ambiguousOutcomeMarker)) return "Ambiguous provider outcomes require manual reconciliation.";
  if (outreachHistoryTextIndicatesProtectedContact(`${item.blockedReason}\n${item.notes}`)) {
    return "Contact, suppression, or terminal history is protected.";
  }
  return "";
}

type RecoverySummary = {
  targeted: number;
  regenerated: number;
  terminallyReconciled: number;
  updatedItems: string[];
  skippedReasons: Record<string, number>;
};

type RecoveryMutationResult = {
  changed: boolean;
  reason: string;
};

function incrementReason(summary: RecoverySummary, reason: string) {
  const key = reason || "manual review required";
  summary.skippedReasons[key] = (summary.skippedReasons[key] ?? 0) + 1;
}

function stripApprovalMarker(value: string) {
  return value
    .split("\n")
    .filter((line) => line !== approvalMarker)
    .join("\n")
    .trim();
}

function currentRecoveryItem(item: OutreachQueueItem, row: RecoveryQueueRow): OutreachQueueItem {
  return {
    ...item,
    prospectId: row.prospectId ?? "",
    topProspectResultId: row.topProspectResultId ?? "",
    previewLink: row.previewLink,
    status: row.status as OutreachQueueItem["status"],
    queuedDate: row.queuedDate?.toISOString() ?? "",
    sentDate: row.sentDate?.toISOString() ?? "",
    replyStatus: row.replyStatus ?? "",
    notes: row.notes ?? "",
    blockedReason: row.blockedReason ?? "",
    outreachCopyVersion: row.outreachCopyVersion ?? "",
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function clearApprovalInTransaction(
  transaction: Prisma.TransactionClient,
  item: OutreachQueueItem,
  now: Date,
  packageDisposition: "review" | "closed",
) {
  if (item.topProspectResultId) {
    await transaction.topProspectResult.updateMany({
      where: { id: item.topProspectResultId, packageSentAt: null, NOT: { packageStatus: "SENT" } },
      data: packageDisposition === "closed"
        ? {
            packageStatus: "SKIPPED",
            packageReviewedAt: now,
            packageApprovedAt: null,
            packageSkippedAt: now,
          }
        : {
            packageStatus: "READY_FOR_REVIEW",
            packageReviewedAt: now,
            packageApprovedAt: null,
            packageSkippedAt: null,
          },
    });
  }
  if (item.prospectId) {
    await transaction.outreachDraft.updateMany({
      where: { prospectId: item.prospectId, approvedAt: { not: null } },
      data: { approvedAt: null },
    });
  }
}

async function reconcileTerminalProspect(item: OutreachQueueItem, prospect: Prospect) {
  const terminalStatus = terminalQueueStatusForProspect(prospect.status);
  if (!terminalStatus) return { changed: false, reason: "Prospect is not terminal." };

  const database = getProspectDatabase();
  const now = new Date();
  const result = await database.$transaction(async (transaction): Promise<RecoveryMutationResult> => {
    const row = await transaction.outreachQueueItem.findUnique({ where: { id: item.id } });
    if (!row) return { changed: false, reason: "The queue record no longer exists." };

    const currentItem = currentRecoveryItem(item, row);
    const blockedReason = readinessRecoveryProtectionReason(currentItem);
    if (blockedReason) return { changed: false, reason: blockedReason };

    const note = `Readiness reconciliation: linked prospect is ${prospect.status}; queue moved to ${terminalStatus}. Approval removed when present. Nothing was sent.`;
    const updated = await transaction.outreachQueueItem.updateMany({
      where: {
        id: currentItem.id,
        status: currentItem.status,
        sentDate: null,
      },
      data: {
        status: terminalStatus,
        queuedDate: null,
        notes: [stripApprovalMarker(currentItem.notes), note].filter(Boolean).join("\n") || null,
        recommendedNextAction: terminalStatus === "Lost" ? "Bad Fit" : "Keep",
      },
    });
    if (updated.count !== 1) {
      return { changed: false, reason: "The record changed during terminal reconciliation." };
    }

    await clearApprovalInTransaction(transaction, currentItem, now, "closed");
    return { changed: true, reason: "" };
  }, { isolationLevel: "Serializable" });

  if (result.changed) {
    await safeRecordAudit({
      action: "readiness_terminal_queue_reconciliation",
      outcome: "success",
      subject: item.businessName,
      metadata: { queueItemId: item.id, prospectStatus: prospect.status, queueStatus: terminalStatus },
    });
  }
  return result;
}

function currentQueueCopy(item: OutreachQueueItem, prospect: Prospect, now: Date) {
  const previewLink = item.previewLink && /\/p\//i.test(item.previewLink) ? item.previewLink : "";
  const outreach = generateOutreach(prospect, previewLink);
  const note = `Outreach copy regenerated to ${currentOutreachCopyVersion} by bounded readiness recovery. Approval removed when present. Nothing was sent.`;
  return {
    outreach,
    queueData: {
      subjectLine: outreach.subjects[0] ?? "",
      emailBody: outreach.concise,
      dmScript: manualDmScript(prospect, previewLink),
      loomTalkingPoints: previewLink
        ? loomTalkingPoints(prospect, previewLink)
        : "Preview missing - generate/review preview before sending yes-reply.",
      outreachCopyVersion: currentOutreachCopyVersion,
      outreachCopyGeneratedAt: new Date(outreach.outreachCopyGeneratedAt || now.toISOString()),
      lastRegeneratedAt: now,
      rewritePlan: [],
      recommendedNextAction: "Needs Human Review",
      reviewSummary: `${item.businessName} outreach copy was regenerated to ${currentOutreachCopyVersion}. Nothing was sent.`,
      notes: [stripApprovalMarker(item.notes), note].filter(Boolean).join("\n") || null,
      status: "Needs Review",
      queuedDate: null,
      blockedReason: null,
    },
  };
}

async function regenerateQueueItem(item: OutreachQueueItem, prospect: Prospect) {
  const database = getProspectDatabase();
  const now = new Date();
  const result = await database.$transaction(async (transaction): Promise<RecoveryMutationResult> => {
    const row = await transaction.outreachQueueItem.findUnique({ where: { id: item.id } });
    if (!row) return { changed: false, reason: "The queue record no longer exists." };

    const currentItem = currentRecoveryItem(item, row);
    const blockedReason = safeReadinessRepairProtectionReason(currentItem, prospect.status);
    if (blockedReason) return { changed: false, reason: blockedReason };

    const eligibility = outreachCopyRegenerationEligibility(currentItem);
    if (!eligibility.eligible) {
      return { changed: false, reason: eligibility.reason || "The package is no longer eligible for regeneration." };
    }

    const { outreach, queueData } = currentQueueCopy(currentItem, prospect, now);
    const updated = await transaction.outreachQueueItem.updateMany({
      where: {
        id: currentItem.id,
        status: currentItem.status,
        sentDate: null,
      },
      data: queueData,
    });
    if (updated.count !== 1) {
      return { changed: false, reason: "The record changed during regeneration." };
    }

    await clearApprovalInTransaction(transaction, currentItem, now, "review");
    await transaction.outreachDraft.create({
      data: {
        prospectId: prospect.id,
        subjectLines: outreach.subjects,
        conciseBody: outreach.concise,
        detailedBody: outreach.detailed,
        followUps: outreach.followUps,
        approvedAt: null,
        createdAt: now,
      },
    });
    await transaction.activity.create({
      data: {
        prospectId: prospect.id,
        type: "outreach",
        label: `Outreach regenerated with ${currentOutreachCopyVersion}. Approval removed. Nothing was sent.`,
        createdAt: now,
      },
    });
    return { changed: true, reason: "" };
  }, { isolationLevel: "Serializable" });

  if (result.changed) {
    await safeRecordAudit({
      action: "readiness_outreach_copy_recovery",
      outcome: "success",
      subject: item.businessName,
      metadata: { queueItemId: item.id, copyVersion: currentOutreachCopyVersion },
    });
  }
  return result;
}

async function recoverOutdatedRecords(): Promise<RecoverySummary> {
  const summary: RecoverySummary = {
    targeted: 0,
    regenerated: 0,
    terminallyReconciled: 0,
    updatedItems: [],
    skippedReasons: {},
  };
  if (!process.env.DATABASE_URL?.trim()) return summary;

  for (let pass = 0; pass < 3; pass += 1) {
    const dashboard = await getAutonomousGrowthDashboard();
    const candidates = dashboard.queue.filter((item) => outreachCopyRegenerationEligibility(item).eligible);
    if (pass === 0) summary.targeted = candidates.length;
    if (!candidates.length) break;

    let changedThisPass = 0;
    for (const item of candidates) {
      if (!item.prospectId) {
        incrementReason(summary, "queue item has no linked prospect");
        continue;
      }
      const prospect = await getProspect(item.prospectId);
      if (!prospect) {
        incrementReason(summary, "linked prospect was not found");
        continue;
      }

      const terminalStatus = terminalQueueStatusForProspect(prospect.status);
      const result = terminalStatus
        ? await reconcileTerminalProspect(item, prospect)
        : await regenerateQueueItem(item, prospect);
      if (!result.changed) {
        incrementReason(summary, result.reason);
        continue;
      }
      changedThisPass += 1;
      summary.updatedItems.push(item.businessName);
      if (terminalStatus) summary.terminallyReconciled += 1;
      else summary.regenerated += 1;
    }
    if (!changedThisPass) break;
  }
  return summary;
}

function mergeReasonCounts(left: Record<string, number>, right: Record<string, number>) {
  const merged = { ...left };
  for (const [reason, count] of Object.entries(right)) merged[reason] = (merged[reason] ?? 0) + count;
  return merged;
}

function combineRegenerationSummary(
  recovery: RecoverySummary,
  fallback: OutreachCopyRegenerationSummary | undefined,
): OutreachCopyRegenerationSummary {
  const fallbackUpdated = fallback?.updated ?? 0;
  const fallbackItems = fallback?.updatedItems ?? [];
  const skippedReasons = mergeReasonCounts(recovery.skippedReasons, fallback?.skippedReasons ?? {});
  const updatedItems = [...new Set([...recovery.updatedItems, ...fallbackItems])];
  const skipped = Object.values(skippedReasons).reduce((sum, count) => sum + count, 0);
  const updated = recovery.regenerated + fallbackUpdated;
  const details = [
    `${updated} unsent package${updated === 1 ? "" : "s"} updated to ${currentOutreachCopyVersion}`,
    recovery.terminallyReconciled
      ? `${recovery.terminallyReconciled} closed prospect queue record${recovery.terminallyReconciled === 1 ? "" : "s"} moved out of email eligibility`
      : "",
    skipped
      ? Object.entries(skippedReasons).map(([reason, count]) => `${count} skipped because ${reason}`).join("; ")
      : "",
  ].filter(Boolean);
  return {
    copyVersion: currentOutreachCopyVersion,
    updated,
    skipped,
    oldUnsentPackagesNeedingRegeneration: recovery.targeted,
    updatedItems,
    skippedReasons,
    message: details.join(". "),
  };
}

export async function regenerateOperatorUnsentOutreachCopyWithRecovery(): Promise<OperatorActionResult> {
  const recovery = await recoverOutdatedRecords();
  const fallback = await regenerateOperatorUnsentOutreachCopy();
  const regeneration = combineRegenerationSummary(recovery, fallback.regeneration);
  return {
    ok: true,
    message: `${regeneration.message} Nothing was sent.`,
    regeneration,
  };
}

export async function runSafeReadinessRepairWithRecovery(input: { confirmed: boolean }): Promise<OperatorActionResult> {
  if (!input.confirmed) return runSafeReadinessRepair({ confirmed: false });
  const recovery = await recoverOutdatedRecords();
  const result = await runSafeReadinessRepair({ confirmed: true });
  const recoveryMessage = [
    recovery.regenerated
      ? `Recovered ${recovery.regenerated} stale outreach package${recovery.regenerated === 1 ? "" : "s"}`
      : "",
    recovery.terminallyReconciled
      ? `reconciled ${recovery.terminallyReconciled} closed prospect queue record${recovery.terminallyReconciled === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean).join(" and ");
  return {
    ...result,
    message: recoveryMessage ? `${recoveryMessage}. ${result.message}` : result.message,
  };
}
