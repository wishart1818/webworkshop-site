import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState, LoadingState } from "../components/engine/EngineStates";
import { DiscoveryFunnel } from "../components/engine/DiscoveryFunnel";
import { ProspectWebsitePreview } from "../components/engine/ProspectWebsitePreview";
import { SystemWorkspace } from "../components/engine/SystemWorkspace";
import { RecommendedMarketPresetCard } from "../components/engine/TopProspectsWorkspace";
import type { DiscoveryDiagnostics } from "../lib/lead-discovery";
import { ProspectDetail, publicPreviewUrlForProspect, type DetailTab } from "../components/engine/ProspectDetail";
import { coreServiceTrades, generateOutreach, seedProspects, withAnalysis, withOutreach, withPresenceGapReview, withPreview, type Prospect } from "../lib/prospect-engine";
import { resolvePreviewImages, validatePreviewImages } from "../lib/preview-image-resolver";
import { evaluatePreviewSendWorthiness } from "../lib/preview-send-worthiness";
import { recommendedMarketPresets } from "../lib/top-prospects";

const coreTradePhotoSlugs: Record<(typeof coreServiceTrades)[number], string> = {
  Roofing: "roofing",
  HVAC: "hvac",
  Plumbing: "plumbing",
  Electrical: "electrical",
  Landscaping: "landscaping",
  "Pressure Washing": "power-washing",
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
    onRegenerateOutreach: async () => undefined,
    onRegeneratePreview: async () => undefined,
    onCreateReviewPackage: async () => undefined,
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
  assert.match(html, /Why isn&#x27;t this being contacted\?/);
  assert.match(html, /Current bucket/);
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
  assert.match(html, /Exact email Auto Email Pilot would send/);
  assert.match(html, /Copy exact first email draft/);
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
  assert.match(html, /no email, contact form, or social message path is available/i);
  assert.match(html, /Needs manual contact research/);
  assert.match(html, /Approve personal draft/);
  assert.match(html, /disabled=""/);
});

test("Prospect Detail open preview uses public preview links instead of internal Preview tabs", () => {
  const token = "abcdefghijklmnopqrstuvwxyzABCDEF";
  const base = withPreview(withAnalysis(structuredClone(seedProspects[0])));
  const publicProspect = {
    ...base,
    outreach: generateOutreach(base, `https://webworkshop.dev/p/${token}`),
  };
  const protectedProspect = {
    ...base,
    outreach: generateOutreach(base, `https://webworkshop.dev/engine/previews/${base.id}`),
  };
  const html = renderDetail(publicProspect, "Preview");
  const detailSource = readFileSync(new URL("../components/engine/ProspectDetail.tsx", import.meta.url), "utf8");
  const engineSource = readFileSync(new URL("../components/ProspectEngine.tsx", import.meta.url), "utf8");

  assert.equal(publicPreviewUrlForProspect(publicProspect), `/p/${token}`);
  assert.equal(publicPreviewUrlForProspect(protectedProspect), "");
  assert.match(html, /Open preview/);
  assert.match(html, /View internal Preview tab/);
  assert.match(detailSource, /window\.location\.assign\(publicPreviewUrl\)/);
  assert.match(detailSource, /No public preview link is available yet/);
  assert.match(detailSource, /Create\/Refresh Review Package/);
  assert.match(engineSource, /href=\{publicPreviewUrl\}/);
  assert.doesNotMatch(engineSource, /href=\{`\/engine\/previews\/\$\{prospect\.id\}`\}/);
});

test("Prospect Engine overview renders clickable funnel diagnostics", () => {
  const source = readFileSync("components/ProspectEngine.tsx", "utf8");

  assert.match(source, /OperatorCommandBar/);
  assert.match(source, /Command Activity/);
  assert.match(source, /CommandActivityWorkspace/);
  assert.match(source, /Prospect Funnel/);
  assert.match(source, /Exclusive Current-Disposition Funnel/);
  assert.match(source, /Overlapping Attributes/);
  assert.match(source, /Current Inventory/);
  assert.match(source, /Explain Prospect Counts/);
  assert.match(source, /Difference = 0/);
  assert.match(source, /engine-funnel-count/);
  assert.match(source, /onOpenFilter/);
  assert.match(source, /Filter by prospect funnel bucket/);
  assert.match(source, /engine-overview-cards/);
  assert.match(source, /Operational dashboard/);
  assert.match(source, /function MetricCard/);
  assert.match(source, /Email Ready/);
  assert.match(source, /Manual DM/);
  assert.match(source, /Phone Only/);
  assert.match(source, /Blocked \/ Suppressed/);
  assert.match(source, /Replies/);
  assert.match(source, /Follow-ups/);
  assert.match(source, /Why this action\?/);
});

test("Prospect Engine shell uses compact navigation, density, page tabs, and a single safety strip", () => {
  const source = readFileSync("components/ProspectEngine.tsx", "utf8");
  const css = readFileSync("app/engine/engine.css", "utf8");

  assert.match(source, /workspaceIcons/);
  assert.match(source, /primaryMobileTabs/);
  assert.match(source, /moreMobileTabs/);
  assert.match(source, /MobileBottomNav/);
  assert.match(source, /engine-mobile-more-sheet/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /engine-shell--nav-collapsed/);
  assert.match(source, /Interface density/);
  assert.match(source, /webworkshop-engine-density/);
  assert.match(source, /CompactSafetyStatus/);
  assert.match(source, /ActionMenu/);
  assert.match(source, /shortActionLabel/);
  assert.match(source, /engine-action-label-full/);
  assert.match(source, /engine-action-label-short/);
  assert.match(source, /Open Preview/);
  assert.match(source, /Rewrite outreach/);
  assert.match(source, /Regenerate with fixes/);
  assert.match(source, /activeFilterChips/);
  assert.match(source, /Email mode/);
  assert.match(source, /DMs\/forms\/calls\/Looms/);
  assert.match(source, /prospectViewLabels/);
  assert.match(source, /pipelineViewLabels/);
  assert.match(source, /Next action/);
  assert.match(source, /SectionTabs/);
  assert.match(css, /\.engine-section-tabs/);
  assert.match(css, /\.engine-next-action-card/);
  assert.match(css, /--engine-radius-sm/);
  assert.match(css, /--engine-shadow-sheet/);
  assert.match(css, /--engine-duration/);
  assert.match(css, /\.engine-compact-safety/);
  assert.match(css, /\.engine-status-badge/);
  assert.match(css, /\.engine-skeleton/);
  assert.match(css, /\.engine-toast/);
  assert.match(css, /\.engine-overview-cards/);
  assert.match(css, /\.engine-metric-card/);
  assert.match(css, /\.engine-density--comfortable/);
  assert.match(css, /\.engine-shell--nav-collapsed/);
  assert.match(css, /\.engine-mobile-bottom-nav/);
  assert.match(css, /\.engine-mobile-more-sheet/);
  assert.match(css, /\.engine-row-actions/);
  assert.match(css, /\.engine-filter-drawer/);
  assert.match(css, /\.engine-mobile-action-bar/);
});

