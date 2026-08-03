import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  generateOutreach,
  inferOutreachCopyVersion,
  LEGACY_OUTREACH_COPY_VERSION,
  outreachDraftLooksCurrent,
  OUTREACH_COPY_VERSION,
  seedProspects,
} from "../lib/prospect-engine";

const environment = { WEBWORKSHOP_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840" } as NodeJS.ProcessEnv;

test("permission-first V6 copy is current while the old already-built CTA is stale", () => {
  const prospect = structuredClone(seedProspects[0]);
  const current = generateOutreach(prospect, "", environment);
  assert.equal(current.outreachCopyVersion, OUTREACH_COPY_VERSION);
  assert.equal(outreachDraftLooksCurrent(current, environment), true);
  assert.equal(inferOutreachCopyVersion(current, environment), OUTREACH_COPY_VERSION);

  const oldCta = {
    ...current,
    concise: current.concise.replace("Would you be interested in seeing what that could look like?", "Want me to send it over?"),
    outreachCopyVersion: OUTREACH_COPY_VERSION,
  };
  assert.equal(outreachDraftLooksCurrent(oldCta, environment), false);
  assert.equal(inferOutreachCopyVersion(oldCta, environment), LEGACY_OUTREACH_COPY_VERSION);

  const falseBuiltClaim = {
    ...current,
    concise: current.concise.replace(/I can build you a refreshed, more modern website designed to help bring in more calls and quote requests\.|It looks like you don't currently have a full website up\. I can build you a modern one designed to help bring in more calls and quote requests\./i, "I built a website preview for the business."),
  };
  assert.equal(outreachDraftLooksCurrent(falseBuiltClaim, environment), false);
});

test("final safety audit removes truncated queue reads and false reply counting", () => {
  const repository = readFileSync("lib/autonomous-growth-repository.ts", "utf8");
  assert.doesNotMatch(repository, /outreachQueueItem\.findMany\([\s\S]{0,180}take:\s*100/);
  assert.match(repository, /replyStatusIndicatesReply/);
  assert.match(repository, /emailsSentOnCurrentBusinessDate/);
  assert.match(repository, /America\/New_York/);
  assert.match(repository, /sharedMailboxProviderDomains\.has\(recipientDomain\)/);
  assert.match(repository, /Date\.parse\(left\.queuedDate/);
  assert.doesNotMatch(repository, /\|\| item\.replyStatus\)\.length/);
  assert.match(repository, /const reconciliationChanged = recipientChanged/);
  assert.match(repository, /if \(!reconciliationChanged\) return item/);
  assert.match(repository, /const regenerated = await regenerateProspectOutreachWithCurrentScript\(prospect\.id\)/);
  assert.doesNotMatch(repository, /for \(let attempt = 0; attempt < 2/);
});

test("suppression webhook bypasses only engine Basic auth and retains its token guard", () => {
  const middleware = readFileSync("middleware.ts", "utf8");
  const webhook = readFileSync("app/api/engine/outreach-events/route.ts", "utf8");
  assert.match(middleware, /\/api\/engine\/outreach-events/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /OUTREACH_SUPPRESSION_WEBHOOK_TOKEN/);
  assert.match(webhook, /return NextResponse\.json\(\{ error: "Unauthorized\." \}/);
});

test("post-interest preview polish remains protected from copy regeneration", () => {
  const growth = readFileSync("lib/autonomous-growth.ts", "utf8");
  assert.match(growth, /contactedOrClosedStatuses[\s\S]*"Preview Build Needed",[\s\S]*"Preview Needs Polish",[\s\S]*"Loom Needed"/);
});

test("email draft review supports verified-name save and exact single-draft regeneration", () => {
  const helper = readFileSync("components/engine/EmailDraftReviewHelper.tsx", "utf8");
  const route = readFileSync("app/api/engine/autonomous-growth/route.ts", "utf8");
  const repository = readFileSync("lib/autonomous-growth-repository.ts", "utf8");
  assert.match(helper, /Verified contact first name/);
  assert.match(helper, /save_verified_contact_first_name/);
  assert.match(helper, /expectedUpdatedAt: selectedItem\.updatedAt/);
  assert.match(helper, /will not infer a name from the email address/i);
  assert.match(route, /saveVerifiedContactFirstNameAndRegenerate/);
  assert.match(repository, /queueItemDraftMutationIsProtected\(queueItem\)/);
  assert.match(repository, /webworkshopRecipientFirstName\(value\)/);
  assert.match(repository, /regenerateProspectOutreachWithCurrentScript\(prospect\.id\)/);
});

