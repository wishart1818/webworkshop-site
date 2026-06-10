import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeHost(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const matchingEnvNames = Object.keys(process.env)
    .filter((name) => name.startsWith("ENGINE_") || name.startsWith("DATABASE_"))
    .sort();

  return NextResponse.json(
    {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      hasVercelProjectProductionUrl: Boolean(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      nextRuntime: process.env.NEXT_RUNTIME ?? runtime,
      nodeEnv: process.env.NODE_ENV ?? null,
      requestHost: new URL(request.url).host,
      deploymentUrlHost: safeHost(process.env.VERCEL_URL),
      matchingEnvNames,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
