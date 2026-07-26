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
        raise RuntimeError(f"Expected at least {minimum} matches in {path}, found {count}: {old[:120]!r}")
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


# Repair Python string-escape artifacts in transformed TypeScript regexes.
for candidate in Path(".").rglob("*"):
    if candidate.suffix not in {".ts", ".tsx"} or not candidate.is_file():
        continue
    content = candidate.read_text(encoding="utf-8")
    if "\x08" in content:
        candidate.write_text(content.replace("\x08", r"\b"), encoding="utf-8")

# Keep failed quality checks explainable by preserving both label and reason.
replace_required(
    "lib/top-prospects.ts",
    ''': check.reason || check.label);''',
    ''': [check.label, check.reason].filter(Boolean).join(": "));''',
)

# Broad wording assertions that still describe the previous prebuilt-preview offer.
for path in ["tests/autonomous-growth.test.ts", "tests/prospect-engine.test.ts", "tests/top-prospects.test.ts"]:
    content = read(path)
    content = content.replace(
        "/help you get more calls and quote requests/i",
        "/make it easier for people to see what you do and call or request a quote/i",
    )
    content = content.replace(
        "/help get you more calls and quote requests/i",
        "/Would you like me to put together a quick preview\\?/i",
    )
    content = content.replace(
        "/helping get more calls and quote requests/i",
        "/actual services|desktop and mobile/i",
    )
    content = content.replace(
        "/Loom needed: Sample Roofing/",
        "/Manual preview build needed: Sample Roofing/",
    )
    write(path, content)

replace_test(
    "tests/autonomous-growth.test.ts",
    "queued email send readiness enforces suppression, public links, compliance, and review state",
    r'''test("queued email send readiness enforces suppression, truthful first touch, compliance, and review state", () => {
  const safeBody = [
    "Hi Ready Pressure Washing team,",
    "",
    "I came across your business.",
    "",
    "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.",
    "",
    "Would you like me to put together a quick preview?",
    "",
    "Thanks,",
    "",
    "Brendan",
    "WebWorkshop",
    "123 Main St, Toledo, OH",
    "",
    "If you'd rather not hear from me again, just let me know.",
  ].join("\n");
  const item = {
    id: "queued-email",
    prospectId: "prospect-1",
    topProspectResultId: "result-1",
    businessName: "Ready Pressure Washing",
    trade: "Pressure Washing",
    city: "Tampa, FL",
    website: "https://example.com",
    email: "owner@readypressurewashing.com",
    contactSource: "Public email",
    contactConfidence: 90,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: "Quick website idea for Ready Pressure Washing",
    emailBody: safeBody,
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Ready",
    blockedReason: "",
    reviewScore: 92,
    reviewSummary: "",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Queued",
    sourceProvider: "Top Prospects",
    queuedDate: new Date(0).toISOString(),
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: new Date(0).toISOString(),
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  } satisfies OutreachQueueItem;
  const settings = { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot" as const, killSwitch: false };
  const ready = evaluateQueuedEmailSendReadiness({ environment: env(), item, queue: [item], settings });
  assert.equal(ready.ready, true, ready.blockedReasons.join("; "));

  const builtClaim = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: {
      ...item,
      emailBody: safeBody.replace(
        "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.",
        "I put together a quick website preview for you.",
      ),
    },
    queue: [item],
    settings,
  });
  assert.equal(builtClaim.ready, false);
  assert.match(builtClaim.blockedReasons.join(" "), /cannot imply that a preview is already built/i);

  const suppressed = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item,
    queue: [item, { ...item, id: "bounced", status: "Bounced", email: "owner@readypressurewashing.com" }],
    settings,
  });
  assert.equal(suppressed.ready, false);
  assert.match(suppressed.blockedReasons.join(" "), /suppressed/i);

  const notQueued = evaluateQueuedEmailSendReadiness({ environment: env(), item: { ...item, status: "Eligible" }, queue: [item], settings });
  assert.equal(notQueued.ready, false);
  assert.match(notQueued.blockedReasons.join(" "), /Only Queued email items/i);

  const contactedDomain = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, email: "sales@readypressurewashing.com" },
    queue: [item, { ...item, id: "sent-domain", status: "Sent", email: "owner@readypressurewashing.com", sentDate: new Date(0).toISOString() }],
    settings,
  });
  assert.equal(contactedDomain.ready, false);
  assert.match(contactedDomain.blockedReasons.join(" "), /business email domain was already contacted/i);

  const sharedMailboxDomain = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, email: "second@gmail.com" },
    queue: [item, { ...item, id: "sent-gmail", status: "Sent", email: "first@gmail.com", sentDate: new Date(0).toISOString() }],
    settings,
  });
  assert.equal(sharedMailboxDomain.blockedReasons.some((reason) => /business email domain|domain is suppressed/i.test(reason)), false);

  const suspiciousEmail = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, email: "admin@totalwptheme.com" },
    queue: [item],
    settings,
  });
  assert.equal(suspiciousEmail.ready, false);
  assert.match(suspiciousEmail.blockedReasons.join(" "), /needs manual verification/i);

  const staleBusinessCopy = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, businessName: "Different Business" },
    queue: [item],
    settings,
  });
  assert.equal(staleBusinessCopy.ready, false);
  assert.match(staleBusinessCopy.blockedReasons.join(" "), /does not match the current business identity/i);
});''',
)

