from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {text.count(old)}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {count}")
    return updated


# 1. Centralize the v7 team-greeting behavior.
path = "lib/outreach-style-guide.ts"
text = read(path)
text = replace_once(
    text,
    'export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "manual_lovable_permission_first_v6";',
    'export const WEBWORKSHOP_OUTREACH_COPY_VERSION = "manual_lovable_permission_first_v7";',
    "copy version",
)
text = replace_once(
    text,
    '    "Use a verified first name when available. Otherwise use a safe neutral greeting rather than a long legal business name plus team.",',
    '    "Use a short, natural business-name team greeting. Fall back to Hi there when the name cannot be shortened confidently.",',
    "first-touch greeting rule",
)
helper = r'''
const legalBusinessSuffixPattern = /(?:,?\s+(?:llc|l\.l\.c\.|inc\.?|incorporated|corporation|corp\.?|ltd\.?|limited|company|co\.?))+$/i;
const genericBusinessGreetingNames = new Set([
  "business",
  "company",
  "contractor",
  "home",
  "local",
  "service",
  "services",
  "solutions",
  "team",
]);
const knownBusinessServiceSuffixes = [
  "heating and cooling",
  "pressure washing",
  "power washing",
  "home maintenance",
  "general contractor",
  "tree service",
  "lawn care",
  "pro wash",
  "roofing",
  "hvac",
  "plumbing",
  "electrical",
  "landscaping",
  "painting",
  "concrete",
  "cleaning",
  "fencing",
  "flooring",
  "remodeling",
  "maintenance",
  "services",
  "service",
];

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function webworkshopBusinessGreetingName(businessName: string, trade = "", city = "") {
  const original = businessName.trim().replace(/\s+/g, " ");
  if (!original || /@|https?:\/\//i.test(original)) return "";

  let candidate = original.replace(legalBusinessSuffixPattern, "").trim();
  const cityName = normalizedCityName(city);
  if (cityName) {
    candidate = candidate.replace(new RegExp(`\\s+of\\s+${escapedPattern(cityName)}$`, "i"), "").trim();
  }

  const tradeSuffix = webworkshopTradeLabel(trade).replace(/-/g, " ").trim();
  const suffixes = [...new Set([tradeSuffix, ...knownBusinessServiceSuffixes].filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  for (const suffix of suffixes) {
    const shortened = candidate.replace(new RegExp(`(?:\\s+|^)${escapedPattern(suffix)}$`, "i"), "").trim();
    if (shortened && shortened !== candidate) {
      candidate = shortened;
      break;
    }
  }

  candidate = candidate
    .replace(/^[\s,;:|\-]+|[\s,;:|\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = candidate.split(/\s+/).filter(Boolean);
  if (!candidate || words.length > 4 || candidate.length > 45) return "";
  if (genericBusinessGreetingNames.has(candidate.toLowerCase())) return "";
  if (candidate === original && words.length > 3) return "";
  return candidate;
}

export function webworkshopFirstEmail'''
text = sub_once(
    text,
    r'\n\nconst unsafeRecipientFirstNames = new Set\([\s\S]*?\nexport function webworkshopFirstEmail',
    "\n\n" + helper,
    "verified-name helper block",
)
text = replace_once(
    text,
    '''  factualMiddleLine,
  recipientName,
}: {''',
    '''  factualMiddleLine,
}: {''',
    "recipientName argument",
)
text = replace_once(
    text,
    '''  factualMiddleLine?: string;
  recipientName?: string;
}) {
  const verifiedRecipientFirstName = webworkshopRecipientFirstName(recipientName);
  const greeting = verifiedRecipientFirstName ? `Hi ${verifiedRecipientFirstName},` : "Hi there,";''',
    '''  factualMiddleLine?: string;
}) {
  const businessGreetingName = webworkshopBusinessGreetingName(businessName, trade, city);
  const greeting = businessGreetingName ? `Hi ${businessGreetingName} team,` : "Hi there,";''',
    "first email greeting",
)
write(path, text)

# 2. Stop passing the stored person name into first-touch generation.
path = "lib/prospect-engine.ts"
text = read(path)
text = replace_once(
    text,
    '''    footer,
    recipientName: prospect.contactPersonName,
  });''',
    '''    footer,
  });''',
    "prospect recipientName forwarding",
)
write(path, text)

# 3. Remove the broken verified-name API action.
path = "app/api/engine/autonomous-growth/route.ts"
text = read(path)
text = replace_once(text, "  saveVerifiedContactFirstNameAndRegenerate,\n", "", "verified-name repository import")
text = replace_once(text, "      contactFirstName?: string;\n      expectedUpdatedAt?: string;\n", "", "verified-name payload fields")
text = sub_once(
    text,
    r'\n    if \(payload\.action === "save_verified_contact_first_name"\) \{[\s\S]*?\n    \}\n    if \(payload\.action === "record_feedback"\)',
    '\n    if (payload.action === "record_feedback")',
    "verified-name route action",
)
write(path, text)

