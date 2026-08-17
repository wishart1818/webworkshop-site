import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createProspect,
  prospectWrittenContactMethodIsUsable,
  type Prospect,
} from "../lib/prospect-engine";
import {
  discoveryIdentityEvidenceSignal,
  discoverySameNameAmbiguitySignal,
  type DiscoveryIdentityEvidence,
} from "../lib/prospect-identity-evidence";
import {
  noSiteEnrichmentDiagnosticSignal,
} from "../lib/prospect-verification-resolution";
import { verifiedEmailEvidenceForProspect } from "../lib/prospect-qualification";
import { assessNoWebsiteOpportunity, topProspectRejectionReason } from "../lib/top-prospects";
import { extractContactDiscoveryFromPages } from "../lib/site-analysis";
import { discoveryDiagnosticsFromJson } from "../lib/lead-discovery";
import {
  enrichProspectWrittenContact,
  latestWrittenContactEnrichmentDiagnostic,
  prospectNeedsBoundedWrittenContactEnrichment,
  writtenContactEnrichmentDiagnosticSignal,
} from "../lib/written-contact-enrichment";

const now = new Date("2026-08-17T16:00:00.000Z");
const facebookUrl = "https://facebook.com/austinpressurewashing";

function identity(
  source: DiscoveryIdentityEvidence["source"],
  overrides: Partial<DiscoveryIdentityEvidence> = {},
): DiscoveryIdentityEvidence {
  return {
    source,
    businessName: "Austin Pressure Washing",
    website: "",
    profileUrl: source === "google" ? facebookUrl : "",
    phone: "512-555-0142",
    address: "123 Congress Avenue, Austin, TX",
    city: "Austin",
    state: "TX",
    latitude: 30.2672,
    longitude: -97.7431,
    observedAt: now.toISOString(),
    ...overrides,
  };
}

function noSiteProspect(overrides: Partial<Prospect> = {}) {
  const prospect = createProspect({
    businessName: "Austin Pressure Washing",
    website: "",
    profileUrl: "",
    phone: "512-555-0142",
    email: "",
    address: "123 Congress Avenue, Austin, TX",
    city: "Austin",
    state: "TX",
    trade: "Pressure Washing",
    serviceArea: "Austin, TX",
    sizeIndicator: "Growing",
    status: "New",
  });
  prospect.prospectType = "no_website_social_only";
  prospect.classification = "phone_only";
  prospect.recommendedContactMethod = "needs_manual_contact_research";
  prospect.sourceConfidence = 70;
  prospect.websiteStatus = "no_owned_website";
  prospect.fitDisposition = "no_owned_website";
  prospect.websiteVerification = {
    version: "website-verification-v2",
    status: "no_owned_website",
    confidence: "high",
    canonicalUrl: "",
    attempts: [],
    usableSignals: [],
    explanation: "Fresh independent providers established that no owned website was found.",
    checkedAt: now.toISOString(),
    ownershipDecision: "not_owned",
    identityEvidence: ["Google and Bing matched the business by name, phone, and address."],
    fit: {
      disposition: "no_owned_website",
      reason: "No credible owned-domain candidate was supplied by either provider.",
      supportingEvidence: ["Two fresh provider identities matched."],
      confidence: "high",
      analysisOrigin: "automated_html",
      evaluatedAt: now.toISOString(),
    },
  };
  prospect.activitySignals = [
    discoveryIdentityEvidenceSignal(identity("google")),
    discoveryIdentityEvidenceSignal(identity("bing")),
    noSiteEnrichmentDiagnosticSignal({
      version: "no-site-enrichment-v3",
      outcome: "probable_no_owned_website",
      reason: "Fresh Google and Bing identities matched without an owned website.",
      checkedAt: now.toISOString(),
      providerSources: ["bing", "google"],
      websiteCandidate: "",
      websiteVerificationStatus: "no_owned_website",
      websiteFitDisposition: "no_owned_website",
    }),
  ];
  return Object.assign(prospect, overrides);
}

function facebookDocument(body: string) {
  return {
    url: new URL(facebookUrl),
    text: `<html><body><h1>Austin Pressure Washing</h1><p>123 Congress Avenue, Austin, TX</p><p>Call 512-555-0142</p>${body}</body></html>`,
  };
}

