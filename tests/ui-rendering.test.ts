import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState, LoadingState } from "../components/engine/EngineStates";
import { DiscoveryFunnel } from "../components/engine/DiscoveryFunnel";
import { ProspectWebsitePreview } from "../components/engine/ProspectWebsitePreview";
import type { DiscoveryDiagnostics } from "../lib/lead-discovery";
import { ProspectDetail, type DetailTab } from "../components/engine/ProspectDetail";
import { coreServiceTrades, seedProspects, withAnalysis, withOutreach, withPresenceGapReview, withPreview, type Prospect } from "../lib/prospect-engine";

const coreTradePhotoSlugs: Record<(typeof coreServiceTrades)[number], string> = {
  Roofing: "roofing",
  HVAC: "hvac",
  Plumbing: "plumbing",
  Electrical: "electrical",
  Landscaping: "landscaping",
  "Power Washing": "power-washing",
  Painting: "painting",
  Concrete: "concrete",
  Cleaning: "cleaning",
  "Tree Service": "tree-service",
  Fencing: "fencing",
  Flooring: "flooring",
  Remodeling: "remodeling",
};

function renderDetail(prospect: Prospect, detailTab: DetailTab) {
  return renderToStaticMarkup(createElement(ProspectDetail, {
    prospect,
    detailTab,
    setDetailTab: () => undefined,
    onAnalyze: () => undefined,
    onPresenceGap: () => undefined,
    onOutreach: () => undefined,
    onPreview: () => undefined,
    onStatus: () => undefined,
    note: "",
    setNote: () => undefined,
    addNote: () => undefined,
    updateSelected: () => undefined,
  }));
}

test("prospect details explain missing public contact data", () => {
  const prospect = { ...structuredClone(seedProspects[1]), phone: "", email: "" };
  const html = renderDetail(prospect, "Analysis");

  assert.match(html, /No public phone/);
  assert.match(html, /No public email/);
  assert.match(html, /Website not analyzed yet/);
});

test("no-website prospect detail shows presence-gap guidance without a website analysis action", () => {
  const prospect = structuredClone(seedProspects[0]);
  prospect.website = "";
  prospect.profileUrl = "https://facebook.com/local-roofing";
  prospect.prospectType = "no_website_social_only";
  prospect.classification = "social_only";
  prospect.recommendedContactMethod = "message_on_facebook";
  prospect.websiteStatus = "no_owned_website";
  prospect.websiteStatusDetail = "No owned website detected.";
  prospect.reviewCount = 24;
  prospect.activitySignals = ["public_reviews", "public_profile"];
  const html = renderDetail(prospect, "Analysis");

  assert.match(html, /Open public profile/);
  assert.match(html, /No owned website detected/);
  assert.match(html, /owning the customer journey/i);
  assert.match(html, /Social-Only Prospect/);
  assert.match(html, /Message on Facebook/);
  assert.match(html, /public reviews/);
  assert.doesNotMatch(html, /Analyze website/);
});

test("404 website shows broken status and never falls back to not analyzed", () => {
  const prospect = withPresenceGapReview(
    structuredClone(seedProspects[3]),
    "http_404",
    "Website returned HTTP 404.",
  );
  const html = renderDetail(prospect, "Analysis");

  assert.match(html, /Website returned 404/);
  assert.match(html, /Website returned HTTP 404/);
  assert.match(html, /Broken website/);
  assert.match(html, /Presence Gap Score/);
  assert.match(html, /Best outreach channel/);
  assert.match(html, /Re-check website/);
  assert.doesNotMatch(html, /Website not analyzed yet/);
});

test("untouched redesign prospect offers both website and no-website analysis paths", () => {
  const html = renderDetail(structuredClone(seedProspects[0]), "Analysis");

  assert.match(html, /Website not analyzed yet/);
  assert.match(html, /Analyze website/);
  assert.match(html, /Run No Website \/ Social-Only analysis/);
});

test("unapproved outreach renders compliance review and disabled copy controls", () => {
  const prospect = withOutreach(withAnalysis(structuredClone(seedProspects[0])));
  const html = renderDetail(prospect, "Outreach");

  assert.match(html, /Human review required/);
  assert.match(html, /postal address/i);
  assert.match(html, /Approve personal draft/);
  assert.match(html, /Copy concise draft/);
  assert.match(html, /disabled=""/);
});

