import type { Prospect } from "@/lib/prospect-engine";

export type ProspectListClientResult = {
  prospects: Prospect[];
  persistence: "memory" | "postgresql";
  malformedRecordsOmitted: number;
};

type ProspectListPayload = {
  prospects?: Prospect[];
  persistence?: "memory" | "postgresql";
  diagnostics?: { malformedRecordsOmitted?: number };
  error?: string;
  code?: string;
  retryable?: boolean;
  requestId?: string;
};

type ProspectListRequestOptions = {
  fetcher?: typeof fetch;
  pause?: (milliseconds: number) => Promise<void>;
  attempts?: number;
};

function safeReference(value: unknown) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

async function parsePayload(response: Response): Promise<ProspectListPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/application\/json/i.test(contentType)) return {};
  try {
    return await response.json() as ProspectListPayload;
  } catch {
    return {};
  }
}

export async function requestProspectList({
  fetcher = fetch,
  pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 3,
}: ProspectListRequestOptions = {}): Promise<ProspectListClientResult> {
  const boundedAttempts = Math.max(1, Math.min(3, attempts));
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const response = await fetcher("/api/engine/prospects", { cache: "no-store" });
    const payload = await parsePayload(response);
    if (response.ok && Array.isArray(payload.prospects)) {
      return {
        prospects: payload.prospects,
        persistence: payload.persistence ?? "memory",
        malformedRecordsOmitted: Math.max(0, Number(payload.diagnostics?.malformedRecordsOmitted) || 0),
      };
    }

    if (payload.retryable === true && attempt < boundedAttempts) {
      await pause(250 * attempt);
      continue;
    }

    const reference = safeReference(payload.requestId);
    const baseMessage = response.status === 401
      ? "Engine authorization is required. Reload the page and sign in again."
      : payload.error || "Unable to load prospects.";
    throw new Error(reference ? `${baseMessage} Reference: ${reference}.` : baseMessage);
  }
  throw new Error("Unable to load prospects.");
}
