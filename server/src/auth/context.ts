import type { PrismaClient, User } from '@prisma/client';
import { prisma } from '../db/client.js';
import { ForbiddenError, UnauthenticatedError } from '../errors/index.js';
import { verifyToken } from './jwt.js';
import { createUserLoader, type UserLoader } from '../db/userLoader.js';

export interface GraphQLContext {
  readonly prisma: PrismaClient;
  readonly viewer: User | null;
  readonly users: UserLoader;
  readonly now: () => Date;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header === null) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token === '') return null;
  return token;
}

export async function buildContext(request: Request): Promise<GraphQLContext> {
  const token = bearerToken(request);
  let viewer: User | null = null;

  if (token !== null) {
    const payload = await verifyToken(token);
    if (payload !== null) {
      viewer = await prisma.user.findUnique({ where: { id: payload.sub } });
    }
  }

  return { prisma, viewer, users: createUserLoader(prisma), now: () => new Date() };
}

export function requireViewer(context: GraphQLContext): User {
  if (context.viewer === null) throw new UnauthenticatedError();
  return context.viewer;
}

export function requireAgent(context: GraphQLContext): User {
  const viewer = requireViewer(context);
  if (viewer.role !== 'AGENT') {
    throw new ForbiddenError('Only agents may perform this action.');
  }
  return viewer;
}