test("phone-only outreach drafts show written-outreach block before approval", () => {
  const prospect = withOutreach({
    ...structuredClone(seedProspects[1]),
    email: "",
    contactFormUrl: "",
    profileUrl: "",
    classification: "phone_only",
    recommendedContactMethod: "needs_manual_contact_research",
  });
  const html = renderDetail(prospect, "Outreach");

  assert.match(html, /Written outreach is blocked/);
  assert.match(html, /Needs manual contact research/);
  assert.match(html, /Approve personal draft/);
  assert.match(html, /disabled=""/);
});

test("preview workspace renders the complete contractor strategy", () => {
  const prospect = withPreview(structuredClone(seedProspects[2]));
  const html = renderDetail(prospect, "Preview");

  assert.match(html, /Visual style direction/);
  assert.match(html, /Service page structure/);
  assert.match(html, /Trust strategy/);
  assert.match(html, /Lead capture/);
  assert.match(html, /Prospect-specific style profile/);
  assert.match(html, /Preview quality check/);
  assert.match(html, /Safety\/truthfulness/);
  assert.match(html, /Visual polish/);
  assert.match(html, /Brand signal/);
  assert.match(html, /Primary CTA/);
});

test("protected website preview uses the prospect style profile instead of WebWorkshop branding", () => {
  const prospect = withPreview({
    ...structuredClone(seedProspects[0]),
    businessName: "Blue Line Roofing",
    website: "https://bluelineroofing.example",
  });
  const html = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
    prospect,
    savedPreview: prospect.preview,
  }));

  assert.match(html, /Protected concept preview\. Not a live client website\./);
  assert.match(html, /Blue Line Roofing/);
  assert.match(html, /--prospect-primary:#174b78/);
  assert.match(html, /--prospect-accent:#2c94c6/);
  assert.match(html, /Request an estimate/);
  assert.match(html, /Representative image direction/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/roofing-hero\.jpg/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/roofing-service\.jpg/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/roofing-proof\.jpg/);
  assert.match(html, /data-fallback-src="\/engine-preview-assets\/trades\/roofing-hero\.svg"/);
  assert.match(html, /Representative roofing photo with roofline/);
  assert.match(html, /Representative trade image/);
  assert.match(html, /Replace with verified Blue Line Roofing photos before launch/);
  assert.match(html, /Sample layout content/);
  assert.match(html, /Why choose us/);
  assert.match(html, /Service area/);
  assert.match(html, /Call \(419\) 555-0142/);
  assert.match(html, /data-layout="(?:trust-led|clean-split)"/);
  assert.doesNotMatch(html, /picsum\.photos|honey|coffee|liquid/i);
  assert.doesNotMatch(html, /--preview-green|--preview-lime/);
  assert.doesNotMatch(html, /Concept prepared for manual review in WebWorkshop Prospect Engine/);
  assert.doesNotMatch(html, /prospect-preview-visual__mark|role="img"/);
});

test("HVAC public preview uses trade-specific equipment visuals instead of random stock imagery", () => {
  const prospect = withPreview({
    ...structuredClone(seedProspects.find((item) => item.trade === "HVAC") ?? seedProspects[0]),
    businessName: "Rick's Affordable Heating & Cooling",
    trade: "HVAC",
    city: "toledo",
    state: "oh",
    serviceArea: "toledo and nearby communities",
  });
  const html = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
    prospect,
    publicView: true,
    savedPreview: prospect.preview,
  }));

  assert.match(html, /Rick&#x27;s Affordable Heating &amp; Cooling/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/hvac-hero\.jpg/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/hvac-service\.jpg/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/hvac-detail\.jpg/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/hvac-support\.jpg/);
  assert.match(html, /\/engine-preview-assets\/trade-photos\/hvac-proof\.jpg/);
  assert.match(html, /data-fallback-src="\/engine-preview-assets\/trades\/hvac-hero\.svg"/);
  assert.match(html, /outdoor AC condenser beside a residential home/);
  assert.match(html, /furnace or air handler equipment and technician tools/);
  assert.match(html, /thermostat, vent, and home comfort detail/);
  assert.match(html, /HVAC in Toledo, OH/);
  assert.match(html, /Heating and cooling help without the runaround\./);
  assert.match(html, /A clearer way to schedule heating and cooling service\./);
  assert.match(html, /Heating and cooling repair/);
  assert.match(html, /Troubleshoot comfort problems, airflow issues, unusual sounds/);
  assert.match(html, /System installation/);
  assert.match(html, /Compare replacement or new-system options/);
  assert.match(html, /Maintenance and tune-ups/);
  assert.match(html, /Plan seasonal system checks, filter and airflow review/);
  assert.doesNotMatch(html, /Clear help for the work your property needs|Understand the scope, practical next steps|\btoledo\b/);
  const imageSources = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(imageSources.slice(0, 5), [
    "/engine-preview-assets/trade-photos/hvac-hero.jpg",
    "/engine-preview-assets/trade-photos/hvac-service.jpg",
    "/engine-preview-assets/trade-photos/hvac-detail.jpg",
    "/engine-preview-assets/trade-photos/hvac-support.jpg",
    "/engine-preview-assets/trade-photos/hvac-proof.jpg",
  ]);
  assert.equal(new Set(imageSources.slice(0, 5)).size, 5);
  assert.doesNotMatch(html, /picsum\.photos|honey|coffee|food|nature|abstract|HVAC system/i);
});

