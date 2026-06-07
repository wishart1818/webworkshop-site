import { NextResponse, type NextRequest } from "next/server";

export function engineAuthState() {
  const username = process.env.ENGINE_USERNAME?.trim();
  const password = process.env.ENGINE_PASSWORD?.trim();

  return {
    configured: Boolean(username && password),
    username,
    password,
  };
}

export function authorizeEngineRequest(request: NextRequest) {
  const auth = engineAuthState();

  if (!auth.configured) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Prospect Engine access is not configured.", { status: 503 });
    }
    return null;
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const [username, password] = atob(header.slice(6)).split(":");
      if (username === auth.username && password === auth.password) return null;
    } catch {
      // Malformed credentials fall through to the authorization challenge.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="WebWorkshop Prospect Engine"' },
  });
}
