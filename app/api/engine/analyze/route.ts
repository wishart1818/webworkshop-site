import { NextResponse } from "next/server";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import { activity, calculatePriority, withPresenceGapReview, type Prospect } from "@/lib/prospect-engine";
import { saveProspect } from "@/lib/prospect-repository";
import { validateProspect } from "@/lib/prospect-validation";
import { analyzePublicWebsite, classifyWebsiteAnalysisFailure } from "@/lib/site-analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function invalidWebsiteValidation(error: string) {
  return /^Website (?:must use HTTP or HTTPS|cannot include credentials|uses an unsupported port)|Invalid URL$/i.test(error);
}

export async function POST(request: Request) {
  let prospectId = "";
  let validatedProspect: Prospect | null = null;
  try {
    const input = await request.json();
    const validation = validateProspect(input);
    if (!validation.ok) {
      const safeFallback = invalidWebsiteValidation(validation.error) && input && typeof input === "object" && !Array.isArray(input)
        ? validateProspect({ ...input, website: "", prospectType: "no_website_social_only" })
        : null;
      if (safeFallback?.ok) {
        prospectId = safeFallback.value.id;
        const prospect = await saveProspect(withPresenceGapReview(safeFallback.value, "invalid_website", "No usable website found."));
        await safeRecordAudit({ action: "website_analysis", outcome: "success", subject: prospectId, metadata: { mode: "presence_gap", status: prospect.websiteStatus } });
        return NextResponse.json({ prospect, warning: "No usable website found." });
      }
      await safeRecordAudit({ action: "website_analysis", outcome: "rejected", metadata: { reason: validation.error } });
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    validatedProspect = validation.value;
    prospectId = validatedProspect.id;
    if (!validatedProspect.website) {
      const prospect = await saveProspect(withPresenceGapReview(validatedProspect, "no_owned_website", "No owned website detected."));
      await safeRecordAudit({ action: "website_analysis", outcome: "success", subject: prospectId, metadata: { mode: "presence_gap", status: prospect.websiteStatus } });
      return NextResponse.json({ prospect });
    }
    const hostname = new URL(validatedProspect.website).hostname;
    await enforceRateLimit({ action: "website_analysis", subject: hostname, limit: 6, windowMs: 60 * 60 * 1000 });

    const analysis = await analyzePublicWebsite(validatedProspect);
    const switchingFromPresenceGap = validatedProspect.prospectType === "no_website_social_only";
    const prospect = await saveProspect({
      ...validatedProspect,
      prospectType: "redesign",
      classification: "website_redesign",
      websiteStatus: "usable",
      websiteStatusDetail: "Website analysis completed successfully.",
      websiteAnalysisAttemptedAt: analysis.analyzedAt,
      analysis,
      outreach: switchingFromPresenceGap ? undefined : validatedProspect.outreach,
      preview: switchingFromPresenceGap ? undefined : validatedProspect.preview,
      priorityScore: calculatePriority(analysis, validatedProspect.sizeIndicator, validatedProspect.serviceArea),
      status: validatedProspect.status === "New" ? "Reviewed" : validatedProspect.status,
      activities: [activity("analysis", `Live website analysis completed with a score of ${analysis.overallScore}.`), ...validatedProspect.activities],
    });
    await safeRecordAudit({ action: "website_analysis", outcome: "success", subject: hostname, metadata: { prospectId, score: analysis.overallScore } });
    return NextResponse.json({ prospect });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const websiteFailure = classifyWebsiteAnalysisFailure(error);
    if (websiteFailure && validatedProspect) {
      const prospect = await saveProspect(withPresenceGapReview(validatedProspect, websiteFailure.status, websiteFailure.detail));
      await safeRecordAudit({ action: "website_analysis", outcome: "success", subject: prospectId, metadata: { mode: "presence_gap", status: websiteFailure.status } });
      return NextResponse.json({ prospect, warning: websiteFailure.detail });
    }
    const expected = /Only HTTP|credentials cannot|unsupported port|Local websites|private or unsupported|robots.txt does not allow|too large|redirected too many|did not return HTML|Please wait|Rate limit reached|returned HTTP/.test(message);
    if (!expected) console.error("Unable to analyze website.", error);
    await safeRecordAudit({ action: "website_analysis", outcome: expected ? "rejected" : "failure", subject: prospectId || undefined, metadata: { message } });
    return NextResponse.json(
      { error: expected ? message : "Unable to analyze website right now." },
      { status: expected ? 422 : 500 },
    );
  }
}