replace_test(
    "tests/autonomous-growth.test.ts",
    "missing public preview, protected engine links, and weak previews block send readiness",
    r'''test("missing or weak previews do not block truthful first-touch eligibility", () => {
  const prospect = eligibleProspect();
  const weak = {
    ...prospect,
    preview: {
      ...prospect.preview!,
      heroHeadline: "hvac help in toledo",
      qualityScore: {
        visualPolish: 60,
        businessSpecificity: 70,
        clarity: 70,
        mobileResponsiveness: 70,
        conversionStrength: 70,
        safetyTruthfulness: 90,
        overall: 70,
        notes: ["Needs stronger layout."],
      },
    },
  };
  const weakGate = evaluatePreviewQualityGate(weak);
  assert.notEqual(weakGate.status, "Eligible");
  assert.equal(eligibilityFor({ ...prospect, preview: undefined }, { previewLink: "", previewGate: weakGate }).eligible, true);
  assert.equal(eligibilityFor(weak, { previewLink: "", previewGate: weakGate }).eligible, true);

  const unsafeCopy = {
    ...prospect,
    outreach: {
      ...prospect.outreach!,
      concise: `${prospect.outreach!.concise}\nhttps://webworkshop.dev/engine/previews/prospect-1`,
    },
  };
  const quality = evaluateOutreachEmailQuality(unsafeCopy, "");
  assert.equal(quality.ready, false);
  assert.match(quality.issues.join(" "), /first touch|link/i);
});''',
)

replace_test(
    "tests/autonomous-growth.test.ts",
    "preview below 85 creates a regeneration plan and remains not send-ready",
    r'''test("preview quality does not create a pre-interest regeneration requirement", () => {
  const prospect = eligibleProspect();
  const weak = {
    ...prospect,
    preview: {
      ...prospect.preview!,
      qualityScore: {
        visualPolish: 78,
        businessSpecificity: 72,
        clarity: 80,
        mobileResponsiveness: 82,
        conversionStrength: 74,
        safetyTruthfulness: 92,
        overall: 78,
        notes: ["Needs stronger layout."],
      },
    },
  };
  const previewGate = evaluatePreviewQualityGate(weak);
  const emailQuality = evaluateOutreachEmailQuality(weak, "");
  const review = evaluateSelfReview({ emailQuality, previewGate, prospect: weak });
  assert.notEqual(previewGate.status, "Eligible");
  assert.notEqual(review.recommendedNextAction, "Regenerate Preview");
  assert.deepEqual(review.regenerationPlan, []);
  assert.equal(eligibilityFor(weak, { previewLink: "", previewGate, emailQuality }).eligible, true);
});''',
)

