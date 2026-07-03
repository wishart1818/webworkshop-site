import { NextResponse } from "next/server";
import { latestSystemSelfCheckReport, runSystemSelfCheck } from "@/lib/system-self-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ selfCheck: latestSystemSelfCheckReport() });
}

export async function POST() {
  return NextResponse.json({ selfCheck: runSystemSelfCheck() });
}
