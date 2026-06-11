import { TopProspectSchemaLockUnavailableError } from "@/lib/top-prospect-schema";

export type TopProspectFailureClassification =
  | "database_connection"
  | "database_permissions"
  | "missing_tables"
  | "partial_schema"
  | "schema_lock_busy"
  | "schema_mismatch"
  | "stale_prisma_client"
  | "unknown";

export type TopProspectJobFailureClassification =
  | "discovery_provider_error"
  | "geocoding_error"
  | "radius_filter_error"
  | "database_error"
  | "worker_timeout"
  | "unexpected_exception";

export class TopProspectStageError extends Error {
  constructor(
    readonly classification: Exclude<TopProspectJobFailureClassification, "database_error" | "unexpected_exception">,
    readonly safeReason: string,
    options?: ErrorOptions,
  ) {
    super(safeReason, options);
    this.name = "TopProspectStageError";
  }
}

function errorSignals(error: unknown) {
  const signals: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) signals.push(current.name, current.message);
    if (typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    for (const key of ["code", "sqlState", "kind"]) {
      if (typeof record[key] === "string") signals.push(record[key]);
    }
    current = record.cause;
  }
  return signals.join(" ").toLowerCase();
}

export function classifyTopProspectFailure(error: unknown): TopProspectFailureClassification {
  if (error instanceof TopProspectSchemaLockUnavailableError) return "schema_lock_busy";
  const signals = errorSignals(error);
  if (/partially initialized/.test(signals)) return "partial_schema";
  if (/\bp2021\b|relation .* does not exist|table .* does not exist/.test(signals)) return "missing_tables";
  if (/\bp2022\b|column .* does not exist/.test(signals)) return "schema_mismatch";
  if (/topprospect(job|result).*(undefined|not a function)|cannot read properties of undefined/.test(signals)) {
    return "stale_prisma_client";
  }
  if (
    /\bp1001\b|\bp1002\b|\bp1003\b|\bp1011\b|\bp2024\b|econnrefused|connection refused|can't reach database|cannot reach database|connection closed|connection pool timeout|tls handshake|ssl (error|failure|failed)/.test(
      signals,
    )
  ) {
    return "database_connection";
  }
  if (/\bp1000\b|\bp1010\b|\b42501\b|permission denied|access denied|not authorized|authentication failed/.test(signals)) {
    return "database_permissions";
  }
  return "unknown";
}

export function classifyTopProspectJobFailure(error: unknown): TopProspectJobFailureClassification {
  if (error instanceof TopProspectStageError) return error.classification;
  const classification = classifyTopProspectFailure(error);
  if (classification !== "unknown") return "database_error";
  const signals = errorSignals(error);
  if (/timeout|timed out|aborterror|timeouterror/.test(signals)) return "worker_timeout";
  return "unexpected_exception";
}

const fallbackReasons: Record<TopProspectJobFailureClassification, string> = {
  discovery_provider_error: "The public business discovery provider could not complete the search.",
  geocoding_error: "The location provider could not resolve the requested city and state.",
  radius_filter_error: "The returned business records could not be filtered by the requested radius.",
  database_error: "PostgreSQL could not save or load this Top Prospects job.",
  worker_timeout: "The Top Prospects worker exceeded its safe processing time.",
  unexpected_exception: "The Top Prospects worker stopped because of an unexpected server error.",
};

export function safeTopProspectJobFailure(error: unknown) {
  const classification = classifyTopProspectJobFailure(error);
  const reason = error instanceof TopProspectStageError ? error.safeReason : fallbackReasons[classification];
  return { classification, reason };
}

export function encodeTopProspectJobFailure(classification: TopProspectJobFailureClassification, reason: string) {
  return `[${classification}] ${reason}`;
}

export function parseTopProspectJobFailure(value: string | null | undefined) {
  const message = value?.trim() ?? "";
  const match = message.match(/^\[([a-z_]+)\]\s+(.+)$/);
  if (!match || !(match[1] in fallbackReasons)) {
    return { classification: null, reason: message };
  }
  return {
    classification: match[1] as TopProspectJobFailureClassification,
    reason: match[2],
  };
}

function databaseTarget(url: string | undefined) {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    return {
      database: parsed.pathname.replace(/^\/+/, ""),
      host: parsed.hostname.replace(/-pooler(?=\.)/, ""),
    };
  } catch {
    return null;
  }
}

export function topProspectRuntimeChecks(
  prismaModelsPresent: boolean,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const pooled = databaseTarget(environment.DATABASE_URL);
  const direct = databaseTarget(environment.DATABASE_URL_UNPOOLED);
  return {
    hasDatabaseUrl: Boolean(environment.DATABASE_URL?.trim()),
    hasUnpooledDatabaseUrl: Boolean(environment.DATABASE_URL_UNPOOLED?.trim()),
    prismaModelsPresent,
    databaseTargetsMatch: !pooled || !direct || (pooled.host === direct.host && pooled.database === direct.database),
  };
}