replace_test(
    "tests/autonomous-growth.test.ts",
    "casual DM playbook keeps the first DM link-free and creates Loom-safe scripts",
    r'''test("casual DM playbook asks permission before the manual Lovable build", () => {
  const prospect = {
    ...eligibleProspect(),
    website: "",
    websiteStatus: "no_owned_website",
    profileUrl: "https://facebook.com/sample-roofing",
    prospectType: "no_website_social_only",
    classification: "social_only",
    recommendedContactMethod: "message_on_facebook",
  } as Prospect;
  const playbook = casualDmPlaybook(prospect, publicLink);

  assert.match(playbook.firstDm, /couldn't find a dedicated website/i);
  assert.match(playbook.firstDm, /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(playbook.firstDm, /https?:\/\/|\/p\//);
  assert.doesNotMatch(playbook.firstDm, /\b(?:built|made|put together)\b.{0,50}\bpreview\b/i);
  assert.match(playbook.yesReply, /I'll put together a quick preview/i);
  assert.doesNotMatch(playbook.yesReply, /https?:\/\/|\/p\//);
  assert.match(playbook.sendAfterLoom, /Loom walkthrough/);
  assert.match(playbook.sendAfterLoom, /Preview:/);
  assert.match(playbook.sendAfterLoom, /\/p\/abcdefghijklmnopqrstuvwxyzABCDEF/);
  assert.match(playbook.pricingReply, /\$1,000 total/);
  assert.match(playbook.pricingReply, /\$49\/month/);
  assert.match(playbook.higherSupportReply, /\$79\/month/);
  assert.match(playbook.starterPageReply, /\$500/);
});''',
)

replace_test(
    "tests/autonomous-growth.test.ts",
    "Prospect Said Yes creates a Loom Needed task status instead of sending",
    r'''test("Prospect Said Yes creates a Preview Build Needed task instead of sending", () => {
  assert.ok(outreachQueueStatuses.includes("Prospect Said Yes"));
  assert.ok(outreachQueueStatuses.includes("Preview Build Needed"));
  assert.equal(queueStatusAfterManualAction("Prospect Said Yes"), "Preview Build Needed");
  assert.equal(queueStatusAfterManualAction("First DM Sent"), "First DM Sent");
});''',
)

replace_test(
    "tests/autonomous-growth.test.ts",
    "Loom notification draft is internal-only and secret-safe",
    r'''test("manual preview build notification is internal-only and secret-safe", () => {
  const item = queueItem({ status: "Preview Build Needed" });
  const notification = loomNeededNotificationDraft(item, {
    OUTREACH_NOTIFY_EMAIL: "operator@example.com",
    OUTREACH_NOTIFY_FROM_EMAIL: "alerts@webworkshop.dev",
    OUTREACH_NOTIFY_ON_LOOM_NEEDED: "true",
    RESEND_API_KEY: "secret-resend-key",
  });

  assert.equal(notification.configured, true);
  assert.match(notification.subject, /Manual preview build needed: Sample Roofing/);
  assert.match(notification.body, /manual|Lovable/i);
  assert.doesNotMatch(JSON.stringify(notification), /secret-resend-key|operator@example.com|alerts@webworkshop.dev/);
});''',
)

