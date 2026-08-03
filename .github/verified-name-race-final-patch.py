from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "lib/autonomous-growth-repository.ts",
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
''',
    '''  const regenerated = await regenerateProspectOutreachWithCurrentScript(prospect.id);
''',
)

replace_once(
    "tests/final-manual-workflow-audit.test.ts",
    '''  assert.match(repository, /const reconciliationChanged = recipientChanged/);
  assert.match(repository, /if \\(!reconciliationChanged\\) return item/);
''',
    '''  assert.match(repository, /const reconciliationChanged = recipientChanged/);
  assert.match(repository, /if \\(!reconciliationChanged\\) return item/);
  assert.match(repository, /const regenerated = await regenerateProspectOutreachWithCurrentScript\\(prospect\\.id\\)/);
  assert.doesNotMatch(repository, /for \\(let attempt = 0; attempt < 2/);
''',
)
