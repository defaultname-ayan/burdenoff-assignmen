const ENDPOINT: string = import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const TOKEN_KEY = 'sla-tracker.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export class GraphQLRequestError extends Error {
  readonly code: string;
  readonly field: string | null;

  constructor(message: string, code: string, field: string | null) {
    super(message);
    this.name = 'GraphQLRequestError';
    this.code = code;
    this.field = field;
  }
}

interface GraphQLResponse<TData> {
  data?: TData;
  errors?: Array<{
    message: string;
    extensions?: { code?: string; field?: string };
  }>;
}

export async function request<TData>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<TData> {
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new GraphQLRequestError(
      'Cannot reach the API. Is the server running on port 4000?',
      'NETWORK_ERROR',
      null,
    );
  }

  const payload = (await response.json()) as GraphQLResponse<TData>;
  const firstError = payload.errors?.[0];

  if (firstError !== undefined) {
    throw new GraphQLRequestError(
      firstError.message,
      firstError.extensions?.code ?? 'UNKNOWN_ERROR',
      firstError.extensions?.field ?? null,
    );
  }
  if (payload.data === undefined) {
    throw new GraphQLRequestError('The API returned no data.', 'UNKNOWN_ERROR', null);
  }
  return payload.data;
}