replace_test(
    "tests/prospect-engine.test.ts",
    "Outreach Package email uses casual human permission-first copy and stores public preview links for yes replies",
    r'''test("Outreach Package uses truthful permission-first copy before a manual build", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "MC Pressure Washing FL";
  prospect.trade = "Pressure Washing";
  prospect.city = "Tampa";
  const previewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";
  const outreach = generateOutreach(prospect, previewLink, { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });
  const allDrafts = [outreach.concise, outreach.detailed, ...outreach.followUps].join("\n");

  assert.equal(outreach.subjects[0], "Quick website idea for MC Pressure Washing FL");
  assert.match(outreach.concise, /I came across your business/i);
  assert.match(outreach.concise, /had an idea for a simpler website direction/i);
  assert.match(outreach.concise, /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(outreach.concise, /https?:\/\/|\/p\//i);
  assert.doesNotMatch(outreach.concise, /\b(?:built|made|put together)\b.{0,60}\bpreview\b/i);
  assert.match(outreach.detailed, /I'll put together a quick preview and send it over once it's ready/i);
  assert.doesNotMatch(outreach.detailed, new RegExp(previewLink.replaceAll("/", "\\/")));
  assert.match(outreach.concise, /Thanks,\n\nBrendan\nWebWorkshop/i);
  assert.match(outreach.concise, new RegExp(testPostalAddress));
  assert.match(outreach.concise, /rather not hear from me again/i);
  assert.doesNotMatch(allDrafts, /One missed opportunity:|One thing that already works well:|customer proof you can verify|trust details could be easier/i);
  assert.doesNotMatch(allDrafts, /\b\d{1,3}\s*\/\s*100\b|\bscore\b/i);
  assert.doesNotMatch(allDrafts, /I reviewed your website|I analyzed your website|free audit|problems|mistakes|your website is bad/i);
  assert.doesNotMatch(allDrafts, /\bwill get you more calls/i);
  assert.ok(outreach.followUps.every((followUp) => !followUp.includes(previewLink)));
});''',
)

replace_test(
    "tests/prospect-engine.test.ts",
    "first-touch email wording matches the approved has-website and no-website templates",
    r'''test("first-touch email wording matches the manual Lovable permission-first templates", () => {
  const hasWebsite = withAnalysis(structuredClone(seedProspects[0]));
  hasWebsite.businessName = "Styles Power Wash";
  hasWebsite.trade = "Pressure Washing";
  hasWebsite.city = "St Augustine";

  assert.equal(firstTouchEmailDraft(hasWebsite, testFooter), [
    "Hi Styles Power Wash team,",
    "",
    "I came across your business.",
    "",
    "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.",
    "",
    "Would you like me to put together a quick preview?",
    "",
    testFooter,
  ].join("\n"));

  const noWebsite = withPresenceGapReview({ ...structuredClone(seedProspects[0]), businessName: "ClearFlow Plumbing", trade: "Plumbing", city: "Toledo", website: "" }, "no_owned_website");
  assert.equal(firstTouchEmailDraft(noWebsite, testFooter), [
    "Hi ClearFlow Plumbing team,",
    "",
    "I came across your business.",
    "",
    "I couldn't find a dedicated website for your business. I had an idea for what one could look like and how it could make it easier for people to call or request a quote.",
    "",
    "Would you like me to put together a quick preview?",
    "",
    testFooter,
  ].join("\n"));
});''',
)

replace_test(
    "tests/prospect-engine.test.ts",
    "detailed outreach avoids repeating the business name immediately after greeting",
    r'''test("permission-first outreach avoids repeating the business name and stays link-free", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  prospect.businessName = "Styles Power Wash";
  prospect.trade = "Pressure Washing";
  prospect.city = "St Augustine";
  const previewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";
  const outreach = generateOutreach(prospect, previewLink, { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.match(outreach.concise, /Hi Styles Power Wash team,\n\nI came across your business\./);
  assert.doesNotMatch(outreach.concise, /Hi Styles Power Wash team,\n\n[^.]+Styles Power Wash/i);
  assert.doesNotMatch(outreach.concise, /https?:\/\/|\/p\//i);
  assert.doesNotMatch(outreach.detailed, new RegExp(previewLink.replaceAll("/", "\\/")));
  assert.match(outreach.detailed, /I'll put together a quick preview/i);
  assert.match(outreach.detailed, /Thanks,\n\nBrendan\nWebWorkshop/i);
  assert.match(outreach.detailed, new RegExp(testPostalAddress));
  assert.match(outreach.detailed, /rather not hear from me again/i);
});''',
)

