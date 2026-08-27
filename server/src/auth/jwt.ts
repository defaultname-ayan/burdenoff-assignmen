import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@prisma/client';
import { config } from '../config/index.js';

export interface TokenPayload {
  readonly sub: string;
  readonly role: UserRole;
}

const secret = new TextEncoder().encode(config.jwtSecret);

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const sub = payload.sub;
    const role = payload['role'];
    if (typeof sub !== 'string' || (role !== 'AGENT' && role !== 'REPORTER')) return null;
    return { sub, role };
  } catch {
    return null;
  }
}
