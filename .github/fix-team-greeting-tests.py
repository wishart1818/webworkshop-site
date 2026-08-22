from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {count}")
    return updated


# Make shortening conservative but useful for the approved examples.
path = "lib/outreach-style-guide.ts"
text = read(path)
text = replace_once(
    text,
    '  "power washing",\n  "home maintenance",',
    '  "power washing",\n  "power wash",\n  "home maintenance",',
    "power-wash suffix",
)
text = replace_once(
    text,
    '  if (candidate === original && words.length > 3) return "";\n',
    "",
    "overly broad unchanged-name rejection",
)
write(path, text)

# Remove the now-unreachable verified-name mutation implementation as well as its import.
path = "lib/autonomous-growth-repository.ts"
text = read(path)
text = replace_once(
    text,
    'import { webworkshopRecipientFirstName } from "@/lib/outreach-style-guide";\n',
    "",
    "verified-name style-guide import",
)
text = sub_once(
    text,
    r'\nexport async function saveVerifiedContactFirstNameAndRegenerate\([\s\S]*?\n\}\n\n(?=export async function )',
    "\n",
    "verified-name repository mutation",
)
write(path, text)

# Update exact first-touch expectations.
path = "tests/prospect-engine.test.ts"
text = read(path)
text = replace_once(text, '  "Hi there,",\n  "",\n  "I\'m Brendan, and I build websites for local service businesses. I came across Styles Power Wash', '  "Hi Styles team,",\n  "",\n  "I\'m Brendan, and I build websites for local service businesses. I came across Styles Power Wash', "existing-site exact greeting")
text = replace_once(text, '  "Hi there,",\n  "",\n  "I\'m Brendan, based in Findlay, and I build websites for local service businesses. I came across ClearFlow Plumbing', '  "Hi ClearFlow team,",\n  "",\n  "I\'m Brendan, based in Findlay, and I build websites for local service businesses. I came across ClearFlow Plumbing', "no-site exact greeting")
text = sub_once(
    text,
    r'test\("first-touch email uses the saved contact first name and never infers one from the email address", \(\) => \{[\s\S]*?\n\}\);',
    '''test("first-touch email ignores stored person names and email local-parts", () => {
  const prospect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Pinnacle Pressure Washing of Toledo",
    trade: "Pressure Washing",
    city: "Toledo",
    email: "nick@pinnacle419.com",
    contactPersonName: "Nick Smith",
  });

  assert.match(firstTouchEmailDraft(prospect, testFooter), /^Hi Pinnacle team,/);
  assert.doesNotMatch(firstTouchEmailDraft(prospect, testFooter), /^Hi Nick,/);
  assert.match(firstTouchEmailDraft({ ...prospect, contactPersonName: "" }, testFooter), /^Hi Pinnacle team,/);
});''',
    "saved contact-name test",
)
text = replace_once(
    text,
    'assert.match(outreach.concise, /Hi there,\\n\\nI\'m Brendan, and I build websites for local service businesses\\. I came across Styles Power Wash',
    'assert.match(outreach.concise, /Hi Styles team,\\n\\nI\'m Brendan, and I build websites for local service businesses\\. I came across Styles Power Wash',
    "permission-first greeting assertion",
)
text = replace_once(
    text,
    'assert.doesNotMatch(outreach.concise, /Hi there,\\n\\n[^.]+Styles Power Wash[^.]+Styles Power Wash/i);',
    'assert.doesNotMatch(outreach.concise, /Hi Styles team,\\n\\n[^.]+Styles Power Wash[^.]+Styles Power Wash/i);',
    "business-name repetition assertion",
)
write(path, text)

# Update safe readiness repair expectation.
path = "tests/operator-test-center.test.ts"
text = read(path)
text = replace_once(
    text,
    '    assert.match(repairedCopy?.emailBody ?? "", /^Hi there,/);',
    '    assert.match(repairedCopy?.emailBody ?? "", /^Hi Ready team,/);',
    "operator repair greeting",
)
write(path, text)