replace_test(
    "tests/prospect-engine.test.ts",
    "outreach avoids analytical strength claims for weak websites",
    r'''test("outreach avoids analytical strength claims for weak websites", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  for (const key of Object.keys(prospect.analysis!.scores) as Array<keyof typeof prospect.analysis.scores>) {
    prospect.analysis!.scores[key] = 25;
  }
  const outreach = generateOutreach(prospect, "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF", { WEBWORKSHOP_POSTAL_ADDRESS: testPostalAddress });

  assert.match(outreach.concise, /had an idea for a simpler website direction/i);
  assert.match(outreach.concise, /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(outreach.concise, /https?:\/\/|\/p\//i);
  assert.doesNotMatch(outreach.concise, /already pretty easy|solid technical foundation/i);
  assert.doesNotMatch(outreach.concise, /One thing that already works well|One missed opportunity/i);
});''',
)

replace_test(
    "tests/prospect-engine.test.ts",
    "no-website prospects still generate dedicated-website outreach",
    r'''test("verified no-website prospects receive careful dedicated-website wording", () => {
  const noWebsite = withPresenceGapReview({
    ...structuredClone(seedProspects[0]),
    website: "",
  }, "no_owned_website", "No owned website detected.");
  const withDraft = withOutreach(noWebsite);

  assert.match(withDraft.outreach?.concise ?? "", /couldn't find a dedicated website/i);
  assert.match(withDraft.outreach?.concise ?? "", /idea for what one could look like/i);
  assert.match(withDraft.outreach?.concise ?? "", /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(withDraft.outreach?.concise ?? "", /https?:\/\/|\/p\//i);
  assert.doesNotMatch(withDraft.outreach?.concise ?? "", /your website has issues|you don't have a website/i);
});''',
)

replace_test(
    "tests/top-prospects.test.ts",
    "Top Prospects treats contact forms and social profiles as usable manual written outreach",
    r'''test("Top Prospects keeps contact forms and social profiles manual and permission-first", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const formProspect = withAnalysis(structuredClone(seedProspects[0]));
  formProspect.email = "";
  formProspect.phone = "419-555-0100";
  formProspect.contactFormUrl = "https://local-roofing.example/contact";
  formProspect.contactFormDetected = true;
  formProspect.bestManualContactMethod = "contact_form";
  formProspect.recommendedContactMethod = "submit_contact_form";
  const formPackage = prepareTopProspectArtifacts(formProspect, publicLink);

  assert.equal(topProspectRejectionReason(formPackage.prospect, formPackage.assessment, "growth"), null);
  assert.equal(formPackage.emailQuality.readinessLabel, "Send-ready");
  assert.match(formPackage.prospect.outreach?.concise ?? "", /had an idea for a simpler website direction/i);
  assert.match(formPackage.prospect.outreach?.concise ?? "", /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(formPackage.prospect.outreach?.concise ?? "", /\/p\//i);
  assert.doesNotMatch(formPackage.prospect.outreach?.detailed ?? "", new RegExp(publicLink.replaceAll("/", "\\/")));

  const socialProspect = withAnalysis(structuredClone(seedProspects[2]));
  socialProspect.email = "";
  socialProspect.contactFormUrl = "";
  socialProspect.facebookUrl = "https://facebook.com/evergreenoutdoor";
  socialProspect.bestManualContactMethod = "facebook";
  socialProspect.recommendedContactMethod = "message_on_facebook";
  const socialPackage = prepareTopProspectArtifacts(socialProspect, publicLink);

  assert.equal(topProspectRejectionReason(socialPackage.prospect, socialPackage.assessment, "growth"), null);
  assert.equal(socialPackage.emailQuality.readinessLabel, "Send-ready");
  assert.match(socialPackage.prospect.outreach?.concise ?? "", /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(socialPackage.prospect.outreach?.concise ?? "", /\/p\//i);
  assert.doesNotMatch(socialPackage.prospect.outreach?.detailed ?? "", new RegExp(publicLink.replaceAll("/", "\\/")));
});''',
)

