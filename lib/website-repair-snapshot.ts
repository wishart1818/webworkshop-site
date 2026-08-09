import { createHash } from "node:crypto";
import type { Prospect } from "@/lib/prospect-engine";

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalValue(record[key])]),
  );
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function canonicalProspect(prospect: Prospect) {
  return canonicalValue({
    ...prospect,
    notes: [...prospect.notes].sort(),
    activities: [...prospect.activities].sort((left, right) => left.id.localeCompare(right.id)),
    contactEvidence: [...prospect.contactEvidence].sort((left, right) => (
      canonicalJson(left).localeCompare(canonicalJson(right))
    )),
  });
}

export function websiteRepairStateDigest(value: unknown) {
  return createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex");
}

export function websiteRepairProspectStateDigest(prospect: Prospect) {
  return websiteRepairStateDigest(canonicalProspect(prospect));
}

function addChangedPath(paths: Set<string>, path: string) {
  if (paths.size < 30) paths.add(path || "root");
}

function changedPaths(left: unknown, right: unknown, path: string, paths: Set<string>) {
  if (Object.is(left, right)) return;
  if (canonicalJson(left) === canonicalJson(right)) return;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) addChangedPath(paths, `${path}.length`);
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      changedPaths(left[index], right[index], `${path}[${index}]`, paths);
    }
    return;
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    for (const key of [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort()) {
      changedPaths(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key, paths);
    }
    return;
  }

  addChangedPath(paths, path);
}

export function websiteRepairStateChangedPaths(left: unknown, right: unknown) {
  const paths = new Set<string>();
  changedPaths(canonicalValue(left), canonicalValue(right), "", paths);
  return [...paths];
}

export function websiteRepairProspectChangedPaths(left: Prospect, right: Prospect) {
  const paths = new Set<string>();
  changedPaths(canonicalProspect(left), canonicalProspect(right), "", paths);
  return [...paths];
}
