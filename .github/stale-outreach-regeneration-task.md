# Fix #63: stale outreach regeneration must not block real Autopilot discovery

## Production failure

The first real Florida + Pressure Washing Autopilot start failed before discovery. Production logged on POST `/api/engine/autonomous-growth`:

`Error: The current evidence does not support website-rebuild outreach. Review and save an eligible website-fit decision before generating a draft.`

The UI then displayed `Unexpected end of JSON input` and Autopilot remained Not started.

## Root cause

`startAutopilotTopProspectsHandoff()` calls `processExistingQualifiedProspects({ dryRun: false })` before creating the fresh Top Prospects job. That path calls `regenerateUnsentOutreachCopy()`. A stale legacy queue item can pass the copy-regeneration eligibility check, but `regeneratedQueueCopy()` -> `generateOutreach()` can throw because the linked prospect's current website-fit evidence no longer supports rebuild outreach. The database regeneration loop currently lets that per-item error abort the whole existing-inventory pass, so fresh discovery never starts.

There is a second error-boundary bug: the `start_autopilot` / `retry_autopilot_handoff` route returns the async handoff from inside a try without awaiting it, so a rejected handoff can bypass the route catch and yield a non-JSON 500. The client then surfaces the JSON parser error instead of a safe API error.

## Required implementation

Keep this narrow and fail closed.

1. In `regenerateUnsentOutreachCopy()`:
   - Catch current-script / `regeneratedQueueCopy()` failures per queue item in BOTH database and memory modes.
   - Count the item as skipped and record a stable safe reason, preferably `current website-fit evidence no longer supports outreach regeneration`.
   - Log only safe identifiers such as queue item id/prospect id and error name; do not log email/body/private content.
   - Continue processing later eligible items.
   - Leave the invalid item unchanged: do not mutate its copy, approval, contact state, suppression history, queue/send state, or timestamps.
   - Preserve all existing protected-status behavior.

2. In `app/api/engine/autonomous-growth/route.ts`:
   - Ensure Start/Retry Autopilot asynchronous handoff failures stay inside the route-level catch, e.g. `return await startAutopilotTopProspectsHandoff(...)` or equivalent.
   - Failure response must remain JSON and fail closed.

3. Add a tiny client-side non-JSON fallback only if needed after the route fix. Do not broaden UI scope.

## Regression tests required

Add tests proving:
- a stale queue item whose linked prospect no longer has eligible website-fit evidence does not make `regenerateUnsentOutreachCopy()` throw;
- that stale item is counted as skipped and remains unchanged;
- another valid eligible item still regenerates;
- `processExistingQualifiedProspects({ dryRun:false })` completes despite the stale item;
- a rejected Start/Retry Autopilot handoff is caught by the route and returned as JSON rather than leaking an empty/non-JSON 500;
- no email, DM, form, phone, Loom, SMS, approval, suppression, contact-history, qualification, or provider behavior is loosened.

## Non-goals / safety

Do NOT change:
- qualification thresholds
- website-fit eligibility semantics
- provider discovery behavior
- `AUTOPILOT_DISABLED`
- `OUTREACH_EMAIL_DISABLED`
- `OUTREACH_AUTO_SEND_ENABLED`
- `OUTREACH_FULL_AUTO_SEND_ENABLED`
- daily caps
- send behavior
- Prisma schema
- production data

Current production prospect email sending must remain disabled.

## Verification

Run focused regressions, then the repository's full `npm run verify`, plus `git diff --check`. Remove this temporary task file before finalizing the PR.