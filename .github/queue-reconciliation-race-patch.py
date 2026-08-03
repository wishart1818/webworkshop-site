from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}\n--- expected ---\n{old[:500]}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const reconciled: OutreachQueueItem = {
    ...item,
    email: nextEmail,
    contactSource: nextContactSource,
    contactConfidence: prospect.sourceConfidence,
    status: nextStatus,
    queuedDate: nextStatus === "Queued" ? item.queuedDate || nowIso : "",
    blockedReason: blockedReasonText(autoEligibility.blockedReasons, []),
    eligibilityReason: emailQuality.ready
      ? `${prospect.trade} prospect has send-safe permission-first copy and a usable written contact path. The preview will be built manually only after interest.`
      : "First-touch package generated, but review is required before any outreach.",
    recommendedNextAction: nextStatus === "Eligible" || nextStatus === "Queued" ? "Keep" : "Needs Human Review",
    updatedAt: nowIso,
  };
  if (recipientChanged) return await persistRecipientChangedQueueSnapshot(reconciled, item) ?? reconciled;
  return await persistQueueSnapshot(reconciled, item) ?? reconciled;
''',
    '''  const reconciled: OutreachQueueItem = {
    ...item,
    email: nextEmail,
    contactSource: nextContactSource,
    contactConfidence: prospect.sourceConfidence,
    status: nextStatus,
    queuedDate: nextStatus === "Queued" ? item.queuedDate || nowIso : "",
    blockedReason: blockedReasonText(autoEligibility.blockedReasons, []),
    eligibilityReason: emailQuality.ready
      ? `${prospect.trade} prospect has send-safe permission-first copy and a usable written contact path. The preview will be built manually only after interest.`
      : "First-touch package generated, but review is required before any outreach.",
    recommendedNextAction: nextStatus === "Eligible" || nextStatus === "Queued" ? "Keep" : "Needs Human Review",
    updatedAt: nowIso,
  };
  const reconciliationChanged = recipientChanged
    || item.contactConfidence !== reconciled.contactConfidence
    || item.status !== reconciled.status
    || item.queuedDate !== reconciled.queuedDate
    || item.blockedReason !== reconciled.blockedReason
    || item.eligibilityReason !== reconciled.eligibilityReason
    || item.recommendedNextAction !== reconciled.recommendedNextAction;
  if (!reconciliationChanged) return item;
  if (recipientChanged) return await persistRecipientChangedQueueSnapshot(reconciled, item) ?? reconciled;
  return await persistQueueSnapshot(reconciled, item) ?? reconciled;
''',
)

replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const regenerated = await regenerateProspectOutreachWithCurrentScript(prospect.id);
  if (!regenerated?.queueItem) {
    throw new Error("The verified name was saved, but the linked draft could not be refreshed. Refresh and try again.");
  }

  return {
    item: regenerated.queueItem,
    contactFirstName: verifiedFirstName,
  };
''',
    '''  let regenerated: Awaited<ReturnType<typeof regenerateProspectOutreachWithCurrentScript>> = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      regenerated = await regenerateProspectOutreachWithCurrentScript(prospect.id);
      break;
    } catch (error) {
      const changedDuringRefresh = error instanceof Error
        && error.message === "The review package changed before refresh completed. Refresh and try again.";
      if (!changedDuringRefresh || attempt === 1) throw error;
      const latestQueueItem = (await listOutreachQueueItems()).find((entry) => entry.id === id) ?? null;
      if (
        !latestQueueItem
        || latestQueueItem.prospectId !== prospect.id
        || queueItemDraftMutationIsProtected(latestQueueItem)
      ) throw error;
    }
  }
  if (!regenerated?.queueItem) {
    throw new Error("The verified name was saved, but the linked draft could not be refreshed. Refresh and try again.");
  }

  return {
    item: regenerated.queueItem,
    contactFirstName: verifiedFirstName,
  };
''',
)

replace_once(
    "tests/final-manual-workflow-audit.test.ts",
    '''  assert.doesNotMatch(repository, /\\|\\| item\\.replyStatus\\)\\.length/);
});
''',
    '''  assert.doesNotMatch(repository, /\\|\\| item\\.replyStatus\\)\\.length/);
  assert.match(repository, /const reconciliationChanged = recipientChanged/);
  assert.match(repository, /if \\(!reconciliationChanged\\) return item/);
});
''',
)
