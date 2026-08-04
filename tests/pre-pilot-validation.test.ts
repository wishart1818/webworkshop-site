import assert from "node:assert/strict";
import test from "node:test";
import {
  approveAndQueueEmail,
  resetAutonomousGrowthMemoryForTests,
  sendQueuedEmailQueueItem,
  setOutreachQueueMemoryForTests,
  updateAutonomousGrowthSettings,
  upsertAutonomousQueueItemFromPackage,
} from "../lib/autonomous-growth-repository";
import { defaultAutonomousGrowthSettings, type OutreachQueueItem } from "../lib/autonomous-growth";
import {
  createProspect,
  generateOutreach,
  outreachDraftLooksCurrent,
  type ContactRouteEvidence,
  type Prospect,
  type WebsiteFitObservation,
} from "../lib/prospect-engine";
import {
  buildActiveProspectQualificationAudit,
} from "../lib/prospect-qualification-audit";
import {
  classifyPublicEmailEvidence,
  outreachObservationForProspect,
  outreachObservationGroundingProblems,
  prospectDecisionDimensions,
  prospectFreshnessAt,
  prospectQualificationBlockReasons,
  verifiedContactFirstNameForProspect,
  verifiedEmailEvidenceForProspect,
  websiteFitAllowsAutonomousOutreach,
} from "../lib/prospect-qualification";
import {
  resetProspectMemoryForTests,
  setProspectMemoryForTests,
} from "../lib/prospect-repository";
import {
  extractContactDiscoveryFromPages,
  revalidateProspectPublicEmailSource,
  verifyProspectWebsite,
  type WebsiteVerificationDependencies,
} from "../lib/site-analysis";
import {
  assessOpportunity,
  likelyFranchise,
  likelyNationalOrLargeBrand,
  likelySupplierOrDistributor,
  topProspectRejectionReason,
  websiteBusinessMismatch,
} from "../lib/top-prospects";

const postalEnvironment = {
  NODE_ENV: "test",
  AUTOPILOT_DISABLED: "false",
  OUTREACH_EMAIL_DISABLED: "false",
  OUTREACH_AUTO_SEND_ENABLED: "true",
  OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
  OUTREACH_SEND_PROVIDER: "resend",
  RESEND_API_KEY: "test-only-key",
  OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
  OUTREACH_REPLY_TO_EMAIL: "reply@webworkshop.dev",
  OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
  OUTREACH_DAILY_CAP: "1",
} as NodeJS.ProcessEnv;

function baseProspect(overrides: Partial<Prospect> = {}) {
  return {
    ...createProspect({
      businessName: "Pinnacle Pressure Washing of Toledo",
      website: "https://pinnacle419.com",
      phone: "+14195550123",
      email: "info@pinnacle419.com",
      city: "Toledo",
      state: "OH",
      trade: "Pressure Washing",
      serviceArea: "Toledo, OH",
      status: "Reviewed",
      sizeIndicator: "Established",
    }),
    ...overrides,
  } satisfies Prospect;
}

function firstPartyEmail(email: string, website: string, discoveredAt: string): ContactRouteEvidence {
  return {
    kind: "email",
    value: email,
    sourceUrl: new URL("/contact", website).href,
    extractionMethod: "mailto",
    confidence: "high",
    domainMatchesBusiness: new URL(website).hostname === email.split("@")[1],
    discoveredAt,
    sourceType: "owned_website",
    firstParty: true,
    decision: "autonomous_eligible",
    decisionReason: "The address is explicitly published as the business contact on the verified owned website.",
  };
}

function groundedObservation(kind: WebsiteFitObservation["kind"] = "quote_path"): WebsiteFitObservation {
  return {
    kind,
    statement: kind === "mobile_layout"
      ? "I noticed the quote request is difficult to reach on a phone."
      : "I noticed the quote request is difficult to reach on the current website.",
    rebuildSentence: "I can rebuild your current website with a more modern design that makes requesting a quote easier while presenting your verified services and contact information more clearly.",
    evidence: [kind === "mobile_layout"
      ? "Rendered review at a 390px mobile viewport showed the quote action below overlapping content."
      : "Rendered review showed no quote action in the primary customer path."],
    demoChecklist: [kind === "mobile_layout"
      ? "Show the corrected quote action at desktop and mobile viewports"
      : "Show the quote action in the desktop and mobile customer path"],
  };
}

