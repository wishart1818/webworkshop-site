import { NextResponse } from "next/server";
import { safeRecordAudit } from "@/lib/operational-controls";
import { listProspects, persistenceMode, saveProspect } from "@/lib/prospect-repository";
import { validateProspect } from "@/lib/prospect-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ prospects: await listProspects(), persistence: persistenceMode() });
  } catch (error) {
    console.error("Unable to load prospects.", error);
    const unavailable = error instanceof Error && error.message.includes("DATABASE_URL is required");
    return NextResponse.json({ error: unavailable ? error.message : "Unable to load prospects." }, { status: unavailable ? 503 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const validation = validateProspect(await request.json());
    if (!validation.ok) {
      await safeRecordAudit({ action: "prospect_create", outcome: "rejected", metadata: { reason: validation.error } });
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const prospect = await saveProspect(validation.value);
    await safeRecordAudit({ action: "prospect_create", outcome: "success", subject: prospect.id, metadata: { website: prospect.website } });
    return NextResponse.json({ prospect, persistence: persistenceMode() }, { status: 201 });
  } catch (error) {
    console.error("Unable to create prospect.", error);
    await safeRecordAudit({ action: "prospect_create", outcome: "failure", metadata: { message: error instanceof Error ? error.message : "Unknown error" } });
    const unavailable = error instanceof Error && error.message.includes("DATABASE_URL is required");
    return NextResponse.json({ error: unavailable ? error.message : "Unable to create prospect." }, { status: unavailable ? 503 : 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const validation = validateProspect(await request.json());
    if (!validation.ok) {
      await safeRecordAudit({ action: "prospect_update", outcome: "rejected", metadata: { reason: validation.error } });
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const prospect = await saveProspect(validation.value);
    await safeRecordAudit({ action: "prospect_update", outcome: "success", subject: prospect.id, metadata: { status: prospect.status } });
    return NextResponse.json({ prospect, persistence: persistenceMode() });
  } catch (error) {
    console.error("Unable to save prospect.", error);
    await safeRecordAudit({ action: "prospect_update", outcome: "failure", metadata: { message: error instanceof Error ? error.message : "Unknown error" } });
    const unavailable = error instanceof Error && error.message.includes("DATABASE_URL is required");
    return NextResponse.json({ error: unavailable ? error.message : "Unable to save prospect." }, { status: unavailable ? 503 : 500 });
  }
}
