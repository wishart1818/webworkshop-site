import { NextResponse } from "next/server";
import { discoverContractorsWithDiagnostics } from "@/lib/lead-discovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
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
    return NextResponse.json({
      smokeTest: {
        query: "Pressure Washing near Tampa, FL",
        createdOutreachPackages: false,
        sentOutreach: false,
        diagnostics: result.diagnostics,
        sampleCount: result.leads.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider smoke test failed safely.";
    console.warn("[provider-smoke-test] failed safely.", { message });
    return NextResponse.json({
      smokeTest: {
        query: "Pressure Washing near Tampa, FL",
        createdOutreachPackages: false,
        sentOutreach: false,
        diagnostics: null,
        sampleCount: 0,
        safeError: message,
      },
    }, { status: 200 });
  }
}
