const ARGON2_OPTIONS = { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
}
