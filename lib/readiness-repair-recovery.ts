import { currentOutreachCopyVersion } from "@/lib/autonomous-growth";
import { updateOutreachQueueStatus } from "@/lib/autonomous-growth-repository";
import {
  regenerateOperatorUnsentOutreachCopy,
  runSafeReadinessRepair,
  type OperatorActionResult,
} from "@/lib/operator-test-center";
import { getProspectDatabase } from "@/lib/prospect-repository";

const repairableQueueStatuses = ["Draft", "Eligible", "Needs Review"] as const;
const ambiguousOutcomeMarker = "[auto-email-ambiguous]";

export type ReadinessRepairCandidate = {
  id: string;
  prospectId: string | null;
  status: string;
  updatedAt: Date;
  sentDate: Date | null;
  replyStatus: string | null;
  notes: string | null;
  outreachCopyVersion: string | null;
};

export type ReadinessRepairRecoveryDependencies = {
  listCandidates: () => Promise<ReadinessRepairCandidate[]>;
  readProspectStatus: (prospectId: string) => Promise<string>;
  normalizeNullNotes: (candidate: ReadinessRepairCandidate) => Promise<boolean>;
  markBadFit: (queueItemId: string) => Promise<boolean>;
};

export type ReadinessRepairRecoverySummary = {
  inspected: number;
  normalizedNullNotes: number;
  alignedClosedLost: number;
  skipped: number;
};

const emptyRecoverySummary = (): ReadinessRepairRecoverySummary => ({
  inspected: 0,
  normalizedNullNotes: 0,
  alignedClosedLost: 0,
  skipped: 0,
});

const defaultDependencies: ReadinessRepairRecoveryDependencies = {
  async listCandidates() {
    if (!process.env.DATABASE_URL?.trim()) return [];
    return getProspectDatabase().outreachQueueItem.findMany({
      where: {
        sentDate: null,
        status: { in: [...repairableQueueStatuses] },
      },
      select: {
        id: true,
        prospectId: true,
        status: true,
        updatedAt: true,
        sentDate: true,
        replyStatus: true,
        notes: true,
        outreachCopyVersion: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });
  },
  async readProspectStatus(prospectId) {
    if (!process.env.DATABASE_URL?.trim()) return "";
    const prospect = await getProspectDatabase().prospect.findUnique({
      where: { id: prospectId },
      select: { status: true },
    });
    return prospect?.status ?? "";
  },
  async normalizeNullNotes(candidate) {
    if (!process.env.DATABASE_URL?.trim()) return false;
    const updated = await getProspectDatabase().outreachQueueItem.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        updatedAt: candidate.updatedAt,
        sentDate: null,
        notes: null,
      },
      data: { notes: "" },
    });
    return updated.count === 1;
  },
  async markBadFit(queueItemId) {
    const updated = await updateOutreachQueueStatus(queueItemId, "Bad Fit");
    return updated?.status === "Bad Fit";
  },
};

export async function prepareReadinessRepairCandidates(
  dependencies: ReadinessRepairRecoveryDependencies = defaultDependencies,
): Promise<ReadinessRepairRecoverySummary> {
  const summary = emptyRecoverySummary();
  const candidates = await dependencies.listCandidates();

  for (const candidate of candidates) {
    if (candidate.outreachCopyVersion === currentOutreachCopyVersion) continue;
    summary.inspected += 1;

    if (
      candidate.sentDate
      || candidate.replyStatus
      || candidate.notes?.includes(ambiguousOutcomeMarker)
    ) {
      summary.skipped += 1;
      continue;
    }

    const prospectStatus = candidate.prospectId
      ? await dependencies.readProspectStatus(candidate.prospectId)
      : "";

    if (prospectStatus === "CLOSED_LOST") {
      if (await dependencies.markBadFit(candidate.id)) summary.alignedClosedLost += 1;
      else summary.skipped += 1;
      continue;
    }

    if (!['NEW', 'REVIEWED'].includes(prospectStatus)) {
      summary.skipped += 1;
      continue;
    }

    if (candidate.notes === null) {
      if (await dependencies.normalizeNullNotes(candidate)) summary.normalizedNullNotes += 1;
      else summary.skipped += 1;
    }
  }

  return summary;
}

function recoveryMessage(summary: ReadinessRepairRecoverySummary) {
  if (!summary.inspected) return "";
  return [
    `Recovery preparation inspected ${summary.inspected} stale record${summary.inspected === 1 ? "" : "s"}.`,
    summary.normalizedNullNotes
      ? `Normalized ${summary.normalizedNullNotes} legacy null-note record${summary.normalizedNullNotes === 1 ? "" : "s"} so guarded regeneration can match it.`
      : "",
    summary.alignedClosedLost
      ? `Moved ${summary.alignedClosedLost} linked Closed Lost record${summary.alignedClosedLost === 1 ? "" : "s"} to Bad Fit in the outreach queue.`
      : "",
    summary.skipped ? `${summary.skipped} record${summary.skipped === 1 ? " was" : "s were"} left unchanged for safety.` : "",
    "Nothing was sent.",
  ].filter(Boolean).join(" ");
}

export async function regenerateOperatorUnsentOutreachCopyWithRecovery(): Promise<OperatorActionResult> {
  const recovery = await prepareReadinessRepairCandidates();
  const result = await regenerateOperatorUnsentOutreachCopy();
  return {
    ...result,
    message: [result.message, recoveryMessage(recovery)].filter(Boolean).join(" "),
  };
}

export async function runSafeReadinessRepairWithRecovery(
  input: Parameters<typeof runSafeReadinessRepair>[0],
): Promise<OperatorActionResult> {
  if (!input.confirmed) return runSafeReadinessRepair(input);
  const recovery = await prepareReadinessRepairCandidates();
  const result = await runSafeReadinessRepair(input);
  return {
    ...result,
    message: [result.message, recoveryMessage(recovery)].filter(Boolean).join(" "),
  };
}
