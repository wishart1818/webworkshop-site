import { after } from "next/server";

function engineAuthorization() {
  const username = process.env.ENGINE_USERNAME?.trim();
  const password = process.env.ENGINE_PASSWORD?.trim();
  if (!username || !password) throw new Error("Engine credentials are required for background continuation.");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function continueTopProspectJobAfterResponse(request: Request, jobId: string) {
  const url = new URL(`/api/engine/top-prospects/${jobId}/run`, request.url);
  after(async () => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { Authorization: engineAuthorization() },
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        });
        if (response.ok) return;
      } catch (error) {
        if (attempt === 2) console.error("[top-prospects] Unable to schedule the next worker batch.", error);
      }
    }
  });
}
