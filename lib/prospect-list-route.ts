import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  listProspectsWithDiagnostics,
  persistenceMode,
  ProspectRecordsUnreadableError,
  type ProspectListResult,
} from "@/lib/prospect-repository";
import { TopProspectSchemaLockUnavailableError } from "@/lib/top-prospect-schema";

type ProspectListLoader = () => Promise<ProspectListResult>;

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = String(error.code);
  return /^P\d{4}$/.test(code) ? code : "";
}

export function classifyProspectListFailure(error: unknown) {
  if (error instanceof TopProspectSchemaLockUnavailableError) {
    return {
      status: 503,
      code: "PROSPECT_SCHEMA_BUSY",
      retryable: true,
      error: "Prospect data is temporarily busy. Retry in a moment.",
    };
  }
  if (error instanceof ProspectRecordsUnreadableError) {
    return {
      status: 500,
      code: "PROSPECT_RECORDS_UNREADABLE",
      retryable: false,
      error: "Saved prospect data needs operator attention.",
    };
  }
  if (error instanceof Error && error.message.includes("DATABASE_URL is required")) {
    return {
      status: 503,
      code: "PROSPECT_DATABASE_NOT_CONFIGURED",
      retryable: false,
      error: "Prospect database configuration is unavailable.",
    };
  }
  const prismaCode = databaseErrorCode(error);
  if (["P1001", "P1002", "P1008"].includes(prismaCode)) {
    return {
      status: 503,
      code: "PROSPECT_DATABASE_TEMPORARILY_UNAVAILABLE",
      retryable: true,
      error: "Prospect data is temporarily unavailable. Retry in a moment.",
    };
  }
  if (["P2021", "P2022"].includes(prismaCode)) {
    return {
      status: 503,
      code: "PROSPECT_DATABASE_SCHEMA_UNAVAILABLE",
      retryable: false,
      error: "Prospect data setup needs operator attention.",
    };
  }
  return {
    status: 500,
    code: "PROSPECTS_LOAD_FAILED",
    retryable: false,
    error: "Unable to load prospects.",
  };
}

export async function handleProspectList(load: ProspectListLoader = listProspectsWithDiagnostics) {
  const requestId = randomUUID();
  try {
    const result = await load();
    return NextResponse.json({
      prospects: result.prospects,
      persistence: persistenceMode(),
      diagnostics: result.diagnostics,
    }, {
      headers: { "Cache-Control": "no-store", "X-Prospect-Request-Id": requestId },
    });
  } catch (error) {
    const failure = classifyProspectListFailure(error);
    console.error("[prospects-api] Prospect list request failed.", {
      requestId,
      code: failure.code,
      errorName: error instanceof Error ? error.name : "UnknownError",
      databaseErrorCode: databaseErrorCode(error) || undefined,
    });
    return NextResponse.json({
      error: failure.error,
      code: failure.code,
      retryable: failure.retryable,
      requestId,
    }, {
      status: failure.status,
      headers: { "Cache-Control": "no-store", "X-Prospect-Request-Id": requestId },
    });
  }
}
