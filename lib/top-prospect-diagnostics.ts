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
