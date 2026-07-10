# Prospect Engine Production Setup

This guide deploys the existing Prospect Engine without changing the public WebWorkshop site. The public routes do not require PostgreSQL or engine credentials. Only `/engine` and `/api/engine/*` are protected by engine authentication and depend on the engine database.

## 1. Provision PostgreSQL

**Recommended provider: Neon PostgreSQL through the Vercel Marketplace.**

Neon is a practical fit for this single-operator Next.js application because it integrates with Vercel, supports managed backups and connection security, and can scale without managing a database server.

1. In Vercel, open the project and choose **Storage** or **Marketplace**.
2. Add a Neon PostgreSQL database in the same region as the Vercel project.
3. Copy both the pooled and direct PostgreSQL connection strings from Neon.
4. Confirm both connection strings include TLS, normally `sslmode=require`.
5. Keep both connection strings private. Never expose them through a variable beginning with `NEXT_PUBLIC_`.

Use Neon's pooled connection string as the Vercel `DATABASE_URL`. Use the direct connection string only when running Prisma migration commands from a trusted terminal. This keeps serverless runtime connections pooled while migrations use a direct database session.

Official references:

- [Neon on the Vercel Marketplace](https://vercel.com/marketplace/neon)
- [Prisma ORM with Neon](https://docs.prisma.io/docs/v6/orm/overview/databases/neon)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)

## 2. Configure Vercel Environment Variables

In **Vercel project settings > Environment Variables**, add:

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes for the production engine | Neon pooled PostgreSQL connection string |
| `ENGINE_USERNAME` | Yes for the production engine | A non-obvious operator username |
| `ENGINE_PASSWORD` | Yes for the production engine | A unique password-manager-generated password |
| `ENGINE_SETUP_TOKEN` | Temporary, database initialization only | A unique password-manager-generated token of at least 32 characters |
| `NEXT_PUBLIC_SITE_URL` | Recommended | The public production URL, such as `https://webworkshop.dev` |
| `NOMINATIM_API_URL` | No | Optional approved geocoding endpoint override |
| `OVERPASS_API_URL` | No | Optional approved public-map discovery endpoint override |
| `GOOGLE_PLACES_API_KEY` | No | Enables licensed Google Places text search enrichment |
| `AZURE_MAPS_API_KEY` | No | Preferred Microsoft local-business source; enables Azure Maps POI Search |
| `BING_MAPS_API_KEY` | No | Legacy Bing Local Search for eligible enterprise accounts only, until June 30, 2028 |
| `YELP_API_KEY` | No | Enables Yelp business identity, phone, rating, and review-count enrichment |
| `YELLOW_PAGES_API_URL` | No | Approved/licensed directory endpoint returning `businesses`, `results`, or `records` |
| `YELLOW_PAGES_API_KEY` | No | Optional bearer token for the approved directory endpoint |
| `OUTREACH_NOTIFY_EMAIL` | No | Internal operator email for Loom Needed notifications only |
| `OUTREACH_NOTIFY_FROM_EMAIL` | No | Verified sender address for internal Loom Needed notifications |
| `OUTREACH_NOTIFY_ON_LOOM_NEEDED` | No | Set to `true` to notify internally when a prospect says yes and a Loom task is created |
| `WEBWORKSHOP_POSTAL_ADDRESS` | Recommended | Prospect Engine sender mailing address inserted into manual email drafts; email packages are not send-ready until this is set |
| `OUTREACH_POSTAL_ADDRESS` | Auto Email Pilot only | Separate Auto Email Pilot/provider-readiness postal address; this does not replace `WEBWORKSHOP_POSTAL_ADDRESS` for Top Prospects packages |
| `OUTREACH_AUTO_SEND_ENABLED` | Auto Email Pilot only | Must be exactly `true` before any queued approved email can send |
| `OUTREACH_SEND_PROVIDER` | Auto Email Pilot only | Must be `resend` for the current email executor |
| `RESEND_API_KEY` | Auto Email Pilot only | Resend API key used only for approved queued email sending and optional internal Loom notifications |
| `OUTREACH_FROM_EMAIL` | Auto Email Pilot only | Verified sender used by approved queued email sending |
| `OUTREACH_REPLY_TO_EMAIL` | Auto Email Pilot only | Reply-to address used by approved queued email sending |
| `OUTREACH_DAILY_CAP` | Auto Email Pilot only | Hard provider-side daily cap, clamped to 0-25 by the app |
| `AUTOPILOT_DISABLED` | No | Set to `true` for a hard environment-level kill switch that prevents new Autopilot runs while leaving saved-batch review available |

Apply production secrets to the **Production** environment. Use separate credentials and a separate database for Preview if preview deployments need engine access.

Do not add `DATABASE_URL`, `ENGINE_USERNAME`, or `ENGINE_PASSWORD` to client-side code, public documentation, screenshots, or variables prefixed with `NEXT_PUBLIC_`.

The optional Loom notification variables are internal only. They never send anything to prospects, and the workflow still requires you to manually record and send the Loom. If the notification variables or `RESEND_API_KEY` are missing, the Loom Needed task still works and no runtime error is raised.

Postal address variables are intentionally split:

- `WEBWORKSHOP_POSTAL_ADDRESS` is the address the Prospect Engine uses for Top Prospects and manual Outreach Package email draft compliance/readiness.
- `OUTREACH_POSTAL_ADDRESS`, if configured, is only for the separate Auto Email Pilot/provider readiness gate.
- If both exist, Top Prospects and Prospect Engine email packages use `WEBWORKSHOP_POSTAL_ADDRESS`.
- If `WEBWORKSHOP_POSTAL_ADDRESS` is missing, email packages can still be reviewed, but they are not considered send-ready and no placeholder address is inserted into copyable final drafts.

Set `AUTOPILOT_DISABLED=true` when you want a hard Production kill switch. It blocks new Autopilot starts, retries, and next-batch handoffs. It does not cancel completed jobs, does not pretend provider jobs were cancelled, and does not block manual review of saved batches or manual Top Prospects searches.

Auto Email Pilot remains off by default. A queued email can send only when all of these are true: Autonomous Growth mode is `Auto Email Pilot`, the in-app kill switch is off, `OUTREACH_AUTO_SEND_ENABLED=true`, Resend sender/reply-to/postal env vars are configured, the item is already `Queued`, the recipient is a public email, the email body uses a public `/p/` preview link, opt-out language and sender postal address are present, no placeholder/internal score/protected `/engine` link exists, daily cap and cooldown allow it, and no matching email/domain suppression or previous send is found. Contact forms, quote forms, social DMs, phone calls, and Looms remain manual-only.

Emergency suppression controls are available in Autonomous Growth. Mark bounced, complained, opted-out, or manually suppressed addresses immediately move matching queue items into non-sendable statuses and write audit events. Future Auto Email Pilot sends are blocked for those matching addresses/domains.

### Provider Coverage for Real Lead Discovery

For real Top Prospects and Autopilot discovery, configure provider coverage before increasing scan count:

- `GOOGLE_PLACES_API_KEY` is recommended for real local business discovery and should be configured first.
- `YELP_API_KEY` is optional and can improve business identity, phone, rating, and review-count enrichment.
- `AZURE_MAPS_API_KEY` or `BING_MAPS_API_KEY` is useful, but may not return enough usable websites alone.
- OpenStreetMap and Overpass are backup-only public sources and may timeout or return sparse records.
- Provider Smoke Test creates no Outreach Packages and sends nothing.
- Autopilot sends nothing automatically. Emails, social DMs, contact forms, phone calls, and Looms remain manual or review-only.

Google Places uses Places API (New) by default through `https://places.googleapis.com/v1/places:searchText`. Only set `GOOGLE_PLACES_API_URL` if you intentionally need the legacy `https://maps.googleapis.com/maps/api/place/textsearch/json` endpoint; otherwise leave it unset.

Recommended launch sequence:

1. Add `GOOGLE_PLACES_API_KEY` in Vercel Production.
2. Redeploy the latest production deployment.
3. Run Provider Smoke Test in `/engine` > System.
4. Confirm Google Places succeeds and returns records.
5. Run a small Top Prospects test: Pressure Washing, Tampa, FL, scan 25, final 5, written outreach only, exclude previously reviewed on.
6. Start Autopilot only after the small test produces reviewable prospects.

The names are exact and case-sensitive: `ENGINE_USERNAME` and `ENGINE_PASSWORD`. After adding or changing either value, create a new Production deployment. Vercel does not apply environment-variable changes to deployments that already exist.

Engine authentication runs in Node.js middleware so it reads the same runtime environment as the engine API routes. If configuration is missing, the 503 response includes an `X-Engine-Auth-Configuration` header that reports only whether each required variable is present; it never contains either secret value.

## 3. Apply Prisma Migrations

Run migrations once from a trusted terminal before using `/engine` in production. Do not add migrations to the Vercel build command because concurrent deployments can race.

If the production `DATABASE_URL` exists only in Vercel, use the protected one-time initializer instead:

1. Add a temporary Production-only `ENGINE_SETUP_TOKEN` containing at least 32 random characters.
2. Redeploy Production so the new token is available to the function.
3. Send one authenticated `POST` request to `/api/engine/setup-database` with the token in the `X-Engine-Setup-Token` header. The request must also use the existing `/engine` Basic authentication credentials.
4. Confirm the response status is `201` and the System workspace reports that PostgreSQL tables are reachable.
5. Delete `ENGINE_SETUP_TOKEN` from Vercel and redeploy. The endpoint then returns `503` and cannot initialize another database.

The initializer runs only in Vercel Production, prefers Neon's direct `DATABASE_URL_UNPOOLED` connection when available, acquires a bounded transaction-scoped PostgreSQL advisory lock, refuses partial schemas, applies the reviewed repository migrations in dependency order inside one transaction, records their checksums in `_prisma_migrations`, and refuses to run again after all required tables exist. Transaction-scoped locks release automatically on commit, rollback, timeout, or connection close. A concurrent attempt returns a safe retryable response instead of releasing another session's lock. The initializer never returns the database URL or setup token.

Use secure prompts so credentials and the temporary token are not stored in PowerShell history:

```powershell
$credential = Get-Credential -Message "Enter ENGINE_USERNAME and ENGINE_PASSWORD"
$secureSetupToken = Read-Host "Enter ENGINE_SETUP_TOKEN" -AsSecureString
$setupToken = [System.Net.NetworkCredential]::new("", $secureSetupToken).Password
$basicValue = "$($credential.UserName):$($credential.GetNetworkCredential().Password)"
$basicHeader = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($basicValue))

try {
  Invoke-RestMethod -Method Post `
    -Uri "https://www.webworkshop.dev/api/engine/setup-database" `
    -Headers @{
      Authorization = "Basic $basicHeader"
      "X-Engine-Setup-Token" = $setupToken
    }
} finally {
  Remove-Variable setupToken, basicValue, basicHeader, credential, secureSetupToken
}
```

PowerShell:

```powershell
$env:DATABASE_URL="<neon-direct-postgresql-connection-string>"
npm.cmd run prisma:deploy
```

Expected result: Prisma reports that all migrations were successfully applied. The command applies the reviewed files in `prisma/migrations`.

Prisma documents `prisma migrate deploy` as the command for applying pending migrations in production and staging environments: [Prisma migrate command reference](https://docs.prisma.io/docs/cli/migrate).

## 4. Deploy and Verify

1. Deploy the current `main` branch to Vercel.
2. Open the public homepage and at least one public secondary route, such as `/pricing`.
3. Confirm both public routes load without an authentication prompt.
4. Open `https://<production-domain>/engine`.
5. Enter `ENGINE_USERNAME` and `ENGINE_PASSWORD` in the browser's Basic authentication prompt.
6. Open the **System** workspace.
7. Confirm it reports **Core systems ready**, database reachable, and engine access credentials configured.
8. Create a test prospect, update its status, add a note, and reload `/engine` to confirm PostgreSQL persistence.

Always access `/engine` through HTTPS. Do not share its URL and credentials in public channels. Rotate the Basic authentication password if it is disclosed.

## 5. Failure Isolation

The public website remains available when the engine database is absent or unreachable:

- Middleware authentication only matches `/engine/:path*` and `/api/engine/:path*`.
- Public pages do not read from the Prospect Engine repository.
- In production, an engine without `ENGINE_USERNAME` and `ENGINE_PASSWORD` returns HTTP 503.
- In production, engine prospect APIs without `DATABASE_URL` return HTTP 503.
- In local development, the engine uses a clearly labeled, non-durable in-memory store when `DATABASE_URL` is absent.

This isolation means an engine configuration problem must not take down or protect public WebWorkshop routes.

## What Works Now

- Contractor prospect creation and low-volume public-data discovery
- Website analysis with robots, redirect, response-size, rate-limit, and private-network controls
- Prospect scoring, search, filters, sorting, pipeline status, notes, and activity history
- Personalized outreach drafts with explicit human approval before copying
- Contractor-specific website preview concepts
- PostgreSQL persistence, revision history, status history, audit events, and rate limits
- Production fail-closed behavior for missing engine authentication or database configuration

## What Is Local-Only or Limited

- Without `DATABASE_URL`, local development uses server memory that resets when the server restarts.
- Default Nominatim and Overpass discovery is suitable only for low-volume, user-triggered research.
- Google Places, Bing Local, Yelp, and Yellow Pages enrichment remain disabled until their licensed server-side credentials or approved endpoint are configured. The engine does not scrape search-result pages.
- Website analysis and generated content use deterministic application logic, not a paid AI provider.
- Basic authentication is appropriate for one trusted operator, not a multi-user team with roles.
- Monitoring, alerting, retention policy, and provider-specific backup verification must be configured operationally.

## What Needs a Paid Lead Data Provider Later

Before high-volume or national lead discovery, replace the default public-map discovery endpoints with an approved commercial provider that permits the intended business use. The provider should supply reliable business identity, website, phone, public email where licensed, location, trade/category, freshness, usage rights, rate limits, and deletion or suppression handling.

Keep discovery user-triggered and human-reviewed. Do not add automatic mass-email sending.
