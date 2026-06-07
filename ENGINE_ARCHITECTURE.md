# WebWorkshop Prospect Engine

## Product boundary

The public WebWorkshop marketing site remains on its existing routes. The operator workspace lives at `/engine` and is excluded from search indexing.

## Current functional workflow

1. Add a contractor prospect to the discovery queue.
2. Search, filter, sort, and prioritize prospects.
3. Generate a structured website analysis and category scores.
4. Generate personalized outreach grounded in analysis findings.
5. Require explicit human approval before personal sending.
6. Generate a contractor-specific website preview direction.
7. Track notes, activity, and pipeline status.

## Architecture

- `components/ProspectEngine.tsx`: operator UI, workflow orchestration, and visible server-sync state.
- `lib/prospect-engine.ts`: typed domain model, scoring, analysis, outreach, and preview services.
- `lib/prospect-repository.ts`: PostgreSQL repository with a non-durable development-memory fallback.
- `app/api/engine/prospects/route.ts`: validated prospect read/write API.
- `app/api/engine/analyze/route.ts`: robots-aware, per-host-throttled live homepage analysis API with SSRF and response-size protections.
- `app/api/engine/discover/route.ts`: user-triggered contractor discovery through low-volume public map data.
- `lib/operational-controls.ts`: PostgreSQL-backed rate limits and durable audit events, with a development-memory implementation.
- `middleware.ts`: Basic authentication guard for the engine and its API.
- `prisma/schema.prisma`: PostgreSQL production data model for prospects, analyses, outreach drafts, previews, notes, activities, and status history.
- `prisma/migrations/20260607_initial/migration.sql`: reviewed initial PostgreSQL deployment migration.
- `app/engine/page.tsx`: private product entry route.

The UI persists through the server API. When `DATABASE_URL` is configured, the repository uses PostgreSQL through Prisma. Without a database, local development uses a clearly labeled, non-durable server-memory store. Production fails closed with HTTP 503 when PostgreSQL is not configured.

## Production integration requirements

- Provision PostgreSQL and run `npm run prisma:deploy`.
- Replace single-operator Basic authentication with identity-based roles when multiple operators are needed.
- Connect an approved lead-data provider for national discovery.
- Replace the public-data discovery provider with a contracted commercial provider before high-volume national use.
- Connect an AI provider for richer analysis and generation, with structured output validation.
- Add browser-level interaction tests when a reliable browser runtime is available.
- Add encryption, retention rules, backups, monitoring, and error reporting.

## Compliance controls

- No automatic mass-email sending.
- Outreach is stored as an unapproved draft by default.
- Approval is explicit and reversible.
- Generated copy identifies itself as a personal draft.
- A production discovery worker must respect site terms and `robots.txt`.
