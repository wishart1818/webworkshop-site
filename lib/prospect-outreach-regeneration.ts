import type { OutreachQueueItem } from "@/lib/autonomous-growth";
import {
  createOrRefreshAutonomousReviewPackageForProspect,
  listOutreachQueueItemsForBackfill,
  regenerateProspectOutreachWithCurrentScript,
  repairOutreachQueueItemForReadiness,
} from "@/lib/autonomous-growth-repository";
import {
  activity,
  generateOutreach,
  OUTREACH_COPY_VERSION,
  type Prospect,
} from "@/lib/prospect-engine";
import { getProspect, saveProspect } from "@/lib/prospect-repository";

export type ProspectOutreachRegenerationOptions = {
  previewOnly?: boolean;
};

export type ProspectOutreachRegenerationDependencies = {
  regenerate: typeof regenerateProspectOutreachWithCurrentScript;
  getProspect: typeof getProspect;
  saveProspect: typeof saveProspect;
  listQueueItems: typeof listOutreachQueueItemsForBackfill;
  repairQueueItem: typeof repairOutreachQueueItemForReadiness;
  refreshQueueItem: typeof createOrRefreshAutonomousReviewPackageForProspect;
};

const defaultDependencies: ProspectOutreachRegenerationDependencies = {
  regenerate: regenerateProspectOutreachWithCurrentScript,
  getProspect,
  saveProspect,
  listQueueItems: listOutreachQueueItemsForBackfill,
  repairQueueItem: repairOutreachQueueItemForReadiness,
  refreshQueueItem: createOrRefreshAutonomousReviewPackageForProspect,
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown outreach regeneration error.";
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function isProtectedRegenerationError(error: unknown) {
  return /cannot be regenerated after approval, sending, contact, or suppression/i.test(errorMessage(error));
}

function isRetryableRepairConflict(reason: string) {
  return /changed before|try again|transaction|serialization|conflict/i.test(reason);
}

function currentProspectDraft(prospect: Prospect, previewLink: string, nowIso: string): Prospect {
  const auditLabel = `Outreach regenerated with ${OUTREACH_COPY_VERSION}. Approval removed. Nothing was sent.`;
  const outreach = {
    ...generateOutreach(prospect, previewLink),
    approved: false,
    lastRegeneratedAt: nowIso,
  };
  return {
    ...prospect,
    outreach,
    activities: prospect.activities.some((item) => item.label === auditLabel)
      ? prospect.activities
      : [activity("outreach", auditLabel), ...prospect.activities],
  };
}

async function repairLinkedQueueItem(
  item: OutreachQueueItem,
  dependencies: ProspectOutreachRegenerationDependencies,
) {
  let latestItem: OutreachQueueItem | null = item;
  let latestReason = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repair = await dependencies.repairQueueItem({
      id: item.id,
      action: "regenerate_current_copy",
      reason: "The linked prospect draft and review package were out of sync.",
    });
    latestItem = repair.item ?? latestItem;
    latestReason = repair.blockedReason;
    if (repair.changed) return latestItem;
    if (!isRetryableRepairConflict(repair.blockedReason)) {
      throw new Error(repair.blockedReason || "The linked outreach package is protected from regeneration.");
    }
  }

  throw new Error(latestReason || "The linked outreach package changed repeatedly. Reload and try once more.");
}

async function refreshQueueFromLatestProspect(
  prospect: Prospect,
  dependencies: ProspectOutreachRegenerationDependencies,
) {
  let latestError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const refreshed = await dependencies.refreshQueueItem(prospect);
      if (refreshed) return refreshed;
      latestError = new Error("The linked outreach package was not found after conflict recovery.");
    } catch (error) {
      if (isProtectedRegenerationError(error)) throw error;
      latestError = error;
    }
  }
  throw latestError instanceof Error
    ? latestError
    : new Error("The linked outreach package could not be refreshed from the latest prospect.");
}

export async function regenerateProspectOutreachWithConflictRecovery(
  prospectId: string,
  options: ProspectOutreachRegenerationOptions = {},
  dependencies: ProspectOutreachRegenerationDependencies = defaultDependencies,
) {
  try {
    return await dependencies.regenerate(prospectId, options);
  } catch (error) {
    if (options.previewOnly || isProtectedRegenerationError(error)) throw error;

    console.warn("[outreach-regeneration] Standard regeneration failed; attempting bounded conflict recovery.", {
      errorName: errorName(error),
      prospectId,
    });

    const originalProspect = await dependencies.getProspect(prospectId);
    if (!originalProspect) return null;

    const queueItems = await dependencies.listQueueItems();
    const existingQueueItem = queueItems.find((item) => item.prospectId === prospectId) ?? null;
    const repairedQueueItem = existingQueueItem
      ? await repairLinkedQueueItem(existingQueueItem, dependencies)
      : null;
    const previewLink = repairedQueueItem?.previewLink ?? existingQueueItem?.previewLink ?? "";

    const latestProspect = await dependencies.getProspect(prospectId) ?? originalProspect;
    const updatedProspect = currentProspectDraft(latestProspect, previewLink, new Date().toISOString());
    const savedProspect = await dependencies.saveProspect(updatedProspect);
    const refreshedQueueItem = existingQueueItem
      ? await refreshQueueFromLatestProspect(savedProspect, dependencies)
      : null;

    return {
      prospect: originalProspect,
      updatedProspect: savedProspect,
      queueItem: refreshedQueueItem ?? repairedQueueItem ?? existingQueueItem,
      previewLink: refreshedQueueItem?.previewLink ?? previewLink,
      wouldUpdateQueue: Boolean(existingQueueItem),
    };
  }
}
