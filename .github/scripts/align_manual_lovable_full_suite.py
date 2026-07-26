from __future__ import annotations

from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_required(path: str, old: str, new: str, minimum: int = 1) -> None:
    content = read(path)
    count = content.count(old)
    if count < minimum:
        raise RuntimeError(f"Expected at least {minimum} matches in {path}, found {count}: {old[:140]!r}")
    write(path, content.replace(old, new))


def replace_test(path: str, title: str, replacement: str) -> None:
    content = read(path)
    marker = f'test("{title}"'
    start = content.find(marker)
    if start < 0:
        raise RuntimeError(f"Test not found in {path}: {title}")
    next_test = content.find('\ntest("', start + len(marker))
    if next_test < 0:
        updated = content[:start] + replacement.rstrip() + "\n"
    else:
        updated = content[:start] + replacement.rstrip() + "\n\n" + content[next_test + 1:]
    write(path, updated)


# System self-check must recognize the new post-interest state.
replace_required(
    "lib/system-self-check.ts",
    '''    check("loom_said_yes", "Prospect Said Yes creates Loom Needed", queueStatusAfterManualAction("Prospect Said Yes") === "Loom Needed", "Manual yes response creates a Loom Needed task.", "Review queueStatusAfterManualAction."),''',
    '''    check("preview_build_said_yes", "Prospect Said Yes creates Preview Build Needed", queueStatusAfterManualAction("Prospect Said Yes") === "Preview Build Needed", "A positive reply creates a manual Lovable build task without sending or implying that a preview already exists.", "Review queueStatusAfterManualAction."),''',
)

