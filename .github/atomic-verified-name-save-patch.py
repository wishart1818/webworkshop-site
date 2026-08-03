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
    '''export async function saveVerifiedContactFirstNameAndRegenerate(
  id: string,
  value: string,
  expectedUpdatedAt = "",
) {
  const verifiedFirstName = webworkshopRecipientFirstName(value);
  if (!verifiedFirstName) {
    throw new Error("Enter a verified person's first name. Generic labels and email addresses are not allowed.");
  }

  const queueItem = (await listOutreachQueueItems()).find((entry) => entry.id === id) ?? null;
  if (!queueItem) return null;
  if (expectedUpdatedAt && queueItem.updatedAt !== expectedUpdatedAt) {
    throw new Error("The draft changed after it was opened. Refresh and review the current draft before saving the name.");
  }
  if (queueItemDraftMutationIsProtected(queueItem)) {
    throw new Error("The contact name cannot change after approval, sending, contact, or suppression.");
  }
  if (!queueItem.prospectId) {
    throw new Error("This outreach package is not linked to a saved prospect.");
  }

  const prospect = await getProspect(queueItem.prospectId);
  if (!prospect) throw new Error("The linked prospect was not found.");

  await saveProspect({
    ...prospect,
    contactPersonName: verifiedFirstName,
    activities: [
      activity("outreach", `Verified contact first name saved as ${verifiedFirstName}. The editable first-touch draft will be regenerated. Nothing was sent.`),
      ...prospect.activities,
    ],
  });

  const regenerated = await regenerateProspectOutreachWithCurrentScript(prospect.id);
  if (!regenerated?.queueItem) {
    throw new Error("The verified name was saved, but the linked draft could not be refreshed. Refresh and try again.");
  }

  return {
    item: regenerated.queueItem,
    contactFirstName: verifiedFirstName,
  };
}
''',
    '''export async function saveVerifiedContactFirstNameAndRegenerate(
  id: string,
  value: string,
  expectedUpdatedAt = "",
) {
  const verifiedFirstName = webworkshopRecipientFirstName(value);
  if (!verifiedFirstName) {
    throw new Error("Enter a verified person's first name. Generic labels and email addresses are not allowed.");
  }

  const queueItem = (await listOutreachQueueItems()).find((entry) => entry.id === id) ?? null;
  if (!queueItem) return null;
  if (!queueItem.prospectId) {
    throw new Error("This outreach package is not linked to a saved prospect.");
  }

  const prospect = await getProspect(queueItem.prospectId);
  if (!prospect) throw new Error("The linked prospect was not found.");

  const alreadyApplied = queueItem.emailBody.trimStart().startsWith(`Hi ${verifiedFirstName},`)
    && webworkshopRecipientFirstName(prospect.contactPersonName) === verifiedFirstName;
  if (expectedUpdatedAt && queueItem.updatedAt !== expectedUpdatedAt && !alreadyApplied) {
    throw new Error("The draft changed after it was opened. Refresh and review the current draft before saving the name.");
  }
  if (alreadyApplied) {
    return { item: queueItem, contactFirstName: verifiedFirstName };
  }
  if (queueItemDraftMutationIsProtected(queueItem)) {
    throw new Error("The contact name cannot change after approval, sending, contact, or suppression.");
  }

  const nowIso = new Date().toISOString();
  const updatedProspect = { ...prospect, contactPersonName: verifiedFirstName };
  const outreach = {
    ...generateOutreach(updatedProspect, queueItem.previewLink),
    approved: false,
    generatedAt: nowIso,
    outreachCopyGeneratedAt: nowIso,
    outreachCopyVersion: currentOutreachCopyVersion,
  };
  const nextCopy = {
    subjectLine: outreach.subjects[0] ?? queueItem.subjectLine,
    emailBody: outreach.concise,
    dmScript: manualDmScript(updatedProspect, queueItem.previewLink),
    loomTalkingPoints: loomTalkingPoints(updatedProspect, queueItem.previewLink),
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: nowIso,
    lastRegeneratedAt: nowIso,
  };

  if (!hasDatabase) {
    const index = memoryQueue().findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = memoryQueue()[index];
    const memoryAlreadyApplied = current.emailBody.trimStart().startsWith(`Hi ${verifiedFirstName},`)
      && webworkshopRecipientFirstName((await getProspect(current.prospectId))?.contactPersonName ?? "") === verifiedFirstName;
    if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt && !memoryAlreadyApplied) {
      throw new Error("The draft changed after it was opened. Refresh and review the current draft before saving the name.");
    }
    if (memoryAlreadyApplied) return { item: structuredClone(current), contactFirstName: verifiedFirstName };
    if (queueItemDraftMutationIsProtected(current)) {
      throw new Error("The contact name cannot change after approval, sending, contact, or suppression.");
    }
    await saveProspect({
      ...updatedProspect,
      outreach,
      activities: [
        activity("outreach", `Verified contact first name saved as ${verifiedFirstName}. This editable first-touch draft was regenerated. Nothing was sent.`),
        ...prospect.activities,
      ],
    });
    const refreshed = { ...current, ...nextCopy, updatedAt: nowIso };
    memoryQueue()[index] = structuredClone(refreshed);
    await recordRunReview(memorySettings(), memoryQueue());
    return { item: structuredClone(refreshed), contactFirstName: verifiedFirstName };
  }

  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const generatedAt = new Date(nowIso);
  const row = await database.$transaction(async (transaction) => {
    const currentRow = await transaction.outreachQueueItem.findUnique({ where: { id } });
    if (!currentRow) return null;
    const current = queueToDomain(currentRow);
    const transactionAlreadyApplied = current.emailBody.trimStart().startsWith(`Hi ${verifiedFirstName},`);
    if (transactionAlreadyApplied) {
      await transaction.prospect.update({
        where: { id: prospect.id },
        data: { contactPersonName: verifiedFirstName },
      });
      return currentRow;
    }
    if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
      throw new Error("The draft changed after it was opened. Refresh and review the current draft before saving the name.");
    }
    if (queueItemDraftMutationIsProtected(current)) {
      throw new Error("The contact name cannot change after approval, sending, contact, or suppression.");
    }

    const updated = await transaction.outreachQueueItem.updateMany({
      where: {
        id,
        status: currentRow.status,
        updatedAt: currentRow.updatedAt,
        sentDate: null,
        NOT: [
          { status: { in: ["Queued", ...protectedQueueStatuses] } },
          { notes: { contains: ambiguousOutcomeMarker } },
        ],
      },
      data: {
        subjectLine: nextCopy.subjectLine,
        emailBody: nextCopy.emailBody,
        dmScript: nextCopy.dmScript,
        loomTalkingPoints: nextCopy.loomTalkingPoints,
        outreachCopyVersion: nextCopy.outreachCopyVersion,
        outreachCopyGeneratedAt: generatedAt,
        lastRegeneratedAt: generatedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("The review package changed before refresh completed. Refresh and try again.");
    }

    await transaction.prospect.update({
      where: { id: prospect.id },
      data: { contactPersonName: verifiedFirstName },
    });
    await transaction.outreachDraft.upsert({
      where: { prospectId_createdAt: { prospectId: prospect.id, createdAt: generatedAt } },
      update: {
        subjectLines: outreach.subjects,
        conciseBody: outreach.concise,
        detailedBody: outreach.detailed,
        followUps: outreach.followUps,
        approvedAt: null,
      },
      create: {
        prospectId: prospect.id,
        createdAt: generatedAt,
        subjectLines: outreach.subjects,
        conciseBody: outreach.concise,
        detailedBody: outreach.detailed,
        followUps: outreach.followUps,
        approvedAt: null,
      },
    });
    return transaction.outreachQueueItem.findUniqueOrThrow({ where: { id } });
  }, { isolationLevel: "Serializable" });

  if (!row) return null;
  return {
    item: queueToDomain(row),
    contactFirstName: verifiedFirstName,
  };
}
''',
)

replace_once(
    "tests/autonomous-growth.test.ts",
    '''    assert.equal(result?.item.status, queued.status);
    assert.equal(result?.item.sentDate, "");

    await assert.rejects(
''',
    '''    assert.equal(result?.item.status, queued.status);
    assert.equal(result?.item.sentDate, "");

    const repeated = await saveVerifiedContactFirstNameAndRegenerate(queued.id, "Nick", queued.updatedAt);
    assert.match(repeated?.item.emailBody ?? "", /^Hi Nick,/);
    assert.equal(repeated?.contactFirstName, "Nick");

    await assert.rejects(
''',
)