function prospectWithProviderProfile(profileUrl: string, overrides: Partial<Prospect> = {}) {
  const base = noSiteProspect();
  return noSiteProspect({
    ...overrides,
    activitySignals: [
      discoveryIdentityEvidenceSignal(identity("google", { profileUrl })),
      discoveryIdentityEvidenceSignal(identity("bing")),
      ...base.activitySignals.filter((signal) => signal.startsWith("no_site_enrichment_diagnostic:")),
    ],
  });
}

test("bounded enrichment persists an identity-matched official Facebook route as manual only", async () => {
  const result = await enrichProspectWrittenContact(noSiteProspect(), {
    now: () => now,
    fetchDocument: async () => facebookDocument("<p>Call for service.</p>"),
  });

  assert.equal(result.attempted, true);
  assert.equal(result.diagnostic?.outcome, "manual_social");
  assert.equal(result.prospect.email, "");
  assert.equal(result.prospect.facebookUrl, facebookUrl);
  assert.equal(result.prospect.recommendedContactMethod, "message_on_facebook");
  assert.equal(topProspectRejectionReason(result.prospect, assessNoWebsiteOpportunity(result.prospect), "growth", "written_only"), null);
  assert.equal(result.prospect.outreach, undefined);
});

test("no identity-matched social profile leaves the prospect phone-only", async () => {
  let requests = 0;
  const prospect = noSiteProspect({
    activitySignals: [
      discoveryIdentityEvidenceSignal(identity("google", { profileUrl: "https://maps.google.com/?cid=3545450935484072529" })),
      discoveryIdentityEvidenceSignal(identity("bing")),
      ...noSiteProspect().activitySignals.filter((signal) => signal.startsWith("no_site_enrichment_diagnostic:")),
    ],
  });
  const result = await enrichProspectWrittenContact(prospect, {
    now: () => now,
    fetchDocument: async () => {
      requests += 1;
      return facebookDocument("");
    },
  });
  assert.equal(requests, 0);
  assert.equal(result.diagnostic?.outcome, "no_route");
  assert.equal(prospectWrittenContactMethodIsUsable(result.prospect), false);
  assert.equal(topProspectRejectionReason(result.prospect, assessNoWebsiteOpportunity(result.prospect), "growth", "written_only"), "Phone-only / written outreach blocked");
});

test("wrong-market or conflicting-phone same-name social evidence is rejected", async () => {
  for (const provider of [
    identity("google", { city: "Houston", address: "900 Main Street, Houston, TX", latitude: 29.7604, longitude: -95.3698 }),
    identity("google", { phone: "713-555-0199" }),
  ]) {
    let requests = 0;
    const prospect = noSiteProspect({
      activitySignals: [
        discoveryIdentityEvidenceSignal(provider),
        discoveryIdentityEvidenceSignal(identity("bing")),
        ...noSiteProspect().activitySignals.filter((signal) => signal.startsWith("no_site_enrichment_diagnostic:")),
      ],
    });
    const result = await enrichProspectWrittenContact(prospect, {
      now: () => now,
      fetchDocument: async () => {
        requests += 1;
        return facebookDocument("");
      },
    });
    assert.equal(requests, 0);
    assert.equal(result.prospect.facebookUrl, "");
    assert.equal(prospectWrittenContactMethodIsUsable(result.prospect), false);
  }
});

test("a fetched same-name Facebook page with a conflicting market and phone overrides provider-bound identity", async () => {
  const result = await enrichProspectWrittenContact(noSiteProspect(), {
    now: () => now,
    fetchDocument: async () => ({
      url: new URL(facebookUrl),
      text: "<html><body><h1>Austin Pressure Washing</h1><p>Houston, TX</p><p>Call 713-555-0199</p></body></html>",
    }),
  });

  assert.equal(result.diagnostic?.outcome, "identity_conflict");
  assert.equal(result.prospect.facebookUrl, "");
  assert.equal(result.prospect.recommendedContactMethod, "needs_manual_contact_research");
  assert.equal(prospectWrittenContactMethodIsUsable(result.prospect), false);
  assert.equal(topProspectRejectionReason(result.prospect, assessNoWebsiteOpportunity(result.prospect), "growth", "written_only"), "Phone-only / written outreach blocked");
  assert.equal(result.prospect.outreach, undefined);
});

