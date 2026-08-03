from __future__ import annotations

import os
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: apply-v6-name-patch.py <repo-root>")
    os.chdir(sys.argv[1])

    style_path = Path("lib/outreach-style-guide.ts")
    style = style_path.read_text()
    style = replace_once(
        style,
        'export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "manual_lovable_permission_first_v5";',
        'export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "manual_lovable_permission_first_v6";',
        "copy version",
    )
    helper = r'''
const unsafeRecipientFirstNames = new Set([
  "admin",
  "billing",
  "booking",
  "contact",
  "customer",
  "hello",
  "info",
  "manager",
  "none",
  "office",
  "owner",
  "quotes",
  "sales",
  "service",
  "staff",
  "support",
  "team",
  "unknown",
]);

export function webworkshopRecipientFirstName(value?: string) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized || /@|https?:\/\//i.test(normalized)) return "";
  const withoutTitle = normalized.replace(/^(?:(?:mr|mrs|ms|miss|dr)\.?\s+)+/i, "");
  const candidate = withoutTitle.split(/[\s,(/&]+/)[0]?.replace(/[^\p{L}'’\-]/gu, "") ?? "";
  if (candidate.length < 2 || candidate.length > 40) return "";
  if (unsafeRecipientFirstNames.has(candidate.toLowerCase())) return "";
  if (candidate === candidate.toUpperCase()) {
    return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
  }
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

'''
    style = replace_once(
        style,
        "export function webworkshopFirstEmail({\n",
        helper + "export function webworkshopFirstEmail({\n",
        "recipient helper insertion",
    )
    style = replace_once(
        style,
        '  const verifiedRecipientName = recipientName?.trim() ?? "";\n  const greeting = verifiedRecipientName ? `Hi ${verifiedRecipientName},` : "Hi there,";\n',
        '  const verifiedRecipientFirstName = webworkshopRecipientFirstName(recipientName);\n  const greeting = verifiedRecipientFirstName ? `Hi ${verifiedRecipientFirstName},` : "Hi there,";\n',
        "greeting logic",
    )
    style_path.write_text(style)

    engine_path = Path("lib/prospect-engine.ts")
    engine = engine_path.read_text()
    engine = replace_once(
        engine,
        '    kind: noOwnedWebsiteProspect(prospect) ? "no_website" : "has_website",\n    footer,\n',
        '    kind: noOwnedWebsiteProspect(prospect) ? "no_website" : "has_website",\n    footer,\n    recipientName: prospect.contactPersonName,\n',
        "first-touch contact name plumbing",
    )
    engine_path.write_text(engine)

    growth_path = Path("lib/autonomous-growth-repository.ts")
    growth = growth_path.read_text()
    growth = replace_once(
        growth,
        "function prospectForQueueCopyRegeneration(item: OutreachQueueItem): Prospect {",
        'function prospectForQueueCopyRegeneration(item: OutreachQueueItem, contactPersonName = ""): Prospect {',
        "queue prospect signature",
    )
    growth = replace_once(
        growth,
        "    email: item.email,\n    city: location.city,\n",
        "    email: item.email,\n    contactPersonName,\n    city: location.city,\n",
        "queue prospect contact name",
    )
    growth = replace_once(
        growth,
        "function regeneratedQueueCopy(item: OutreachQueueItem, nowIso: string) {\n  const prospect = prospectForQueueCopyRegeneration(item);\n",
        'function regeneratedQueueCopy(item: OutreachQueueItem, nowIso: string, contactPersonName = "") {\n  const prospect = prospectForQueueCopyRegeneration(item, contactPersonName);\n',
        "regenerated copy signature",
    )
    growth = replace_once(
        growth,
        "  reason: string,\n  nowIso: string,\n) {\n",
        '  reason: string,\n  nowIso: string,\n  contactPersonName = "",\n) {\n',
        "readiness repair signature",
    )
    growth = replace_once(
        growth,
        "      ...regeneratedQueueCopy({ ...item, notes: notesWithoutApproval }, nowIso),\n",
        "      ...regeneratedQueueCopy({ ...item, notes: notesWithoutApproval }, nowIso, contactPersonName),\n",
        "readiness repair regeneration",
    )
    growth = replace_once(
        growth,
        "    const data = readinessRepairData(current, input.action, reason, nowIso);\n",
        '    const data = readinessRepairData(current, input.action, reason, nowIso, prospect?.contactPersonName ?? "");\n',
        "memory readiness contact name",
    )
    growth = replace_once(
        growth,
        '? await transaction.prospect.findUnique({ where: { id: item.prospectId }, select: { status: true } })\n',
        '? await transaction.prospect.findUnique({ where: { id: item.prospectId }, select: { status: true, contactPersonName: true } })\n',
        "database readiness contact selection",
    )
    growth = replace_once(
        growth,
        "    const data = readinessRepairData(item, input.action, reason, nowIso);\n",
        '    const data = readinessRepairData(item, input.action, reason, nowIso, prospect?.contactPersonName ?? "");\n',
        "database readiness contact name",
    )
    growth = replace_once(
        growth,
        "      Object.assign(item, {\n        ...regeneratedQueueCopy(item, nowIso),\n",
        '      const prospect = item.prospectId ? await getProspect(item.prospectId) : null;\n      Object.assign(item, {\n        ...regeneratedQueueCopy(item, nowIso, prospect?.contactPersonName ?? ""),\n',
        "memory bulk regeneration contact name",
    )
    growth = replace_once(
        growth,
        "    const regenerated = regeneratedQueueCopy(item, nowIso);\n",
        '    const prospect = item.prospectId ? await getProspect(item.prospectId) : null;\n    const regenerated = regeneratedQueueCopy(item, nowIso, prospect?.contactPersonName ?? "");\n',
        "database bulk regeneration contact name",
    )
    growth_path.write_text(growth)

    style_test_path = Path("tests/outreach-style-guide.test.ts")
    style_test = style_test_path.read_text()
    style_test = replace_once(
        style_test,
        "  webworkshopPreviewValueLine,\n  webworkshopShouldMentionFindlay,\n",
        "  webworkshopPreviewValueLine,\n  webworkshopRecipientFirstName,\n  webworkshopShouldMentionFindlay,\n",
        "style helper import",
    )
    style_test = style_test.replace("manual_lovable_permission_first_v5", "manual_lovable_permission_first_v6")
    recipient_test = r'''

test("recipient greeting uses only a safe recorded first name", () => {
  assert.equal(webworkshopRecipientFirstName("Nick Smith"), "Nick");
  assert.equal(webworkshopRecipientFirstName("Dr. Ana-María Lopez"), "Ana-María");
  assert.equal(webworkshopRecipientFirstName("NICK"), "Nick");
  assert.equal(webworkshopRecipientFirstName("Owner"), "");
  assert.equal(webworkshopRecipientFirstName("nick@pinnacle419.com"), "");
});
'''
    style_test = replace_once(
        style_test,
        '\ntest("existing-site email clearly offers a refreshed website and asks permission to show it", () => {',
        recipient_test + '\ntest("existing-site email clearly offers a refreshed website and asks permission to show it", () => {',
        "style recipient test",
    )
    style_test_path.write_text(style_test)

    engine_test_path = Path("tests/prospect-engine.test.ts")
    engine_test = engine_test_path.read_text()
    greeting_test = r'''

test("first-touch email uses the saved contact first name and never infers one from the email address", () => {
  const prospect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Pinnacle Pressure Washing of Toledo",
    trade: "Pressure Washing",
    city: "Toledo",
    email: "nick@pinnacle419.com",
    contactPersonName: "Nick Smith",
  });

  assert.match(firstTouchEmailDraft(prospect, testFooter), /^Hi Nick,/);
  assert.match(firstTouchEmailDraft({ ...prospect, contactPersonName: "" }, testFooter), /^Hi there,/);
});
'''
    engine_test = replace_once(
        engine_test,
        '\ntest("permission-first outreach avoids repeating the business name and stays link-free", () => {',
        greeting_test + '\ntest("permission-first outreach avoids repeating the business name and stays link-free", () => {',
        "prospect greeting test",
    )
    engine_test_path.write_text(engine_test)

    growth_test_path = Path("tests/autonomous-growth.test.ts")
    growth_test = growth_test_path.read_text().rstrip()
    regeneration_test = r'''

test("bulk copy regeneration preserves the saved contact first name from the live prospect", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetProspectMemoryForTests();
  const prospect = eligibleProspect();
  Object.assign(prospect, {
    id: "named-regeneration-prospect",
    businessName: "Pinnacle Pressure Washing of Toledo",
    city: "Toledo",
    state: "OH",
    email: "nick@pinnacle419.com",
    contactPersonName: "Nick Smith",
  });
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem({
    id: "named-regeneration-package",
    prospectId: prospect.id,
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: "Toledo, OH",
    email: prospect.email,
    contactSource: "Public email",
    status: "Needs Review",
    outreachCopyVersion: "old_copy_v0",
    emailBody: "Old audit-style copy with One missed opportunity.",
    sentDate: "",
    replyStatus: "",
    notes: "",
  })]);

  const summary = await regenerateUnsentOutreachCopy();
  const refreshed = outreachQueueMemoryForTests()[0];
  assert.equal(summary.updated, 1);
  assert.equal(refreshed.outreachCopyVersion, currentOutreachCopyVersion);
  assert.match(refreshed.emailBody, /^Hi Nick,/);
});
'''
    growth_test_path.write_text(growth_test + regeneration_test + "\n")

    audit_path = Path("tests/final-manual-workflow-audit.test.ts")
    audit = audit_path.read_text().replace("permission-first V5 copy", "permission-first V6 copy")
    audit_path.write_text(audit)


if __name__ == "__main__":
    main()
