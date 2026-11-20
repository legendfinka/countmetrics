import { createHash, randomBytes } from "node:crypto";

/** Random refresh token. Only its hash is saved. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 is enough here. The token is long and random, not a password. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Public key that goes into the tracker snippet. */
export function generateSiteKey(): string {
  return `cm_${randomBytes(9).toString("base64url")}`;
}
