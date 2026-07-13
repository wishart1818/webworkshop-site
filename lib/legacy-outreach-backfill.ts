import {
  createOrRefreshAutonomousReviewPackageForProspect,
  listOutreachQueueItemsForBackfill,
  regenerateProspectOutreachWithCurrentScript,
  regenerateUnsentOutreachCopy,
} from "@/lib/autonomous-growth-repository";
import { currentOutreachCopyVersion, outreachCopyRegenerationEligibility, type OutreachQueueItem } from "@/lib/autonomous-growth";
import {
  LEGACY_OUTREACH_COPY_VERSION,
  OUTREACH_COPY_VERSION,
  outreachDraftLooksCurrent,
  prospectWrittenContactMethodIsUsable,
  type Prospect,
} from "@/lib/prospect-engine";
import { listProspects } from "@/lib/prospect-repository";

const untouchedProspectStatuses = new Set(["Contacted", "Interested", "Proposal Sent", "Closed Won", "Closed Lost"]);
const unsafeHistoryPattern = /\b(sent|contacted|replied|positive reply|won|lost|not interested|opted out|bounced|complained|suppressed|never contact|bad fit)\b/i;

export type LegacyOutreachBackfillResult = {
  status: "previewed" | "completed" | "blocked";
  copyVersion: string;
  checked: {
    prospects: number;
    queuePackages: number;
  };
  updated: {
    prospectDrafts: number;
    queuePackages: number;
    newReviewPackagesCreated: number;
  };
  skipped: Record<string, number>;
  samples: Array<{ businessName: string; action: string; reason: string }>;
  safety: {
    emailsSent: 0;
    dmsSent: 0;
    formsSubmitted: 0;
    callsPlaced: 0;
    loomsSent: 0;
  };
  copyForChatGPT: string;
};

