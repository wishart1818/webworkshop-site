import { NextResponse } from "next/server";
import { executeOperatorCommand, listOperatorCommandReceipts, parseOperatorCommand } from "@/lib/operator-command-center";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ receipts: await listOperatorCommandReceipts(50) });
  } catch (error) {
    console.error("[operator-commands] Receipt load failed safely.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Command Activity is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      commandText?: string;
      mode?: "search" | "command";
      action?: "preview" | "execute" | "confirm" | "cancel";
    };
    const commandText = String(payload.commandText ?? "");
    if (payload.action === "preview") {
      return NextResponse.json({ preview: parseOperatorCommand(commandText, payload.mode) });
    }
    if (payload.action === "cancel") {
      const result = await executeOperatorCommand(commandText, { mode: payload.mode, confirmed: false });
      result.receipt.status = "cancelled";
      result.receipt.whatDidNotChange = ["Operator cancelled before applying changes.", "No outreach was sent."];
      return NextResponse.json(result);
    }
    return NextResponse.json(await executeOperatorCommand(commandText, {
      mode: payload.mode,
      confirmed: payload.action === "confirm",
    }));
  } catch (error) {
    console.error("[operator-commands] Command failed safely.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Operator command failed safely." }, { status: 503 });
  }
}
