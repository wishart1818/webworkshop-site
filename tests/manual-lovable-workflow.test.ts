import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueStatusAfterManualAction } from "../lib/autonomous-growth";
import { firstTouchEmailDraft, outreachComplianceFooter, withAnalysis, seedProspects } from "../lib/prospect-engine";

process.env.WEBWORKSHOP_POSTAL_ADDRESS ??= "147 George St, Findlay, OH 45840";

test("first touch asks permission to create a preview and never claims one already exists", () => {
  const prospect = withAnalysis(structuredClone(seedProspects[0]));
  const email = firstTouchEmailDraft(prospect, outreachComplianceFooter());
  assert.match(email, /Would you be interested in seeing what that could look like\?/i);
  assert.doesNotMatch(email, /\b(?:I|we)\s+(?:built|made|created|put together)\b.{0,80}\b(?:preview|website|site)\b/i);
  assert.doesNotMatch(email, /https?:\/\/|\/p\//i);
});

test("positive interest enters the manual Lovable build queue", () => {
  assert.equal(queueStatusAfterManualAction("Prospect Said Yes"), "Preview Build Needed");
});

test("first-touch readiness no longer requires preview generation or preview quality", () => {
  const autonomous = readFileSync(new URL("../lib/autonomous-growth.ts", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../lib/autonomous-growth-repository.ts", import.meta.url), "utf8");
  const quality = readFileSync(new URL("../lib/top-prospects.ts", import.meta.url), "utf8");
  assert.doesNotMatch(autonomous.match(/function prospectFacingEmailBodySafe[\s\S]*?export function evaluateQueuedEmailSendReadiness/)?.[0] ?? "", /Public \/p\/ preview link is missing/);
  assert.doesNotMatch(quality.match(/export function evaluateOutreachEmailQuality[\s\S]*?export function assertOutreachEmailReady/)?.[0] ?? "", /Public preview link exists and is included after permission/);
  assert.match(repository, /Permission-first first-touch package prepared\. No preview was generated/);
  assert.doesNotMatch(repository.match(/async function syncTopProspectResultIntoQueue[\s\S]*?export async function getAutonomousGrowthDashboard/)?.[0] ?? "", /prepareTopProspectArtifactsWithResearch|prepareProspectForPreview|createPublicPreviewToken/);
});

test("manual preview link workflow is explicit and provider-free", () => {
  const repository = readFileSync(new URL("../lib/autonomous-growth-repository.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/engine/autonomous-growth/route.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../components/engine/AutonomousGrowthWorkspace.tsx", import.meta.url), "utf8");
  const setter = repository.match(/export async function setManualPreviewLink[\s\S]*?export async function updateOutreachQueueStatus/)?.[0] ?? "";
  assert.match(setter, /Preview Build Needed/);
  assert.match(setter, /legitimate public HTTPS preview link/);
  assert.doesNotMatch(setter, /sendWithResend|api\.resend\.com|fetch\(/);
  assert.match(route, /set_manual_preview_link[\s\S]*setManualPreviewLink/);
  assert.match(workspace, /Build one polished website manually in Lovable/);
  assert.match(workspace, /Add Lovable preview link/);
});

test("Ready for Loom fails closed without a public preview link", () => {
  const repository = readFileSync(new URL("../lib/autonomous-growth-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /status === "Ready for Loom"[\s\S]*Save and QA a legitimate public Lovable preview link/);
});
