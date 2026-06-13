import { NextResponse } from "next/server";
import { safeRecordAudit } from "@/lib/operational-controls";
import { updateTopProspectOutreachPackage } from "@/lib/top-prospect-repository";
import { outreachPackageActions, type OutreachPackageAction } from "@/lib/top-prospects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ resultId: string }> }) {
  const { resultId } = await context.params;
  try {
    const payload = await request.json() as { action?: unknown };
    if (typeof payload.action !== "string" || !outreachPackageActions.includes(payload.action as OutreachPackageAction)) {
      return NextResponse.json({ error: "Select a supported Outreach Package action." }, { status: 400 });
    }
    const action = payload.action as OutreachPackageAction;
    const result = await updateTopProspectOutreachPackage(resultId, action);
    if (!result) return NextResponse.json({ error: "Outreach Package was not found." }, { status: 404 });
    await safeRecordAudit({
      action: `outreach_package_${action}`,
      outcome: "success",
      subject: result.prospect.id,
      metadata: { resultId, packageStatus: result.packageStatus },
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Outreach Package.";
    const conflict = /before|cannot be changed|again before|not available/i.test(message);
    console.error("[outreach-package] Action failed.", { resultId, classification: conflict ? "invalid_transition" : "unexpected_exception" });
    await safeRecordAudit({
      action: "outreach_package_update",
      outcome: "failure",
      metadata: { resultId, classification: conflict ? "invalid_transition" : "unexpected_exception" },
    });
    return NextResponse.json(
      { error: conflict ? message : "Unable to update Outreach Package." },
      { status: conflict ? 409 : 500 },
    );
  }
}