function verifiedWeakProspect(overrides: Partial<Prospect> = {}) {
  const checkedAt = new Date().toISOString();
  const prospect = baseProspect({
    websiteStatus: "usable",
    fitDisposition: "clearly_weak_or_outdated_website",
    contactEvidence: [firstPartyEmail("info@pinnacle419.com", "https://pinnacle419.com", checkedAt)],
    recommendedContactMethod: "send_email",
    bestManualContactMethod: "email",
    contactConfidence: "high",
    websiteVerification: {
      version: "website-verification-v2",
      status: "usable",
      confidence: "high",
      canonicalUrl: "https://pinnacle419.com/",
      attempts: [],
      usableSignals: ["business name", "meaningful page title", "navigation", "service content", "public email"],
      explanation: "The owned website was verified.",
      checkedAt,
      ownershipDecision: "owned",
      identityEvidence: ["The business name and owned host match."],
      fit: {
        disposition: "clearly_weak_or_outdated_website",
        reason: "Rendered review found a difficult quote-request path.",
        supportingEvidence: ["The quote action is absent from the primary customer path."],
        confidence: "high",
        analysisOrigin: "rendered_review",
        evaluatedAt: checkedAt,
        observation: groundedObservation(),
      },
    },
    ...overrides,
  });
  prospect.outreach = generateOutreach(prospect, "", postalEnvironment);
  return prospect;
}