# Operator Test Center should test the manual-build confirmation rather than a prebuilt yes-reply link.
replace_required(
    "lib/operator-test-center.ts",
    '''    yesReplyIncludesPublicPreview: boolean;''',
    '''    yesReplyLinkFree: boolean;''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''    if (!item.previewLink) add(item, "Missing preview", "No public preview link is stored.", "Regenerate the Outreach Package so a public /p/ preview is created.", "prospect_preview");
    if (item.previewLink && (!/\/p\//i.test(item.previewLink) || /\/engine(?:\/|$|\?)/i.test(item.previewLink))) add(item, "Invalid public preview", "Preview link is missing or points to a protected engine route.", "Regenerate the package and verify the prospect-facing link starts with /p/.", "prospect_preview");''',
    '''    const previewRequired = ["Preview Build Needed", "Loom Needed", "Preview Needs Polish", "Ready for Loom", "Loom Recorded"].includes(item.status);
    if (previewRequired && !item.previewLink) add(item, "Missing manual preview", "The prospect asked for a preview, but no public Lovable preview link is stored.", "Build and QA the site manually in Lovable, then save its legitimate public HTTPS link.", "prospect_preview");
    if (previewRequired && item.previewLink && (!/^https:\/\//i.test(item.previewLink) || /\/engine(?:\/|$|\?)/i.test(item.previewLink))) add(item, "Invalid public preview", "The saved post-interest preview link is missing or points to a protected engine route.", "Save the legitimate public Lovable preview URL after manual QA.", "prospect_preview");''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''  return "First-touch copy is link-free. Next: test yes-reply preview link with Generate One Test Outreach Package.";''',
    '''  return "First-touch copy is link-free. Next: test the manual-build confirmation with Generate One Test Outreach Package.";''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''    { label: "Yes-reply / preview-send script", body: playbook.yesReply },''',
    '''    { label: "Yes-reply / manual-build confirmation", body: playbook.yesReply },''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''    "Yes-reply uses a fake public /p/ preview link.",''',
    '''    "Yes-reply confirms the manual Lovable build and remains link-free.",''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''      yesReplyIncludesPublicPreview: playbook.yesReply.includes(publicPreviewLink),''',
    '''      yesReplyLinkFree: !/https?:\/\/|\/p\//i.test(playbook.yesReply),''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''  const yesReply = fakeScripts.find((script) => script.label === "Yes-reply / preview-send script")?.body ?? "";''',
    '''  const yesReply = fakeScripts.find((script) => script.label === "Yes-reply / manual-build confirmation")?.body ?? "";''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''  const firstEmailHasApprovedReason = /I was looking at .+ businesses around the .+ area and came across your business\.[\s\S]+(?:I noticed you don't have a website|I put together a quick preview showing what your website could look like)/i.test(firstEmail);''',
    '''  const firstEmailHasApprovedReason = /I came across your business\.[\s\S]+(?:couldn't find a dedicated website|had an idea for a simpler website direction)[\s\S]+Would you like me to put together a quick preview\?/i.test(firstEmail);''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''  check(checks, { key: "yes-reply-public-preview", category: "Outreach copy quality", label: "Yes-reply includes public /p/ preview link", passed: fakePackage.packagePreview?.yesReplyIncludesPublicPreview === true && /https:\/\/webworkshop\.dev\/p\//i.test(yesReply), detail: "Preview link appears only in the yes-reply / preview-send script." });''',
    '''  check(checks, { key: "yes-reply-manual-build", category: "Outreach copy quality", label: "Yes-reply confirms a manual build and stays link-free", passed: fakePackage.packagePreview?.yesReplyLinkFree === true && !/https?:\/\/|\/p\//i.test(yesReply) && /I'll put together a quick preview/i.test(yesReply), detail: "A positive reply creates the manual Lovable build expectation without pretending a preview already exists." });''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''  check(checks, { key: "current-wording", category: "Outreach copy quality", label: "Uses more calls and quote requests wording", passed: /help get (?:you )?more calls and quote requests/i.test(fakeCopyBlob), detail: "Fake copy uses the current direct, casual wording." });''',
    '''  check(checks, { key: "current-wording", category: "Outreach copy quality", label: "Uses the current permission-first website wording", passed: /easier for people to (?:see what you do and )?call or request a quote/i.test(fakeCopyBlob) && /Would you like me to put together a quick preview\?/i.test(fakeCopyBlob), detail: "Fake copy uses the current direct, truthful manual-build wording." });''',
)
replace_required(
    "lib/operator-test-center.ts",
    '''  check(checks, { key: "missing-packages", category: "Existing prospect readiness", label: "Missing packages detected", info: true, detail: `${existing?.needsPreview ?? 0} prospect(s) need preview/package work.` });''',
    '''  check(checks, { key: "missing-packages", category: "Existing prospect readiness", label: "Missing first-touch packages detected", info: true, detail: `${existing?.needsPreview ?? 0} prospect(s) need first-touch package work. A website preview is not required until a prospect asks for one.` });''',
)

# Update the legacy queue fixture itself so readiness tests exercise current copy rather than stale prebuilt claims.
replace_required(
    "tests/operator-test-center.test.ts",
    '''    subjectLine: "Quick website preview for Ready Pressure Washing",
    emailBody: [
      "Hi Ready Pressure Washing team,",
      "",
      "I was looking at pressure washing businesses around the Tampa area and came across your business.",
      "",
      "I put together a quick preview showing what your website could look like with a cleaner, more modern design and how it could help you get more calls and quote requests.",
      "",
      "Want me to send it over?",''',
    '''    subjectLine: "Quick website idea for Ready Pressure Washing",
    emailBody: [
      "Hi Ready Pressure Washing team,",
      "",
      "I came across your business.",
      "",
      "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.",
      "",
      "Would you like me to put together a quick preview?",''',
)

