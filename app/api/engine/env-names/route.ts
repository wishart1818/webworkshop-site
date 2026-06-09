import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const names = Object.keys(process.env)
    .filter((name) => name.startsWith("ENGINE_") || name.startsWith("DATABASE_"))
    .sort();

  return NextResponse.json({ names });
}