test("core trade previews render deterministic local imagery by default", () => {
  for (const trade of coreServiceTrades) {
    const prospect = withPreview({
      ...structuredClone(seedProspects[0]),
      businessName: `${trade} Sample Business`,
      trade,
    });
    const html = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
      prospect,
      publicView: true,
      savedPreview: prospect.preview,
    }));
    const slug = coreTradePhotoSlugs[trade];

    assert.match(html, new RegExp(`/engine-preview-assets/trade-photos/${slug}-hero\\.jpg`));
    assert.match(html, new RegExp(`/engine-preview-assets/trade-photos/${slug}-service\\.jpg`));
    assert.match(html, new RegExp(`/engine-preview-assets/trade-photos/${slug}-detail\\.jpg`));
    assert.match(html, new RegExp(`/engine-preview-assets/trade-photos/${slug}-support\\.jpg`));
    assert.match(html, new RegExp(`/engine-preview-assets/trade-photos/${slug}-proof\\.jpg`));
    assert.match(html, new RegExp(`data-fallback-src="/engine-preview-assets/trades/${slug}-hero\\.svg"`));
    assert.doesNotMatch(html, /picsum\.photos|loremflickr|placehold|honey|coffee|liquid|abstract/i);
    assert.doesNotMatch(html, /prospect-preview-visual__mark|prospect-preview-visual__details/);
  }
});

test("core trade photo library covers each preview section", () => {
  for (const slug of Object.values(coreTradePhotoSlugs)) {
    for (const slot of ["hero", "service", "detail", "support", "proof"] as const) {
      const asset = new URL(`../public/engine-preview-assets/trade-photos/${slug}-${slot}.jpg`, import.meta.url);
      assert.equal(existsSync(asset), true, `${slug}-${slot}.jpg should exist`);
      assert.ok(statSync(asset).size > 20_000, `${slug}-${slot}.jpg should be a real preview image`);
    }
  }
});

test("priority trades use matching preview image language", () => {
  const expected = [
    ["HVAC", /outdoor AC condenser/i],
    ["Roofing", /roofline, shingle detail/i],
    ["Plumbing", /under-sink service, visible pipes/i],
    ["Landscaping", /lawn, planting beds, patio edge/i],
    ["Electrical", /residential breaker panel service/i],
  ] as const;

  for (const [trade, pattern] of expected) {
    const prospect = withPreview({
      ...structuredClone(seedProspects[0]),
      businessName: `${trade} Preview Co.`,
      trade,
    });
    const html = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
      prospect,
      publicView: true,
      savedPreview: prospect.preview,
    }));

    assert.match(html, pattern);
    assert.doesNotMatch(html, /random|stock|placeholder|abstract visual panel/i);
  }
});

test("public website preview exposes only the prospect concept with no engine navigation", () => {
  const prospect = withPreview({
    ...structuredClone(seedProspects[0]),
    businessName: "Blue Line Roofing",
    notes: ["Private operator note"],
    analysis: withAnalysis(structuredClone(seedProspects[0])).analysis,
  });
  const html = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
    prospect,
    publicView: true,
    savedPreview: prospect.preview,
  }));

  assert.match(html, /Concept preview\. Not a live client website\./);
  assert.match(html, /data-preview-access="public"/);
  assert.doesNotMatch(html, /href="\/engine"|Back to Prospect Engine|Private operator note|Website score|Opportunity score/i);
});