replace_test(
    "tests/top-prospects.test.ts",
    "No Website / Social Only prospects receive separate presence scoring and ownership-focused artifacts",
    r'''test("No Website / Social Only prospects receive separate scoring and permission-first outreach", () => {
  const prospect = structuredClone(seedProspects[0]);
  prospect.businessName = "Local Social Roofing";
  prospect.website = "";
  prospect.websiteStatus = "no_owned_website";
  prospect.profileUrl = "https://www.facebook.com/local-social-roofing";
  prospect.prospectType = "no_website_social_only";
  prospect.email = "";
  prospect.facebookUrl = "https://www.facebook.com/local-social-roofing";
  prospect.recommendedContactMethod = "message_on_facebook";
  prospect.bestManualContactMethod = "facebook";
  prospect.contactConfidence = "medium";
  prospect.phone = "(419) 555-0111";
  prospect.rating = 4.8;
  prospect.reviewCount = 48;
  prospect.recentReviewCount = 3;
  prospect.sourceConfidence = 82;
  prospect.analysis = undefined;

  const scores = calculateNoWebsitePresenceScores(prospect);
  const assessment = assessNoWebsiteOpportunity(prospect);
  const prepared = prepareTopProspectArtifacts(prospect, publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF"));

  assert.ok(scores.onlinePresenceGapScore >= 80);
  assert.ok(scores.businessActivityScore > 0);
  assert.ok(scores.localFitScore > 0);
  assert.ok(scores.finalSalesScore > 0);
  assert.equal(assessment.presenceScores?.websiteNeedScore, scores.websiteNeedScore);
  assert.equal(assessment.salesScores.weightedSalesScore, scores.finalSalesScore);
  assert.equal(assessment.salesScores.websiteQualityScore, 0);
  assert.equal(topProspectRejectionReason(prospect, assessment), null);
  assert.match(prepared.prospect.outreach?.concise ?? "", /couldn't find a dedicated website/i);
  assert.match(prepared.prospect.outreach?.concise ?? "", /Would you like me to put together a quick preview\?/i);
  assert.doesNotMatch(prepared.prospect.outreach?.detailed ?? "", new RegExp(prepared.previewLink.replaceAll("/", "\\/")));
  assert.match(prepared.buildPrompt, /first owned/i);
  assert.match(prepared.assessment.pitchAngle, /beyond Facebook or Google/i);
  assert.doesNotMatch(prepared.prospect.outreach?.detailed ?? "", /licensed|insured|warrant|recent local roofs?/i);
});''',
)

