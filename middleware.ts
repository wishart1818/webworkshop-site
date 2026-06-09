import { NextResponse, type NextRequest } from "next/server";
import { authorizeEngineRequest } from "@/lib/engine-auth";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/engine/config-check") {
    return NextResponse.next();
  }

  return authorizeEngineRequest(request, {
    username: process.env.ENGINE_USERNAME,
    password: process.env.ENGINE_PASSWORD,
  });
}

export const config = {
  matcher: ["/engine/:path*", "/api/engine/:path*"],
  runtime: "nodejs",
};
