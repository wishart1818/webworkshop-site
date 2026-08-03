# Team greeting simplification task

Implement this task on the current branch, then remove this temporary task file before finalizing the pull request.

## Goal

Remove the fragile verified-contact-name workflow from first-touch outreach and replace it with a reliable business-team greeting.

The current `Verified contact first name` save/regenerate feature repeatedly fails with:

`The review package changed before refresh completed. Refresh and try again.`

We have decided to stop searching for or entering individual contact names for now. Simplify the system rather than adding retry logic.

## Required greeting behavior

- Do not automatically search for contact names.
- Do not infer names from email addresses.
- Do not require a verified first name.
- Remove the `Verified contact first name` input and `Save & Regenerate Greeting` button from the email review interface.
- Remove or disable the corresponding API action so it is no longer callable.
- Do not create a database migration.
- Leave existing `contactPersonName` database values untouched for compatibility, but do not use them for first-touch greeting generation.
- Default to a short, natural business-name greeting:
  - `Pinnacle Pressure Washing of Toledo` -> `Hi Pinnacle team,`
  - `American Dream Pressure Washing LLC` -> `Hi American Dream team,`
  - `Rannebarger Home Maintenance` -> `Hi Rannebarger team,`
- Remove legal suffixes such as LLC, Inc., Incorporated, Corporation, Corp., Ltd., Limited, and Co.
- Remove trailing location phrases such as `of Toledo` when the prospect city is known.
- Remove a known trade/service phrase when it appears at the end of the business name and the remaining brand name is clear.
- Preserve multiword brand names such as `American Dream`.
- Do not reduce every company to only its first word.
- When the business name cannot be shortened confidently, use `Hi there,` rather than creating an awkward greeting.
- Use `Hi`, not `Hey`.

## Copy preservation

The approved outreach subject, offer, CTA, footer, postal address, opt-out text, permission-first workflow, and Findlay regional logic must otherwise remain unchanged.

The existing-site first-touch structure remains:

Subject: `Quick website idea for [Business Name]`

Greeting: `Hi [short business name] team,` or safe fallback `Hi there,`

Body:

`I'm Brendan, based in Findlay, and I build websites for local service businesses. I came across [Business Name] while looking at [trade] businesses around [area].`

`I can build you a refreshed, more modern website designed to help bring in more calls and quote requests.`

`Would you be interested in seeing what that could look like?`

Then the existing Brendan/WebWorkshop signature, postal address, and opt-out.

Preserve the existing regional rule: `based in Findlay` only for the existing nearby Northwest Ohio allowlist; distant prospects retain the non-Findlay introduction.

## Existing failing work

Start from current `main`. Do not reuse the abandoned atomic verified-name patch branches. Inspect the latest failed verification history only for context. Remove obsolete code and tests related solely to the verified-name save/regenerate action.

Do not add unsafe retries that could overwrite concurrent operator edits.

Preserve queue and transaction correctness:

- Queue statistics describe only successfully committed outcomes.
- Rollbacks must not leave counters incremented.
- Retries must not double-count.
- Records changed during processing must be safely skipped or retried according to existing logic.
- Preserve safeguards for Approved, Queued, Sending, Sent, Replied, Suppressed, Blocked, Lost, DM-only, and every other protected state.
- Preserve bounded stale-unsent recovery.

## Tests

Add or update regression tests covering at least:

1. `Pinnacle Pressure Washing of Toledo` -> `Hi Pinnacle team,`
2. `American Dream Pressure Washing LLC` -> `Hi American Dream team,`
3. `Rannebarger Home Maintenance` -> `Hi Rannebarger team,`
4. legal suffix removal,
5. known city/location removal,
6. known trade phrase removal,
7. preservation of multiword brand names,
8. uncertain shortening -> `Hi there,`,
9. first-touch subject and body remain otherwise unchanged,
10. protected outreach records are never modified,
11. no first name is inferred from an email address,
12. the removed verified-name UI/action is no longer rendered or callable,
13. rollback/retry statistics remain correct where relevant.

Fix root causes. Do not weaken assertions merely to make CI pass.

## Safety constraints

- Do not send any prospect email, DM, form submission, call, Loom, or other outreach.
- Keep `OUTREACH_EMAIL_DISABLED=true`.
- Do not enable auto-send or full autopilot.
- Keep the daily cap at 1.
- Do not run live provider discovery or consume provider credits.
- Do not rotate credentials or create a database.
- Do not change the approved sales workflow.
- Human approval remains required before any prospect enters the send queue.

## Validation and delivery

- Run focused tests while developing.
- Run the repository's complete Verify command, including tests, lint, typecheck, and production build.
- Confirm all required GitHub checks pass.
- Confirm nothing was sent and no sending configuration changed.
- Keep this as one clean PR from current `main`.
- Do not create temporary helper PRs or committed patch scripts.
- Remove this temporary task file before finalizing.
- Do not merge automatically.

In the final PR summary include the root cause, files changed, greeting-shortening rules, removed verified-name functionality, tests, verification results, and safety confirmation.