replace_test(
    "tests/operator-test-center.test.ts",
    "Operator Test Center fake package always returns fake scripts without real outreach activity",
    r'''test("Operator Test Center fake package models the manual Lovable workflow without outreach activity", () => {
  const result = generateOneTestOutreachPackage({
    WEBWORKSHOP_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
  } as NodeJS.ProcessEnv);
  const fake = result.fakePackage;

  assert.equal(result.ok, true);
  assert.match(result.message, /No provider calls, prospects, or outreach sends were created/);
  assert.equal(fake?.label, "TEST / FAKE");
  assert.equal(fake?.businessName, "Test Pressure Washing Co.");
  assert.match(fake?.tradeCity ?? "", /Pressure Washing near Orlando, FL/);
  assert.match(fake?.recommendedContactPath ?? "", /manual review only/i);
  assert.equal(result.packagePreview?.firstEmailLinkFree, true);
  assert.equal(result.packagePreview?.firstDmLinkFree, true);
  assert.equal(result.packagePreview?.yesReplyLinkFree, true);
  assert.match(result.packagePreview?.publicPreviewLink ?? "", /^https:\/\/webworkshop\.dev\/p\//);
  assert.ok(fake?.scripts.some((script) => script.label === "First email script" && /Would you like me to put together a quick preview\?/i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "First Facebook/Instagram DM script" && /Would you like me to put together a quick preview\?/i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "Softer DM script"));
  assert.ok(fake?.scripts.some((script) => script.label === "Yes-reply / manual-build confirmation" && /I'll put together a quick preview/i.test(script.body) && !/https?:\/\/|\/p\//i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "Pricing reply"));
  assert.ok(fake?.scripts.some((script) => script.label === "Follow-up"));
  assert.ok(fake?.scripts.some((script) => script.label === "Not interested reply"));
  assert.match(fake?.fullSummary ?? "", /easier for people to see what you do and call or request a quote/i);
  assert.match(fake?.fullSummary ?? "", /No email, DM, form, phone call, or Loom was sent/i);
  assert.doesNotMatch(fake?.scripts.find((script) => script.label === "First email script")?.body ?? "", /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(fake?.scripts.find((script) => script.label === "First Facebook\/Instagram DM script")?.body ?? "", /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(fake?.fullSummary ?? "", /will get you more calls|DATABASE_URL|RESEND_API_KEY|TWILIO_AUTH_TOKEN|secret/i);
});''',
)

replace_test(
    "tests/operator-test-center.test.ts",
    "Full Autonomous Readiness Test checks copy, existing prospects, saved results, and queue items",
    r'''test("Full Autonomous Readiness Test checks manual-build copy, existing prospects, saved results, and queue items", async () => {
  const result = await runFullAutonomousReadinessTest({
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "secret-resend-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
    OUTREACH_EMAIL_DISABLED: "false",
    OUTREACH_AUTO_SEND_ENABLED: "false",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
  } as NodeJS.ProcessEnv);
  const labels = result.readiness?.checks.map((check) => check.label).join("\n") ?? "";

  assert.match(labels, /First-touch email has no preview link/);
  assert.match(labels, /Yes-reply confirms a manual build and stays link-free/);
  assert.match(labels, /Existing qualified unsent prospects checked/);
  assert.match(labels, /Saved Top Prospects results checked/);
  assert.match(labels, /Outreach queue items checked/);
  assert.equal(result.readiness?.checks.find((check) => check.key === "first-email-link-free")?.status, "passed");
  assert.equal(result.readiness?.checks.find((check) => check.key === "yes-reply-manual-build")?.status, "passed");
  assert.doesNotMatch(result.readiness?.summaries.debug ?? "", /\/engine\/previews|secret-resend-key|postgres:\/\/|twilio-auth-token|google-places-key/i);
});''',
)

# Legacy backfill regenerates truthful first-touch copy but does not place the preview URL in the yes reply.
replace_required(
    "tests/legacy-outreach-backfill.test.ts",
    '''  assert.match(prospect.outreach?.detailed ?? "", /https:\/\/webworkshop\.dev\/p\//);''',
    '''  assert.match(prospect.outreach?.detailed ?? "", /I'll put together a quick preview/i);
  assert.doesNotMatch(prospect.outreach?.detailed ?? "", /https?:\/\/|\/p\//i);''',
)

