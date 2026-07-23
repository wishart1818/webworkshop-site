import { NextResponse } from "next/server";
import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { createTopProspectJob, getActiveTopProspectJobSummary, getTopProspectJob } from "@/lib/top-prospect-repository";
import { safeTopProspectJobFailure } from "@/lib/top-prospect-diagnostics";
import { validateTopProspectInput } from "@/lib/top-prospects";
import {
  approveAndQueueEmail,
  failAutopilotCampaignHandoff,
  getAutonomousGrowthDashboard,
  pauseAutopilotCampaign,
  processExistingQualifiedProspects,
  recordEmailSuppression,
  recordAutonomousFeedback,
  rewriteOutreachQueueItem,
  resumeAutopilotCampaign,
  runAutopilotNextBatchNow,
  runFakeAutopilotSmokeTestForDashboard,
  runFullAutoEmailBatch,
  runMarketScoutDryRunForDashboard,
  runSmartAutonomousDryRun,
  sendQueuedEmailQueueItem,
  startAutopilotCampaign,
  stopAutopilotCampaign,
  updateAutonomousGrowthSettings,
  updateOutreachQueueStatus,
} from "@/lib/autonomous-growth-repository";
import {
  autonomousFeedbackLabels,
  outreachQueueStatuses,
  type AutonomousFeedbackLabel,
  type AutonomousGrowthSettings,
  type OutreachQueueStatus,
} from "@/lib/autonomous-growth";
import { autopilotStartConfirmation, autopilotTopProspectInput, normalizeAutopilotCampaignSettings, type AutopilotCampaignSettings, type AutopilotHandoffFailure } from "@/lib/autopilot-campaign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const autopilotDisabledMessage = "Autopilot is disabled by environment kill switch.";

function autopilotEnvironmentDisabled() {
  return process.env.AUTOPILOT_DISABLED === "true";
}

function handoffFailure(settings: AutopilotCampaignSettings, overrides: Partial<AutopilotHandoffFailure> & Pick<AutopilotHandoffFailure, "phase" | "message">): AutopilotHandoffFailure {
  const confirmation = autopilotStartConfirmation(settings);
  const input = autopilotTopProspectInput(settings);
  return {
    databaseConnected: Boolean(process.env.DATABASE_URL?.trim()),
    attemptedMarket: confirmation.market,
    attemptedCities: input.city,
    attemptedTrade: confirmation.trade,
    attemptedProspectMode: input.mode,
    attemptedProspectType: input.prospectType,
    ...overrides,
  };
}

async function startAutopilotTopProspectsHandoff(request: Request, settings: AutopilotCampaignSettings) {
  if (autopilotEnvironmentDisabled()) {
    const autopilot = await failAutopilotCampaignHandoff(settings, handoffFailure(settings, {
      phase: "environment",
      message: autopilotDisabledMessage,
    }));
    return NextResponse.json({ autopilot, topProspectJobWarning: autopilotDisabledMessage });
  }
  const existingInventory = await processExistingQualifiedProspects({ dryRun: false });
  if (existingInventory.autoEmailPilot.approvedQueued > 0) {
    const dashboard = await getAutonomousGrowthDashboard();
    return NextResponse.json({
      ...dashboard,
      autoEmailPilot: existingInventory.autoEmailPilot,
      summary: existingInventory.summary,
      message: existingInventory.message,
      discoverySkipped: true,
    });
  }
  const validation = validateTopProspectInput(autopilotTopProspectInput(settings));
  if (!validation.ok) {
    const autopilot = await failAutopilotCampaignHandoff(settings, handoffFailure(settings, { phase: "validation", message: validation.error }));
    return NextResponse.json({ autopilot, topProspectJobWarning: validation.error });
  }
  try {
    const created = await createTopProspectJob(validation.value);
    const job = await getTopProspectJob(created.id);
    if (!job) {
      const autopilot = await failAutopilotCampaignHandoff(settings, handoffFailure(settings, {
        phase: "job_creation",
        message: "Top Prospects job creation returned an ID, but the job could not be read back.",
      }));
      return NextResponse.json({ autopilot, topProspectJobWarning: "Top Prospects job was created but could not be loaded for Autopilot tracking." });
    }
    const autopilot = await startAutopilotCampaign(settings, job);
    continueTopProspectJobAfterResponse(request, job.id);
    return NextResponse.json({ autopilot, topProspectJobId: job.id });
  } catch (error) {
    const safe = safeTopProspectJobFailure(error);
    let active: Awaited<ReturnType<typeof getActiveTopProspectJobSummary>> = null;
    try {
      active = await getActiveTopProspectJobSummary();
    } catch {
      active = null;
    }
    const errorWithActive = error as { activeJobId?: string; activeJobStatus?: string };
    const activeJobId = errorWithActive.activeJobId ?? active?.id;
    const activeJobStatus = errorWithActive.activeJobStatus ?? active?.status;
    const activeMessage = activeJobId ? "Another Top Prospects job is running." : "";
    const message = activeMessage || safe.reason || "Top Prospects job could not start.";
    const autopilot = await failAutopilotCampaignHandoff(settings, handoffFailure(settings, {
      phase: activeJobId ? "active_job" : safe.classification === "database_error" ? "database" : "job_creation",
      message,
      ...(activeJobId ? { activeJobId } : {}),
      ...(activeJobStatus ? { activeJobStatus } : {}),
    }));
    console.warn("[autonomous-growth] Autopilot Top Prospects handoff failed safely.", {
      error: error instanceof Error ? error.name : "unknown",
      classification: safe.classification,
      activeJobId,
    });
    return NextResponse.json({ autopilot, topProspectJobWarning: message });
  }
}

