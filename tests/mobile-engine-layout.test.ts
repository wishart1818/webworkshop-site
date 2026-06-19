import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/engine/engine.css", import.meta.url), "utf8");
const topProspectsWorkspace = readFileSync(new URL("../components/engine/TopProspectsWorkspace.tsx", import.meta.url), "utf8");
const prospectEngineWorkspace = readFileSync(new URL("../components/ProspectEngine.tsx", import.meta.url), "utf8");
const prospectEngine = readFileSync(new URL("../lib/prospect-engine.ts", import.meta.url), "utf8");
const topProspectWorker = readFileSync(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
const topProspectRepository = readFileSync(new URL("../lib/top-prospect-repository.ts", import.meta.url), "utf8");
const mobileStart = css.indexOf("@media (max-width: 767px)");
const mobileEnd = css.indexOf("@media (max-width: 420px)");
const mobileCss = css.slice(mobileStart, mobileEnd);

test("engine phone layout uses a single-column form flow", () => {
  assert.notEqual(mobileStart, -1);
  assert.match(mobileCss, /\.engine-top-prospect-launcher form\s*{\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.engine-discovery-form\s*{\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.engine-score-grid,\s*\.engine-two-col,\s*\.engine-form-grid\s*{\s*grid-template-columns: 1fr;/);
});

test("engine phone layout removes desktop-width result overflow", () => {
  assert.match(mobileCss, /\.engine-table__head\s*{\s*display: none;/);
  assert.match(mobileCss, /\.engine-table > button\s*{\s*min-width: 0;/);
  assert.match(mobileCss, /\.engine-pipeline\s*{\s*grid-template-columns: 1fr;\s*overflow-x: visible;/);
  assert.match(mobileCss, /\.engine-top-table article\s*{\s*min-width: 0;\s*grid-template-columns: 1fr;/);
  assert.doesNotMatch(mobileCss, /min-width:\s*36rem/);
  assert.match(mobileCss, /\.engine-provider-diagnostic dl\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(mobileCss, /\.engine-trade-diagnostics \[role="row"\]\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(mobileCss, /\.engine-auto-queue__summary\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});

test("engine phone controls and navigation account for iPhone interaction constraints", () => {
  assert.match(css, /padding-bottom: calc\(var\(--engine-mobile-nav-height\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /padding: 0\.4rem 0\.4rem calc\(0\.4rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileCss, /\.engine-top-prospect-launcher button\s*{\s*width: 100%;/);
  assert.match(mobileCss, /min-height: 2\.75rem;\s*font-size: 1rem;/);
  assert.match(mobileCss, /\.engine-empty__actions \.engine-button\s*{\s*width: 100%;/);
  assert.match(mobileCss, /\.engine-inline-actions \.engine-button\s*{\s*width: 100%;/);
  assert.match(mobileCss, /\.engine-prospect-labels span,/);
});

test("protected prospect previews remain readable and business-themed on phones", () => {
  assert.match(mobileCss, /\.prospect-preview-site\[data-layout="project-led"\] \.prospect-preview-hero,/);
  assert.match(mobileCss, /\.prospect-preview-nav div\s*{\s*display: none;/);
  assert.match(mobileCss, /\.prospect-preview-actions\s*{\s*align-items: stretch;\s*flex-direction: column;/);
  assert.match(mobileCss, /\.prospect-preview-hero__visual img\s*{\s*min-height: 18rem;\s*aspect-ratio: 4 \/ 3;/);
  assert.match(mobileCss, /\.prospect-preview-service-list article,\s*\.prospect-preview-service-list article:first-child\s*{\s*grid-column: 1 \/ -1;\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.prospect-preview-contact form\s*{\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.prospect-preview-footer\s*{\s*flex-direction: column;/);
  assert.match(mobileCss, /\.prospect-preview-why,/);
  assert.doesNotMatch(css, /--preview-green|--preview-lime/);
  assert.match(css, /prospect-preview-visual-caption/);
});

test("Outreach Package bulk review exposes the complete human approval workflow on mobile", () => {
  assert.match(topProspectsWorkspace, /Outreach Package Review/);
  assert.match(topProspectsWorkspace, /Generate Outreach Package/);
  assert.match(topProspectsWorkspace, /Review preview \+ email/);
  assert.match(topProspectsWorkspace, /Approve to Send/);
  assert.match(topProspectsWorkspace, /Email quality checks/);
  assert.match(topProspectsWorkspace, /check\.phrase/);
  assert.match(topProspectsWorkspace, /check\.reason/);
  assert.match(topProspectsWorkspace, /check\.suggestion/);
  assert.match(topProspectsWorkspace, /Public preview link/);
  assert.match(topProspectsWorkspace, /Send-ready/);
  assert.match(topProspectsWorkspace, /Phone-only \/ written outreach blocked/);
  assert.match(topProspectsWorkspace, /Missing written contact method/);
  assert.match(topProspectsWorkspace, /Mark Sent/);
  assert.match(topProspectsWorkspace, /Skip/);
  assert.match(topProspectsWorkspace, /Open Lovable/);
  assert.match(topProspectsWorkspace, /Open Bolt/);
  assert.match(topProspectsWorkspace, /Open v0/);
  assert.match(mobileCss, /\.engine-package-review-grid,\s*\.engine-package-dialog__summary,\s*\.engine-email-quality ul\s*{\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.engine-package-card__actions\s*{\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.engine-email-quality li > b\s*{\s*font-size: 0\.875rem;/);
});

test("Top Prospects exposes modes, background batch workflow, queue, and requested score labels", () => {
  assert.match(topProspectsWorkspace, /Prospect mode/);
  assert.match(topProspectsWorkspace, /allCoreServiceTradesOption/);
  assert.match(prospectEngine, /All Core Service Trades/);
  assert.match(topProspectsWorkspace, /useState<ProspectMode>\("growth"\)/);
  assert.match(topProspectsWorkspace, /useState<ProspectSearchType>\("all"\)/);
  assert.match(topProspectsWorkspace, /defaultValue="50"/);
  assert.match(topProspectsWorkspace, /defaultValue="100"/);
  assert.match(topProspectsWorkspace, /defaultValue="20"/);
  assert.match(topProspectsWorkspace, /total all-trades budget/);
  assert.match(topProspectsWorkspace, /Discovery complete\. Analyze/);
  assert.match(topProspectsWorkspace, /Analyze saved prospects/);
  assert.match(topProspectsWorkspace, /discovery complete, waiting to analyze/);
  assert.match(topProspectsWorkspace, /latestJob && latestJob\.scannedCount > 0 \? latestJob\.results\[0\] : null/);
  assert.match(topProspectsWorkspace, /Website scan/);
  assert.match(topProspectsWorkspace, /Preview generation/);
  assert.match(topProspectsWorkspace, /Outreach packages/);
  assert.match(topProspectsWorkspace, /NEEDS_NEXT_BATCH/);
  assert.match(topProspectsWorkspace, /PARTIAL_RESULTS_READY/);
  assert.match(topProspectWorker, /BATCH_SIZE = 3/);
  assert.match(topProspectWorker, /waitingStatusForDiscovery/);
  assert.match(topProspectWorker, /Saved discovery found; resuming analysis without rediscovery/);
  assert.match(topProspectWorker, /status: partialStatus/);
  assert.match(topProspectWorker, /stage: "ANALYZE"/);
  assert.match(topProspectWorker, /status: done \? "RUNNING" : waitingStatus/);
  assert.match(topProspectRepository, /reconcileStaleTopProspectJobs/);
  assert.match(topProspectRepository, /staleRunningMs = 10 \* 60_000/);
  assert.match(topProspectRepository, /stage: "DISCOVER",\s*OR: \[\{ leaseUntil: null \}, \{ leaseUntil: \{ lte: now \} \}\]/);
  assert.match(topProspectRepository, /inferredScannedCount/);
  assert.match(topProspectsWorkspace, /Outreach preference/);
  assert.match(topProspectsWorkspace, /Written outreach only/);
  assert.match(topProspectsWorkspace, /Phone allowed/);
  assert.match(topProspectsWorkspace, /Email available/);
  assert.match(topProspectsWorkspace, /Contact form available/);
  assert.match(topProspectsWorkspace, /Social message available/);
  assert.match(topProspectsWorkspace, /Hide phone-only leads/);
  assert.match(topProspectsWorkspace, /Send-ready only/);
  assert.match(topProspectsWorkspace, /Needs contact research/);
  assert.match(prospectEngineWorkspace, /Filter by contact method/);
  assert.match(topProspectsWorkspace, /Morning Prospect Batch/);
  assert.match(topProspectsWorkspace, /Auto Prospect Queue/);
  assert.match(topProspectsWorkspace, /Final weighted sales/);
  assert.match(topProspectsWorkspace, /Revenue opportunity/);
  assert.match(topProspectsWorkspace, /AI replacement confidence/);
  assert.match(topProspectsWorkspace, /No Website \/ Social Only/);
  assert.match(topProspectsWorkspace, /All Prospect Types/);
  assert.match(prospectEngine, /No website found/);
  assert.match(prospectEngine, /Public email available/);
  assert.match(prospectEngine, /Needs manual contact research/);
  assert.match(topProspectsWorkspace, /prospectPresenceLabels/);
  assert.match(topProspectsWorkspace, /Online presence gap/);
  assert.match(topProspectsWorkspace, /Business activity/);
  assert.match(topProspectsWorkspace, /Local fit/);
  assert.match(topProspectsWorkspace, /Final sales score/);
  assert.match(css, /\.engine-presence-summary\s*{\s*display: flex;\s*flex-wrap: wrap;/);
});