function safeDependencies(fetchImpl: typeof fetch, now = new Date()): WebsiteVerificationDependencies {
  return {
    fetch: fetchImpl,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxVerificationAttempts: 6,
    maxContactPages: 4,
    requestTimeoutMs: 2_000,
  };
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

test("Pinnacle-style modern website is adequate and cannot enter redesign outreach despite a high business score", async () => {
  const html = `<!doctype html><html><head><title>Pinnacle Pressure Washing of Toledo</title><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@type":"LocalBusiness"}</script></head><body><header><nav>Home Services Projects Reviews Contact</nav></header><main><h1>Pinnacle Pressure Washing of Toledo</h1><p>Residential pressure washing, house washing, concrete cleaning, and exterior cleaning for Toledo homeowners. Browse service details and recent project information before requesting an estimate.</p><a href="tel:+14195550123">Call</a><a href="mailto:info@pinnacle419.com">Email</a><form><input name="email"><textarea name="project"></textarea><button>Request quote</button></form><img src="/project.jpg" alt="Exterior cleaning project"></main></body></html>`;
  const prospect = baseProspect({ rating: 4.9, reviewCount: 240, sourceConfidence: 98 });
  const result = await verifyProspectWebsite(prospect, safeDependencies(async () => htmlResponse(html)));
  const assessment = assessOpportunity(result.prospect);

  assert.equal(result.prospect.fitDisposition, "adequate_existing_website");
  assert.equal(topProspectRejectionReason(result.prospect, assessment, "volume"), "Confirmed usable website / not a fit");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.equal(outreachObservationForProspect(result.prospect), null);
  assert.throws(
    () => generateOutreach(result.prospect, "", postalEnvironment),
    /does not support website-rebuild outreach/i,
  );
  const dimensions = prospectDecisionDimensions(result.prospect);
  assert.equal(dimensions.websiteNeed, 10);
  assert.ok(dimensions.websiteQuality > dimensions.websiteNeed);
});

test("incomplete raw HTML remains inconclusive instead of inventing a visual redesign defect", async () => {
  const html = `<!doctype html><html><head><title>Pinnacle Pressure Washing of Toledo</title><meta name="viewport" content="width=device-width"></head><body><header><nav>Home About</nav></header><main><h1>Pinnacle Pressure Washing of Toledo</h1><p>${"Local property information and company background. ".repeat(12)}</p></main></body></html>`;
  const result = await verifyProspectWebsite(baseProspect(), safeDependencies(async () => htmlResponse(html)));
  assert.equal(result.report.status, "usable");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.match(result.report.fit?.reason ?? "", /Raw HTML cannot establish a customer-facing visual defect/i);
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.throws(
    () => generateOutreach(result.prospect, "", postalEnvironment),
    /does not support website-rebuild outreach/i,
  );
});

test("clearly weak owned website retains one grounded issue and a directly matching rebuild sentence", () => {
  const prospect = verifiedWeakProspect();
  assert.equal(websiteFitAllowsAutonomousOutreach(prospect), true);
  assert.equal(prospectQualificationBlockReasons(prospect).length, 0);
  assert.match(prospect.outreach?.concise ?? "", /quote request is difficult to reach/);
  assert.match(prospect.outreach?.concise ?? "", /rebuild your current website/);
});

test("verified no-owned-website state uses cautious language and remains distinct from crawler failure", async () => {
  const prospect = baseProspect({
    website: "",
    email: "",
    prospectType: "no_website_social_only",
    profileUrl: "https://facebook.com/pinnaclepressurewashing",
    facebookUrl: "https://facebook.com/pinnaclepressurewashing",
    activitySignals: ["discovery_source:google"],
    sourceConfidence: 50,
    contactEvidence: [{
      kind: "facebook",
      value: "https://facebook.com/pinnaclepressurewashing",
      sourceUrl: "https://facebook.com/pinnaclepressurewashing",
      extractionMethod: "visible_text",
      confidence: "high",
      domainMatchesBusiness: false,
      discoveredAt: new Date().toISOString(),
      sourceType: "official_social",
      firstParty: true,
      decisionReason: "The official profile was manually verified for this business.",
    }],
  });
  const result = await verifyProspectWebsite(prospect, safeDependencies(async () => {
    throw new Error("No website request should run.");
  }));
  const outreach = generateOutreach(result.prospect, "", postalEnvironment);
  assert.equal(result.prospect.fitDisposition, "no_owned_website");
  assert.match(outreach.concise, /couldn't find a dedicated website linked from the business's public profiles/i);
  assert.doesNotMatch(outreach.concise, /definitely has no website|preview (?:is|was) ready/i);
});

test("crawler block and temporary failure stay manual-only instead of becoming absence evidence", async () => {
  const bot = await verifyProspectWebsite(baseProspect(), safeDependencies(async () => htmlResponse("<title>Checking your browser</title><p>Verify you are human. Cloudflare Ray ID.</p>", 403)));
  const temporary = await verifyProspectWebsite(baseProspect(), safeDependencies(async () => htmlResponse("<title>Service unavailable</title><p>Service unavailable</p>", 508)));
  assert.equal(bot.report.status, "crawler_blocked");
  assert.equal(temporary.report.status, "temporarily_unavailable");
  assert.equal(websiteFitAllowsAutonomousOutreach(bot.prospect), false);
  assert.equal(websiteFitAllowsAutonomousOutreach(temporary.prospect), false);
});

test("fit disposition cannot override a conflicting website state or synthesize an unsupported observation", () => {
  const inconsistent = verifiedWeakProspect();
  inconsistent.websiteStatus = "temporarily_unavailable";
  const withoutSavedObservation: Prospect = {
    ...inconsistent,
    websiteVerification: inconsistent.websiteVerification
      ? { ...inconsistent.websiteVerification, fit: { ...inconsistent.websiteVerification.fit!, observation: undefined } }
      : undefined,
  };
  assert.equal(websiteFitAllowsAutonomousOutreach(withoutSavedObservation), false);
  assert.equal(outreachObservationForProspect(withoutSavedObservation), null);
});

test("identity, directory, duplicate-brand, franchise, national, and supplier guards remain independent", () => {
  assert.equal(websiteBusinessMismatch(baseProspect({ businessName: "Pinnacle Pressure Washing", website: "https://unrelated-roofing.example" })), true);
  assert.equal(likelyNationalOrLargeBrand(baseProspect({ businessName: "Erie Home", website: "https://eriehome.com" })), true);
  assert.equal(likelyFranchise(baseProspect({ businessName: "SERVPRO of Toledo" })), true);
  assert.equal(likelySupplierOrDistributor(baseProspect({ businessName: "ABC Roofing Supply" })), true);
});

test("first-party business-domain email is autonomously eligible with exact provenance", () => {
  const result = classifyPublicEmailEvidence({
    email: "info@pinnacle419.com",
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: "https://pinnacle419.com",
    sourceUrl: "https://pinnacle419.com/contact",
    extractionMethod: "mailto",
    sourceText: "Contact our office for an estimate.",
  });
  assert.equal(result.decision, "autonomous_eligible");
  assert.equal(result.firstParty, true);
  assert.equal(result.domainMatchesBusiness, true);
});

test("official-social email provenance remains official-social instead of being relabeled as website evidence", () => {
  const result = classifyPublicEmailEvidence({
    email: "info@pinnacle419.com",
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: "https://pinnacle419.com",
    sourceUrl: "https://facebook.com/pinnaclepressurewashing",
    sourceType: "official_social",
    extractionMethod: "visible_text",
    sourceText: "Email info@pinnacle419.com for an estimate.",
  });
  assert.equal(result.decision, "autonomous_eligible");
  assert.equal(result.sourceType, "official_social");
  assert.match(result.reason, /official social profile/i);
});

test("email-domain matching handles subdomains without conflating unrelated public-suffix domains", () => {
  const validSubdomain = classifyPublicEmailEvidence({
    email: "hello@pinnacle.co.uk",
    businessName: "Pinnacle",
    website: "https://www.pinnacle.co.uk",
    sourceUrl: "https://contact.pinnacle.co.uk/contact",
    extractionMethod: "mailto",
  });
  const unrelated = classifyPublicEmailEvidence({
    email: "hello@unrelated.co.uk",
    businessName: "Pinnacle",
    website: "https://www.pinnacle.co.uk",
    sourceUrl: "https://unrelated.co.uk/contact",
    extractionMethod: "mailto",
  });
  assert.equal(validSubdomain.decision, "autonomous_eligible");
  assert.equal(validSubdomain.domainMatchesBusiness, true);
  assert.equal(unrelated.domainMatchesBusiness, false);
  assert.notEqual(unrelated.decision, "autonomous_eligible");
});

test("autonomous email evidence requires high-confidence provenance even when a stale decision says eligible", () => {
  const prospect = verifiedWeakProspect();
  prospect.contactEvidence[0] = { ...prospect.contactEvidence[0]!, confidence: "medium" };
  assert.equal(verifiedEmailEvidenceForProspect(prospect), null);
  assert.match(prospectQualificationBlockReasons(prospect).join(" "), /lacks autonomous-quality first-party evidence/i);
});

test("an arbitrary page cannot become an official-social source by label alone", () => {
  const prospect = verifiedWeakProspect();
  prospect.contactEvidence[0] = {
    ...prospect.contactEvidence[0]!,
    sourceUrl: "https://directory.example/pinnacle",
    sourceType: "official_social",
  };
  assert.equal(verifiedEmailEvidenceForProspect(prospect), null);
});

test("official-social email evidence must match the prospect's saved official profile", () => {
  const prospect = verifiedWeakProspect({
    facebookUrl: "https://facebook.com/pinnaclepressurewashing",
  });
  prospect.contactEvidence[0] = {
    ...prospect.contactEvidence[0]!,
    sourceUrl: "https://facebook.com/unrelated-business",
    sourceType: "official_social",
  };
  assert.equal(verifiedEmailEvidenceForProspect(prospect), null);
});

test("a clearly published first-party Gmail mailbox may qualify while admin@gmail.com stays manual", () => {
  const legitimate = classifyPublicEmailEvidence({
    email: "pinnaclepressurewashing@gmail.com",
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: "https://pinnacle419.com",
    sourceUrl: "https://pinnacle419.com/contact",
    extractionMethod: "mailto",
    sourceText: "Email our business for an estimate.",
  });
  const suspicious = classifyPublicEmailEvidence({
    email: "admin@gmail.com",
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: "https://pinnacle419.com",
    sourceUrl: "https://pinnacle419.com/contact",
    extractionMethod: "visible_text",
    sourceText: "Contact us.",
  });
  assert.equal(legitimate.decision, "autonomous_eligible");
  assert.equal(suspicious.decision, "manual_review_required");
});

test("a free-domain site-credit mailbox is not treated as the business contact", () => {
  const result = classifyPublicEmailEvidence({
    email: "designerportfolio@gmail.com",
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: "https://pinnacle419.com",
    sourceUrl: "https://pinnacle419.com/contact",
    extractionMethod: "mailto",
    sourceText: "Website designed by North Coast Web Design. designerportfolio@gmail.com",
  });
  assert.equal(result.decision, "manual_review_required");
});

test("bounded contact extraction gives an explicitly published business Gmail address high-confidence evidence", () => {
  const sourceUrl = "https://pinnacle419.com/contact";
  const discovery = extractContactDiscoveryFromPages("https://pinnacle419.com", [{
    url: sourceUrl,
    html: "<html><body><h1>Contact Pinnacle Pressure Washing</h1><p>Email our office for an estimate.</p><a href='mailto:pinnaclepressurewashing@gmail.com'>pinnaclepressurewashing@gmail.com</a></body></html>",
  }], baseProspect({ email: "" }));
  const prospect = verifiedWeakProspect({
    email: discovery.email,
    contactEvidence: discovery.contactEvidence,
  });
  const evidence = verifiedEmailEvidenceForProspect(prospect);
  assert.equal(discovery.email, "pinnaclepressurewashing@gmail.com");
  assert.equal(evidence?.sourceUrl, sourceUrl);
  assert.equal(evidence?.confidence, "high");
  assert.equal(evidence?.decision, "autonomous_eligible");
});

test("bounded contact extraction prefers the labeled business Gmail over a footer designer Gmail", () => {
  const sourceUrl = "https://pinnacle419.com/contact";
  const discovery = extractContactDiscoveryFromPages("https://pinnacle419.com", [{
    url: sourceUrl,
    html: [
      "<html><body><h1>Contact Pinnacle Pressure Washing</h1>",
      "<p>Email our office for an estimate.</p>",
      "<a href='mailto:pinnaclepressurewashing@gmail.com'>pinnaclepressurewashing@gmail.com</a>",
      "<footer>Website designed by North Coast Web Design. <a href='mailto:designerportfolio@gmail.com'>designerportfolio@gmail.com</a></footer>",
      "</body></html>",
    ].join(""),
  }], baseProspect({ email: "" }));
  assert.equal(discovery.email, "pinnaclepressurewashing@gmail.com");
  assert.equal(discovery.contactEvidence.find((item) => item.value === "designerportfolio@gmail.com")?.decision, "manual_review_required");
});

test("vendor, privacy, directory, and source-less emails cannot become autonomous", () => {
  const common = {
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: "https://pinnacle419.com",
    extractionMethod: "visible_text" as const,
    sourceText: "Contact information",
  };
  assert.equal(classifyPublicEmailEvidence({ ...common, email: "support@sitebuilder.example", sourceUrl: "https://pinnacle419.com/contact" }).decision, "rejected");
  assert.equal(classifyPublicEmailEvidence({ ...common, email: "privacy@pinnacle419.com", sourceUrl: "https://pinnacle419.com/privacy" }).decision, "rejected");
  assert.equal(classifyPublicEmailEvidence({ ...common, email: "info@pinnacle419.com", sourceUrl: "https://directory.example/listing", sourceType: "directory" }).decision, "manual_review_required");
  assert.equal(classifyPublicEmailEvidence({ ...common, email: "info@pinnacle419.com", sourceUrl: "" }).decision, "manual_review_required");
});

test("verified person evidence enables first-name greeting and unverified names fall back to clean business-team greeting", () => {
  const verified = verifiedWeakProspect({
    businessName: "Smith Landscaping LLC",
    contactPersonName: "Nick",
  });
  verified.contactEvidence.push({
    kind: "contact_person",
    value: "Nick",
    sourceUrl: "https://pinnacle419.com/contact",
    extractionMethod: "visible_text",
    confidence: "high",
    domainMatchesBusiness: true,
    discoveredAt: new Date().toISOString(),
    sourceType: "owned_website",
    firstParty: true,
    decisionReason: "Operator verified the name on the first-party contact page.",
  });
  verified.outreach = generateOutreach(verified, "", postalEnvironment);
  const unverified = verifiedWeakProspect({ businessName: "Smith Landscaping LLC", contactPersonName: "Nick" });
  const unsafeRole = verifiedWeakProspect({ businessName: "ABC Roofing & Construction Inc.", contactPersonName: "Admin" });

  assert.equal(verifiedContactFirstNameForProspect(verified), "Nick");
  assert.match(verified.outreach.concise, /^Hi Nick,/);
  assert.match(generateOutreach(unverified, "", postalEnvironment).concise, /^Hi Smith Landscaping team,/);
  assert.match(generateOutreach(unsafeRole, "", postalEnvironment).concise, /^Hi ABC Roofing & Construction team,/);
  assert.doesNotMatch(generateOutreach(unsafeRole, "", postalEnvironment).concise, /^Hi Admin,/);
});

test("mobile-specific claim requires mobile evidence and a matching Lovable/Loom demonstration", () => {
  const grounded = groundedObservation("mobile_layout");
  const unsupported = { ...grounded, evidence: ["The HTML includes a navigation element."], demoChecklist: ["Show the homepage"] };
  assert.deepEqual(outreachObservationGroundingProblems(grounded), []);
  assert.match(outreachObservationGroundingProblems(unsupported).join(" "), /mobile-specific|mobile Lovable\/Loom/i);
});

test("unsupported praise is absent and a controlled general rebuild fallback remains factual", () => {
  const prospect = verifiedWeakProspect({ rating: 4.9, reviewCount: 200 });
  const body = prospect.outreach?.concise ?? "";
  assert.doesNotMatch(body, /love what you're doing|customers clearly love|amazing business|impressed by/i);
  assert.match(body, /I noticed [\s\S]+I can rebuild your current website/);
});

test("freshness marks daily evidence, weekly fit, approval, and copy independently", () => {
  const now = new Date();
  const fresh = verifiedWeakProspect();
  const staleAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1_000).toISOString();
  const stale = structuredClone(fresh);
  stale.websiteVerification!.checkedAt = staleAt;
  stale.websiteVerification!.fit!.evaluatedAt = staleAt;
  stale.contactEvidence[0]!.discoveredAt = staleAt;
  const approvalAt = new Date(Date.parse(staleAt) - 24 * 60 * 60 * 1_000).toISOString();
  stale.outreach = { ...stale.outreach!, approved: true, generatedAt: approvalAt, outreachCopyGeneratedAt: approvalAt };
  const status = prospectFreshnessAt(stale, now);
  assert.equal(status.websiteVerificationFresh, false);
  assert.equal(status.websiteFitFresh, false);
  assert.equal(status.contactSourceFresh, false);
  assert.equal(status.approvalFresh, false);
});

test("permission-first email stays short, link-free, rebuild-specific, and never claims a preview exists", () => {
  const prospect = verifiedWeakProspect();
  const body = prospect.outreach?.concise ?? "";
  const beforeFooter = body.split("Thanks,")[0] ?? body;
  const wordCount = beforeFooter.trim().split(/\s+/).length;
  assert.ok(wordCount >= 70 && wordCount <= 130, `Expected 70-130 words before footer, received ${wordCount}.`);
  assert.equal(outreachDraftLooksCurrent(prospect.outreach!, postalEnvironment), true);
  assert.match(body, /Would you be interested in seeing what that could look like\?/);
  assert.doesNotMatch(body, /https?:\/\/|\/p\/|already (?:built|made|created)|put together a preview/i);
});

test("read-only qualification audit names affected records and reports no mutation or outreach", () => {
  const active = verifiedWeakProspect({ id: "audit-active" });
  const strong = verifiedWeakProspect({ id: "audit-strong", businessName: "Strong Website Co" });
  strong.fitDisposition = "strong_existing_website";
  strong.websiteVerification!.fit = { ...strong.websiteVerification!.fit!, disposition: "strong_existing_website", observation: undefined };
  const protectedRecord = verifiedWeakProspect({ id: "audit-protected", status: "Contacted" });
  const queue = [{
    id: "audit-queue-active",
    prospectId: active.id,
    status: "Needs Review",
    sentDate: "",
    notes: "Nothing was sent.",
  }, {
    id: "audit-queue-protected",
    prospectId: protectedRecord.id,
    status: "Sent",
    sentDate: new Date().toISOString(),
    notes: "Provider message ID: test-history",
  }] as OutreachQueueItem[];
  const report = buildActiveProspectQualificationAudit([active, strong, protectedRecord], queue);
  assert.equal(report.mode, "read_only");
  assert.equal(report.nothingChanged, true);
  assert.equal(report.outreachSent, 0);
  assert.equal(report.records.find((item) => item.prospectId === strong.id)?.proposedDecision, "Blocked");
  assert.equal(report.records.find((item) => item.prospectId === protectedRecord.id)?.proposedDecision, "Protected history");
  assert.deepEqual(report.records.find((item) => item.prospectId === active.id)?.queuePackageIds, ["audit-queue-active"]);
});

test("just-in-time source removal returns the claimed draft to review before any provider call", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  let providerCalls = 0;
  try {
    Object.assign(process.env, postalEnvironment);
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "must-not-send" }), { status: 200 });
    };
    const prospect = verifiedWeakProspect({ id: "jit-source-removed" });
    setProspectMemoryForTests([prospect]);
    setOutreachQueueMemoryForTests([]);
    await updateAutonomousGrowthSettings({
      ...defaultAutonomousGrowthSettings,
      mode: "auto_email_pilot",
      killSwitch: false,
      maxEmailsSentPerDay: 1,
    });
    const item = await upsertAutonomousQueueItemFromPackage({
      prospect,
      previewLink: "",
      outreachPreference: "written_only",
      topProspectResultId: "jit-source-removed-result",
    });
    const approved = await approveAndQueueEmail(item.id);
    assert.equal(approved.queued, true, approved.blockedReasons.join("; "));

    const noEmailHtml = `<!doctype html><html><head><title>Pinnacle Pressure Washing of Toledo</title><meta name="viewport" content="width=device-width"></head><body><nav>Home Services About Contact</nav><h1>Pinnacle Pressure Washing of Toledo</h1><p>Residential pressure washing and exterior cleaning for Toledo homeowners. Read about house washing, concrete cleaning, and exterior care before requesting information for your property.</p><a href="tel:+14195550123">Call</a><form><input name="phone"><button>Request quote</button></form><img src="/work.jpg" alt="Exterior cleaning"></body></html>`;
    const result = await sendQueuedEmailQueueItem(item.id, {
      websiteVerificationDependencies: safeDependencies(async () => htmlResponse(noEmailHtml)),
    });
    assert.equal(result.sent, false);
    assert.equal(result.item?.status, "Needs Review");
    assert.match(result.blockedReasons.join(" "), /recipient no longer matches|public-email evidence is stale or was removed|lacks stored public source/i);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("just-in-time revalidation dispatches only after the approved website, fit, and email source remain unchanged", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  let providerCalls = 0;
  try {
    Object.assign(process.env, postalEnvironment);
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "provider-jit-success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const prospect = verifiedWeakProspect({ id: "jit-verified-success" });
    prospect.websiteVerification!.usableSignals = [
      "meaningful page title",
      "business name",
      "navigation",
      "service content",
    ];
    setProspectMemoryForTests([prospect]);
    setOutreachQueueMemoryForTests([]);
    await updateAutonomousGrowthSettings({
      ...defaultAutonomousGrowthSettings,
      mode: "auto_email_pilot",
      killSwitch: false,
      maxEmailsSentPerDay: 1,
    });
    const item = await upsertAutonomousQueueItemFromPackage({
      prospect,
      previewLink: "",
      outreachPreference: "written_only",
      topProspectResultId: "jit-verified-success-result",
    });
    const approved = await approveAndQueueEmail(item.id);
    assert.equal(approved.queued, true, approved.blockedReasons.join("; "));

    const homeHtml = `<!doctype html><html><head><title>Pinnacle Pressure Washing of Toledo</title></head><body><nav>Home Services About <a href="/contact">Contact</a></nav><h1>Pinnacle Pressure Washing of Toledo</h1><p>${"Residential pressure washing and exterior cleaning services for Toledo homeowners. ".repeat(4)}</p></body></html>`;
    const contactHtml = "<!doctype html><html><head><title>Contact Pinnacle Pressure Washing of Toledo</title></head><body><h1>Contact Pinnacle Pressure Washing of Toledo</h1><p>Email our office for an estimate.</p><a href='mailto:info@pinnacle419.com'>info@pinnacle419.com</a></body></html>";
    const result = await sendQueuedEmailQueueItem(item.id, {
      websiteVerificationDependencies: safeDependencies(async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return htmlResponse(/\/contact(?:[/?#]|$)/i.test(url) ? contactHtml : homeHtml);
      }),
    });
    assert.equal(result.sent, true, result.blockedReasons.join("; "));
    assert.equal(result.item?.status, "Sent");
    assert.equal(result.providerMessageId, "provider-jit-success");
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
  }
});

test("autonomous email evidence helper requires the exact saved recipient", () => {
  const prospect = verifiedWeakProspect();
  assert.equal(verifiedEmailEvidenceForProspect(prospect)?.value, "info@pinnacle419.com");
  assert.equal(verifiedEmailEvidenceForProspect({ ...prospect, email: "sales@pinnacle419.com" }), null);
});

test("just-in-time official-social validation requires the exact email and matching business identity", async () => {
  const prospect = verifiedWeakProspect({
    contactPersonName: "Nick",
    facebookUrl: "https://facebook.com/pinnaclepressurewashing",
  });
  prospect.contactEvidence = [{
    ...prospect.contactEvidence[0]!,
    sourceUrl: "https://facebook.com/pinnaclepressurewashing",
    sourceType: "official_social",
    domainMatchesBusiness: true,
  }, {
    kind: "contact_person",
    value: "Nick",
    sourceUrl: "https://facebook.com/pinnaclepressurewashing",
    extractionMethod: "visible_text",
    confidence: "high",
    domainMatchesBusiness: false,
    discoveredAt: new Date().toISOString(),
    sourceType: "official_social",
    firstParty: true,
  }];
  const present = await revalidateProspectPublicEmailSource(prospect, safeDependencies(async () => htmlResponse(
    "<html><body><h1>Pinnacle Pressure Washing of Toledo</h1><p>Contact Nick at info@pinnacle419.com for an estimate.</p></body></html>",
  )));
  const nameRemoved = await revalidateProspectPublicEmailSource(prospect, safeDependencies(async () => htmlResponse(
    "<html><body><h1>Pinnacle Pressure Washing of Toledo</h1><p>Email info@pinnacle419.com for an estimate.</p></body></html>",
  )));
  const removed = await revalidateProspectPublicEmailSource(prospect, safeDependencies(async () => htmlResponse(
    "<html><body><h1>Pinnacle Pressure Washing of Toledo</h1><p>Call for an estimate.</p></body></html>",
  )));
  assert.equal(present.valid, true);
  assert.equal(present.evidence?.sourceType, "official_social");
  assert.equal(present.contactPersonValid, true);
  assert.equal(nameRemoved.valid, true);
  assert.equal(nameRemoved.contactPersonValid, false);
  assert.equal(removed.valid, false);
  assert.match(removed.reason, /exact approved email is no longer visible/i);
});
