import { createPublicKey, verify as verifySignature } from "node:crypto";

const githubActionsIssuer = "https://token.actions.githubusercontent.com";
const githubActionsJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const topProspectsAudience = "webworkshop-top-prospects";
const expectedRepository = "wishart1818/webworkshop-site";
const expectedRepositoryId = "1261515110";
const expectedRef = "refs/heads/main";
const expectedWorkflowRef = "wishart1818/webworkshop-site/.github/workflows/top-prospects-oidc-continuation.yml@refs/heads/main";
const allowedEvents = new Set(["schedule", "workflow_dispatch"]);
const clockSkewSeconds = 30;
const maxTokenAgeSeconds = 10 * 60;
const jwksCacheMs = 60 * 60 * 1000;

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

type GitHubActionsClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  repository?: unknown;
  repository_id?: unknown;
  ref?: unknown;
  workflow_ref?: unknown;
  event_name?: unknown;
};

type GitHubJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

type CachedJwks = {
  keys: GitHubJwk[];
  expiresAt: number;
};

let cachedJwks: CachedJwks | null = null;

function decodeJson<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function audienceMatches(value: unknown) {
  if (typeof value === "string") return value === topProspectsAudience;
  return Array.isArray(value) && value.some((entry) => entry === topProspectsAudience);
}

function validNumericDate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function claimsMatch(claims: GitHubActionsClaims) {
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== githubActionsIssuer) return false;
  if (!audienceMatches(claims.aud)) return false;
  if (!validNumericDate(claims.exp) || claims.exp <= now - clockSkewSeconds) return false;
  if (!validNumericDate(claims.iat) || claims.iat > now + clockSkewSeconds) return false;
  if (now - claims.iat > maxTokenAgeSeconds) return false;
  if (claims.nbf !== undefined && (!validNumericDate(claims.nbf) || claims.nbf > now + clockSkewSeconds)) return false;
  if (claims.repository !== expectedRepository) return false;
  if (String(claims.repository_id ?? "") !== expectedRepositoryId) return false;
  if (claims.ref !== expectedRef) return false;
  if (claims.workflow_ref !== expectedWorkflowRef) return false;
  if (typeof claims.event_name !== "string" || !allowedEvents.has(claims.event_name)) return false;
  return true;
}

async function githubJwks() {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;

  const response = await fetch(githubActionsJwksUrl, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("GitHub Actions OIDC signing keys are unavailable.");

  const body = (await response.json()) as { keys?: GitHubJwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error("GitHub Actions OIDC signing keys are invalid.");
  }

  cachedJwks = { keys: body.keys, expiresAt: Date.now() + jwksCacheMs };
  return body.keys;
}

export async function verifyTopProspectsGitHubOidcToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJson<JwtHeader>(encodedHeader);
  const claims = decodeJson<GitHubActionsClaims>(encodedClaims);
  if (!header || !claims) return false;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false;
  if (header.typ !== undefined && header.typ !== "JWT") return false;
  if (!claimsMatch(claims)) return false;

  const keys = await githubJwks();
  const jwk = keys.find((candidate) => candidate.kid === header.kid && (!candidate.alg || candidate.alg === "RS256"));
  if (!jwk) return false;

  try {
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    return verifySignature(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      publicKey,
      Buffer.from(encodedSignature, "base64url"),
    );
  } catch {
    return false;
  }
}