function emptyResult(status: LegacyOutreachBackfillResult["status"]): LegacyOutreachBackfillResult {
  return {
    status,
    copyVersion: OUTREACH_COPY_VERSION,
    checked: { prospects: 0, queuePackages: 0 },
    updated: { prospectDrafts: 0, queuePackages: 0, newReviewPackagesCreated: 0 },
    skipped: {},
    samples: [],
    safety: { emailsSent: 0, dmsSent: 0, formsSubmitted: 0, callsPlaced: 0, loomsSent: 0 },
    copyForChatGPT: "",
  };
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function prospectHasUnsafeHistory(prospect: Prospect) {
  const text = [
    prospect.status,
    ...prospect.notes,
    ...prospect.activities.map((item) => item.label),
  ].join(" ");
  return untouchedProspectStatuses.has(prospect.status) || unsafeHistoryPattern.test(text);
}

function prospectHasAnalysisContext(prospect: Prospect) {
  return Boolean(prospect.analysis || prospect.prospectType === "no_website_social_only" || prospect.websiteStatus !== "unknown");
}

export function prospectOutreachNeedsCurrentScript(prospect: Prospect) {
  if (!prospect.outreach) return { needsUpdate: true, reason: "missing outreach draft" };
  if (!prospect.outreach.outreachCopyVersion || prospect.outreach.outreachCopyVersion === LEGACY_OUTREACH_COPY_VERSION) {
    return { needsUpdate: true, reason: "legacy or unversioned outreach draft" };
  }
  if (!outreachDraftLooksCurrent(prospect.outreach)) return { needsUpdate: true, reason: "outreach copy fails current permission-first checks" };
  return { needsUpdate: false, reason: "already current" };
}

function prospectBackfillSkipReason(prospect: Prospect, existingQueue: OutreachQueueItem | undefined) {
  if (prospectHasUnsafeHistory(prospect)) return "sent/contacted/suppressed/not-interested history";
  if (!prospectWrittenContactMethodIsUsable(prospect)) return "no usable written contact path";
  if (!prospectHasAnalysisContext(prospect)) return "missing truthful analysis context";
  if (existingQueue?.sentDate || unsafeHistoryPattern.test(`${existingQueue?.status ?? ""} ${existingQueue?.replyStatus ?? ""} ${existingQueue?.notes ?? ""}`)) {
    return "linked queue has sent/contact/suppression history";
  }
  return "";
}

function formatBackfillCopy(result: LegacyOutreachBackfillResult) {
  const skipped = Object.entries(result.skipped).map(([reason, count]) => `- ${reason}: ${count}`).join("\n") || "- none: 0";
  return [
    "WebWorkshop Legacy Outreach Backfill Result",
    `Status: ${result.status === "completed" ? "Completed" : result.status === "blocked" ? "Blocked" : "Previewed"}`,
    `Copy version: ${result.copyVersion}`,
    "",
    "Checked:",
    `- Prospects: ${result.checked.prospects}`,
    `- Queue packages: ${result.checked.queuePackages}`,
    "",
    "Updated:",
    `- Prospect drafts: ${result.updated.prospectDrafts}`,
    `- Queue packages: ${result.updated.queuePackages}`,
    `- New review packages created: ${result.updated.newReviewPackagesCreated}`,
    "",
    "Skipped:",
    skipped,
    "",
    "Safety:",
    "- Emails sent: 0",
    "- DMs sent: 0",
    "- Forms submitted: 0",
    "- Calls placed: 0",
    "- Looms sent: 0",
  ].join("\n");
}

export async function previewLegacyOutreachBackfill(): Promise<LegacyOutreachBackfillResult> {
  const result = emptyResult("previewed");
  const [prospects, queue] = await Promise.all([listProspects(), listOutreachQueueItemsForBackfill()]);
  result.checked.prospects = prospects.length;
  result.checked.queuePackages = queue.length;
  const queueByProspect = new Map(queue.filter((item) => item.prospectId).map((item) => [item.prospectId, item]));

  for (const prospect of prospects) {
    const existingQueue = queueByProspect.get(prospect.id);
    const skip = prospectBackfillSkipReason(prospect, existingQueue);
    if (skip) {
      increment(result.skipped, skip);
      if (result.samples.length < 8) result.samples.push({ businessName: prospect.businessName, action: "skip", reason: skip });
      continue;
    }
    const current = prospectOutreachNeedsCurrentScript(prospect);
    if (current.needsUpdate) {
      result.updated.prospectDrafts += 1;
      if (result.samples.length < 8) result.samples.push({ businessName: prospect.businessName, action: "update prospect draft", reason: current.reason });
    } else {
      increment(result.skipped, "already current");
    }
    if (!existingQueue && prospect.email) {
      result.updated.newReviewPackagesCreated += 1;
      if (result.samples.length < 8) result.samples.push({ businessName: prospect.businessName, action: "create review package", reason: "qualified unsent prospect missing queue package" });
    }
  }

  for (const item of queue) {
    const eligibility = outreachCopyRegenerationEligibility(item);
    if (eligibility.eligible) result.updated.queuePackages += 1;
    else increment(result.skipped, `queue: ${eligibility.reason}`);
  }

  result.copyForChatGPT = formatBackfillCopy(result);
  return result;
}

export async function applyLegacyOutreachBackfill(options: { confirmed?: boolean } = {}): Promise<LegacyOutreachBackfillResult> {
  if (!options.confirmed) {
    const blocked = await previewLegacyOutreachBackfill();
    blocked.status = "blocked";
    increment(blocked.skipped, "explicit confirmation required");
    blocked.copyForChatGPT = formatBackfillCopy(blocked);
    return blocked;
  }
  const result = await previewLegacyOutreachBackfill();
  result.status = "completed";
  result.updated = { prospectDrafts: 0, queuePackages: 0, newReviewPackagesCreated: 0 };
  const [prospects, queue] = await Promise.all([listProspects(), listOutreachQueueItemsForBackfill()]);
  const queueByProspect = new Map(queue.filter((item) => item.prospectId).map((item) => [item.prospectId, item]));

  for (const prospect of prospects) {
    const existingQueue = queueByProspect.get(prospect.id);
    if (prospectBackfillSkipReason(prospect, existingQueue)) continue;
    if (prospectOutreachNeedsCurrentScript(prospect).needsUpdate) {
      const regenerated = await regenerateProspectOutreachWithCurrentScript(prospect.id);
      if (regenerated?.updatedProspect) result.updated.prospectDrafts += 1;
    }
    if (!existingQueue && prospect.email) {
      const created = await createOrRefreshAutonomousReviewPackageForProspect(prospect.id);
      if (created) result.updated.newReviewPackagesCreated += 1;
    }
  }

  const queueRegeneration = await regenerateUnsentOutreachCopy();
  result.updated.queuePackages = queueRegeneration.updated;
  result.copyVersion = currentOutreachCopyVersion;
  result.copyForChatGPT = formatBackfillCopy(result);
  return result;
}
