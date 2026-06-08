import { NextResponse } from "next/server";
import { engineAuthState } from "@/lib/engine-auth";
import { databaseHealth, operationalMode, safeListAuditEvents } from "@/lib/operational-controls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const database = await databaseHealth();
  const authentication = engineAuthState();
  const auditEvents = await safeListAuditEvents(database);
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
        message: process.env.OVERPASS_API_URL || process.env.NOMINATIM_API_URL
          ? "Custom public-data provider endpoints are configured."
          : "Default low-volume public-data providers are active.",
      },
      audit: {
        configured: true,
        message: operationalMode() === "postgresql"
          ? "Audit events and rate limits are persisted in PostgreSQL."
          : "Audit events and rate limits reset when the development server restarts.",
      },
    },
    auditEvents,
  });
}