# Replace obsolete verified-name tests with the simplified behavior and improve failure diagnostics.
path = "tests/autonomous-growth.test.ts"
text = read(path)
text = replace_once(text, '  saveVerifiedContactFirstNameAndRegenerate,\n', "", "verified-name test import")
text = replace_once(
    text,
    'test("bulk copy regeneration preserves the saved contact first name from the live prospect", async () => {',
    'test("bulk copy regeneration uses the business-team greeting even when a person name is stored", async () => {',
    "bulk regeneration test title",
)
text = replace_once(text, '  assert.match(refreshed.emailBody, /^Hi Nick,/);', '  assert.match(refreshed.emailBody, /^Hi Pinnacle team,/);', "bulk regeneration greeting")
text = sub_once(
    text,
    r'\ntest\("verified contact first name save updates the prospect and only the linked editable draft", async \(\) => \{[\s\S]*?\n\}\);',
    '''
test("queue generation ignores stored person names and email local-parts", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetProspectMemoryForTests();
  resetOperationalMemoryForTests();
  try {
    const prospect = eligibleProspect();
    Object.assign(prospect, {
      id: "team-greeting-prospect",
      businessName: "Pinnacle Pressure Washing of Toledo",
      city: "Toledo",
      state: "OH",
      email: "nick@pinnacle419.com",
      contactPersonName: "Nick Smith",
    });
    prospect.outreach = generateOutreach(prospect, publicLink);
    await saveProspect(prospect);
    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect,
      topProspectResultId: "team-greeting-result",
    });
    assert.match(queued.emailBody, /^Hi Pinnacle team,/);
    assert.doesNotMatch(queued.emailBody, /^Hi Nick,/);
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});''',
    "verified-name mutation test",
)
text = text.replace(
    'assert.equal(eligible.status, "Eligible");',
    'assert.equal(eligible.status, "Eligible", JSON.stringify({ issues: eligible.detectedIssues, summary: eligible.reviewSummary, body: eligible.emailBody }));',
)
write(path, text)

# Replace the generated audit block with syntax-safe source assertions.
path = "tests/final-manual-workflow-audit.test.ts"
text = read(path)
text = sub_once(
    text,
    r'test\("email draft review uses business-team greetings and exposes no verified-name action", \(\) => \{[\s\S]*?\n\}\);',
    '''test("email draft review uses business-team greetings and exposes no verified-name action", () => {
  const helper = readFileSync("components/engine/EmailDraftReviewHelper.tsx", "utf8");
  const route = readFileSync("app/api/engine/autonomous-growth/route.ts", "utf8");
  const repository = readFileSync("lib/autonomous-growth-repository.ts", "utf8");
  const engine = readFileSync("lib/prospect-engine.ts", "utf8");
  const styleGuide = readFileSync("lib/outreach-style-guide.ts", "utf8");
  assert.equal(helper.includes("Verified contact first name"), false);
  assert.equal(helper.includes("Save & Regenerate Greeting"), false);
  assert.equal(helper.includes("save_verified_contact_first_name"), false);
  assert.equal(route.includes("save_verified_contact_first_name"), false);
  assert.equal(route.includes("saveVerifiedContactFirstNameAndRegenerate"), false);
  assert.equal(repository.includes("saveVerifiedContactFirstNameAndRegenerate"), false);
  const firstTouch = engine.match(/export function firstTouchEmailDraft[\\s\\S]*?\\n\\}/)?.[0] ?? "";
  assert.equal(firstTouch.includes("contactPersonName"), false);
  assert.equal(firstTouch.includes("recipientName"), false);
  assert.equal(styleGuide.includes("Hi ${businessGreetingName} team,"), true);
  assert.equal(styleGuide.includes('businessGreetingName ? `Hi ${businessGreetingName} team,` : "Hi there,"'), true);
});''',
    "generated team-greeting audit",
)
write(path, text)

print("Aligned team-greeting implementation and tests.")
