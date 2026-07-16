import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createOrRefreshAutonomousReviewPackageForProspect,
  regenerateProspectOutreachWithCurrentScript,
} from "@/lib/autonomous-growth-repository";
import { applyLegacyOutreachBackfill, previewLegacyOutreachBackfill } from "@/lib/legacy-outreach-backfill";
import { safeRecordAudit } from "@/lib/operational-controls";
import { listProspects, saveProspect } from "@/lib/prospect-repository";
import { PREVIEW_GENERATOR_VERSION, previewRegenerationBlockReason, regeneratePreview } from "@/lib/prospect-engine";
import { evaluatePreviewSendWorthiness } from "@/lib/preview-send-worthiness";
import { getPublicProspectPreview } from "@/lib/top-prospect-repository";
import { researchProspectForPreview } from "@/lib/preview-business-research";

export const dynamic = "force-dynamic";

function publicPreviewTokenFromLink(value: string | undefined) {
  const match = value?.match(/\/p\/([A-Za-z0-9_-]{32})/);
  return match?.[1] ?? "";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      action?: string;
      prospectId?: string;
      feedback?: string;
      confirmed?: boolean;
      previewOnly?: boolean;
    };
    if (payload.action === "preview_legacy_backfill") {
      const result = await previewLegacyOutreachBackfill();
      await safeRecordAudit({ action: "legacy_outreach_backfill_preview", outcome: "success", metadata: { prospects: result.checked.prospects, queuePackages: result.checked.queuePackages } });
      return NextResponse.json({ result });
    }
    if (payload.action === "apply_legacy_backfill") {
      const result = await applyLegacyOutreachBackfill({ confirmed: payload.confirmed === true });
      await safeRecordAudit({ action: "legacy_outreach_backfill_apply", outcome: result.status === "completed" ? "success" : "rejected", metadata: { status: result.status, updated: result.updated } });
      return NextResponse.json({ result }, { status: result.status === "blocked" ? 409 : 200 });
    }
    if (payload.action === "regenerate_prospect_outreach") {
      if (!payload.prospectId) return NextResponse.json({ error: "Prospect ID is required." }, { status: 400 });
      const result = await regenerateProspectOutreachWithCurrentScript(payload.prospectId, { previewOnly: payload.previewOnly });
      if (!result) return NextResponse.json({ error: "Prospect was not found." }, { status: 404 });
      await safeRecordAudit({ action: "prospect_outreach_regenerate", outcome: "success", subject: payload.prospectId, metadata: { previewOnly: Boolean(payload.previewOnly), queueUpdated: result.wouldUpdateQueue } });
      return NextResponse.json(result);
    }
    if (payload.action === "regenerate_prospect_preview") {
      if (!payload.prospectId) return NextResponse.json({ error: "Prospect ID is required." }, { status: 400 });
      const prospect = (await listProspects()).find((item) => item.id === payload.prospectId);
      if (!prospect) return NextResponse.json({ error: "Prospect was not found." }, { status: 404 });
      const blockReason = previewRegenerationBlockReason(prospect);
      if (blockReason) {
        await safeRecordAudit({ action: "prospect_preview_regenerate", outcome: "rejected", subject: payload.prospectId, metadata: { reason: blockReason } });
        return NextResponse.json({ error: `Preview regeneration blocked: ${blockReason}.` }, { status: 409 });
      }
      const researchedProspect = await researchProspectForPreview(prospect);
      const updated = regeneratePreview(researchedProspect, payload.feedback ?? "");
      const preflightVerdict = evaluatePreviewSendWorthiness(updated, {
        publicPreviewUrl: "/p/abcdefghijklmnopqrstuvwxyzABCDEF",
        publicPreviewVerified: true,
      });
      if (preflightVerdict.verdict === "blocked") {
        await safeRecordAudit({
          action: "prospect_preview_regenerate",
          outcome: "rejected",
          subject: payload.prospectId,
          metadata: { reason: preflightVerdict.primaryWarning, previewVersion: PREVIEW_GENERATOR_VERSION },
        });
        return NextResponse.json({
          error: `Preview regeneration blocked: ${preflightVerdict.primaryWarning}. Previous public preview was retained. Nothing was sent.`,
          previewVerdict: preflightVerdict,
        }, { status: 422 });
      }
      const saved = await saveProspect(updated);
      const queueItem = await createOrRefreshAutonomousReviewPackageForProspect(saved.id);
      const publicPreviewLink = queueItem?.previewLink ?? "";
      const publicPreviewToken = publicPreviewTokenFromLink(publicPreviewLink);
      const publicProspect = publicPreviewToken ? await getPublicProspectPreview(publicPreviewToken) : null;
      const publicPreviewVerified = Boolean(
        publicProspect?.id === saved.id
        && publicProspect.preview?.generatedAt === saved.preview?.generatedAt
        && publicProspect.preview?.previewVersion === saved.preview?.previewVersion,
      );
      const previewVerdict = evaluatePreviewSendWorthiness(saved, {
        publicPreviewUrl: publicPreviewLink,
        publicPreviewVerified,
      });
      if (!publicPreviewVerified || previewVerdict.verdict === "blocked") {
        await saveProspect(prospect);
        await createOrRefreshAutonomousReviewPackageForProspect(prospect.id).catch(() => null);
        await safeRecordAudit({
          action: "prospect_preview_regenerate",
          outcome: "failure",
          subject: payload.prospectId,
          metadata: {
            reason: previewVerdict.primaryWarning,
            publicPreviewVerified,
            previewVersion: PREVIEW_GENERATOR_VERSION,
          },
        });
        return NextResponse.json({
          error: `Preview regeneration could not verify the updated public preview: ${previewVerdict.primaryWarning}. Previous public preview was retained. Nothing was sent.`,
          previewVerdict,
          publicPreviewVerified,
        }, { status: 502 });
      }
      revalidatePath(`/p/${publicPreviewToken}`);
      revalidatePath("/engine");
      await safeRecordAudit({
        action: "prospect_preview_regenerate",
        outcome: "success",
        subject: payload.prospectId,
        metadata: {
          previewVersion: PREVIEW_GENERATOR_VERSION,
          queueItemId: queueItem?.id ?? "",
          feedbackProvided: Boolean(payload.feedback?.trim()),
          previewVerdict: previewVerdict.label,
          resolvedImageCount: previewVerdict.resolvedImageCount,
          publicPreviewVerified,
        },
      });
      return NextResponse.json({
        updatedProspect: saved,
        queueItem,
        previewVersion: PREVIEW_GENERATOR_VERSION,
        previewVerdict,
        publicPreviewVerified,
        publicPreviewUrl: publicPreviewLink,
        message: `Public preview updated. ${previewVerdict.label}: ${previewVerdict.primaryWarning} Nothing was sent.`,
      });
    }
    if (payload.action === "create_autonomous_review_package") {
      if (!payload.prospectId) return NextResponse.json({ error: "Prospect ID is required." }, { status: 400 });
      const item = payload.previewOnly ? null : await createOrRefreshAutonomousReviewPackageForProspect(payload.prospectId);
      await safeRecordAudit({ action: "autonomous_review_package_create", outcome: payload.previewOnly || item ? "success" : "rejected", subject: payload.prospectId, metadata: { previewOnly: Boolean(payload.previewOnly), queueItemId: item?.id ?? "" } });
      return NextResponse.json({
        previewOnly: Boolean(payload.previewOnly),
        queueItem: item,
        message: payload.previewOnly
          ? "Preview only. A current review package would be created or refreshed. Nothing was sent."
          : item ? "Current review package created or refreshed. Nothing was sent." : "Prospect was not found.",
      }, { status: !payload.previewOnly && !item ? 404 : 200 });
    }
    return NextResponse.json({ error: "Unsupported outreach sync action." }, { status: 400 });
  } catch (error) {
    await safeRecordAudit({ action: "outreach_sync", outcome: "failure", metadata: { message: error instanceof Error ? error.message : "Unknown error" } });
    return NextResponse.json({ error: "Outreach sync action failed safely. No outreach was sent." }, { status: 500 });
  }
}