test("global operator command bar exposes search, command help, previews, and safe receipts", () => {
  const source = readFileSync("components/engine/OperatorCommandBar.tsx", "utf8");

  assert.match(source, /webworkshop-command-center-expanded/);
  assert.match(source, /engine-command-center__summary/);
  assert.match(source, /Search or run a command/);
  assert.match(source, /is-mobile-expanded/);
  assert.match(source, /Search prospects or paste a WebWorkshop command/);
  assert.match(source, /Auto detect/);
  assert.match(source, /Command understood/);
  assert.match(source, /Confirm and Apply/);
  assert.match(source, /Copy Result for ChatGPT/);
  assert.match(source, /Command Activity/);
  assert.match(source, />History<\/button>/);
  assert.match(source, /Outreach sent/);
  assert.doesNotMatch(source, /eval\(|new Function|child_process|shell_command|runSql|runJavaScript/i);
});

test("Autonomous Growth keeps important controls visible before advanced settings", () => {
  const source = readFileSync("components/engine/AutonomousGrowthWorkspace.tsx", "utf8");

  assert.match(source, /Autonomous Growth Control Center/);
  assert.match(source, /autonomousGrowthViewLabels/);
  assert.match(source, /Pilot/);
  assert.match(source, /Campaigns/);
  assert.match(source, /Queues/);
  assert.match(source, /Activity/);
  assert.match(source, /Settings/);
  assert.match(source, /webworkshop-autonomous-growth-view/);
  assert.match(source, /Open Settings/);
  assert.match(source, /Advanced Settings/);
  assert.match(source, /Unsaved changes/);
  assert.match(source, /beforeunload/);
  assert.match(source, /Contact forms: never automated/);
  assert.match(source, /Phone calls: never automated/);
  assert.match(source, /Looms: manual only/);
});

test("Operator Test Center and System use compact subnavigation with details preserved", () => {
  const testCenterSource = readFileSync("components/engine/OperatorTestCenterWorkspace.tsx", "utf8");
  const systemSource = readFileSync("components/engine/SystemWorkspace.tsx", "utf8");

  assert.match(testCenterSource, /testCenterViewLabels/);
  assert.match(testCenterSource, /Readiness/);
  assert.match(testCenterSource, /Safe Tests/);
  assert.match(testCenterSource, /Results/);
  assert.match(testCenterSource, /Diagnostics/);
  assert.match(testCenterSource, /webworkshop-test-center-view/);
  assert.match(testCenterSource, /Provider Smoke Test finished/);
  assert.match(testCenterSource, /setActiveView\("diagnostics"\)/);
  assert.match(systemSource, /systemViewLabels/);
  assert.match(systemSource, /Providers/);
  assert.match(systemSource, /Environment Status/);
  assert.match(systemSource, /Technical Details/);
  assert.match(systemSource, /EmailReadinessPanel/);
  assert.match(systemSource, /webworkshop-system-view/);
  assert.match(systemSource, /LaunchReadinessCard/);
});

test("Autonomous Growth packages expose why-not-contacted diagnostics", () => {
  const source = readFileSync("components/engine/AutonomousGrowthWorkspace.tsx", "utf8");

  assert.match(source, /Why isn&apos;t this being contacted\?/);
  assert.match(source, /Current bucket/);
  assert.match(source, /Blocked because/);
  assert.match(source, /Next step/);
});

test("preview workspace renders the complete contractor strategy", () => {
  const prospect = withPreview(structuredClone(seedProspects[2]));
  const html = renderDetail(prospect, "Preview");

  assert.match(html, /Preview send-worthiness verdict/);
  assert.match(html, /Improve preview/);
  assert.match(html, /Open Public Preview/);
  assert.match(html, /Regenerate Preview/);
  assert.match(html, /Regenerate with feedback/);
  assert.match(html, /Advanced preview details/);
  assert.match(html, /Generator/);
  assert.match(html, /photo-led-v3/);
  assert.match(html, /Visual style direction/);
  assert.match(html, /Service page structure/);
  assert.match(html, /Trust strategy/);
  assert.match(html, /Lead capture/);
  assert.match(html, /Prospect-specific style profile/);
  assert.match(html, /Preview art direction/);
  assert.match(html, /Image treatment/);
  assert.match(html, /CTA treatment/);
  assert.match(html, /Preview quality check/);
  assert.match(html, /Safety\/truthfulness/);
  assert.match(html, /Visual polish/);
  assert.match(html, /Brand signal/);
  assert.match(html, /Primary CTA/);
  assert.match(html, /Image strategy/);
  assert.match(html, /Distinct images/);
  assert.match(html, /Nothing is sent/);
});

test("preview regeneration controls use one protected action with loading and safe feedback", () => {
  const source = readFileSync("components/ProspectEngine.tsx", "utf8");
  const route = readFileSync("app/api/engine/outreach-sync/route.ts", "utf8");
  const handler = source.slice(source.indexOf("async function regenerateSelectedPreview"), source.indexOf("async function createSelectedReviewPackage"));

  assert.match(source, /action: "regenerate_prospect_preview"/);
  assert.match(source, /prospectId: target\.id/);
  assert.match(source, /feedback/);
  assert.match(source, /previewRegeneratingId === target\.id/);
  assert.match(source, /previewRegenerationBlockReason\(target\)/);
  assert.match(source, /setPreviewActionMessage\(\{ tone: "success"/);
  assert.match(source, /Existing public preview was preserved/);
  assert.match(source, /onRegeneratePreview\("", prospect\)/);
  assert.match(source, /disabled=\{previewRegeneratingId === prospect\.id\}/);
  assert.match(source, /typeof children === "function" \? children\(close\) : children/);
  assert.doesNotMatch(handler, /const updated = regeneratePreview\(target/);
  assert.doesNotMatch(handler, /queuePersist\(updated\)/);
  assert.match(route, /if \(payload\.action === "regenerate_prospect_preview"\)/);
  assert.match(route, /previewRegenerationBlockReason\(prospect\)/);
  assert.match(route, /regeneratePreview\(prospect, payload\.feedback \?\? ""\)/);
  assert.match(route, /evaluatePreviewSendWorthiness\(updated/);
  assert.match(route, /getPublicProspectPreview\(publicPreviewToken\)/);
  assert.match(route, /publicPreviewVerified/);
  assert.match(route, /await saveProspect\(prospect\)/);
  assert.match(route, /revalidatePath\(`\/p\/\$\{publicPreviewToken\}`\)/);
  assert.match(route, /createOrRefreshAutonomousReviewPackageForProspect\(saved\.id\)/);
  assert.match(route, /Nothing was sent/);
});

test("prospect detail keeps More scoped to the mobile action menu only", () => {
  const prospect = withPreview(withOutreach(withAnalysis(structuredClone(seedProspects[0]))));
  const html = renderDetail(prospect, "Preview");
  const detailSource = readFileSync("components/engine/ProspectDetail.tsx", "utf8");

  assert.equal((html.match(/<summary>More<\/summary>/g) ?? []).length, 1);
  assert.match(detailSource, /setMobileActionMenuOpen\(false\); void onRegeneratePreview\(\)/);
  assert.match(detailSource, /disabled=\{previewRegenerating\}/);
  assert.doesNotMatch(detailSource.slice(detailSource.indexOf("function PreviewView")), /<summary>More<\/summary>/);
});

test("Prospects workspace menus close on outside, Escape, and prospect switching", () => {
  const source = readFileSync("components/ProspectEngine.tsx", "utf8");
  const detailSource = readFileSync("components/engine/ProspectDetail.tsx", "utf8");

  assert.match(source, /function ActionMenu\(\{ children, closeSignal, label \}/);
  assert.match(source, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(source, /document\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /<ActionMenu closeSignal=\{selectedId\} label="More">/);
  assert.match(detailSource, /setMobileActionMenuOpen\(false\);[\s\S]*setPreviewOpenMessage\(""\);[\s\S]*detailBodyRef\.current\?\.scrollTo\(\{ top: 0 \}\);/);
  assert.match(detailSource, /mobileMenuRef/);
  assert.match(detailSource, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(detailSource, /document\.addEventListener\("keydown", handleKeyDown\)/);
});

test("Prospects workspace uses independent desktop panes without document scroll jumping", () => {
  const css = readFileSync("app/engine/engine.css", "utf8");

  assert.match(css, /\.engine-workspace\s*{[\s\S]*height: calc\(100dvh - 15\.25rem\);[\s\S]*overflow: hidden;/);
  assert.match(css, /\.engine-list-panel\s*{[\s\S]*overflow: auto;[\s\S]*overscroll-behavior: contain;/);
  assert.match(css, /\.engine-detail\s*{[\s\S]*grid-template-rows:[\s\S]*minmax\(0, 1fr\)/);
  assert.match(css, /\.engine-detail__body\s*{[\s\S]*overflow: auto;[\s\S]*overscroll-behavior: contain;/);
  assert.match(css, /\.engine-table__head\s*{[\s\S]*position: sticky;[\s\S]*top: 0;/);
  assert.match(css, /@media \(max-width: 880px\)[\s\S]*\.engine-workspace\s*{[\s\S]*display: block;/);
  assert.match(css, /@media \(max-width: 880px\)[\s\S]*\.engine-list-panel\s*{[\s\S]*overflow: visible;/);
});

test("preview review starts with a send-worthiness verdict and focused improvement controls", () => {
  const prospect = withPreview(withOutreach(withAnalysis(structuredClone(seedProspects[0]))));
  prospect.outreach!.detailed = `${prospect.outreach!.detailed}\n\nSounds good - here's the preview:\nhttps://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF`;
  const html = renderDetail(prospect, "Preview");

  assert.match(html, /Preview send-worthiness verdict/);
  assert.match(html, /SEND-WORTHY|NEEDS IMPROVEMENT|BLOCKED/);
  assert.match(html, /Most important issue/);
  assert.match(html, /Images resolved/);
  assert.match(html, /Focused preview improvements/);
  assert.match(html, /Stronger hero/);
  assert.match(html, /Better trade-specific photos/);
  assert.match(html, /Replace repeated images/);
  assert.match(html, /Advanced preview details/);
  assert.match(html, /Nothing is sent/);
});

test("missing public preview link blocks send-worthiness and points to review package creation", () => {
  const prospect = withPreview(withOutreach(withAnalysis(structuredClone(seedProspects[0]))));
  prospect.outreach!.detailed = prospect.outreach!.detailed.replace(/https:\/\/webworkshop\.dev\/p\/[A-Za-z0-9_-]+/g, "");
  const verdict = evaluatePreviewSendWorthiness(prospect, { publicPreviewUrl: "", publicPreviewVerified: false });
  const html = renderDetail(prospect, "Preview");

  assert.equal(verdict.verdict, "blocked");
  assert.match(verdict.primaryWarning, /public \/p\/ preview link/i);
  assert.match(html, /Create public preview/);
  assert.match(html, /Public link<\/span><b>Missing/);
});

test("send-worthiness blocks internal wording and works across representative trades", () => {
  const pressureWashing = withPreview(withOutreach(withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Pinnacle Pressure Washing of Toledo",
    trade: "Pressure Washing",
    city: "Toledo",
    state: "OH",
  })));
  const landscaping = withPreview(withOutreach(withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Greenline Landscaping",
    trade: "Landscaping",
    city: "Tampa",
    state: "FL",
  })));
  const roofing = withPreview(withOutreach(withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Summit Roofing",
    trade: "Roofing",
    city: "Charlotte",
    state: "NC",
  })));
  const internalWording = {
    ...pressureWashing,
    preview: {
      ...pressureWashing.preview!,
      hero: `${pressureWashing.preview!.hero} replace with verified photos before launch`,
    },
  };

  for (const prospect of [pressureWashing, landscaping, roofing]) {
    const verdict = evaluatePreviewSendWorthiness(prospect, {
      publicPreviewUrl: "/p/abcdefghijklmnopqrstuvwxyzABCDEF",
      publicPreviewVerified: true,
    });
    assert.notEqual(verdict.verdict, "blocked");
    assert.ok(verdict.resolvedImageCount >= 6);
  }

  const blocked = evaluatePreviewSendWorthiness(internalWording, {
    publicPreviewUrl: "/p/abcdefghijklmnopqrstuvwxyzABCDEF",
    publicPreviewVerified: true,
  });
  assert.equal(blocked.verdict, "blocked");
  assert.match(blocked.primaryWarning, /Internal or placeholder wording/i);
});

test("condensed engine uses one status indicator and authoritative ready review count", () => {
  const source = readFileSync("components/ProspectEngine.tsx", "utf8");
  const css = readFileSync("app/engine/engine.css", "utf8");

  assert.match(source, /currentInventory\.readyForReview/);
  assert.match(source, /setFunnelFilter\("ready_for_review"\)/);
  assert.match(source, /syncState === "error" \? \(/);
  assert.doesNotMatch(source, /PostgreSQL synced[\s\S]*Development memory[\s\S]*engine-sync/);
  assert.match(css, /\.engine-filter-drawer\s*{[\s\S]*position: sticky;[\s\S]*z-index: 24;/);
  assert.match(css, /\.engine-table__head,\s*\.engine-table > article\s*{[\s\S]*minmax\(18rem, 1\.25fr\)/);
  assert.match(css, /\.engine-table-main\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("preview action bar has sticky, mobile-safe controls", () => {
  const css = readFileSync("app/engine/engine.css", "utf8");

  assert.match(css, /\.engine-preview-action-bar\s*{[\s\S]*position: sticky;[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.engine-preview-feedback textarea/);
  assert.match(css, /\.engine-preview-status-card\s*{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.engine-preview-action-bar\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
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
  assert.match(html, /data-hero-treatment="(?:proof-forward|clean-editorial)"/);
  assert.match(html, /data-layout-direction="(?:split-photo|full-bleed-photo|image-led-grid|dark-premium|light-editorial|bold-local-service)"/);
  assert.match(html, /data-card-style="(?:clean-proof-tiles|layered-photo-cards)"/);
  assert.match(html, /data-rhythm="(?:proof-led|calm-premium)"/);
  assert.match(html, /Roofing services/);
  assert.match(html, /images\.unsplash\.com\/photo-/);
  assert.match(html, /data-preview-image-source="curated-stock-photo-library"/);
  assert.equal(prospect.preview?.resolvedImages?.sourceStatus, "curated stock photo library");
  assert.match(html, /Service detail/);
  assert.match(html, /Services, photos, and contact options work together/);
  assert.match(html, /Service guide/);
  assert.match(html, /Quote request process/);
  assert.match(html, /Get from question to quote faster/);
  assert.match(html, /Gallery/);
  assert.match(html, /Service comparison/);
  assert.match(html, /Questions/);
  assert.match(html, /Preview only: this concept form is not connected/);
  assert.match(html, /prospect-preview-mobile-cta/);
  assert.match(html, /Why choose us/);
  assert.match(html, /Service area/);
  assert.match(html, /Call \(419\) 555-0142/);
  assert.match(html, /data-layout="(?:trust-led|clean-split)"/);
  assert.doesNotMatch(html, /picsum\.photos|honey|coffee|liquid/i);
  assert.doesNotMatch(html, /\/engine-preview-assets\/trade-photos\/roofing-hero\.jpg/);
  assert.doesNotMatch(html, /--preview-green|--preview-lime/);
  assert.doesNotMatch(html, /Concept prepared for manual review in WebWorkshop Prospect Engine/);
  assert.doesNotMatch(html, /Representative image direction|Representative trade image|Replace with verified|Sample layout content|Suggested proof section|Proof concept/i);
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
  prospect.trade = "hvac" as Prospect["trade"];
  const html = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
    prospect,
    publicView: true,
    savedPreview: prospect.preview,
  }));

  assert.match(html, /Rick&#x27;s Affordable Heating &amp; Cooling/);
  assert.match(html, /images\.unsplash\.com\/photo-/);
  assert.match(html, /data-hero-treatment="service-command"/);
  assert.match(html, /data-card-style="technical-service-panels"/);
  assert.match(html, /data-rhythm="service-dense"/);
  assert.match(html, /data-preview-image-source="curated-stock-photo-library"/);
  assert.match(html, /outdoor AC condenser|HVAC unit|air conditioner/i);
  assert.match(html, /technician tools|service call|equipment/i);
  assert.match(html, /home comfort|thermostat-ready home|air conditioner/i);
  assert.match(html, /HVAC in Toledo, OH/);
  assert.match(html, /Heating and cooling help without the runaround\./);
  assert.match(html, /A clearer way to schedule heating and cooling service\./);
  assert.match(html, /Heating and cooling repair/);
  assert.match(html, /Troubleshoot comfort problems, airflow issues, unusual sounds/);
  assert.match(html, /System installation/);
  assert.match(html, /Compare replacement or new-system options/);
  assert.match(html, /Maintenance and tune-ups/);
  assert.match(html, /Plan seasonal system checks, filter and airflow review/);
  assert.match(html, /Service guide/);
  assert.match(html, /Route comfort problems to the right service\./);
  assert.match(html, /FAQ|Questions/);
  assert.match(html, /prospect-preview-lightbox/);
  assert.match(html, /type="range"/);
  assert.match(html, /required=""/);
  assert.doesNotMatch(html, /Recent local work|Our work/);
  assert.doesNotMatch(html, /Clear help for the work your property needs|Understand the scope, practical next steps|\btoledo\b|Representative image direction|Replace with verified|Sample layout content/);
  const imageSources = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(imageSources.slice(0, 5).every((src) => src.includes("images.unsplash.com/photo-")));
  assert.ok(new Set(imageSources.slice(0, 5)).size >= 4);
  assert.ok(new Set(imageSources).size >= 5);
  assert.equal(prospect.preview?.resolvedImages?.sourceStatus, "curated stock photo library");
  assert.doesNotMatch(html, /picsum\.photos|honey|coffee|food|nature|abstract|HVAC system/i);
});

test("core trade previews render deterministic photo imagery by default", () => {
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

    assert.match(html, /images\.unsplash\.com\/photo-/);
    assert.match(html, /data-preview-image-source="curated-stock-photo-library"/);
    assert.equal(prospect.preview?.resolvedImages?.sourceStatus, "curated stock photo library");
    assert.match(html, /prospect-preview-gallery/);
    assert.match(html, /prospect-preview-faq/);
    assert.match(html, /prospect-preview-mobile-cta/);
    assert.doesNotMatch(html, /\/engine-preview-assets\/trade-photos|picsum\.photos|loremflickr|placehold|honey|coffee|liquid|abstract/i);
    assert.doesNotMatch(html, /Representative image direction|Replace with verified|Sample layout content|Suggested proof section|Proof concept/i);
    assert.doesNotMatch(html, /prospect-preview-visual__mark|prospect-preview-visual__details/);
  }
});

test("preview image resolver creates distinct section intents and matching pressure washing imagery", () => {
  const prospect = withPreview({
    ...structuredClone(seedProspects[0]),
    businessName: "MC Pressure Washing FL",
    trade: "Pressure Washing",
    city: "tampa",
    state: "FL",
  });
  const services = [
    { title: "House washing", description: "Exterior siding and trim cleaning." },
    { title: "Concrete cleaning", description: "Driveways, walks, and patios." },
    { title: "Roof and soft washing", description: "Sensitive exterior surfaces." },
  ] as const;
  const images = resolvePreviewImages(prospect, services, {});
  const firstVisibleImages = [images.hero, ...images.services].map((image) => image.src);
  const intentText = images.intents.map((intent) => `${intent.query} ${intent.keywords.join(" ")}`).join(" ");

  assert.equal(images.providerStatus, "not configured");
  assert.equal(images.sourceStatus, "curated stock photo library");
  assert.equal(new Set(firstVisibleImages).size, 4);
  assert.ok(firstVisibleImages.every((src) => src.includes("images.unsplash.com/photo-")));
  assert.ok(validatePreviewImages([images.hero, ...images.services, ...images.gallery]).distinctImageCount >= 5);
  assert.match(intentText, /house washing/i);
  assert.match(intentText, /siding/i);
  assert.match(intentText, /concrete/i);
  assert.match(intentText, /driveway/i);
  assert.match(intentText, /roof/i);
  assert.match(intentText, /soft washing/i);
  assert.equal(validatePreviewImages([images.hero, ...images.services, ...images.gallery]).ok, true);
});

test("two pressure washing public previews are photo-led but not visual duplicates", () => {
  const first = withPreview({
    ...structuredClone(seedProspects[0]),
    businessName: "MC Pressure Washing FL",
    trade: "Pressure Washing",
    city: "tampa",
    state: "FL",
    serviceArea: "Tampa, FL",
  });
  const second = withPreview({
    ...structuredClone(seedProspects[0]),
    id: "styles-power-wash",
    businessName: "Styles Power Wash",
    trade: "Pressure Washing",
    city: "st augustine",
    state: "FL",
    serviceArea: "St Augustine, FL",
  });
  const firstHtml = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
    prospect: first,
    publicView: true,
    savedPreview: first.preview,
  }));
  const secondHtml = renderToStaticMarkup(createElement(ProspectWebsitePreview, {
    prospect: second,
    publicView: true,
    savedPreview: second.preview,
  }));
  const firstHero = first.preview?.resolvedImages?.hero.src;
  const secondHero = second.preview?.resolvedImages?.hero.src;

  assert.match(firstHtml, /MC Pressure Washing FL/);
  assert.match(secondHtml, /Styles Power Wash/);
  assert.match(firstHtml, /Tampa, FL/);
  assert.match(secondHtml, /St Augustine, FL/);
  assert.ok(firstHero?.includes("images.unsplash.com/photo-"));
  assert.ok(secondHero?.includes("images.unsplash.com/photo-"));
  assert.notEqual(firstHero, secondHero);
  assert.notEqual(first.preview?.layoutDirection, undefined);
  assert.notEqual(second.preview?.layoutDirection, undefined);
  assert.notEqual(
    `${first.preview?.layoutDirection}:${first.preview?.resolvedImages?.hero.src}`,
    `${second.preview?.layoutDirection}:${second.preview?.resolvedImages?.hero.src}`,
  );
  assert.doesNotMatch(`${firstHtml}\n${secondHtml}`, /A cleaner exterior starts with a clear quote|Services explained clearly|The contact path stays visible and direct|Representative image direction|proof concept/i);
});

test("preview image resolver supports configured stock manifests without exposing provider secrets", () => {
  const prospect = withPreview({
    ...structuredClone(seedProspects[2]),
    trade: "Landscaping",
    city: "Tampa",
    state: "FL",
  });
  const services = [
    { title: "Landscape design", description: "Outdoor plans." },
    { title: "Installation", description: "Plants and beds." },
    { title: "Seasonal maintenance", description: "Recurring care." },
  ] as const;
  const manifest = Array.from({ length: 10 }, (_, index) => `https://images.example.com/landscaping-${index + 1}.jpg`);
  const images = resolvePreviewImages(prospect, services, {
    PREVIEW_STOCK_IMAGE_MANIFEST_JSON: JSON.stringify([...manifest, "javascript:alert(1)", "not a url"]),
    PREVIEW_STOCK_API_KEY: "secret-key-that-must-not-render",
  });
  const renderedSources = [images.hero, ...images.services, ...images.gallery, images.beforeAfter, images.process, images.cta].map((image) => image.src).join(" ");

  assert.equal(images.providerStatus, "configured");
  assert.equal(images.sourceStatus, "configured stock provider");
  assert.match(images.hero.src, /^https:\/\/images\.example\.com\/landscaping-1\.jpg/);
  assert.doesNotMatch(renderedSources, /secret-key-that-must-not-render|javascript:|not a url/);
  assert.equal(validatePreviewImages([images.hero, ...images.services, ...images.gallery]).ok, true);
});

test("local illustration fallback library remains available but is not the default", () => {
  for (const slug of Object.values(coreTradePhotoSlugs)) {
    for (const slot of ["hero", "service", "detail", "support", "proof"] as const) {
      const asset = new URL(`../public/engine-preview-assets/trade-photos/${slug}-${slot}.jpg`, import.meta.url);
      assert.equal(existsSync(asset), true, `${slug}-${slot}.jpg should exist`);
    }
  }
});

test("priority trades use matching preview image language", () => {
  const expected = [
    ["HVAC", /outdoor AC condenser|HVAC unit|air conditioner/i],
    ["Roofing", /roofer|roof repair|shingle|roofline/i],
    ["Plumbing", /under-sink|plumber|fixture|pipes/i],
    ["Landscaping", /landscaping worker|planting|lawn|outdoor space/i],
    ["Electrical", /electrician|breaker panel|wiring|lighting/i],
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
    assert.doesNotMatch(html, /random stock|placeholder|abstract visual panel|Representative image direction/i);
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
  assert.doesNotMatch(html, /href="\/engine"|Back to Prospect Engine|Private operator note|Website score|Opportunity score|internal QA|generator notes/i);
});

test("no-website public preview stays customer-facing without invented proof", () => {
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

  assert.match(html, /Service guide/);
  assert.match(html, /Gallery/);
  assert.match(html, /Preview only: this concept form is not connected/);
  assert.match(html, /Concept preview\. Not a live client website\./);
  assert.doesNotMatch(html, /Suggested proof section|verified photos|Suggested project context|Sample layout content|Replace with verified|proof concept/i);
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

test("recommended market cards render visible actions above the city list", () => {
  const florida = recommendedMarketPresets.find((preset) => preset.name === "Florida");
  assert.ok(florida);
  const html = renderToStaticMarkup(createElement(RecommendedMarketPresetCard, {
    preset: florida,
    onUseMarket: () => undefined,
    onAddCities: () => undefined,
    onUseRecommendedTrades: () => undefined,
    onUseTrade: () => undefined,
  }));

  assert.match(html, /aria-label="Florida market actions"/);
  assert.match(html, /engine-market-actions/);
  assert.equal((html.match(/Use this market/g) ?? []).length, 1);
  assert.equal((html.match(/Add to current cities/g) ?? []).length, 1);
  assert.equal((html.match(/Use recommended trades/g) ?? []).length, 1);
  assert.ok(html.indexOf("Use this market") < html.indexOf("Tampa, FL"));
  assert.match(html, /aria-label="Use Florida with Pressure Washing"/);
  assert.match(html, /type="button"/);
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
        googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0, endpointVersion: "New" },
        yelp: { configured: true, queryExecuted: true, status: "rate_limited", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0, retryCount: 2, httpStatus: 429 },
      },
      finalMergedCount: 27,
      cityDiagnostics: [
        {
          city: "Sylvania",
          state: "OH",
          label: "Sylvania, OH",
          status: "failed",
          requestedCount: 17,
          rawProviderCount: 0,
          withinRadiusCount: 0,
          afterDeduplicationCount: 0,
          usableWebsiteCount: 0,
          returnedCount: 0,
          providersAttempted: ["osm"],
          skippedCount: 0,
          qualifiedCount: 0,
          mainSkipReasons: ["Provider unavailable or timed out"],
          providerDiagnostics: {
            osm: { configured: true, queryExecuted: true, status: "failed", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
            azureMaps: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
            googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
            yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          },
        },
      ],
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
  assert.match(html, /Required env var/);
  assert.match(html, /Env var present/);
  assert.match(html, /Can run without API key/);
  assert.match(html, /Endpoint/);
  assert.match(html, /New/);
  assert.match(html, /Query executed/);
  assert.match(html, /Succeeded/);
  assert.match(html, /Rate limited/);
  assert.match(html, /Not configured/);
  assert.match(html, /HTTP status/);
  assert.match(html, /429/);
  assert.match(html, /Retries/);
  assert.match(html, /Raw records/);
  assert.match(html, /Within radius/);
  assert.match(html, /After deduplication/);
  assert.match(html, /Usable websites/);
  assert.match(html, /27<\/b> final merged records/);
  assert.match(html, /Trade Breakdown/);
  assert.match(html, /City Breakdown/);
  assert.match(html, /Sylvania, OH/);
  assert.match(html, /Provider unavailable or timed out/);
  assert.match(html, /Roofing/);
  assert.match(html, /partial/);
  assert.match(html, /yelp/);
});

test("system workspace renders the protected self-check report and action", () => {
  const html = renderToStaticMarkup(createElement(SystemWorkspace, {
    system: {
      status: "development",
      checks: {
        database: { configured: true, reachable: true, message: "PostgreSQL is reachable." },
        authentication: { configured: true, message: "Engine access credentials are configured." },
      },
      auditEvents: [],
      providerCoverage: {
        level: "limited",
        label: "Limited provider setup",
        summary: "Only Azure Maps/Bing and OpenStreetMap-style coverage are available.",
        recommendation: "Provider coverage is limited. For better local business discovery, configure Google Places and/or Yelp.",
        googleConfigured: false,
        yelpConfigured: false,
        azureOrBingConfigured: true,
      },
      providerHealth: [
        { provider: "osm", label: "OpenStreetMap", enabled: true, requiredEnvVarName: "Not required", envVarPresent: null, canRunWithoutApiKey: true, lastAttemptedQuery: "Not run", lastStatus: "not_run", lastHttpStatus: "None", lastSafeErrorMessage: "No provider attempt recorded yet.", failureType: "none" },
        { provider: "azureMaps", label: "Azure Maps", enabled: false, requiredEnvVarName: "AZURE_MAPS_API_KEY or BING_MAPS_API_KEY", envVarPresent: false, canRunWithoutApiKey: false, lastAttemptedQuery: "Not run", lastStatus: "not_run", lastHttpStatus: "None", lastSafeErrorMessage: "No provider attempt recorded yet.", failureType: "none" },
      ],
      selfCheck: {
        overallStatus: "Needs attention",
        lastRunAt: "2026-07-03T12:00:00.000Z",
        passed: [{ key: "supplier_filter", label: "Supplier/supply bad-fit filter works", status: "passed", reason: "D & D Landscaping Supply is blocked." }],
        warnings: [{ key: "provider_partial", label: "Provider partial failure", status: "warning", reason: "One city had weak coverage.", suggestedFix: "Try a larger preset." }],
        failed: [],
        suggestedFixes: ["Try a larger preset."],
      },
      buildVersion: "outreach-package-v1-test",
    },
    loading: false,
    error: "",
    onRefresh: () => undefined,
    onRunProviderSmokeTest: () => undefined,
    onRunSelfCheck: () => undefined,
    providerSmokeTest: null,
    providerSmokeTestRunning: false,
    selfCheckRunning: false,
  }));

  assert.match(html, /Run System Self-Check/);
  assert.match(html, /Run Provider Smoke Test/);
  assert.match(html, /Launch Readiness/);
  assert.match(html, /Waiting on Google Places/);
  assert.match(html, /Database/);
  assert.match(html, /Auth/);
  assert.match(html, /Provider coverage/);
  assert.match(html, /Smoke test/);
  assert.match(html, /Autopilot safety/);
  assert.match(html, /Env kill switch/);
  assert.match(html, /Disabled/);
  assert.match(html, /Build version/);
  assert.match(html, /outreach-package-v1-test/);
  assert.match(html, /Next Step/);
  assert.match(html, /Add GOOGLE_PLACES_API_KEY in Vercel, redeploy, then run Provider Smoke Test\./);
  assert.match(html, /Recommended First Live Test/);
  assert.match(html, /Pressure Washing/);
  assert.match(html, /Tampa, FL/);
  assert.match(html, /Businesses to scan: 25/);
  assert.match(html, /Final prospects wanted: 5/);
  assert.match(html, /Written outreach only/);
  assert.match(html, /Only run Autopilot after this small test succeeds/);
  assert.match(html, /Provider Health/);
  assert.match(html, /Provider coverage is limited\. For better local business discovery, configure Google Places and\/or Yelp\./);
  assert.match(html, /Best first/);
  assert.match(html, /Google Places/);
  assert.match(html, /Optional second/);
  assert.match(html, /Yelp/);
  assert.match(html, /Already active/);
  assert.match(html, /Azure Maps\/Bing/);
  assert.match(html, /Backup only/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /GOOGLE_PLACES_API_KEY/);
  assert.match(html, /YELP_API_KEY/);
  assert.match(html, /Redeploy after adding env vars/);
  assert.match(html, /Run Provider Smoke Test again/);
  assert.match(html, /Copy Setup Instructions/);
  assert.match(html, /Add GOOGLE_PLACES_API_KEY in Vercel Production\./);
  assert.match(html, /Redeploy latest production deployment\./);
  assert.match(html, /Confirm Google Places succeeds\./);
  assert.match(html, /Then run Autopilot\./);
  assert.match(html, /AZURE_MAPS_API_KEY or BING_MAPS_API_KEY/);
  assert.match(html, /Safe internal audit/);
  assert.match(html, /never contacts prospects or changes outreach statuses/i);
  assert.match(html, /Needs attention/);
  assert.match(html, /Passed checks/);
  assert.match(html, /Warnings/);
  assert.match(html, /Failed checks/);
  assert.match(html, /Suggested fixes/);
  assert.match(html, /Supplier\/supply bad-fit filter works/);
});

test("system launch readiness advances after Google Places smoke test succeeds", () => {
  const html = renderToStaticMarkup(createElement(SystemWorkspace, {
    system: {
      status: "ready",
      checks: {
        database: { configured: true, reachable: true, message: "PostgreSQL is reachable." },
        authentication: { configured: true, message: "Engine access credentials are configured." },
      },
      auditEvents: [],
      providerCoverage: {
        level: "strong",
        label: "Strong provider setup",
        summary: "Google Places is available and smoke test returned local businesses.",
        recommendation: "Run a small Top Prospects test before Autopilot.",
        googleConfigured: true,
        yelpConfigured: false,
        azureOrBingConfigured: true,
      },
      providerHealth: [
        { provider: "googlePlaces", label: "Google Places", enabled: true, requiredEnvVarName: "GOOGLE_PLACES_API_KEY", envVarPresent: true, canRunWithoutApiKey: false, lastAttemptedQuery: "Tampa pressure washing", lastStatus: "succeeded", lastHttpStatus: "200", lastSafeErrorMessage: "", failureType: "none", endpointVersion: "New" },
        { provider: "yelp", label: "Yelp", enabled: false, requiredEnvVarName: "YELP_API_KEY", envVarPresent: false, canRunWithoutApiKey: false, lastAttemptedQuery: "Not run", lastStatus: "not_run", lastHttpStatus: "None", lastSafeErrorMessage: "No provider attempt recorded yet.", failureType: "none" },
      ],
      selfCheck: { overallStatus: "Healthy", lastRunAt: "2026-07-03T12:00:00.000Z", passed: [], warnings: [], failed: [], suggestedFixes: [] },
      buildVersion: "outreach-package-v1-test",
    },
    loading: false,
    error: "",
    onRefresh: () => undefined,
    onRunProviderSmokeTest: () => undefined,
    onRunSelfCheck: () => undefined,
    providerSmokeTest: {
      query: "Pressure Washing near Tampa, FL",
      createdOutreachPackages: false,
      sentOutreach: false,
      sampleCount: 5,
      diagnostics: {
        rawProviderCount: 12,
        afterDistanceFilteringCount: 11,
        afterDuplicateFilteringCount: 10,
        afterQualificationFilteringCount: 6,
        returnedCount: 5,
        radiusKm: 50,
        categorySignals: ["pressure washing"],
        sourceCounts: { osm: 0, google: 12, bing: 0, yelp: 0, yellowPages: 0 },
        providerDiagnostics: {
          osm: { configured: true, queryExecuted: false, status: "not_attempted", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          azureMaps: { configured: true, queryExecuted: false, status: "not_attempted", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          googlePlaces: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 12, withinRadiusCount: 11, afterDeduplicationCount: 10, usableWebsiteCount: 6, endpointVersion: "New" },
          yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        },
        finalMergedCount: 10,
      },
    },
    providerSmokeTestRunning: false,
    selfCheckRunning: false,
  }));

  assert.match(html, /Ready for small Top Prospects test/);
  assert.match(html, /Google Places/);
  assert.match(html, /Configured/);
  assert.match(html, /Endpoint/);
  assert.match(html, /New/);
  assert.match(html, /Smoke test/);
  assert.match(html, /Passed/);
  assert.match(html, /Run a small Top Prospects test before Autopilot\./);
  assert.match(html, /Outreach packages created: No/);
  assert.match(html, /Outreach sent: No/);
});

test("system launch readiness blocks Autopilot when the environment kill switch is enabled", () => {
  const html = renderToStaticMarkup(createElement(SystemWorkspace, {
    system: {
      status: "ready",
      checks: {
        database: { configured: true, reachable: true, message: "PostgreSQL is reachable." },
        authentication: { configured: true, message: "Engine access credentials are configured." },
      },
      auditEvents: [],
      providerCoverage: {
        level: "strong",
        label: "Strong provider setup",
        summary: "Google Places is available and smoke test returned local businesses.",
        recommendation: "Run a small Top Prospects test before Autopilot.",
        googleConfigured: true,
        yelpConfigured: false,
        azureOrBingConfigured: true,
      },
      providerHealth: [
        { provider: "googlePlaces", label: "Google Places", enabled: true, requiredEnvVarName: "GOOGLE_PLACES_API_KEY", envVarPresent: true, canRunWithoutApiKey: false, lastAttemptedQuery: "Tampa pressure washing", lastStatus: "succeeded", lastHttpStatus: "200", lastSafeErrorMessage: "", failureType: "none", endpointVersion: "New" },
      ],
      selfCheck: { overallStatus: "Healthy", lastRunAt: "2026-07-03T12:00:00.000Z", passed: [], warnings: [], failed: [], suggestedFixes: [] },
      buildVersion: "outreach-package-v1-test",
      autopilotEnvironmentKillSwitchEnabled: true,
    },
    loading: false,
    error: "",
    onRefresh: () => undefined,
    onRunProviderSmokeTest: () => undefined,
    onRunSelfCheck: () => undefined,
    providerSmokeTest: {
      query: "Pressure Washing near Tampa, FL",
      createdOutreachPackages: false,
      sentOutreach: false,
      sampleCount: 5,
      diagnostics: {
        rawProviderCount: 12,
        afterDistanceFilteringCount: 11,
        afterDuplicateFilteringCount: 10,
        afterQualificationFilteringCount: 6,
        returnedCount: 5,
        radiusKm: 50,
        categorySignals: ["pressure washing"],
        sourceCounts: { osm: 0, google: 12, bing: 0, yelp: 0, yellowPages: 0 },
        providerDiagnostics: {
          osm: { configured: true, queryExecuted: false, status: "not_attempted", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          azureMaps: { configured: true, queryExecuted: false, status: "not_attempted", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          googlePlaces: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 12, withinRadiusCount: 11, afterDeduplicationCount: 10, usableWebsiteCount: 6, endpointVersion: "New" },
          yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        },
        finalMergedCount: 10,
      },
    },
    providerSmokeTestRunning: false,
    selfCheckRunning: false,
  }));

  assert.match(html, /Do not run Autopilot yet/);
  assert.match(html, /Env kill switch/);
  assert.match(html, /Enabled/);
  assert.match(html, /Autopilot safety/);
  assert.match(html, /Needs attention/);
  assert.match(html, /Disable AUTOPILOT_DISABLED before starting a real Autopilot run/);
});

test("deployment docs explain provider setup and no-send safety", () => {
  const docs = readFileSync(new URL("../ENGINE_DEPLOYMENT.md", import.meta.url), "utf8");

  assert.match(docs, /GOOGLE_PLACES_API_KEY.*recommended/i);
  assert.match(docs, /YELP_API_KEY.*optional/i);
  assert.match(docs, /AZURE_MAPS_API_KEY.*BING_MAPS_API_KEY.*not return enough usable websites alone/is);
  assert.match(docs, /OpenStreetMap.*backup-only.*may timeout/is);
  assert.match(docs, /Provider Smoke Test creates no Outreach Packages and sends nothing/);
  assert.match(docs, /Autopilot sends nothing automatically/);
  assert.match(docs, /INTERNAL_NOTIFICATIONS_ENABLED.*Operator Test Center/is);
  assert.match(docs, /INTERNAL_NOTIFY_EMAIL.*operator/i);
  assert.match(docs, /These alerts are separate from prospect outreach and do not weaken `OUTREACH_EMAIL_DISABLED`/);
  assert.match(docs, /SMS_NOTIFICATIONS_ENABLED.*Twilio/is);
  assert.match(docs, /INTERNAL_NOTIFY_PHONE.*E\.164/is);
  assert.match(docs, /SMS alerts never go to prospects/i);
  assert.match(docs, /WEBWORKSHOP_POSTAL_ADDRESS.*Prospect Engine uses for Top Prospects/is);
  assert.match(docs, /OUTREACH_POSTAL_ADDRESS.*Auto Email Pilot\/provider readiness/is);
  assert.match(docs, /If both exist, Top Prospects and Prospect Engine email packages use `WEBWORKSHOP_POSTAL_ADDRESS`/);
  assert.match(docs, /AUTOPILOT_DISABLED=true.*hard Production kill switch/is);
  assert.match(docs, /OUTREACH_EMAIL_DISABLED.*block all human-approved and fully automatic email sends/is);
  assert.match(docs, /OUTREACH_EMAIL_DISABLED=true.*email-specific emergency stop/is);
  assert.match(docs, /OUTREACH_AUTO_SEND_ENABLED.*exactly `true`/);
  assert.match(docs, /OUTREACH_FULL_AUTO_SEND_ENABLED.*fully automatic queued-email batches/is);
  assert.match(docs, /Fully automatic queued-email batches require the additional `OUTREACH_FULL_AUTO_SEND_ENABLED=true` flag/is);
  assert.match(docs, /OUTREACH_SUPPRESSION_WEBHOOK_TOKEN.*outreach-events/is);
  assert.match(docs, /queued email can send only when all of these are true/i);
  assert.match(docs, /Contact forms, quote forms, social DMs, phone calls, and Looms remain manual-only/);
  assert.match(docs, /Emergency suppression controls are available in Autonomous Growth/);
  assert.match(docs, /Mark bounced, complained, opted-out, or manually suppressed addresses/i);
  assert.match(docs, /records suppression only and never sends outreach/i);
});

test("Prospect Engine exposes a manual Calls queue without SMS or auto-call behavior", () => {
  const source = readFileSync(new URL("../components/ProspectEngine.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/engine/engine.css", import.meta.url), "utf8");
  const callsBlock = source.slice(source.indexOf("function CallsWorkspace"), source.indexOf("function ProspectFunnelCard"));

  assert.match(source, /type WorkspaceTab = .*"Calls"/);
  assert.match(source, /pendingManualCallsCount/);
  assert.match(source, /CallsWorkspace/);
  assert.match(source, /Copy Call Script/);
  assert.match(source, /Mark Call Back/);
  assert.match(source, /Mark Do Not Contact/);
  assert.match(source, /tel:\$\{prospect\.phone\}/);
  assert.match(source, /engine-nav-badge/);
  assert.match(callsBlock, /never texts prospects/);
  assert.match(callsBlock, /never treats a phone number as SMS permission/);
  assert.doesNotMatch(callsBlock, /sendText|sendSms/i);
  assert.match(css, /engine-calls-workspace/);
  assert.match(css, /engine-call-actions/);
});

test("Prospect review UI exposes tappable cards, visible filters, and direct-open actions", () => {
  const engineSource = readFileSync(new URL("../components/ProspectEngine.tsx", import.meta.url), "utf8");
  const topProspectsSource = readFileSync(new URL("../components/engine/TopProspectsWorkspace.tsx", import.meta.url), "utf8");
  const testCenterSource = readFileSync(new URL("../components/engine/OperatorTestCenterWorkspace.tsx", import.meta.url), "utf8");
  const detailSource = readFileSync(new URL("../components/engine/ProspectDetail.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/engine/engine.css", import.meta.url), "utf8");

  assert.match(engineSource, /webworkshop:open-engine-record/);
  assert.match(engineSource, /engine-filter-summary/);
  assert.match(engineSource, /No record is open because the current filters have no matching prospects/);
  assert.match(engineSource, /Qualified unsent/);
  assert.match(engineSource, /Calls queue/);
  assert.match(detailSource, /Close record/);
  assert.match(topProspectsSource, /engine-top-result-card/);
  assert.match(topProspectsSource, /openResultCard/);
  assert.match(testCenterSource, /Open package/);
  assert.match(testCenterSource, /Open prospect preview/);
  assert.match(testCenterSource, /Records needing attention/);
  assert.match(css, /engine-top-result-card:focus-visible/);
  assert.match(css, /engine-readiness-failed-records/);
  assert.match(css, /engine-operator-summary-actions/);
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
  assert.match(html, /Not required/);
  assert.match(html, /AZURE_MAPS_API_KEY or BING_MAPS_API_KEY/);
  assert.match(html, /GOOGLE_PLACES_API_KEY/);
  assert.match(html, /YELP_API_KEY/);
});