test("a fetched Facebook page with a conflicting phone is rejected even when its market matches", async () => {
  const result = await enrichProspectWrittenContact(noSiteProspect(), {
    now: () => now,
    fetchDocument: async () => ({
      url: new URL(facebookUrl),
      text: "<html><body><h1>Austin Pressure Washing</h1><p>123 Congress Avenue, Austin, TX</p><p>Call 713-555-0199</p></body></html>",
    }),
  });

  assert.equal(result.diagnostic?.outcome, "identity_conflict");
  assert.equal(result.prospect.facebookUrl, "");
  assert.equal(prospectWrittenContactMethodIsUsable(result.prospect), false);
});

test("a blocked social page preserves only the provider-bound manual route and infers no email", async () => {
  const result = await enrichProspectWrittenContact(noSiteProspect(), {
    now: () => now,
    fetchDocument: async () => {
      throw new Error("Crawler blocked");
    },
  });

  assert.equal(result.diagnostic?.outcome, "manual_social");
  assert.equal(result.prospect.facebookUrl, facebookUrl);
  assert.equal(result.prospect.email, "");
  assert.equal(result.prospect.contactEvidence.some((item) => item.kind === "email"), false);
  assert.equal(result.prospect.recommendedContactMethod, "message_on_facebook");
  assert.equal(result.prospect.outreach, undefined);
});

test("unsupported social networks and personal LinkedIn profiles cannot create written routes", async () => {
  for (const profileUrl of [
    "https://x.com/austinpressurewashing",
    "https://twitter.com/austinpressurewashing",
    "https://youtube.com/@austinpressurewashing",
    "https://linkedin.com/in/person-name",
  ]) {
    let requests = 0;
    const result = await enrichProspectWrittenContact(prospectWithProviderProfile(profileUrl), {
      now: () => now,
      fetchDocument: async () => {
        requests += 1;
        return { url: new URL(profileUrl), text: "<html><body>Austin Pressure Washing</body></html>" };
      },
    });

    assert.equal(requests, 0, profileUrl);
    assert.equal(result.diagnostic?.outcome, "no_route", profileUrl);
    assert.equal(prospectWrittenContactMethodIsUsable(result.prospect), false, profileUrl);
    assert.equal(result.prospect.linkedinUrl, "", profileUrl);
    assert.equal(result.prospect.outreach, undefined, profileUrl);
  }
});

test("an identity-matched LinkedIn company page remains an allowed manual route", async () => {
  const linkedinUrl = "https://linkedin.com/company/austin-pressure-washing";
  const result = await enrichProspectWrittenContact(prospectWithProviderProfile(linkedinUrl), {
    now: () => now,
    fetchDocument: async () => ({
      url: new URL(linkedinUrl),
      text: "<html><body><h1>Austin Pressure Washing</h1><p>123 Congress Avenue, Austin, TX</p><p>Call 512-555-0142</p></body></html>",
    }),
  });

  assert.equal(result.diagnostic?.outcome, "manual_social");
  assert.equal(result.prospect.linkedinUrl, linkedinUrl);
  assert.equal(result.prospect.recommendedContactMethod, "message_on_social");
  assert.equal(prospectWrittenContactMethodIsUsable(result.prospect), true);
  assert.equal(result.prospect.outreach, undefined);
});

test("verified email observed on an identity-matched official social profile passes the existing authority gate", async () => {
  const result = await enrichProspectWrittenContact(noSiteProspect(), {
    now: () => now,
    fetchDocument: async () => facebookDocument("<p>Contact our office for an estimate.</p><a href='mailto:austinpressurewashing@gmail.com'>austinpressurewashing@gmail.com</a>"),
  });

  assert.equal(result.diagnostic?.outcome, "verified_email");
  assert.equal(result.prospect.email, "austinpressurewashing@gmail.com");
  assert.equal(verifiedEmailEvidenceForProspect(result.prospect)?.sourceUrl, facebookUrl);
  assert.equal(verifiedEmailEvidenceForProspect(result.prospect)?.extractionMethod, "mailto");
  assert.equal(result.prospect.recommendedContactMethod, "send_email");
  assert.equal(topProspectRejectionReason(result.prospect, assessNoWebsiteOpportunity(result.prospect), "growth", "written_only"), null);
  assert.equal(result.prospect.outreach, undefined);
});

