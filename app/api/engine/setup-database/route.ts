import { handleDatabaseSetup } from "@/lib/production-database-setup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleDatabaseSetup(request);
}
