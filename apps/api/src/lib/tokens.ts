import { createHash, randomBytes } from "node:crypto";

/** Opaque random refresh token (256 bits). Only its hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 is enough here: the input is high-entropy random, not a password. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Public key embedded in the tracker snippet. */
export function generateSiteKey(): string {
  return `cm_${randomBytes(9).toString("base64url")}`;
}
