import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    hasEngineUsername: Boolean(process.env.ENGINE_USERNAME?.trim()),
    hasEnginePassword: Boolean(process.env.ENGINE_PASSWORD?.trim()),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
    runtime,
  });
}