# UI copy now exposes a manual build queue.
replace_required("tests/mobile-engine-layout.test.ts", '''  assert.match(autonomousGrowthWorkspace, /You have Loom walkthroughs to record/);''', '''  assert.match(autonomousGrowthWorkspace, /You have manual Lovable previews to build/);''')
replace_required("tests/mobile-engine-layout.test.ts", '''  assert.match(autonomousGrowthWorkspace, /Loom Needed Queue/);''', '''  assert.match(autonomousGrowthWorkspace, /Manual Preview Build Queue/);''')
replace_required("tests/mobile-engine-layout.test.ts", '''  assert.match(autonomousGrowthWorkspace, /Review-before-Loom checklist/);''', '''  assert.match(autonomousGrowthWorkspace, /Manual Lovable workflow/);''')
replace_required("tests/mobile-engine-layout.test.ts", '''  assert.match(autonomousGrowthWorkspace, /Copy first DM/);''', '''  assert.match(autonomousGrowthWorkspace, /Add Lovable preview link/);''')

replace_test(
    "tests/preview-render-plan.test.ts",
    "all production preview entry points use the authoritative research-aware pipeline",
    r'''test("preview-building entry points use research while first-touch outreach does not auto-build", () => {
  const worker = readFileSync("lib/top-prospect-worker.ts", "utf8");
  const repository = readFileSync("lib/top-prospect-repository.ts", "utf8");
  const autonomous = readFileSync("lib/autonomous-growth-repository.ts", "utf8");
  const regeneration = readFileSync("app/api/engine/outreach-sync/route.ts", "utf8");
  const commands = readFileSync("lib/operator-command-center.ts", "utf8");
  const firstTouchSync = autonomous.match(/async function syncTopProspectResultIntoQueue[\s\S]*?export async function getAutonomousGrowthDashboard/)?.[0] ?? "";

  assert.match(worker, /await prepareTopProspectArtifactsWithResearch\(/);
  assert.match(repository, /await prepareTopProspectArtifactsWithResearch\(/);
  assert.doesNotMatch(firstTouchSync, /prepareTopProspectArtifactsWithResearch|prepareProspectForPreview|createPublicPreviewToken/);
  assert.match(firstTouchSync, /No preview was generated/);
  assert.match(regeneration, /await prepareProspectForPreview\(prospect, \{ mode: "regenerate"/);
  assert.match(commands, /await prepareProspectForPreview\(prospect, \{ mode: "regenerate"/);
});''',
)

replace_test(
    "tests/ui-rendering.test.ts",
    "Prospect Detail open preview uses public preview links instead of internal Preview tabs",
    r'''test("Prospect Detail does not infer a public preview link from permission-first outreach", () => {
  const token = "abcdefghijklmnopqrstuvwxyzABCDEF";
  const base = withPreview(withAnalysis(structuredClone(seedProspects[0])));
  const permissionFirstProspect = {
    ...base,
    outreach: generateOutreach(base, `https://webworkshop.dev/p/${token}`),
  };
  const protectedProspect = {
    ...base,
    outreach: generateOutreach(base, `https://webworkshop.dev/engine/previews/${base.id}`),
  };
  const html = renderDetail(permissionFirstProspect, "Preview");
  const detailSource = readFileSync(new URL("../components/engine/ProspectDetail.tsx", import.meta.url), "utf8");
  const engineSource = readFileSync(new URL("../components/ProspectEngine.tsx", import.meta.url), "utf8");

  assert.equal(publicPreviewUrlForProspect(permissionFirstProspect), "");
  assert.equal(publicPreviewUrlForProspect(protectedProspect), "");
  assert.match(html, /No public preview link is available yet/);
  assert.match(html, /View internal Preview tab/);
  assert.match(detailSource, /window\.location\.assign\(publicPreviewUrl\)/);
  assert.match(detailSource, /No public preview link is available yet/);
  assert.match(detailSource, /Create\/Refresh Review Package/);
  assert.match(engineSource, /href=\{publicPreviewUrl\}/);
  assert.doesNotMatch(engineSource, /href=\{`\/engine\/previews\/\$\{prospect\.id\}`\}/);
});''',
)

print("System, Operator Test Center, and full-suite expectations aligned.")