test("no-website public preview uses supported-fact placeholders instead of invented proof", () => {
  const prospect = withPreview({
    ...structuredClone(seedProspects[0]),
    website: "",
    profileUrl: "https://facebook.com/local-roofing",
    prospectType: "no_website_social_only",
    classification: "social_only",
    recommendedContactMethod: "message_on_facebook",
  });
  const html = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
    prospect,
    publicView: true,
    savedPreview: prospect.preview,
  }));

  assert.match(html, /Project proof concept/);
  assert.match(html, /verified work/i);
  assert.match(html, /Approved project photos/);
  assert.match(html, /Sample layout content/);
  assert.match(html, /Replace with verified/);
  assert.doesNotMatch(html, /Recent local work|licensed|insured|award-winning|warranties/i);
});

test("shared loading and empty states provide useful operator guidance", () => {
  const loading = renderToStaticMarkup(createElement(LoadingState, {
    title: "Loading prospect workspace",
    body: "Retrieving the latest records.",
  }));
  const empty = renderToStaticMarkup(createElement(EmptyState, {
    title: "No prospects match",
    body: "Clear a filter to continue.",
  }));

  assert.match(loading, /role="status"/);
  assert.match(empty, /Clear a filter to continue/);
});

test("discovery funnel identifies each provider and the final merged count", () => {
  const html = renderToStaticMarkup(createElement(DiscoveryFunnel, {
    diagnostics: {
      rawProviderCount: 41,
      afterDistanceFilteringCount: 38,
      afterDuplicateFilteringCount: 27,
      afterQualificationFilteringCount: 18,
      returnedCount: 18,
      radiusKm: 50,
      categorySignals: ["craft=roofer"],
      sourceCounts: { osm: 7, google: 12, bing: 10, yelp: 8, yellowPages: 4 },
      providerDiagnostics: {
        osm: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 7, withinRadiusCount: 7, afterDeduplicationCount: 6, usableWebsiteCount: 4 },
        azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 10, withinRadiusCount: 9, afterDeduplicationCount: 8, usableWebsiteCount: 6 },
        googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        yelp: { configured: true, queryExecuted: true, status: "rate_limited", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0, retryCount: 2, httpStatus: 429 },
      },
      finalMergedCount: 27,
      tradeDiagnostics: [
        {
          trade: "Roofing",
          status: "partial",
          rawProviderCount: 20,
          withinRadiusCount: 19,
          afterDeduplicationCount: 13,
          usableWebsiteCount: 9,
          returnedCount: 8,
          rateLimitedProviders: ["yelp"],
          retryCount: 2,
          providerDiagnostics: {
            osm: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 7, withinRadiusCount: 7, afterDeduplicationCount: 6, usableWebsiteCount: 4 },
            azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 10, withinRadiusCount: 9, afterDeduplicationCount: 8, usableWebsiteCount: 6 },
            googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
            yelp: { configured: true, queryExecuted: true, status: "rate_limited", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0, retryCount: 2, httpStatus: 429 },
          },
        },
      ],
    },
  }));

  assert.match(html, /Azure Maps/);
  assert.match(html, /Google Places/);
  assert.match(html, /Provider Diagnostics/);
  assert.match(html, /API key configured/);
  assert.match(html, /Query executed/);
  assert.match(html, /Succeeded/);
  assert.match(html, /Rate limited/);
  assert.match(html, /HTTP status/);
  assert.match(html, /429/);
  assert.match(html, /Retries/);
  assert.match(html, /Raw records/);
  assert.match(html, /Within radius/);
  assert.match(html, /After deduplication/);
  assert.match(html, /Usable websites/);
  assert.match(html, /27<\/b> final merged records/);
  assert.match(html, /Trade Breakdown/);
  assert.match(html, /Roofing/);
  assert.match(html, /partial/);
  assert.match(html, /yelp/);
});

test("provider diagnostics remain visible for legacy jobs without provider details", () => {
  const legacy = {
    rawProviderCount: 7,
    afterDistanceFilteringCount: 7,
    afterDuplicateFilteringCount: 7,
    afterQualificationFilteringCount: 5,
    returnedCount: 5,
    radiusKm: 10,
    categorySignals: [],
    sourceCounts: { osm: 7, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
    finalMergedCount: 7,
  } as unknown as DiscoveryDiagnostics;
  const html = renderToStaticMarkup(createElement(DiscoveryFunnel, { diagnostics: legacy }));

  assert.match(html, /Provider Diagnostics/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /Azure Maps/);
  assert.match(html, /Google Places/);
  assert.match(html, /Yelp/);
  assert.equal((html.match(/Not recorded/g) ?? []).length, 12);
});
