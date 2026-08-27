import type { User, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { GraphQLContext } from '../../auth/context.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { signToken } from '../../auth/jwt.js';
import { config } from '../../config/index.js';
import { AppError, ErrorCode, ForbiddenError, ValidationError } from '../../errors/index.js';
import { LIMITS, assertEmail, assertPassword, assertRole, requireText } from '../../validation/index.js';

export interface AuthPayload {
  readonly token: string;
  readonly user: User;
}

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: string;
  readonly agentCode?: string | null;
}

export async function register(context: GraphQLContext, input: RegisterInput): Promise<AuthPayload> {
  const name = requireText(input.name, 'name', LIMITS.nameMax);
  const email = assertEmail(input.email);
  const password = assertPassword(input.password);
  const role: UserRole = assertRole(input.role);

  if (role === 'AGENT') {
    if (config.agentSignupCode === '' || input.agentCode !== config.agentSignupCode) {
      throw new ForbiddenError('A valid agent signup code is required to register as an agent.');
    }
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await context.prisma.user.create({
      data: { name, email, passwordHash, role },
    });
    return { token: await signToken({ sub: user.id, role: user.role }), user };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ValidationError('An account with that email already exists.', 'email');
    }
    throw error;
  }
}

export async function login(
  context: GraphQLContext,
  emailInput: string,
  passwordInput: string,
): Promise<AuthPayload> {
  const email = assertEmail(emailInput);
  const user = await context.prisma.user.findUnique({ where: { email } });

  const invalid = new AppError(ErrorCode.UNAUTHORIZED, 'Invalid email or password.');
  if (user === null) {
    await hashPassword(passwordInput);
    throw invalid;
  }
  if (!(await verifyPassword(passwordInput, user.passwordHash))) {
    throw invalid;
  }

  return { token: await signToken({ sub: user.id, role: user.role }), user };
}