replace_test(
    "tests/top-prospects.test.ts",
    "Top Prospect artifacts remain unapproved and include a detailed builder prompt",
    r'''test("Top Prospect artifacts remain unapproved and keep the preview out of first-touch drafts", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const prepared = prepareTopProspectArtifacts(prospect, publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF"));
  const prompt = generateWebsiteBuildPrompt(prepared.prospect, prepared.assessment);

  assert.equal(prepared.prospect.outreach?.approved, false);
  assert.equal(prepared.prospect.outreach?.subjects.length, 3);
  assert.equal(prepared.prospect.outreach?.followUps.length, 2);
  assert.ok(prepared.prospect.preview);
  assert.match(prepared.previewLink, /^https:\/\/webworkshop\.dev\/p\//);
  assert.doesNotMatch(prepared.prospect.outreach?.concise ?? "", /https?:\/\/|\/p\//i);
  assert.match(prepared.prospect.outreach?.concise ?? "", /Would you like me to put together a quick preview\?/i);
  assert.match(prepared.prospect.outreach?.detailed ?? "", /I'll put together a quick preview/i);
  assert.doesNotMatch(prepared.prospect.outreach?.detailed ?? "", new RegExp(prepared.previewLink.replaceAll("/", "\\/")));
  assert.equal(prepared.emailQuality.ready, true);
  assert.ok(prepared.assessment.salesScores.weightedSalesScore > 0);
  assert.match(prompt, new RegExp(prospect.businessName));
  assert.match(prompt, /Style profile:/);
  assert.match(prompt, /Palette: primary #[0-9a-f]{6}/i);
  assert.match(prompt, /Primary CTA wording:/);
  assert.match(prompt, /Why this style was selected:/);
  assert.match(prompt, /Art direction:/);
  assert.match(prompt, /Imagery and section flow:/);
  assert.match(prompt, /Hero treatment:/);
  assert.match(prompt, /Do not reuse WebWorkshop branding/i);
  assert.match(prompt, /no invented claims/i);
});''',
)

replace_test(
    "tests/top-prospects.test.ts",
    "public preview tokens are hard to guess and internal preview links fail send-readiness checks",
    r'''test("public preview tokens stay protected while first-touch readiness remains preview-independent", () => {
  const token = createPublicPreviewToken();
  const publicLink = publicProspectPreviewLink(token);
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const publicPackage = prepareTopProspectArtifacts(prospect, publicLink);
  const internalLink = prospectPreviewLink(prospect.id);
  const scoreLeak = {
    ...publicPackage.prospect,
    outreach: {
      ...publicPackage.prospect.outreach!,
      concise: `${publicPackage.prospect.outreach!.concise}\nWebsite score: 82/100`,
    },
  };

  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(publicPackage.emailQuality.ready, true);
  assert.equal(evaluateOutreachEmailQuality(publicPackage.prospect, internalLink).ready, true);
  assert.throws(() => prepareTopProspectArtifacts(prospect, internalLink), /public \/p\/ preview link/i);
  assert.equal(evaluateOutreachEmailQuality(scoreLeak, publicLink).ready, false);
  assert.doesNotThrow(() => assertOutreachEmailReady(publicPackage.prospect, internalLink));
  assert.doesNotThrow(() => assertOutreachEmailReady(publicPackage.prospect, publicLink));
});''',
)

replace_test(
    "tests/top-prospects.test.ts",
    "missing sender postal address blocks email send-readiness without adding placeholders",
    r'''test("missing sender postal address blocks email readiness without leaking a preview link", () => {
  const publicLink = publicProspectPreviewLink(createPublicPreviewToken());
  const prepared = prepareTopProspectArtifacts(withAnalysis(structuredClone(seedProspects[0])), publicLink);
  const quality = evaluateOutreachEmailQuality(prepared.prospect, publicLink, "written_only", {});
  const allDrafts = [
    prepared.prospect.outreach!.concise,
    prepared.prospect.outreach!.detailed,
    ...prepared.prospect.outreach!.followUps,
  ].join("\n");

  assert.equal(quality.ready, false);
  assert.equal(quality.readinessLabel, "Needs sender postal address before sending");
  assert.doesNotMatch(allDrafts, /\[Add your business postal address before sending\]/i);
  assert.doesNotMatch(allDrafts, new RegExp(publicLink.replaceAll("/", "\\/")));
  assert.doesNotMatch(allDrafts, /\/engine\/previews\//i);
});''',
)

# The unsupported-claim test now starts from the shorter opening.
replace_required(
    "tests/top-prospects.test.ts",
    '''        /I was looking at [^\n]+/,''',
    '''        /I came across your business\./,''',
)

print("Manual Lovable source and tests aligned.")
