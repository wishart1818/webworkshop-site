import { NextResponse } from "next/server";
import { enforceRateLimit, OperationalRateLimitError, safeRecordAudit } from "@/lib/operational-controls";
import {
  auditExistingWebsiteRecords,
  confirmUsableWebsiteNotFit,
  recheckProspectWebsite,
  setProspectWebsiteFitDisposition,
  websiteRepairConfirmationText,
  websiteRepairRequestBatchLimit,
  websiteRepairReviewTokenMaxLength,
} from "@/lib/website-verification-operations";
import { enforceWebsiteRepairApplyRateLimit } from "@/lib/website-repair-rate-limit";
import {
  beginFullLegacyWebsiteCleanupApply,
  continueFullLegacyWebsiteCleanup,
  continueFullLegacyWebsiteCleanupApply,
  getFullLegacyWebsiteCleanup,
  startFullLegacyWebsiteCleanup,
} from "@/lib/full-legacy-website-cleanup";
import {
  beginManualReviewTriageApply,
  continueManualReviewTriage,
  continueManualReviewTriageApply,
  getManualReviewTriage,
  manualReviewTriageConfirmationText,
  startManualReviewTriage,
} from "@/lib/manual-review-triage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supportedActions = [
  "recheck_website",
  "confirm_usable_not_fit",
  "set_website_fit",
  "audit_existing_records",
  "apply_existing_record_repair",
  "start_full_legacy_cleanup",
  "continue_full_legacy_cleanup",
  "get_full_legacy_cleanup",
  "apply_full_legacy_cleanup",
  "continue_full_legacy_cleanup_apply",
  "start_manual_review_triage",
  "continue_manual_review_triage",
  "get_manual_review_triage",
  "apply_manual_review_triage",
  "continue_manual_review_triage_apply",
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

function safeSelectedProspectIds(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Select at least one reviewed website record before applying repairs.");
  if (value.length === 0) throw new Error("Select at least one reviewed website record before applying repairs.");
  if (value.length > 25) throw new Error("The selected website-record set exceeds the reviewed batch limit.");
  const selected = value.map((prospectId) => {
    if (typeof prospectId !== "string") throw new Error("A selected prospect ID is invalid.");
    const normalized = prospectId.trim();
    if (!normalized || normalized.length > 100) throw new Error("A selected prospect ID is invalid.");
    return normalized;
  });
  if (new Set(selected).size !== selected.length) throw new Error("Selected prospect IDs must be unique.");
  return selected;
}

function safeReviewToken(value: unknown) {
  if (typeof value !== "string") throw new Error("A fresh signed website-record review snapshot is required.");
  const token = value.trim();
  if (!token) throw new Error("A fresh signed website-record review snapshot is required.");
  if (token.length > websiteRepairReviewTokenMaxLength) {
    throw new Error("The signed website-record review snapshot exceeds the safe size limit.");
  }
  return token;
}

function safePersistedAuditReference(input: Record<string, unknown>) {
  const auditRunId = safeText(input.auditRunId, 100);
  const accessToken = safeText(input.accessToken, 100);
  if (!auditRunId || !accessToken) throw new Error("A valid persisted audit run reference is required.");
  return { auditRunId, accessToken };
}

function rateLimitOperationLabel(action: string) {
  if (action === "apply_existing_record_repair") return "Website-record repair request";
  if (action === "audit_existing_records") return "Website-record audit request";
  if (action === "recheck_website") return "Website re-check request";
  if (action.includes("full_legacy_cleanup")) return "Full Legacy Cleanup request";
  if (action.includes("manual_review_triage")) return "Manual Review Triage request";
  return "Website-verification request";
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
    if (action === "start_full_legacy_cleanup") {
      return NextResponse.json(await startFullLegacyWebsiteCleanup());
    }
    if (action === "continue_full_legacy_cleanup") {
      return NextResponse.json(await continueFullLegacyWebsiteCleanup(safePersistedAuditReference(input)));
    }
    if (action === "get_full_legacy_cleanup") {
      return NextResponse.json(await getFullLegacyWebsiteCleanup(safePersistedAuditReference(input)));
    }
    if (action === "apply_full_legacy_cleanup") {
      const reference = safePersistedAuditReference(input);
      const confirmation = safeText(input.confirmation, 80);
      return NextResponse.json(await beginFullLegacyWebsiteCleanupApply({ ...reference, confirmation }));
    }
    if (action === "continue_full_legacy_cleanup_apply") {
      return NextResponse.json(await continueFullLegacyWebsiteCleanupApply(safePersistedAuditReference(input)));
    }
    if (action === "start_manual_review_triage") {
      return NextResponse.json(await startManualReviewTriage());
    }
    if (action === "continue_manual_review_triage") {
      return NextResponse.json(await continueManualReviewTriage(safePersistedAuditReference(input)));
    }
    if (action === "get_manual_review_triage") {
      return NextResponse.json(await getManualReviewTriage(safePersistedAuditReference(input)));
    }
    if (action === "apply_manual_review_triage") {
      const reference = safePersistedAuditReference(input);
      const confirmation = safeText(input.confirmation, 80);
      if (confirmation !== manualReviewTriageConfirmationText) {
        throw new Error(`Type ${manualReviewTriageConfirmationText} to Apply the reviewed triage results.`);
      }
      return NextResponse.json(await beginManualReviewTriageApply({ ...reference, confirmation }));
    }
    if (action === "continue_manual_review_triage_apply") {
      return NextResponse.json(await continueManualReviewTriageApply(safePersistedAuditReference(input)));
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
    const confirmation = safeText(input.confirmation, 80);
    const limit = safeOptionalInteger(input.limit, "Batch size");
    const offset = safeOptionalInteger(input.offset, "Audit offset");
    const reviewToken = safeReviewToken(input.reviewToken);
    const selectedProspectIds = safeSelectedProspectIds(input.selectedProspectIds);
    if (limit !== undefined && (limit < 1 || limit > websiteRepairRequestBatchLimit)) {
      throw new Error(`Website-record audit batch size must be between 1 and ${websiteRepairRequestBatchLimit}.`);
    }
    if (offset !== undefined && offset < 0) {
      throw new Error("Website-record audit offset must be a non-negative integer.");
    }
    if (confirmation !== websiteRepairConfirmationText) {
      throw new Error(`Type ${websiteRepairConfirmationText} to apply this audit.`);
    }
    await enforceWebsiteRepairApplyRateLimit();
    return NextResponse.json(await auditExistingWebsiteRecords({
      apply: true,
      confirmation,
      limit,
      offset,
      reviewToken,
      selectedProspectIds,
    }));
  } catch (error) {
    if (error instanceof OperationalRateLimitError) {
      return NextResponse.json({
        error: `${rateLimitOperationLabel(action)} limit reached. Try again in ${error.retryAfterSeconds} seconds. No records were changed and nothing was sent.`,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
        resetsAt: error.resetsAt,
        changed: 0,
        nothingSent: true,
      }, {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      });
    }
    const message = error instanceof Error ? error.message : "Website verification failed safely.";
    const expected = /required|supported|confirmation|not found|cannot be changed|currently verified|rate limit|provider attempt|awaiting reconciliation|dry run|read-only|review|snapshot|evidence changed|signing is not configured|batch size|batch limit|audit offset|candidate range|prospect ID|selected record|selected prospect|Full Legacy Cleanup|candidate snapshot|safety bound|lease changed|not ready|expired|invalid/i.test(message);
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