# 4. Remove the verified-name field and save button from the review modal.
path = "components/engine/EmailDraftReviewHelper.tsx"
text = read(path)
text = sub_once(text, r'\nfunction greetingFirstName\(item: EmailQueueItem\) \{[\s\S]*?\n\}\n', "\n", "greetingFirstName helper")
for old in [
    '  const [contactFirstName, setContactFirstName] = useState("");\n',
    '  const [savingContactName, setSavingContactName] = useState(false);\n',
    '  const [contactNameMessage, setContactNameMessage] = useState("");\n',
    '    setContactFirstName("");\n',
    '    setContactNameMessage("");\n',
    '          setContactFirstName(greetingFirstName(item));\n',
    '          setContactNameMessage("");\n',
    '      && !savingContactName,\n',
]:
    if old not in text:
        raise RuntimeError(f"Missing UI fragment: {old!r}")
    text = text.replace(old, "", 1)
text = sub_once(
    text,
    r'\n\n  async function saveVerifiedContactFirstName\(\) \{[\s\S]*?\n  \}\n\n  async function approveFromDialog',
    "\n\n  async function approveFromDialog",
    "verified-name save function",
)
text = sub_once(
    text,
    r'\n\n            <div className="email-draft-review-contact-name">[\s\S]*?\n            </div>\n\n            <div className="email-draft-review-body">',
    '\n\n            <div className="email-draft-review-body">',
    "verified-name form",
)
text = sub_once(
    text,
    r'\n\n        \.email-draft-review-contact-name \{[\s\S]*?\n        \.email-draft-review-body \{',
    '\n\n        .email-draft-review-body {',
    "verified-name CSS",
)
text = text.replace(
    '''\n          .email-draft-review-contact-name > div {
            align-items: stretch;
            flex-direction: column;
          }
''',
    "",
    1,
)
write(path, text)

# 5. Update style-guide regression coverage.
path = "tests/outreach-style-guide.test.ts"
text = read(path)
text = replace_once(
    text,
    "  webworkshopPreviewValueLine,\n  webworkshopRecipientFirstName,\n  webworkshopShouldMentionFindlay,",
    "  webworkshopPreviewValueLine,\n  webworkshopBusinessGreetingName,\n  webworkshopShouldMentionFindlay,",
    "style-guide test import",
)
text = replace_once(
    text,
    'assert.equal(WEBWORKSHOP_OUTREACH_COPY_VERSION, "manual_lovable_permission_first_v6");',
    'assert.equal(WEBWORKSHOP_OUTREACH_COPY_VERSION, "manual_lovable_permission_first_v7");',
    "style-guide version assertion",
)
text = sub_once(
    text,
    r'\n\ntest\("recipient greeting uses only a safe recorded first name", \(\) => \{[\s\S]*?\n\}\);',
    '''\n\ntest("business-team greeting shortens names conservatively", () => {
  assert.equal(webworkshopBusinessGreetingName("Pinnacle Pressure Washing of Toledo", "Pressure Washing", "Toledo"), "Pinnacle");
  assert.equal(webworkshopBusinessGreetingName("American Dream Pressure Washing LLC", "Pressure Washing", "Tampa"), "American Dream");
  assert.equal(webworkshopBusinessGreetingName("Rannebarger Home Maintenance", "General Contractor", "Findlay"), "Rannebarger");
  assert.equal(webworkshopBusinessGreetingName("Styles by the Mile", "Painting", "Toledo"), "Styles by the Mile");
  assert.equal(webworkshopBusinessGreetingName("The Best Local Home Service Company Incorporated", "", ""), "");
  assert.equal(webworkshopBusinessGreetingName("nick@pinnacle419.com", "Pressure Washing", "Toledo"), "");
});''',
    "old recipient-name test",
)
text = replace_once(text, '    recipientName: "Nick",\n', "", "recipientName test argument")
text = replace_once(text, "  assert.match(email, /^Hi Nick,/);", "  assert.match(email, /^Hi Pinnacle team,/);", "Pinnacle greeting assertion")
text = replace_once(text, "  assert.match(email, /^Hi there,/);", "  assert.match(email, /^Hi Tampa Bay team,/);", "Tampa greeting assertion")
write(path, text)

# 6. Replace the old verified-name audit with an audit that proves the feature is gone.
path = "tests/final-manual-workflow-audit.test.ts"
text = read(path)
text = sub_once(
    text,
    r'\n\ntest\("email draft review supports verified-name save and exact single-draft regeneration", \(\) => \{[\s\S]*?\n\}\);',
    '''\n\ntest("email draft review uses business-team greetings and exposes no verified-name action", () => {
  const helper = readFileSync("components/engine/EmailDraftReviewHelper.tsx", "utf8");
  const route = readFileSync("app/api/engine/autonomous-growth/route.ts", "utf8");
  const engine = readFileSync("lib/prospect-engine.ts", "utf8");
  const styleGuide = readFileSync("lib/outreach-style-guide.ts", "utf8");
  assert.doesNotMatch(helper, /Verified contact first name|Save & Regenerate Greeting|save_verified_contact_first_name/);
  assert.doesNotMatch(route, /save_verified_contact_first_name|saveVerifiedContactFirstNameAndRegenerate/);
  assert.doesNotMatch(engine.match(/export function firstTouchEmailDraft[\\s\\S]*?\n\}/)?.[0] ?? "", /contactPersonName|recipientName/);
  assert.match(styleGuide, /Hi \$\{businessGreetingName\} team,/);
  assert.match(styleGuide, /businessGreetingName \? .* : "Hi there,"/);
});''',
    "old verified-name audit",
)
write(path, text)

# The task file is intentionally removed after the implementation is applied.
Path(".github/team-greeting-simplification-task.md").unlink(missing_ok=True)

print("Applied team-greeting v7 simplification.")
