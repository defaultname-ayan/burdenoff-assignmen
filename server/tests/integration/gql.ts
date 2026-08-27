import { yoga } from '../../src/server.js';
import { prisma } from '../../src/db/client.js';

export interface GraphQLResult<TData> {
  data: TData | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export async function gql<TData>(
  query: string,
  variables: Record<string, unknown> = {},
  token: string | null = null,
): Promise<GraphQLResult<TData>> {
  const response = await yoga.fetch('http://test.local/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };

  const firstError = payload.errors?.[0];
  return {
    data: payload.data ?? null,
    errorCode: firstError?.extensions?.code ?? null,
    errorMessage: firstError?.message ?? null,
  };
}

export function expectData<TData>(result: GraphQLResult<TData>): TData {
  if (result.data === null || result.errorCode !== null) {
    throw new Error(`Expected success but got ${result.errorCode}: ${result.errorMessage}`);
  }
  return result.data;
}

export async function resetDatabase(): Promise<void> {
  await prisma.ticketEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.user.deleteMany();
  await prisma.holiday.deleteMany();
}

export interface Account {
  token: string;
  id: string;
}

export async function registerAccount(
  name: string,
  email: string,
  role: 'AGENT' | 'REPORTER',
): Promise<Account> {
  const result = await gql<{ register: { token: string; user: { id: string } } }>(
    `mutation Register($name: String!, $email: String!, $password: String!, $role: UserRole!, $agentCode: String) {
      register(name: $name, email: $email, password: $password, role: $role, agentCode: $agentCode) {
        token
        user { id role }
      }
    }`,
    {
      name,
      email,
      password: 'password123',
      role,
      agentCode: role === 'AGENT' ? process.env['AGENT_SIGNUP_CODE'] : null,
    },
  );
  const data = expectData(result);
  return { token: data.register.token, id: data.register.user.id };
}