test("guessed and directory-style email routes are never promoted", async () => {
  const noEmail = await enrichProspectWrittenContact(noSiteProspect(), {
    now: () => now,
    fetchDocument: async () => facebookDocument("<p>Contact our office for an estimate.</p>"),
  });
  assert.equal(noEmail.prospect.email, "");
  assert.equal(noEmail.prospect.contactEvidence.some((item) => item.kind === "email"), false);

  const unrelated = await enrichProspectWrittenContact(noSiteProspect(), {
    now: () => now,
    fetchDocument: async () => facebookDocument("<p>Contact our office.</p><a href='mailto:leads@directory-mail.example'>leads@directory-mail.example</a>"),
  });
  assert.equal(unrelated.prospect.email, "");
  assert.notEqual(unrelated.prospect.contactEvidence.find((item) => item.kind === "email")?.decision, "autonomous_eligible");
  assert.equal(verifiedEmailEvidenceForProspect(unrelated.prospect), null);
});

test("provider unavailability and identity ambiguity fail closed without a request", async () => {
  for (const signals of [
    noSiteProspect().activitySignals.filter((signal) => signal.startsWith("no_site_enrichment_diagnostic:")),
    [...noSiteProspect().activitySignals, discoverySameNameAmbiguitySignal()],
  ]) {
    let requests = 0;
    const result = await enrichProspectWrittenContact(noSiteProspect({ activitySignals: signals }), {
      now: () => now,
      fetchDocument: async () => {
        requests += 1;
        return facebookDocument("");
      },
    });
    assert.equal(requests, 0);
    assert.equal(["provider_unavailable", "identity_conflict"].includes(result.diagnostic?.outcome ?? ""), true);
    assert.equal(prospectWrittenContactMethodIsUsable(result.prospect), false);
  }
});

test("fresh written routes and fresh attempted diagnostics prevent duplicate enrichment", async () => {
  const checkedAt = now.toISOString();
  const social = noSiteProspect({
    facebookUrl,
    recommendedContactMethod: "message_on_facebook",
    contactEvidence: [{
      kind: "facebook",
      value: facebookUrl,
      sourceUrl: facebookUrl,
      extractionMethod: "existing_provider",
      confidence: "high",
      domainMatchesBusiness: false,
      discoveredAt: checkedAt,
      lastVerifiedAt: checkedAt,
      sourceType: "official_social",
      firstParty: true,
      decision: "manual_review_required",
      decisionReason: "Verified official profile; messages remain manual.",
    }],
  });
  assert.equal(prospectNeedsBoundedWrittenContactEnrichment(social, now), false);
  const staleSocial = {
    ...social,
    contactEvidence: social.contactEvidence.map((item) => ({
      ...item,
      discoveredAt: "2026-08-15T12:00:00.000Z",
      lastVerifiedAt: "2026-08-15T12:00:00.000Z",
    })),
  };
  assert.equal(prospectNeedsBoundedWrittenContactEnrichment(staleSocial, now), true);

  const attempted = noSiteProspect();
  attempted.activitySignals.push(writtenContactEnrichmentDiagnosticSignal({
    version: "written-contact-enrichment-v1",
    outcome: "no_route",
    checkedAt,
    reason: "No route found.",
    providerSources: ["bing", "google"],
    sourceUrl: "",
    routeKind: "",
    extractionMethod: "",
    requestCount: 0,
  }));
  let requests = 0;
  const result = await enrichProspectWrittenContact(attempted, {
    now: () => now,
    fetchDocument: async () => {
      requests += 1;
      return facebookDocument("");
    },
  });
  assert.equal(result.attempted, false);
  assert.equal(requests, 0);
});

test("suppressed and contacted prospects are rejected before bounded contact enrichment", () => {
  assert.equal(prospectNeedsBoundedWrittenContactEnrichment(noSiteProspect({ status: "Contacted" }), now), false);
  assert.equal(prospectNeedsBoundedWrittenContactEnrichment(noSiteProspect({ notes: ["Do not contact"] }), now), false);
});

test("owned-site contact forms remain manual and are never submitted by enrichment", () => {
  const sourceUrl = "https://austinpressurewashing.example/free-estimate";
  const discovery = extractContactDiscoveryFromPages("https://austinpressurewashing.example", [{
    url: sourceUrl,
    html: "<html><body><h1>Contact Austin Pressure Washing</h1><form><label>Name</label><input name='name'><label>Email</label><input name='email'><label>Project</label><textarea name='message'></textarea><button>Request quote</button></form></body></html>",
  }], noSiteProspect({ website: "https://austinpressurewashing.example" }));
  assert.equal(discovery.quoteFormUrl, sourceUrl);
  assert.equal(discovery.contactEvidence.find((item) => item.kind === "quote_form")?.extractionMethod, "form_markup");
  assert.equal(noSiteProspect().outreach, undefined);
});

