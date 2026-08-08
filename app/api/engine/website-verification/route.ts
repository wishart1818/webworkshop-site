import { NextResponse } from "next/server";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import {
  auditExistingWebsiteRecords,
  confirmUsableWebsiteNotFit,
  recheckProspectWebsite,
  setProspectWebsiteFitDisposition,
} from "@/lib/website-verification-operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supportedActions = [
  "recheck_website",
  "confirm_usable_not_fit",
  "set_website_fit",
  "audit_existing_records",
  "apply_existing_record_repair",
] as const;
type WebsiteVerificationAction = (typeof supportedActions)[number];

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeOptionalInteger(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  return value;
}

export async function POST(request: Request) {
  let action = "";
  try {
    const input = await request.json() as Record<string, unknown>;
    action = safeText(input.action, 80);
    if (!supportedActions.includes(action as WebsiteVerificationAction)) {
      return NextResponse.json({ error: "Select a supported website-verification action." }, { status: 400 });
    }
    if (action === "recheck_website") {
      const prospectId = safeText(input.prospectId, 100);
      if (!prospectId) return NextResponse.json({ error: "Prospect ID is required." }, { status: 400 });
      await enforceRateLimit({ action: "website_contact_recheck", subject: prospectId, limit: 4, windowMs: 60 * 60 * 1000 });
      return NextResponse.json(await recheckProspectWebsite(prospectId));
    }
    if (action === "confirm_usable_not_fit") {
      const prospectId = safeText(input.prospectId, 100);
      if (!prospectId) return NextResponse.json({ error: "Prospect ID is required." }, { status: 400 });
      return NextResponse.json(await confirmUsableWebsiteNotFit(prospectId, input.confirmed === true));
    }
    if (action === "set_website_fit") {
      const prospectId = safeText(input.prospectId, 100);
      if (!prospectId) return NextResponse.json({ error: "Prospect ID is required." }, { status: 400 });
      return NextResponse.json(await setProspectWebsiteFitDisposition({
        prospectId,
        disposition: safeText(input.disposition, 80) as Parameters<typeof setProspectWebsiteFitDisposition>[0]["disposition"],
        reason: safeText(input.reason, 1_500),
        confirmed: input.confirmed === true,
      }));
    }
    if (action === "audit_existing_records") {
      const prospectId = safeText(input.prospectId, 100);
      await enforceRateLimit({
        action: prospectId ? "website_record_audit_exact" : "website_record_audit",
        subject: prospectId || "operator",
        limit: prospectId ? 4 : 12,
        windowMs: 60 * 60 * 1000,
      });
      return NextResponse.json(await auditExistingWebsiteRecords({
        apply: false,
        limit: safeOptionalInteger(input.limit, "Batch size"),
        offset: safeOptionalInteger(input.offset, "Audit offset"),
        prospectId,
      }));
    }
    await enforceRateLimit({ action: "website_record_repair", subject: "operator", limit: 1, windowMs: 60 * 60 * 1000 });
    return NextResponse.json(await auditExistingWebsiteRecords({
      apply: true,
      confirmation: safeText(input.confirmation, 80),
      limit: safeOptionalInteger(input.limit, "Batch size"),
      offset: safeOptionalInteger(input.offset, "Audit offset"),
      reviewToken: safeText(input.reviewToken, 2_000),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website verification failed safely.";
    const expected = /required|supported|confirmation|not found|cannot be changed|currently verified|rate limit|provider attempt|awaiting reconciliation|dry run|read-only|review|snapshot|evidence changed|signing is not configured|batch size|audit offset|candidate range|prospect ID/i.test(message);
    if (!expected) console.error("[website-verification] Safe operation failed.", {
      action,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    await safeRecordAudit({
      action: action || "website_verification_request",
      outcome: expected ? "rejected" : "failure",
      metadata: { safeMessage: expected ? message : "Website verification failed safely.", sent: 0 },
    });
    return NextResponse.json(
      { error: expected ? message : "Website verification failed safely. No records were changed and nothing was sent." },
      { status: expected ? 422 : 500 },
    );
  }
}
