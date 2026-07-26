from __future__ import annotations

from pathlib import Path
from textwrap import dedent
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str, label: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} target in {path}, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str, label: str) -> None:
    content = read(path)
    updated, count = re.subn(pattern, lambda _: replacement, content, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected one {label} regex target in {path}, found {count}.")
    write(path, updated)


# 1. A V3 draft is current only when it actually uses the truthful permission-first CTA.
replace_regex(
    "lib/prospect-engine.ts",
    r'''export function outreachDraftLooksCurrent\([\s\S]*?\n}\n\nexport function inferOutreachCopyVersion\([\s\S]*?\n}\n\nexport function prospectHasUnusableWebsite''',
    dedent('''
    export function outreachDraftLooksCurrent(outreach: Pick<OutreachDraft, "concise" | "detailed" | "followUps" | "outreachCopyVersion">, environment: NodeJS.ProcessEnv = process.env) {
      const firstTouch = outreach.concise ?? "";
      const combined = [firstTouch, outreach.detailed, ...(outreach.followUps ?? [])].join("\\n");
      const address = webworkshopPostalAddress(environment);
      const permissionFirstCta = /would you like me to (?:put together|create|make|build)(?: you)? (?:a )?(?:quick )?(?:website )?preview\?/i.test(firstTouch);
      const pastTensePreviewClaim = /\b(?:I|we)\s+(?:already\s+)?(?:built|made|created|finished|designed|put together)\b.{0,90}\b(?:preview|website|site|concept)\b/i.test(firstTouch);
      return outreach.outreachCopyVersion === OUTREACH_COPY_VERSION
        && !/https?:\\/\\/|\\/p\\/|\\/engine(?:\\/|$)/i.test(firstTouch)
        && !/\b10[-\s]?minute call\b/i.test(combined)
        && !/\[[^\]]*(postal address|before sending|placeholder|insert)[^\]]*\]/i.test(combined)
        && !/\bwill get you more calls\b/i.test(combined)
        && permissionFirstCta
        && !pastTensePreviewClaim
        && /would rather not receive another note|rather not hear from me again|close the loop/i.test(combined)
        && (!address || combined.includes(address));
    }

    export function inferOutreachCopyVersion(outreach: Pick<OutreachDraft, "concise" | "detailed" | "followUps"> & Partial<Pick<OutreachDraft, "outreachCopyVersion">>, environment: NodeJS.ProcessEnv = process.env) {
      const candidate = {
        ...outreach,
        outreachCopyVersion: outreach.outreachCopyVersion || LEGACY_OUTREACH_COPY_VERSION,
      };
      return outreachDraftLooksCurrent(candidate, environment) ? OUTREACH_COPY_VERSION : LEGACY_OUTREACH_COPY_VERSION;
    }

    export function prospectHasUnusableWebsite
    ''').lstrip(),
    "current-copy detector",
)

# 2. Read the full safety queue, calculate email metrics honestly, and use Eastern business dates.
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const rows = await getProspectDatabase().outreachQueueItem.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });''',
    '''  const rows = await getProspectDatabase().outreachQueueItem.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });''',
    "full queue read",
)

replace_regex(
    "lib/autonomous-growth-repository.ts",
    r'''function todayStart\(\) \{[\s\S]*?\n}\n\nfunction metricsForQueue\([\s\S]*?\n}\n\nfunction buildCurrentAutopilotDashboard''',
    dedent('''
    const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    function businessDateKey(value: string | Date) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime()) ? businessDateFormatter.format(date) : "";
    }

    function emailSendRecorded(item: OutreachQueueItem) {
      return item.status === "Sent" || Boolean(item.sentDate && item.contactSource === "Public email");
    }

    function emailsSentOnCurrentBusinessDate(queue: OutreachQueueItem[]) {
      const today = businessDateKey(new Date());
      return queue.filter((item) => emailSendRecorded(item) && item.sentDate && businessDateKey(item.sentDate) === today).length;
    }

    const actualReplyStatuses = new Set<OutreachQueueStatus>([
      "Replied",
      "Positive Reply",
      "Prospect Said Yes",
      "Preview Build Needed",
      "Preview Needs Polish",
      "Loom Needed",
      "Ready for Loom",
      "Loom Recorded",
      "Loom Sent",
      "Pricing Requested",
      "Pricing Sent",
      "Won",
      "Not Interested",
    ]);

    const positiveReplyStatuses = new Set<OutreachQueueStatus>([
      "Positive Reply",
      "Prospect Said Yes",
      "Preview Build Needed",
      "Preview Needs Polish",
      "Loom Needed",
      "Ready for Loom",
      "Loom Recorded",
      "Loom Sent",
      "Pricing Requested",
      "Pricing Sent",
      "Won",
    ]);

    function replyStatusIndicatesReply(value: string) {
      return /\b(?:replied|reply|positive|negative|interested|not[_ -]?interested|prospect[_ -]?said[_ -]?yes|pricing[_ -]?requested)\b/i.test(value)
        && !/\b(?:bounce|bounced|complaint|complained|spam|unsubscribe|unsubscribed|opt[_ -]?out|suppressed)\b/i.test(value);
    }

    function replyStatusIndicatesPositiveReply(value: string) {
      return /\b(?:positive|interested|prospect[_ -]?said[_ -]?yes|pricing[_ -]?requested)\b/i.test(value)
        && !/\b(?:not[_ -]?interested|negative|bounce|complaint|spam|unsubscribe|opt[_ -]?out|suppressed)\b/i.test(value);
    }

    function metricsForQueue(queue: OutreachQueueItem[], settings: AutonomousGrowthSettings): AutonomousGrowthMetrics {
      const today = businessDateKey(new Date());
      const todayItems = queue.filter((item) => businessDateKey(item.createdAt) === today);
      const emailSends = queue.filter(emailSendRecorded);
      const repliedEmailItems = emailSends.filter((item) => actualReplyStatuses.has(item.status) || replyStatusIndicatesReply(item.replyStatus));
      const positiveReplyItems = emailSends.filter((item) => positiveReplyStatuses.has(item.status) || replyStatusIndicatesPositiveReply(item.replyStatus));
      const sentToday = emailsSentOnCurrentBusinessDate(queue);
      const tradeCounts = positiveReplyItems.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.trade]: (counts[item.trade] ?? 0) + 1 }), {});
      const bestTrade = Object.entries(tradeCounts).sort(([, left], [, right]) => right - left)[0]?.[0] ?? "Not enough positive reply data";
      const subjectCounts = positiveReplyItems.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.subjectLine]: (counts[item.subjectLine] ?? 0) + 1 }), {});
      const bestSubjectLine = Object.entries(subjectCounts).sort(([, left], [, right]) => right - left)[0]?.[0] ?? "Not enough positive reply data";
      const ready = queue.filter((item) => ["Eligible", "Queued", "DM Draft", "Ready for Loom"].includes(item.status));
      const loomNeeded = queue.filter((item) => ["Preview Build Needed", "Loom Needed"].includes(item.status)).length;
      const loomRecorded = queue.filter((item) => item.status === "Loom Recorded").length;
      const loomSent = queue.filter((item) => item.status === "Loom Sent").length;
      const followUpsDue = queue.filter((item) => item.status === "Follow-up Needed").length;
      const previewScored = queue.filter((item) => item.previewQualityScore > 0);
      const leadScored = queue.filter((item) => (item.reviewScore || item.previewQualityScore) > 0);
      return {
        prospectsFoundToday: todayItems.length,
        previewsGeneratedToday: todayItems.filter((item) => item.previewLink).length,
        emailReadyLeads: ready.length,
        blockedPhoneOnlyLeads: queue.filter((item) => /phone-only/i.test(item.blockedReason)).length,
        blockedBadFitLeads: queue.filter((item) => item.status === "Bad Fit" || /bad-fit|inactive|franchise|duplicate/i.test(item.blockedReason)).length,
        emailsQueued: queue.filter((item) => item.status === "Queued").length,
        emailsSentToday: sentToday,
        dailyCapRemaining: Math.max(0, Math.min(settings.maxEmailsSentPerDay, outreachEnvironment().dailyCap) - sentToday),
        replies: repliedEmailItems.length,
        positiveReplies: positiveReplyItems.length,
        loomNeeded,
        loomRecorded,
        loomSent,
        followUpsDue,
        replyRate: emailSends.length ? Math.round((repliedEmailItems.length / emailSends.length) * 100) : 0,
        positiveReplyRate: emailSends.length ? Math.round((positiveReplyItems.length / emailSends.length) * 100) : 0,
        bestTrade,
        bestSubjectLine,
        bestOutreachAngle: positiveReplyItems[0]?.eligibilityReason ?? "Not enough positive reply data",
        wonLostProspects: `${queue.filter((item) => item.status === "Won").length} won / ${queue.filter((item) => ["Lost", "Not Interested", "Bad Fit"].includes(item.status)).length} lost`,
        averagePreviewQualityScore: previewScored.length ? Math.round(previewScored.reduce((sum, item) => sum + item.previewQualityScore, 0) / previewScored.length) : 0,
        averageLeadScore: leadScored.length ? Math.round(leadScored.reduce((sum, item) => sum + (item.reviewScore || item.previewQualityScore), 0) / leadScored.length) : 0,
      };
    }

    function buildCurrentAutopilotDashboard
    ''').lstrip(),
    "queue metrics",
)

replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const emailsSentToday = queue.filter((entry) => entry.sentDate && new Date(entry.sentDate) >= todayStart()).length;''',
    '''  const emailsSentToday = emailsSentOnCurrentBusinessDate(queue);''',
    "manual send daily count",
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const sentToday = queue.filter((item) => item.sentDate && new Date(item.sentDate) >= todayStart()).length;''',
    '''  const sentToday = emailsSentOnCurrentBusinessDate(queue);''',
    "pilot cycle daily count",
)

# Shared mailbox providers are unrelated businesses; rate-limit those by recipient, not the provider domain.
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''export function normalizeRecipientEmailDomain(value: string) {
  const email = normalizeEmailAddress(value);
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return "";
  const domain = email.slice(separator + 1).replace(/\.+$/, "");
  return domain && !domain.includes("@") ? domain : "";
}''',
    '''export function normalizeRecipientEmailDomain(value: string) {
  const email = normalizeEmailAddress(value);
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return "";
  const domain = email.slice(separator + 1).replace(/\.+$/, "");
  return domain && !domain.includes("@") ? domain : "";
}

const sharedMailboxProviderDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);''',
    "shared mailbox domains",
)
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''    await enforceRateLimit({
      action: "autonomous_email_send_domain",
      subject: recipientDomain,
      limit: 1,
      windowMs: Math.max(1, settings.emailCooldownMinutes) * 60_000,
    });''',
    '''    if (!sharedMailboxProviderDomains.has(recipientDomain)) {
      await enforceRateLimit({
        action: "autonomous_email_send_domain",
        subject: recipientDomain,
        limit: 1,
        windowMs: Math.max(1, settings.emailCooldownMinutes) * 60_000,
      });
    }''',
    "shared provider domain rate limit",
)

# Choose approved sends deterministically: oldest approval/queue first.
replace_once(
    "lib/autonomous-growth-repository.ts",
    '''  const candidates = approvedItems.slice(0, remainingDailyCap);''',
    '''  const candidates = [...approvedItems]
    .sort((left, right) => {
      const leftTime = Date.parse(left.queuedDate || left.updatedAt || left.createdAt);
      const rightTime = Date.parse(right.queuedDate || right.updatedAt || right.createdAt);
      return leftTime - rightTime || left.id.localeCompare(right.id);
    })
    .slice(0, remainingDailyCap);''',
    "deterministic approved queue order",
)

# Protect every post-interest workflow state from copy regeneration.
replace_once(
    "lib/autonomous-growth.ts",
    '''  "Preview Build Needed",
  "Loom Needed",''',
    '''  "Preview Build Needed",
  "Preview Needs Polish",
  "Loom Needed",''',
    "post-interest protected status",
)

# The webhook has its own timing-safe secret check and must reach its route before engine Basic auth.
replace_once(
    "middleware.ts",
    '''    request.nextUrl.pathname === "/api/engine/config-check"
    || request.nextUrl.pathname === "/api/engine/env-names"
    || request.nextUrl.pathname === "/api/engine/deployment-context"''',
    '''    request.nextUrl.pathname === "/api/engine/config-check"
    || request.nextUrl.pathname === "/api/engine/env-names"
    || request.nextUrl.pathname === "/api/engine/deployment-context"
    || request.nextUrl.pathname === "/api/engine/outreach-events"''',
    "suppression webhook middleware exemption",
)

# Make metric labels honest about what is being measured.
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''          <div><dt>Best trade</dt><dd>{metrics.bestTrade}</dd></div>
          <div><dt>Best subject line</dt><dd>{metrics.bestSubjectLine}</dd></div>
          <div><dt>Best outreach angle</dt><dd>{metrics.bestOutreachAngle}</dd></div>''',
    '''          <div><dt>Best trade by positive email replies</dt><dd>{metrics.bestTrade}</dd></div>
          <div><dt>Best subject by positive email replies</dt><dd>{metrics.bestSubjectLine}</dd></div>
          <div><dt>Best angle by positive email replies</dt><dd>{metrics.bestOutreachAngle}</dd></div>''',
    "honest metric labels",
)

Path("tests/final-manual-workflow-audit.test.ts").write_text(dedent('''
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

test("permission-first V3 copy is current while the old already-built CTA is stale", () => {
  const prospect = structuredClone(seedProspects[0]);
  const current = generateOutreach(prospect, "", environment);
  assert.equal(current.outreachCopyVersion, OUTREACH_COPY_VERSION);
  assert.equal(outreachDraftLooksCurrent(current, environment), true);
  assert.equal(inferOutreachCopyVersion(current, environment), OUTREACH_COPY_VERSION);

  const oldCta = {
    ...current,
    concise: current.concise.replace("Would you like me to put together a quick preview?", "Want me to send it over?"),
    outreachCopyVersion: OUTREACH_COPY_VERSION,
  };
  assert.equal(outreachDraftLooksCurrent(oldCta, environment), false);
  assert.equal(inferOutreachCopyVersion(oldCta, environment), LEGACY_OUTREACH_COPY_VERSION);

  const falseBuiltClaim = {
    ...current,
    concise: current.concise.replace(
      "I had an idea for what one could look like",
      "I built a preview of what one could look like",
    ),
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
''').lstrip(), encoding="utf-8")

print("Final manual Lovable workflow audit fixes applied.")