test("Austin-style score clears the unchanged sales threshold once a verified route is found", async () => {
  const before = noSiteProspect();
  assert.ok((assessNoWebsiteOpportunity(before).presenceScores?.finalSalesScore ?? 0) >= 45);
  assert.equal(topProspectRejectionReason(before, assessNoWebsiteOpportunity(before), "growth", "written_only"), "Phone-only / written outreach blocked");
  const after = await enrichProspectWrittenContact(before, {
    now: () => now,
    fetchDocument: async () => facebookDocument("<p>Contact our office for an estimate.</p><a href='mailto:austinpressurewashing@gmail.com'>Email us</a>"),
  });
  assert.equal(topProspectRejectionReason(after.prospect, assessNoWebsiteOpportunity(after.prospect), "growth", "written_only"), null);
  assert.equal(after.prospect.outreach, undefined);
});

test("Top Prospects calls bounded enrichment after protection and website-fit gates but before artifact assessment", async () => {
  const worker = await readFile(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/engine/TopProspectsWorkspace.tsx", import.meta.url), "utf8");
  const currentResult = worker.indexOf("if (existingResult) return { qualified: existingResult.selected };");
  const contacted = worker.indexOf("if (contactedStatuses.has(existing.status))");
  const protection = worker.indexOf("if (prospectIsSuppressed(existing))");
  const previouslyReviewed = worker.indexOf("if (excludePreviouslyReviewed && previouslyReviewed)");
  const enrichment = worker.indexOf("existing = await enrichWrittenContactBeforeAssessment(existing, outreachPreference)");
  const assessment = worker.indexOf("const rejectionReason = await saveTopProspectResult(jobId, existing, mode, outreachPreference)");
  assert.ok(currentResult >= 0 && contacted > currentResult && protection > contacted && previouslyReviewed > protection);
  assert.ok(enrichment > previouslyReviewed && assessment > enrichment);
  assert.match(workspace, /Written contact enrichment:/);
  assert.equal(latestWrittenContactEnrichmentDiagnostic(noSiteProspect().activitySignals), null);
});

test("saved Top Prospects diagnostics preserve the inspectable written-contact result", () => {
  const diagnostics = discoveryDiagnosticsFromJson({
    leads: [],
    diagnostics: {
      rawProviderCount: 1,
      afterDistanceFilteringCount: 1,
      afterDuplicateFilteringCount: 1,
      afterQualificationFilteringCount: 1,
      returnedCount: 1,
      radiusKm: 50,
      categorySignals: [],
      sourceCounts: { osm: 0, google: 1, bing: 1, yelp: 0, yellowPages: 0 },
      providerDiagnostics: {},
      finalMergedCount: 1,
      websiteEnrichmentRecords: [{
        prospectId: "prospect-austin",
        businessName: "Austin Pressure Washing",
        trade: "Pressure Washing",
        city: "Austin",
        state: "TX",
        version: "no-site-enrichment-v3",
        outcome: "probable_no_owned_website",
        reason: "Two current providers corroborated the no-site evidence.",
        checkedAt: now.toISOString(),
        providerSources: ["bing", "google"],
        websiteCandidate: "",
        websiteVerificationStatus: "no_owned_website",
        websiteFitDisposition: "no_owned_website",
        writtenContactEnrichment: {
          version: "written-contact-enrichment-v1",
          outcome: "manual_social",
          checkedAt: now.toISOString(),
          reason: "An identity-matched official Facebook profile was found. Messaging remains manual.",
          providerSources: ["google"],
          sourceUrl: facebookUrl,
          routeKind: "facebook",
          extractionMethod: "existing_provider",
          requestCount: 1,
        },
      }],
    },
  });
  const record = diagnostics?.websiteEnrichmentRecords?.[0]?.writtenContactEnrichment;
  assert.equal(record?.outcome, "manual_social");
  assert.equal(record?.sourceUrl, facebookUrl);
  assert.equal(record?.extractionMethod, "existing_provider");
});
