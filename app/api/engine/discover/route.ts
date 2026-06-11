import { NextResponse } from "next/server";
import { discoverContractorsWithDiagnostics } from "@/lib/lead-discovery";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import type { TradeCategory } from "@/lib/prospect-engine";
import { requestSubject } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const subject = requestSubject(request);
  try {
    await enforceRateLimit({ action: "lead_discovery", subject, limit: 8, windowMs: 60 * 60 * 1000 });
    const input = (await request.json()) as { city?: unknown; state?: unknown; trade?: unknown; radiusKm?: unknown };
    const result = await discoverContractorsWithDiagnostics({
      city: typeof input.city === "string" ? input.city : "",
      state: typeof input.state === "string" ? input.state : "",
      trade: input.trade as TradeCategory,
      radiusKm: Number(input.radiusKm),
    });
    await safeRecordAudit({
      action: "lead_discovery",
      outcome: "success",
      subject,
      metadata: {
        city: typeof input.city === "string" ? input.city : "",
        trade: typeof input.trade === "string" ? input.trade : "",
        resultCount: result.leads.length,
        rawProviderCount: result.diagnostics.rawProviderCount,
        afterDistanceFilteringCount: result.diagnostics.afterDistanceFilteringCount,
        afterDuplicateFilteringCount: result.diagnostics.afterDuplicateFilteringCount,
        afterQualificationFilteringCount: result.diagnostics.afterQualificationFilteringCount,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const expected = /valid city|two-letter state|not supported|wait|Rate limit reached|could not be found/.test(message);
    const providerFailure = /provider could not complete/.test(message);
    if (!expected && !providerFailure) console.error("Unable to discover leads.", error);
    await safeRecordAudit({ action: "lead_discovery", outcome: expected ? "rejected" : "failure", subject, metadata: { message } });
    return NextResponse.json(
      { error: expected || providerFailure ? message : "Unable to discover leads right now." },
      { status: expected ? 422 : providerFailure ? 502 : 500 },
    );
  }
}
