import { NextResponse } from "next/server";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import { type Prospect } from "@/lib/prospect-engine";
import { saveProspect } from "@/lib/prospect-repository";
import { validateProspect } from "@/lib/prospect-validation";
import { verifyProspectWebsite } from "@/lib/site-analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let prospectId = "";
  try {
    const input = await request.json();
    const validation = validateProspect(input);
    if (!validation.ok) {
      await safeRecordAudit({ action: "website_analysis", outcome: "rejected", metadata: { reason: validation.error } });
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const validatedProspect: Prospect = validation.value;
    prospectId = validatedProspect.id;
    if (!validatedProspect.website) {
      const verified = await verifyProspectWebsite(validatedProspect);
      const prospect = await saveProspect(verified.prospect);
      await safeRecordAudit({ action: "website_verification", outcome: "success", subject: prospectId, metadata: { status: verified.report.status, attemptCount: 0, sent: 0 } });
      return NextResponse.json({ prospect, verification: verified.report });
    }
    const hostname = new URL(validatedProspect.website).hostname;
    await enforceRateLimit({ action: "website_analysis", subject: hostname, limit: 6, windowMs: 60 * 60 * 1000 });

    const verified = await verifyProspectWebsite(validatedProspect);
    const prospect = await saveProspect(verified.prospect);
    await safeRecordAudit({
      action: "website_verification",
      outcome: verified.report.status === "usable" ? "success" : "rejected",
      subject: hostname,
      metadata: {
        prospectId,
        status: verified.report.status,
        attemptCount: verified.report.attempts.length,
        score: verified.analysis?.overallScore ?? null,
        sent: 0,
      },
    });
    return NextResponse.json({
      prospect,
      verification: verified.report,
      ...(verified.report.status === "usable" ? {} : { warning: verified.report.explanation }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const expected = /Only HTTP|credentials cannot|unsupported port|Local websites|private or unsupported|robots.txt does not allow|too large|redirected too many|did not return HTML|Please wait|Rate limit reached|returned HTTP/.test(message);
    if (!expected) console.error("Unable to analyze website.", error);
    await safeRecordAudit({ action: "website_analysis", outcome: expected ? "rejected" : "failure", subject: prospectId || undefined, metadata: { message } });
    return NextResponse.json(
      { error: expected ? message : "Unable to analyze website right now." },
      { status: expected ? 422 : 500 },
    );
  }
}
