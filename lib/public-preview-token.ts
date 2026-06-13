import { randomBytes } from "node:crypto";

export function createPublicPreviewToken() {
  return randomBytes(24).toString("base64url");
}
