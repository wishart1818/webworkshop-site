import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState, LoadingState } from "../components/engine/EngineStates";
import { DiscoveryFunnel } from "../components/engine/DiscoveryFunnel";
import { ProspectWebsitePreview } from "../components/engine/ProspectWebsitePreview";
import type { DiscoveryDiagnostics } from "../lib/lead-discovery";
import { ProspectDetail, type DetailTab } from "../components/engine/ProspectDetail";
import { seedProspects, withAnalysis, withOutreach, withPresenceGapReview, withPreview, type Prospect } from "../lib/prospect-engine";

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

test("preview workspace renders the complete contractor strategy", () => {
  const prospect = withPreview(structuredClone(seedProspects[2]));
  const html = renderDetail(prospect, "Preview");

  assert.match(html, /Visual style direction/);
  assert.match(html, /Service page structure/);
  assert.match(html, /Trust strategy/);
  assert.match(html, /Lead capture/);
  assert.match(html, /Prospect-specific style profile/);
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
  assert.match(html, /Why choose us/);
  assert.match(html, /Service area/);
  assert.match(html, /Call \(419\) 555-0142/);
  assert.match(html, /data-layout="(?:trust-led|clean-split)"/);
  assert.doesNotMatch(html, /--preview-green|--preview-lime/);
  assert.doesNotMatch(html, /Concept prepared for manual review in WebWorkshop Prospect Engine/);
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
  assert.doesNotMatch(html, /\/engine|Back to Prospect Engine|Private operator note|Website score|Opportunity score/i);
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
        yelp: { configured: true, queryExecuted: true, status: "timed_out", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      },
      finalMergedCount: 27,
    },
  }));

  assert.match(html, /Azure Maps/);
  assert.match(html, /Google Places/);
  assert.match(html, /Provider Diagnostics/);
  assert.match(html, /API key configured/);
  assert.match(html, /Query executed/);
  assert.match(html, /Succeeded/);
  assert.match(html, /Timed out/);
  assert.match(html, /Raw records/);
  assert.match(html, /Within radius/);
  assert.match(html, /After deduplication/);
  assert.match(html, /Usable websites/);
  assert.match(html, /27<\/b> final merged records/);
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
