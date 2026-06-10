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

Apply production secrets to the **Production** environment. Use separate credentials and a separate database for Preview if preview deployments need engine access.

Do not add `DATABASE_URL`, `ENGINE_USERNAME`, or `ENGINE_PASSWORD` to client-side code, public documentation, screenshots, or variables prefixed with `NEXT_PUBLIC_`.

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
- Website analysis and generated content use deterministic application logic, not a paid AI provider.
- Basic authentication is appropriate for one trusted operator, not a multi-user team with roles.
- Monitoring, alerting, retention policy, and provider-specific backup verification must be configured operationally.

## What Needs a Paid Lead Data Provider Later

Before high-volume or national lead discovery, replace the default public-map discovery endpoints with an approved commercial provider that permits the intended business use. The provider should supply reliable business identity, website, phone, public email where licensed, location, trade/category, freshness, usage rights, rate limits, and deletion or suppression handling.

Keep discovery user-triggered and human-reviewed. Do not add automatic mass-email sending.
