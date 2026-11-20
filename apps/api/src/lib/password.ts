import argon2 from "argon2";

/** Hashes a password with argon2id (default settings). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Used when the email is unknown. It takes the same time as a real check,
 * so nobody can guess which emails are registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= argon2.hash("dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
}
