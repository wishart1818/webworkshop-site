from pathlib import Path

path = Path("lib/autonomous-growth-repository.ts")
text = path.read_text()
old = '''    await transaction.outreachDraft.upsert({
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
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one outreachDraft upsert, found {text.count(old)}")
path.write_text(text.replace(old, "", 1))
