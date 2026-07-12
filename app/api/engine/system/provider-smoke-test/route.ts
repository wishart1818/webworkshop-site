import { NextResponse } from "next/server";
import { discoverContractorsWithDiagnostics } from "@/lib/lead-discovery";
import { buildProviderSmokeTestRecord, recordOperatorSafeTestResult } from "@/lib/operator-test-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const result = await discoverContractorsWithDiagnostics({
      city: "Tampa",
      state: "FL",
      trade: "Pressure Washing",
      radiusKm: 10,
      limit: 5,
      prospectType: "all",
      skipThrottle: true,
      logger(event, metadata) {
        console.info(`[provider-smoke-test] ${event}.`, metadata);
      },
    });
    const persisted = buildProviderSmokeTestRecord({
      startedAt,
      completedAt: new Date().toISOString(),
      diagnostics: result.diagnostics,
      sampleCount: result.leads.length,
      createdOutreachPackages: false,
      sentOutreach: false,
    });
    await recordOperatorSafeTestResult(persisted);
    return NextResponse.json({
      smokeTest: {
        query: "Pressure Washing near Tampa, FL",
        createdOutreachPackages: false,
        sentOutreach: false,
        diagnostics: result.diagnostics,
        sampleCount: result.leads.length,
        persisted,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider smoke test failed safely.";
    console.warn("[provider-smoke-test] failed safely.", { message });
    const persisted = buildProviderSmokeTestRecord({
      startedAt,
      completedAt: new Date().toISOString(),
      diagnostics: null,
      sampleCount: 0,
      createdOutreachPackages: false,
      sentOutreach: false,
      safeError: message,
    });
    await recordOperatorSafeTestResult(persisted);
    return NextResponse.json({
      smokeTest: {
        query: "Pressure Washing near Tampa, FL",
        createdOutreachPackages: false,
        sentOutreach: false,
        diagnostics: null,
        sampleCount: 0,
        safeError: message,
        persisted,
      },
    }, { status: 200 });
  }
}
