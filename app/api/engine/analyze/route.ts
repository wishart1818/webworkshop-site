import { NextResponse } from "next/server";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import { activity, calculatePriority } from "@/lib/prospect-engine";
import { saveProspect } from "@/lib/prospect-repository";
import { validateProspect } from "@/lib/prospect-validation";
import { analyzePublicWebsite } from "@/lib/site-analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let prospectId = "";
  try {
    const validation = validateProspect(await request.json());
    if (!validation.ok) {
      await safeRecordAudit({ action: "website_analysis", outcome: "rejected", metadata: { reason: validation.error } });
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    prospectId = validation.value.id;
    const hostname = new URL(validation.value.website).hostname;
    await enforceRateLimit({ action: "website_analysis", subject: hostname, limit: 6, windowMs: 60 * 60 * 1000 });

    const analysis = await analyzePublicWebsite(validation.value);
    const prospect = await saveProspect({
      ...validation.value,
      analysis,
      priorityScore: calculatePriority(analysis, validation.value.sizeIndicator, validation.value.serviceArea),
      status: validation.value.status === "New" ? "Reviewed" : validation.value.status,
      activities: [activity("analysis", `Live website analysis completed with a score of ${analysis.overallScore}.`), ...validation.value.activities],
    });
    await safeRecordAudit({ action: "website_analysis", outcome: "success", subject: hostname, metadata: { prospectId, score: analysis.overallScore } });
    return NextResponse.json({ prospect });
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
