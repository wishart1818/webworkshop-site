import { NextResponse } from "next/server";
import { engineAuthState } from "@/lib/engine-auth";
import { discoveryProviderCoverageStatus, discoveryProviderHealth } from "@/lib/lead-discovery";
import { latestOperatorSafeTestResults } from "@/lib/operator-test-history";
import { databaseHealth, operationalMode, safeListAuditEvents } from "@/lib/operational-controls";
import { latestSystemSelfCheckReport } from "@/lib/system-self-check";
import { topProspectBuildVersion } from "@/lib/top-prospect-list-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const database = await databaseHealth();
  const authentication = engineAuthState();
  const auditEvents = await safeListAuditEvents(database);
  const latestSafeTests = await latestOperatorSafeTestResults();
  const latestProviderDiagnostics = latestSafeTests.provider_smoke?.diagnostics?.providerDiagnostics ?? null;
  const production = process.env.NODE_ENV === "production";
  const ready = database.reachable && authentication.configured;

  return NextResponse.json({
    status: ready ? "ready" : production ? "blocked" : "development",
    checks: {
      database,
      authentication: {
        configured: authentication.configured,
        message: authentication.configured
          ? "Engine access credentials are configured."
          : production
            ? "ENGINE_USERNAME and ENGINE_PASSWORD are required."
            : "Development access is open.",
      },
      discovery: {
        configured: true,
        message: [
          "OSM",
          process.env.GOOGLE_PLACES_API_KEY && "Google Places",
          (process.env.AZURE_MAPS_API_KEY || process.env.BING_MAPS_API_KEY) && "Microsoft Local",
          process.env.YELP_API_KEY && "Yelp",
          process.env.YELLOW_PAGES_API_URL && "Yellow Pages",
        ].filter(Boolean).join(", ") + " discovery sources are active.",
      },
      audit: {
        configured: true,
        message: operationalMode() === "postgresql"
          ? "Audit events and rate limits are persisted in PostgreSQL."
          : "Audit events and rate limits reset when the development server restarts.",
      },
    },
    auditEvents,
    selfCheck: latestSystemSelfCheckReport(),
    buildVersion: topProspectBuildVersion(),
    providerCoverage: discoveryProviderCoverageStatus(latestProviderDiagnostics),
    providerHealth: discoveryProviderHealth(latestProviderDiagnostics),
    autopilotEnvironmentKillSwitchEnabled: process.env.AUTOPILOT_DISABLED === "true",
  });
}
