import { NextResponse } from "next/server";
import {
  getAutonomousGrowthDashboard,
  recordAutonomousFeedback,
  rewriteOutreachQueueItem,
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      queueItemId?: string;
      status?: OutreachQueueStatus;
      feedbackLabel?: AutonomousFeedbackLabel;
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
      const item = await updateOutreachQueueStatus(payload.queueItemId, payload.status);
      if (!item) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
      return NextResponse.json({ item });
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
    return NextResponse.json({ error: "Select a supported Autonomous Growth action." }, { status: 400 });
  } catch (error) {
    console.error("[autonomous-growth] Request failed.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Autonomous Growth request failed." }, { status: 503 });
  }
}
