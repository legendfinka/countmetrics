import argon2 from "argon2";

/** argon2id with library defaults. */
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
 * Spend the same time as a real verification when the email is unknown,
 * so response time does not reveal which emails are registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= argon2.hash("dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
}
