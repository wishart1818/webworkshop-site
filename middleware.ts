import type { NextRequest } from "next/server";
import { authorizeEngineRequest } from "@/lib/engine-auth";

export function middleware(request: NextRequest) {
  return authorizeEngineRequest(request);
}

export const config = {
  matcher: ["/engine/:path*", "/api/engine/:path*"],
};