export async function GET() {
  try {
    return NextResponse.json(await getAutonomousGrowthDashboard());
  } catch (error) {
    console.error("[autonomous-growth] Dashboard load failed.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Autonomous Growth dashboard is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      action?: string;
      settings?: Partial<AutonomousGrowthSettings>;
      autopilotSettings?: Partial<AutopilotCampaignSettings>;
      queueItemId?: string;
      status?: OutreachQueueStatus;
      feedbackLabel?: AutonomousFeedbackLabel;
      suppressionReason?: "bounce" | "complaint" | "unsubscribe" | "manual_suppression";
      note?: string;
    };
    if (payload.action === "update_settings") {
      return NextResponse.json({ settings: await updateAutonomousGrowthSettings(payload.settings ?? {}) });
    }
    if (payload.action === "update_queue_status") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      if (!payload.status || !outreachQueueStatuses.includes(payload.status)) {
        return NextResponse.json({ error: "Select a supported queue status." }, { status: 400 });
      }
      let item;
      try {
        item = await updateOutreachQueueStatus(payload.queueItemId, payload.status);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "That queue status change is not allowed." },
          { status: 409 },
        );
      }
      if (!item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item });
    }
    if (payload.action === "approve_and_queue_email") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      const approval = await approveAndQueueEmail(payload.queueItemId);
      if (!approval.item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item: approval.item, approval });
    }
    if (payload.action === "record_feedback") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      if (!payload.feedbackLabel || !autonomousFeedbackLabels.includes(payload.feedbackLabel)) {
        return NextResponse.json({ error: "Select a supported feedback label." }, { status: 400 });
      }
      const item = await recordAutonomousFeedback(payload.queueItemId, payload.feedbackLabel, payload.note);
      if (!item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item });
    }
    if (payload.action === "rewrite_outreach") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      const item = await rewriteOutreachQueueItem(payload.queueItemId);
      if (!item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item });
    }
    if (payload.action === "send_queued_email") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      const result = await sendQueuedEmailQueueItem(payload.queueItemId);
      if (!result.item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item: result.item, sendResult: result });
    }
    if (payload.action === "run_full_auto_email_batch") {
      return NextResponse.json({ autoEmailBatch: await runFullAutoEmailBatch() });
    }
    if (payload.action === "record_email_suppression") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      const dashboard = await getAutonomousGrowthDashboard();
      const item = dashboard.queue.find((entry) => entry.id === payload.queueItemId);
      if (!item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      const reason = payload.suppressionReason ?? "manual_suppression";
      const suppression = await recordEmailSuppression(item.email, reason, "engine_operator");
      return NextResponse.json({ suppression });
    }
    if (payload.action === "start_autopilot" || payload.action === "retry_autopilot_handoff") {
      const settings = normalizeAutopilotCampaignSettings(payload.autopilotSettings ?? {});
      return startAutopilotTopProspectsHandoff(request, settings);
    }
    if (payload.action === "pause_autopilot") {
      return NextResponse.json({ autopilot: await pauseAutopilotCampaign() });
    }
    if (payload.action === "resume_autopilot") {
      await resumeAutopilotCampaign();
      const existingInventory = await processExistingQualifiedProspects({ dryRun: false });
      const dashboard = await getAutonomousGrowthDashboard();
      return NextResponse.json({ ...dashboard, autoEmailPilot: existingInventory.autoEmailPilot, summary: existingInventory.summary });
    }
    if (payload.action === "stop_autopilot") {
      return NextResponse.json({ autopilot: await stopAutopilotCampaign() });
    }
    if (payload.action === "run_autopilot_batch") {
      if (autopilotEnvironmentDisabled()) {
        const dashboard = await getAutonomousGrowthDashboard();
        return NextResponse.json({ autopilot: dashboard.autopilot, topProspectJobWarning: autopilotDisabledMessage });
      }
      await runAutopilotNextBatchNow();
      const existingInventory = await processExistingQualifiedProspects({ dryRun: false });
      const dashboard = await getAutonomousGrowthDashboard();
      return NextResponse.json({ ...dashboard, autoEmailPilot: existingInventory.autoEmailPilot, summary: existingInventory.summary });
    }
    if (payload.action === "run_fake_autopilot_smoke_test") {
      return NextResponse.json(await runFakeAutopilotSmokeTestForDashboard());
    }
    if (payload.action === "process_existing_qualified_prospects") {
      return NextResponse.json(await processExistingQualifiedProspects({ dryRun: false }));
    }
    if (payload.action === "run_smart_backfill_dry_run") {
      return NextResponse.json(await processExistingQualifiedProspects({ dryRun: true }));
    }
    if (payload.action === "run_market_scout_dry_run") {
      return NextResponse.json(await runMarketScoutDryRunForDashboard());
    }
    if (payload.action === "run_smart_autonomous_dry_run") {
      return NextResponse.json(await runSmartAutonomousDryRun());
    }
    return NextResponse.json({ error: "Select a supported Autonomous Growth action." }, { status: 400 });
  } catch (error) {
    console.error("[autonomous-growth] Request failed.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Autonomous Growth request failed." }, { status: 503 });
  }
}
